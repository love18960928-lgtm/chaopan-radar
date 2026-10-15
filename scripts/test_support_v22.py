"""Support zones must be observable as of today and must not imply hidden dealer inventory."""
import unittest
from datetime import date,timedelta
from support_v22 import support_evidence

D=date(2026,10,15)
def bars(n=67,close=106):
    return [[(D-timedelta(days=n-1-i)).isoformat(),close,close+1,close-1,close,1000]
            for i in range(n)]

class SupportTests(unittest.TestCase):
    def test_short_history_says_insufficient(self):
        self.assertFalse(support_evidence(bars(12))['levels'])
    def test_up_gap_detected_after_held_open(self):
        b=bars();b[42]=[b[42][0],105,107,104.5,106,1300]
        b[41]=[b[41][0],100,101,99,100.5,1000]
        for i in range(43,len(b)):
            b[i][1:5]=[106,107,104.5,106]
        a=support_evidence(b)
        gap=[x for x in a['levels'] if x['kind']=='gap']
        self.assertTrue(gap)
        self.assertEqual(101,gap[0]['lower'])
        self.assertEqual(104.5,gap[0]['upper'])
    def test_gap_filled_prior_to_today_is_invalidated(self):
        b=bars();b[41][1:5]=[100,101,99,100.5];b[42][1:5]=[105,107,104.5,106]
        for i in range(43,len(b)):b[i][1:5]=[106,107,104.5,106]
        b[55][1:5]=[100,102,100,101]
        a=support_evidence(b)
        self.assertFalse([x for x in a['levels'] if x['kind']=='gap' and x['date']==b[42][0]])
    def test_abnormal_volume_candle_support_included(self):
        b=bars();b[35][1:6]=[101,105,99,103,4900]
        a=support_evidence(b)
        ks=[x for x in a['levels'] if x['kind']=='volume']
        self.assertTrue(ks)
        self.assertEqual(99,ks[0]['lower'])
    def test_one_intraday_breach_but_close_back_is_not_break(self):
        b=bars();b[35][1:6]=[101,105,99,103,4900]
        b[-1][1:5]=[101,105,98,103]
        a=support_evidence(b)
        ks=[x for x in a['levels'] if x['kind']=='volume' and x['date']==b[35][0]]
        self.assertTrue(ks)
        self.assertFalse(ks[0]['oneDayBreak'])
        self.assertFalse(ks[0]['confirmedBreak'])
    def test_two_closes_below_volume_floor_confirm_break(self):
        b=bars();b[35][1:6]=[101,105,99,103,4900]
        b[-2][1:5]=[97,99,96.5,97]
        b[-1][1:5]=[95,97,94,95]
        a=support_evidence(b)
        ks=[x for x in a['levels'] if x['kind']=='volume' and x['date']==b[35][0]]
        self.assertTrue(ks)
        self.assertTrue(ks[0]['confirmedBreak'])
    def test_future_bars_never_included_as_support_anchor(self):
        b=bars();b[-1][1:6]=[101,106,98,105,15000]
        a=support_evidence(b)
        self.assertFalse(any(x['date']==b[-1][0] for x in a['levels']))
    def test_zone_note_does_not_claim_known_main_cost(self):
        b=bars();b[35][1:6]=[101,105,99,103,4900]
        a=support_evidence(b)
        self.assertIn('非主力成本',a['note'])

if __name__=='__main__':unittest.main()
