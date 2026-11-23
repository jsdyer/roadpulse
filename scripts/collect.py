#!/usr/bin/env python3
"""Retain complete DriveBC observations. Never replace good data on a failed refresh."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_FILTERS = {'status', 'severity', 'event_type', 'event_subtype', 'road_name', 'area_id', 'bbox', 'created', 'updated', 'in_effect_on'}

def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

def validate_config(config):
    if config.get('source') != 'https://api.open511.gov.bc.ca/events':
        raise ValueError('Use the official HTTPS DriveBC events endpoint')
    filters = config.get('filters', {})
    if not isinstance(filters, dict) or set(filters) - ALLOWED_FILTERS:
        raise ValueError('Unsupported API filter; see DriveBC documentation')
    if any(not isinstance(v, str) for v in filters.values()):
        raise ValueError('API filter values must be strings')
    for key, low, high in [('pageSize',1,500),('maxPages',1,100),('retentionCaptures',2,1000),('timeoutSeconds',5,120)]:
        value = config.get(key)
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f'{key} must be between {low} and {high}')
    if filters.get('status', 'ACTIVE') not in ('ACTIVE', 'ARCHIVED', 'ALL'):
        raise ValueError('status must be ACTIVE, ARCHIVED or ALL')
    if 'bbox' in filters:
        b = [float(v) for v in filters['bbox'].split(',')]
        if len(b) != 4 or not (-180 <= b[0] < b[2] <= 180 and -90 <= b[1] < b[3] <= 90):
            raise ValueError('bbox is west,south,east,north')
    return config

def request_json(url, timeout):
    request = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'CoolCode RoadPulse/1.0 (+https://coolcode.ca/roadpulse/)'})
    with urlopen(request, timeout=timeout) as response:
        body = response.read(30_000_001)
        if len(body) > 30_000_000:
            raise ValueError('Source response exceeded 30 MB')
        return json.loads(body)

def validate_event(event):
    if not isinstance(event, dict) or not isinstance(event.get('id'), str) or not event['id'].startswith('drivebc.ca/'):
        raise ValueError('Invalid event ID')
    if event.get('status') not in ('ACTIVE', 'ARCHIVED'):
        raise ValueError('Unrecognized event status')
    for key in ['created', 'updated']:
        value = event.get(key)
        if not isinstance(value, str):
            raise ValueError('Event missing source timestamps')
        datetime.fromisoformat(value.replace('Z', '+00:00'))
    for key in ['roads', 'areas', 'event_subtypes']:
        if key in event and not isinstance(event[key], list):
            raise ValueError(f'Invalid {key}')
    return event

def collect(config, fetch=request_json, pause=time.sleep):
    validate_config(config)
    started = timestamp()
    events, ids, urls = [], set(), []
    size = config['pageSize']
    for page in range(config['maxPages']):
        params = {**config['filters'], 'format':'json', 'limit':size, 'offset':page*size}
        url = config['source'] + '?' + urlencode(params)
        payload = fetch(url, config['timeoutSeconds'])
        if not isinstance(payload, dict) or not isinstance(payload.get('events'), list):
            raise ValueError('Source did not return an events collection')
        batch = payload['events']
        if len(batch) > size:
            raise ValueError('Source ignored the requested page limit')
        for event in batch:
            validate_event(event)
            if event['id'] in ids:
                raise ValueError('Duplicate event across pages; feed may have changed during collection. Retry later.')
            ids.add(event['id']); events.append(event)
        urls.append(url)
        # DriveBC may omit pagination.next. The documented limit/offset protocol is authoritative.
        if len(batch) < size:
            break
        if page + 1 == config['maxPages']:
            raise ValueError('Page limit reached; refusing to publish an incomplete capture')
        pause(1)
    scope = {'source': config['source'], 'filters': config['filters']}
    return {'schemaVersion':1, 'tool':'roadpulse', 'capturedAt':timestamp(), 'collectionStartedAt':started,
            'source':config['source'], 'scope':scope, 'complete':True, 'requestUrls':urls,
            'license':'Open Government Licence – British Columbia', 'events':sorted(events,key=lambda e:e['id'])}

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, delete=False, encoding='utf-8') as stream:
        temporary = Path(stream.name)
        json.dump(value, stream, ensure_ascii=False, separators=(',',':'))
        stream.write('\n')
    os.replace(temporary, path)

def save_capture(capture, config, directory):
    directory = Path(directory)
    manifest_path = directory / 'index.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'schemaVersion':1,'captures':[]}
    if manifest.get('schemaVersion') != 1 or not isinstance(manifest.get('captures'),list):
        raise ValueError('Existing manifest is invalid; leaving it untouched')
    digest = hashlib.sha256(json.dumps(capture['events'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
    filename = capture['capturedAt'].replace(':','').replace('-','') + '-' + digest[:8] + '.json'
    entry = {'file':filename,'capturedAt':capture['capturedAt'],'count':len(capture['events']),'sha256':digest,'scope':capture['scope']}
    previous = manifest['captures']
    entries = sorted([entry]+[e for e in previous if e['file'] != filename],key=lambda e:e['capturedAt'],reverse=True)
    keep = entries[:config['retentionCaptures']]
    # Write the new immutable capture first, then atomically switch the index.
    atomic_json(directory / filename, capture)
    atomic_json(manifest_path, {'schemaVersion':1,'captures':keep,'retentionCaptures':config['retentionCaptures']})
    for old in entries[config['retentionCaptures']:]:
        name = old.get('file','')
        if name and Path(name).name == name and name.endswith('.json'):
            (directory/name).unlink(missing_ok=True)
    return entry

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--config',type=Path,default=ROOT/'web/config.json'); parser.add_argument('--output',type=Path,default=ROOT/'web/data'); args=parser.parse_args()
    config = validate_config(json.loads(args.config.read_text()))
    capture = collect(config)
    entry = save_capture(capture,config,args.output)
    print(f"Saved {entry['count']} events observed {entry['capturedAt']} ({len(capture['requestUrls'])} pages)")

if __name__ == '__main__':
    try: main()
    except Exception as exc: raise SystemExit(f'Refresh failed; existing captures unchanged: {exc}')
