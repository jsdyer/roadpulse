# Road Pulse

Dated British Columbia road observations from the official, keyless DriveBC Open511 API. Public app: **https://coolcode.ca/roadpulse/**. Source: https://github.com/jsdyer/roadpulse.

<!-- coolcode:guide -->
Search any road, town or event ID in the captured BC feed, choose an area/severity/type, and select an event to read its original report. The initial capture contains real DriveBC records; history grows after subsequent successful collections. The source's **ACTIVE** status includes future planned work. **ARCHIVED** does not necessarily mean reopened. An absent event is labelled **no longer in capture**, never reopened.

Choose a dated capture and an earlier one to compare description, road state, schedule and other source fields by event ID. Timing notes quote relevant sentences from the source; no reopening date is invented. Open **Load last … captures** for an event's recent observation history. The observed timestamp and the source's last-update timestamp are separate. Schedule end times are planned, not verified actual outcomes.

Use **Save capture JSON** for a portable receipt, **Export results CSV** for the filtered list, and **Import capture** to inspect a prior download locally. Imports are not uploaded or persisted. Saved filter views use only this browser's local storage. **Check latest saved capture** reloads published data; **Collect now** opens the GitHub workflow for the owner to run a fresh collection. Consult DriveBC for live travel decisions.
<!-- /coolcode:guide -->

## Expand the tool

No hardcoded road whitelist: all roads in the configured feed are searchable. Edit [`web/config.json`](web/config.json), commit to `main`, and its publishing workflow refreshes the data automatically.

| Setting | What to change |
|---|---|
| `quickSearches` | Any array of text queries, e.g. `"Highway 16"`, `"Golden"`. Shortcuts do not restrict the data. |
| `defaultFilters` | Initial `query`, `road`, `area`, `severity`, `type`, `status`, `since` (`YYYY-MM-DD`), `change`; empty means all. |
| `filters` | Collection scope sent to the API. Default `{"status":"ACTIVE"}` includes all currently published active/future BC events. Add `road_name`, `area_id`, `severity`, `event_type`, `event_subtype`, `bbox`, `created`, `updated` or `in_effect_on` using the official syntax. |
| `filters.bbox` | Optional `"-123.45,48.99,-122.45,49.49"` (west,south,east,north). Delete it to restore province-wide collection. |
| `pageSize` / `maxPages` | Default 500 records/page, 20 pages. Max page size is 500. Reaching the cap or any failed page aborts the entire refresh. |
| `retentionCaptures` | 120 published files by default (roughly 30 days at four/day). Increase up to 1,000 for a larger online archive. Older captures remain in Git commit history, though removed from the current Pages build. |
| `historyCaptureLimit` | 24 captures loaded per event history by default (up to 120 in the UI). Select or import older captures for further comparison. |
| `staleHours` | Warn when the newest capture is older than 12 hours. |

Collection scopes are stored with receipts. A scope change deliberately prevents misleading appeared/disappeared comparisons against the prior scope. For a completely different source, add an adapter and tests instead of replacing the DriveBC endpoint with an arbitrary URL.

## Collection and deployment

- GitHub Actions → **Road Pulse · Collect, check and publish** → **Run workflow** → leave `refresh_data` checked to collect immediately.
- Scheduled at minute 17 every six hours (UTC), subject to GitHub scheduling delays.
- A `web/config.json` or collector change on `main` also collects. Other pushes build the retained data.
- No API key or repository secret is needed. Pages uses GitHub Actions; workflows require repository Contents write permission to retain generated captures.
- Source requests are sequential, with a one-second pause between pages, a 45-second timeout and a strict page cap. The complete response must validate before any published capture changes. Duplicate IDs across pages abort a refresh rather than silently imply missing records.
- On source failure, the workflow displays a warning and publishes the last good capture. Its old timestamp remains visible. Missing all data is a build failure.
- The data commit uses a normal fast-forward push. A competing edit causes a visible failure rather than overwriting it.
- A failed run does not create a capture; a successful empty **complete** feed is a real observation. No prior history is fabricated.

Run locally (no build-time network):

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
# Only when collecting fresh data:
python3 scripts/collect.py
```

CI additionally runs the Playwright smoke test against the built Pages path. Browser tests use the real initial event fixture plus explicitly synthetic comparison variations, never published as observations.

## Evidence and limits

Official references: [DriveBC Open511 help](https://api.open511.gov.bc.ca/help), [BC API specification](https://github.com/bcgov/api-specs/tree/master/open511), [BC data catalogue](https://catalogue.data.gov.bc.ca/dataset/open511-drivebc-api), [Open Government Licence – BC](https://pub.data.gov.bc.ca/license/OGL-vbc2.0.pdf), and [API terms linked by DriveBC](https://www2.gov.bc.ca/gov/content?id=D1EE0A405E584363B205CD4353E02C88).

Contains information licensed under the Open Government Licence – British Columbia. Not an official government service and not endorsed by BC. Coverage is the configured feed, not all municipal roads or every real-world incident. Brief incidents can appear and disappear between six-hour captures. DriveBC can revise a record between pages. A missing record, expired estimate or old source timestamp is not evidence of a reopened road. Planned schedules are retained verbatim, including local values without timezone offsets; the UI does not turn them into purported UTC reopening times. Recurring schedules and raw fields remain inspectable. Spatial links use a point or a line's first coordinate only, not the complete affected segment.

No live API calls or secrets run in the public page. The browser fetches the hosted captures and config; imports and filters remain local. CoolCode's shared first-party tool metrics may run when served on CoolCode. Source/map/GitHub links navigate to their respective providers when clicked. Browser error states preserve the last displayed capture.
