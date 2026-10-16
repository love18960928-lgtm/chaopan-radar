"""No look-ahead and strict daily MA5/10 evidence for r6."""
import unittest
from continuation_v303 import continuation_context
from test_continuation_v303 import sample

class TradeMA510R6Tests(unittest.TestCase):
    def test_all_stocks_get_recent_5_10_without_breakout(self):
        b=[[str(i),100.,101.,99.,100.,1000] for i in range(90)]
        x=continuation_context(b)
        self.assertIsNone(x['strictMA510Hold'])
        self.assertTrue(x['recentCloseHold5'])
        self.assertTrue(x['recentCloseHold10'])
        self.assertEqual(x['consecutiveCloseMA510'],81)
        self.assertIsNone(x['trailingStop'])

    def test_since_historical_breakout_has_non_decreasing_stop(self):
        b=sample(24)
        stops=[]
        for end in range(65,len(b)+1):
            value=continuation_context(b[:end])['trailingStop']
            if value is not None: stops.append(value)
        self.assertTrue(stops)
        self.assertEqual(stops,sorted(stops))
        x=continuation_context(b)
        self.assertGreater(x['highestCloseSinceBreakout'],x['originalNeckline'])
        self.assertIsNotNone(x['atr14'])
        self.assertTrue(x['recentCloseHold10'])

    def test_midway_ma_break_not_strict_but_recent_can_requalify(self):
        b=sample(26)
        b[70][4]=107.05;b[70][1]=108;b[70][3]=106
        x=continuation_context(b)
        self.assertFalse(x['strictMA510Hold'])
        self.assertTrue(x['recentCloseHold5'])
        self.assertTrue(x['recentCloseHold10'])

    def test_no_future_data_used(self):
        b=sample(24)
        early=continuation_context(b[:-1]); later=continuation_context(b)
        self.assertNotEqual(early['highestCloseSinceBreakout'],later['highestCloseSinceBreakout'])
        self.assertEqual(early['breakoutDate'],later['breakoutDate'])

if __name__=='__main__':unittest.main()
