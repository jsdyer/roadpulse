import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from collect import collect, save_capture, validate_config
ROOT=Path(__file__).resolve().parents[1]
CONFIG=json.loads((ROOT/'web/config.json').read_text())
INDEX=json.loads((ROOT/'web/data/index.json').read_text())
REAL=json.loads((ROOT/'web/data'/INDEX['captures'][0]['file']).read_text())

class CollectorTests(unittest.TestCase):
 def test_full_page_without_next_link_fetches_offset(self):
  config={**CONFIG,'pageSize':2}; calls=[]
  def fetch(url,timeout):
   calls.append(url); return {'events':REAL['events'][:2] if len(calls)==1 else REAL['events'][2:3],'pagination':{'offset':'0'}}
  result=collect(config,fetch,lambda _:None)
  self.assertEqual(len(result['events']),3); self.assertIn('offset=2',calls[1]); self.assertTrue(result['complete'])
 def test_duplicate_page_and_truncation_fail(self):
  config={**CONFIG,'pageSize':1,'maxPages':2}
  with self.assertRaisesRegex(ValueError,'Duplicate'): collect(config,lambda *args:{'events':REAL['events'][:1]},lambda _:None)
  with self.assertRaisesRegex(ValueError,'Page limit'): collect({**config,'maxPages':1},lambda *args:{'events':REAL['events'][:1]},lambda _:None)
 def test_upstream_failure_does_not_touch_existing_data(self):
  with tempfile.TemporaryDirectory() as temp:
   directory=Path(temp);save_capture(REAL,CONFIG,directory);before={p.name:p.read_bytes() for p in directory.iterdir()}
   def fail(*args):raise OSError('source unavailable')
   with self.assertRaises(OSError):collect(CONFIG,fail)
   self.assertEqual(before,{p.name:p.read_bytes() for p in directory.iterdir()})
 def test_invalid_source_body_rejected_not_empty(self):
  with self.assertRaisesRegex(ValueError,'events collection'):collect(CONFIG,lambda *args:{'error':'upstream'},lambda _:None)
 def test_valid_empty_capture_distinguished_from_failure(self):
  c=collect(CONFIG,lambda *args:{'events':[]},lambda _:None);self.assertEqual(c['events'],[]);self.assertTrue(c['complete'])
 def test_retention_prunes_only_owned_capture_files(self):
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp);(p/'keep.txt').write_text('safe')
   for i in range(3):
    c=copy.deepcopy(REAL);c['capturedAt']=f'2026-01-0{i+1}T00:00:00Z';save_capture(c,{**CONFIG,'retentionCaptures':2},p)
   manifest=json.loads((p/'index.json').read_text());self.assertEqual(len(manifest['captures']),2);self.assertTrue((p/'keep.txt').exists());self.assertEqual(len(list(p.glob('2026*.json'))),2)
 def test_bad_bounds_or_endpoint_rejected(self):
  with self.assertRaises(ValueError):validate_config({**CONFIG,'source':'http://localhost/events'})
  with self.assertRaises(ValueError):validate_config({**CONFIG,'filters':{'bbox':'-123,49,-124,50'}})

if __name__=='__main__':unittest.main()
