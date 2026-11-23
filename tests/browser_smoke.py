"""CI-only browser smoke. Real source fixture plus labelled in-memory comparison variants."""
import functools
import base64
import http.server
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def main():
 output=ROOT/'browser-checks';output.mkdir(exist_ok=True)
 handler=functools.partial(QuietHandler,directory=str(ROOT/'dist'))
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
 thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch()
   page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
   failures=[];page.on('pageerror',lambda e:failures.append(str(e)))
   # Never fetch OpenStreetMap tiles in automation. Interactive geometry is real;
   # this small blank image substitutes only for the background tile service.
   tile_requests=[]
   blank_tile=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhZkAAAAASUVORK5CYII=')
   def mock_tile(route):
    tile_requests.append(route.request.url)
    route.fulfill(status=200,content_type='image/png',body=blank_tile)
   page.route('https://tile.openstreetmap.org/**',mock_tile)
   page.goto(f'http://127.0.0.1:{server.server_port}/');page.locator('.event-card').first.wait_for()
   assert int(page.locator('#total-count').inner_text().replace(',',''))>0
   assert not tile_requests, 'Offscreen maps must not prefetch tiles'
   page.locator('#road-map').scroll_into_view_if_needed()
   expect(page.locator('#road-map')).to_have_attribute('data-ready','true')
   expect(page.locator('[data-map-event]')).not_to_have_count(0)
   assert int(page.locator('#road-map').get_attribute('data-event-count'))>50
   assert page.locator('[data-geometry="LineString"]').count()>0
   assert page.locator('[data-geometry="Point"]').count()>0
   # Narrow to one actual point so its SVG is not obscured by neighbouring roads.
   point_id=page.locator('[data-geometry="Point"]').first.get_attribute('data-map-event')
   page.locator('#query').fill(point_id)
   expect(page.locator('#road-map')).to_have_attribute('data-event-count','1')
   expect(page.locator('.event-card')).to_have_count(1)
   page.locator('#road-map').scroll_into_view_if_needed()
   page.locator('#map-fit').click()
   page.locator('[data-map-event]').click()
   expect(page.locator('#detail .event-id')).to_have_text(point_id)
   expect(page.locator('.event-card')).to_have_attribute('aria-pressed','true')
   expect(page.locator('[data-map-event]')).to_have_attribute('data-selected','true')
   expect(page.locator('.leaflet-popup')).to_be_visible()
   page.locator('#map-toggle').click();expect(page.locator('#map-body')).to_be_hidden()
   page.locator('#map-toggle').click();expect(page.locator('#map-body')).to_be_visible()
   page.locator('#query').fill('this road cannot exist 99999999999');assert page.locator('.empty').is_visible();expect(page.locator('#road-map')).to_have_attribute('data-event-count','0')
   page.locator('#reset').click();page.locator('.event-card').first.click();assert page.locator('#detail h3').inner_text()
   with page.expect_download() as dl:page.locator('#save-json').click()
   receipt=json.loads(Path(dl.value.path()).read_text());assert receipt['tool']=='roadpulse'
   published_capture=page.locator('#capture-select').input_value()
   # A synthetic prior capture exists only in the test upload, never in published data.
   earlier=json.loads(json.dumps(receipt));earlier['capturedAt']='2020-01-01T00:00:00Z';earlier['events']=earlier['events'][:-1]
   page.locator('#import').set_input_files({'name':'test-prior.json','mimeType':'application/json','buffer':json.dumps(earlier).encode()})
   page.locator('#message').filter(has_text='Imported').wait_for()
   imported_capture=page.locator('#capture-select').input_value()
   assert imported_capture.startswith('import-')
   # Scheduled CI refreshes can add several real captures. Select identities, not
   # option positions: the previous real capture may correctly be unchanged.
   page.locator('#capture-select').select_option(published_capture)
   page.locator('#compare-select').select_option(imported_capture)
   expect(page.locator('#compare-note')).to_contain_text('matched by DriveBC')
   page.locator('#change').select_option('appeared')
   expect(page.locator('.event-card')).to_have_count(1)
   expect(page.locator('.event-card')).to_have_attribute('data-event', receipt['events'][-1]['id'])
   page.locator('#reset').click();page.locator('#save-watch').click();assert page.locator('#watch-list button').count()>=2
   page.locator('#road-map').scroll_into_view_if_needed()
   page.screenshot(path=str(output/'desktop.png'),full_page=True)
   assert tile_requests
   assert page.locator('#map-attribution a').first.get_attribute('href')=='https://www.openstreetmap.org/copyright'
   page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(output/'mobile.png'),full_page=True)
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
   # Tile-service failures must leave geometry and records usable.
   failed_map=browser.new_page(viewport={'width':1200,'height':900})
   failed_map.route('https://tile.openstreetmap.org/**',lambda route:route.abort())
   failed_map.goto(f'http://127.0.0.1:{server.server_port}/')
   failed_map.locator('.event-card').first.wait_for()
   failed_map.locator('#road-map').scroll_into_view_if_needed()
   expect(failed_map.locator('#map-tile-status')).to_contain_text('background tiles could not load')
   expect(failed_map.locator('[data-map-event]')).not_to_have_count(0)
   expect(failed_map.locator('.event-card').first).to_be_attached()
   failed_map.close()
   assert not failures,failures
   browser.close()
 finally:server.shutdown();server.server_close()
if __name__=='__main__':main()
