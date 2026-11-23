"""Vendored map runtime must match the official published integrity digests."""
import base64
import hashlib
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class MapVendorTests(unittest.TestCase):
 def test_leaflet_matches_official_release_and_license_is_included(self):
  root=ROOT/'web/vendor/leaflet'
  provenance=json.loads((root/'PROVENANCE.json').read_text())
  self.assertEqual(provenance['version'],'1.9.4')
  for name,record in provenance['files'].items():
   digest=hashlib.sha256((root/name).read_bytes()).digest()
   self.assertEqual('sha256-'+base64.b64encode(digest).decode(),record['officialSRI'])
  self.assertIn('BSD 2-Clause License',(root/'LICENSE').read_text())
if __name__=='__main__':unittest.main()
