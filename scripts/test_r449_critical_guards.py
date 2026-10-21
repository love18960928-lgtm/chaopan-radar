"""r44.9 edge-case regression; safe offline, never downloads market data."""
import unittest
import math
from intraday_plan_v26 import next_tick,tick
from collector import make_bar,markets_needing_refresh

class TradeEdgeSafety(unittest.TestCase):
    def test_ordinary_share_tick_boundary(self):
        for previous,expected in [(9.99,10.0),(10.,10.05),(49.95,50.),
                (49.99,50.),(99.9,100.),(99.95,100.),
                (499.5,500.),(499.8,500.),(999.,1000.),(999.5,1000.)]:
            self.assertEqual(next_tick(previous),expected,(previous,expected))

    def test_all_resulting_ticks_valid(self):
        for p in [9.978,9.99,10,10.001,49.9,49.95,49.98,49.99,50,
                  99.9,99.93,99.95,99.99,100,499.5,499.7,499.9,500,999,999.9,1000]:
            n=next_tick(p)
            self.assertGreater(n,p)
            self.assertAlmostEqual(n/tick(n),round(n/tick(n)),places=6)

    def test_open_must_be_within_daily_range(self):
        self.assertIsNone(make_bar('2026-10-20','2454','聯發科','上市',106,105,100,103,1000000))
        self.assertIsNone(make_bar('2026-10-20','2454','聯發科','上市',99,105,100,103,1000000))
        self.assertIsNotNone(make_bar('2026-10-20','2454','聯發科','上市',101,105,100,103,1000000))

    def test_nonfinite_not_written(self):
        for bad in (float('nan'),float('inf'),float('-inf')):
            self.assertIsNone(make_bar('2026-10-20','2454','聯發科','上市',101,105,100,103,bad))

    def test_market_partial_session_must_retry(self):
        d='2026-10-20'
        known={('上市',d):set(map(str,range(699))),('上櫃',d):set(map(str,range(450)))}
        self.assertEqual(markets_needing_refresh(known,d),['上市'])
        known[('上市',d)].add('699')
        self.assertEqual(markets_needing_refresh(known,d),[])
        self.assertCountEqual(markets_needing_refresh({},d),['上市','上櫃'])

if __name__=='__main__':unittest.main()
