"""CI-only browser smoke. Real source fixture plus labelled in-memory comparison variants."""
import functools
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
   page.goto(f'http://127.0.0.1:{server.server_port}/');page.locator('.event-card').first.wait_for()
   assert int(page.locator('#total-count').inner_text().replace(',',''))>0
   page.locator('#query').fill('this road cannot exist 99999999999');assert page.locator('.empty').is_visible()
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
   page.screenshot(path=str(output/'desktop.png'),full_page=True)
   page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(output/'mobile.png'),full_page=True)
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
   assert not failures,failures
   browser.close()
 finally:server.shutdown();server.server_close()
if __name__=='__main__':main()
