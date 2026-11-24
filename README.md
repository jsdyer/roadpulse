# Road Pulse

Dated British Columbia road observations from the official, keyless DriveBC Open511 API. Public app: **https://coolcode.ca/roadpulse/**. Source: https://github.com/jsdyer/roadpulse.

<!-- coolcode:guide -->
Search any road, town or event ID in the captured BC feed, choose an area/severity/type, and explore the matching events on the interactive map. Lines retain the source's reported road geometry; dots show source points. Click either a map feature or a list entry to select the same event receipt. **Fit results** frames every mapped result, **Zoom to selected** focuses one event, and **Show on this map** returns from a receipt to its location. The keyboard-accessible event list stays available, including records without usable coordinates. The initial capture contains real DriveBC records; history grows after subsequent successful collections. The source's **ACTIVE** status includes future planned work. **ARCHIVED** does not necessarily mean reopened. An absent event is labelled **no longer in capture**, never reopened.

The map and list follow the same dated capture and filters. Grey dashed geometry represents an absent event's last known position; it does not mean the road reopened. Hide the map at any time. Background tiles load only while the map is visible; a tile-service failure leaves road geometry and receipts usable.

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
| `map.enabled` | Set `false` to disable the map while preserving the complete list and receipt features. |
| `map.tileUrl` | Default `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Set an alternative provider's HTTPS XYZ template, or `""` for geometry without a basemap. Do not put a secret key in public config. |
| `map.attributionText` / `map.attributionUrl` | Required visible attribution for the chosen tile provider; keep the default OpenStreetMap credit when using its tiles. Text is rendered literally, never as HTML. |
| `map.maxZoom` / `map.fitMaxZoom` | Provider maximum zoom (18 default) and the maximum automatic results/selection zoom (12). Both are bounded to 1–19. |
| `map.initialCenter` / `map.initialZoom` | Fallback view for an empty result: `[latitude, longitude]`, e.g. `[54, -125]`, and zoom `5`. |

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

Contains information licensed under the Open Government Licence – British Columbia. Not an official government service and not endorsed by BC. Coverage is the configured feed, not all municipal roads or every real-world incident. Brief incidents can appear and disappear between six-hour captures. DriveBC can revise a record between pages. A missing record, expired estimate or old source timestamp is not evidence of a reopened road. Planned schedules are retained verbatim, including local values without timezone offsets; the UI does not turn them into purported UTC reopening times. Recurring schedules and raw fields remain inspectable. The embedded map draws each valid source Point or the full LineString, retaining every vertex. It does not infer a route or closure length from text. Unsupported or malformed geometry remains in the event list and is counted as unmapped. External OpenStreetMap links use a point or a line's first coordinate only. The map is a view of the selected dated capture, not a live traffic map.

No live DriveBC API calls or secrets run in the public page. The browser fetches the hosted captures and config; imports and filters remain local. When the map is visible, background tile requests go directly to its configured provider (OpenStreetMap by default), revealing the viewed area and normal browser request metadata. The app does not upload event JSON, search text, or imported files to that provider. CoolCode's shared first-party tool metrics may run when served on CoolCode. Source/map/GitHub links navigate to their respective providers when clicked. Browser error states preserve the last displayed capture.

## Map dependencies and tile service

[Leaflet 1.9.4](https://leafletjs.com/install.html), the stable 1.x release, is vendored locally in `web/vendor/leaflet/`. JavaScript and CSS were downloaded from the exact official-documented jsDelivr release URLs and checked against the SHA-256 SRI digests published by Leaflet. `PROVENANCE.json` records URLs and hashes; the BSD 2-Clause licence is included. The offline build does not contact a CDN. No additional npm dependency or API key is required.

The default basemap follows the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/): visible attribution, exact HTTPS tile URL, browser caching, an explicit `strict-origin-when-cross-origin` referrer policy, zero offscreen tile buffer, and no bulk download, offline tile export, prefetch or background map scans. The map's tile layer is paused outside the visible page area and in background tabs. Use a suitable alternative provider if traffic outgrows the community tile service. Map controls are not a directions engine.

CI substitutes a local blank tile response for **all** OSM tile requests. It checks point and line display, shared filtering, feature selection, hide/show, capture comparison and failed-tile fallback without contacting the community tile service. Node tests check full geometry preservation, malformed-coordinate handling, matching filtered IDs, bounds and absent-event semantics. No historical event data is changed by the map addition.

<!-- schedule-reliability -->
## Schedule reliability

Public GitHub repositories can have scheduled workflows disabled after 60 days of inactivity. A separate weekly [schedule guard](.github/workflows/schedule-guard.yml) calls GitHub's enable-workflow API for an explicit list of refresh workflows and itself. It can restore workflows disabled for inactivity, preserves manually disabled workflows, and runs independently of collection failures.

This is an interim mitigation, not a scheduling guarantee: GitHub does not document active-workflow renewal as a permanent exemption, and scheduled runs can be delayed or dropped. A scheduler on our own Linux server is the planned independent trigger. The guard does not collect data, create dummy commits, or change source/check timestamps; successful collection and published data freshness still need monitoring.
<!-- /schedule-reliability -->
