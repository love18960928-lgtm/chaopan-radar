"""Stand-alone QA tests for recently failed heavy-volume resistance.
Run with PYTHONPATH=PROJECT/scripts python -m unittest -v test_neckline_extended
Fixture is the 65-bar published subset, not full authenticated exchange history.
"""
import json, unittest
from pathlib import Path
from copy import deepcopy
from structure_v24 import unified_structure
from structure_v25 import cycle_judgement,_recent_high_volume_neckline_failure

bars=json.loads((Path(__file__).parent/'2492_20261019_snapshot_fixture.json').read_text())['bars']

class RecentNecklineAudit(unittest.TestCase):
    def setUp(self):
        self.b=deepcopy(bars)
    def flag(self, b=None, level=None, lookback=20):
        x=b or self.b
        return _recent_high_volume_neckline_failure(x,unified_structure(x) if level is None else level,lookback)
    def test_fixture_has_valid_as_of(self):
        self.assertEqual(self.b[-1][0],'2026-10-19')
        self.assertEqual(len(self.b),65)
        self.assertEqual(unified_structure(self.b)['primaryNeckline'],396.0)
    def test_correct_first_and_last_upcross_dates(self):
        r=self.flag();self.assertIsNotNone(r)
        self.assertEqual(r['anchorDate'],'2026-10-05')
        self.assertEqual(r['initialCrossDate'],'2026-10-07')
        self.assertEqual(r['lastCrossDate'],'2026-10-14')
        self.assertEqual(r['crossCount'],2)
        self.assertLess(r['lastCrossDate'],self.b[-2][0])
    def test_failure_pct_denominator_is_neckline(self):
        self.assertEqual(self.flag()['failurePct'],8.08)
    def test_only_risk_prioritized_not_rewritten_history(self):
        r=cycle_judgement(self.b)
        self.assertEqual(r['unifiedStage'],'近期大量K頸線跌回／風險優先')
        self.assertTrue(r['riskFirst']);self.assertFalse(r['priceBreakout'])
        self.assertLessEqual(r['unifiedScore'],15)
        self.assertEqual(r['cycle']['initialDate'],'2026-10-02')
        self.assertEqual(r['cycle']['level'],340)
    def test_no_false_positive_before_second_failure_close(self):
        b=self.b[:-1]
        self.assertIsNone(self.flag(b))
    def test_reclaim_last_day_clears_alert(self):
        b=self.b[:-1]+[['2026-10-19',370,408,365,405,10099]]
        self.assertIsNone(self.flag(b))
    def test_last_day_not_two_percent_below(self):
        b=self.b[:-1]+[['2026-10-19',370,395,355.5,390,10099]]
        self.assertIsNone(self.flag(b))
    def test_wrong_level_date_returns_none(self):
        base=unified_structure(self.b)
        base['primaryNecklineDate']='2026-10-21'
        self.assertIsNone(self.flag(self.b,base))
    def test_aged_anchor_not_last_twenty_days(self):
        self.assertIsNone(self.flag(self.b,lookback=3))
    def test_no_cross_after_anchor(self):
        b=deepcopy(self.b)
        idx=next(i for i,x in enumerate(b) if x[0]=='2026-10-05')
        for j in range(idx+1,len(b)):
            b[j][4]=min(b[j][4],395)
            b[j][1]=min(b[j][1],395)
        self.assertIsNone(self.flag(b))
    def test_as_of_no_future_leak(self):
        idx=next(i for i,x in enumerate(self.b) if x[0]=='2026-10-16')
        prefix=self.b[:idx+1]
        before=cycle_judgement(prefix)
        _=cycle_judgement(self.b)
        after=cycle_judgement(prefix)
        self.assertEqual(before,after)
        self.assertIsNone(before['setupEvidence']['recentVolumeNecklineFailure'])
    def test_insufficient_bars_cannot_claim_failure(self):
        self.assertIsNone(_recent_high_volume_neckline_failure(self.b[:2],{},20))

if __name__=='__main__':unittest.main()
