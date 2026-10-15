"""V2.3 independent price levels: no future data, no automatic support reset."""
import unittest
from datetime import date, timedelta
from structure_v23 import structure_evidence

D=date(2026,10,15)
def series(length=105):
    out=[]
    for i in range(length):
        day=(D-timedelta(days=length-1-i)).isoformat()
        out.append([day,44.0,46.0,42.0,44.0,1000.0])
    if length>25:out[25][1:6]=[42.,45.,39.,40.,8500.]
    return out

class StructureTests(unittest.TestCase):
    def test_short_history_never_makes_levels(self):
        self.assertIsNone(structure_evidence(series(25))['neckline'])
    def test_not_claim_24_months(self):
        self.assertFalse(structure_evidence(series())['historyComplete24m'])
    def test_latest_massive_candle_creates_next_day_neck_not_support(self):
        b=series();b[-1][1:6]=[46.,50.,44.,48.,10000.]
        r=structure_evidence(b)
        self.assertEqual(50.,r['neckline'])
        self.assertEqual('今日大量K形成／下次突破參考',r['necklineState'])
        self.assertTrue(all(x['date']!=b[-1][0] for x in r['supports']))
    def test_deep_volume_support_persists_after_new_high(self):
        b=series();before=structure_evidence(b)
        b[-1][1:6]=[46.,50.,44.,48.,10000.]
        after=structure_evidence(b)
        self.assertIsNotNone(after['mainDefense'])
        self.assertEqual(40,after['mainDefense']['keyPrice'])
        self.assertEqual(50,after['neckline'])
        self.assertEqual(before['mainDefense']['keyPrice'],after['mainDefense']['keyPrice'])
    def test_main_support_demoted_after_two_closes_below_floor(self):
        b=series()
        b[-2][1:5]=[39,40,36,37]
        b[-1][1:5]=[37,38,35,36]
        r=structure_evidence(b)
        self.assertFalse(r['mainDefense'] and r['mainDefense'].get('keyPrice')==40)
        self.assertTrue(any(x['kind']=='volume' and x.get('keyPrice')==40 and x['confirmedBreak'] for x in r['brokenSupport']))
    def test_any_new_breakout_does_not_erase_old_volume_keys(self):
        b=series();b[-1][1:6]=[46,50,44,48,11000]
        r=structure_evidence(b)
        self.assertTrue(any(x['close']==40 and x['date']==b[25][0] for x in r['volumeKeyLevels']))
    def test_no_support_promotion_on_unretested_neck(self):
        b=series();b[-1][1:6]=[46,50,44,48,11000]
        r=structure_evidence(b)
        self.assertFalse(any(x['kind']=='neckRetest' and x['date']==b[-1][0] for x in r['supports']))

if __name__=='__main__':unittest.main()
