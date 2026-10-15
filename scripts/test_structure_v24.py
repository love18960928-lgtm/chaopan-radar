"""Regression: one near-term pressure and support engine; no AND-gated exclusions."""
import unittest, json
from pathlib import Path
from structure_v24 import unified_structure

ROOT=Path(__file__).resolve().parents[1]

class UnifiedRecentTests(unittest.TestCase):
 def umc(self):
  fixture=json.loads((ROOT/'scripts/umc_20261014_fixture.json').read_text('utf-8'))
  return fixture['bars']
 def test_umc_20261014_neckline_is_143_not_131_support(self):
  b=self.umc(); r=unified_structure(b)
  self.assertEqual(r['primaryNeckline'],143.0)
  self.assertEqual(r['unifiedStage'],'接近近期頸線')
  self.assertTrue(r['primarySupport'] is None or r['primarySupport']['lower']<=b[-1][4])
 def test_umc_20261015_scenario_keeps_143_and_nearest_support(self):
  # Last day's OHLCV is a TEST FIXTURE, not represented as confirmed market data.
  b=self.umc()+[['2026-10-15',137.,138.,132.,133.5,160000.]]
  r=unified_structure(b)
  self.assertEqual(r['primaryNeckline'],143.0)
  self.assertTrue(r['primarySupport'])
  self.assertTrue(130<=r['primarySupport']['lower']<=134)
  self.assertTrue(r['unifiedStage'] not in ('近期頸線首次突破','資料不足'))
 def test_new_large_candle_not_its_own_old_neckline(self):
  b=self.umc()+[['2026-10-15',145.,170.,142.,156.,900000.]]
  r=unified_structure(b)
  self.assertTrue(r['newVolumeReference'] and r['newVolumeReference']['formedToday'])
  self.assertNotEqual(r['primaryNeckline'],170)
 def test_asof_time_protection(self):
  b=self.umc(); earlier=unified_structure(b[:-1]);whole=unified_structure(b)
  self.assertIsNotNone(whole['rules']);self.assertLessEqual(earlier['historyDays'],whole['historyDays'])
 def test_risk_does_not_delete_record(self):
  from risk_v22 import assess_stock,market_context
  b=self.umc()+[['2026-10-15',137.,138.,132.,133.5,160000.]]
  st={'code':'2303','name':'聯電','market':'上市','bars':b}
  c=assess_stock(st,{},market_context({'上市2303':st},'2026-10-15'),'2026-10-15')
  self.assertEqual(c['code'],'2303');self.assertEqual(c['neck'],143)
  self.assertIsNotNone(c.get('unifiedStage'))
  self.assertEqual(c['launchStage'],c['unifiedStage'])
 def test_every_observation_gets_same_keys(self):
  b=self.umc()
  z=unified_structure(b)
  for key in ('primaryNeckline','primarySupport','unifiedStage','unifiedScore','volumeBreakout','priceBreakout','recentResistanceLevels'):
   self.assertIn(key,z)

if __name__=='__main__':unittest.main()
