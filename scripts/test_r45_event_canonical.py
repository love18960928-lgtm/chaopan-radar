"""Regression tests for old/new neckline consistency; no future prices used."""
import json
import unittest
from pathlib import Path
from rules import scan_stock,build_snapshot
from risk_v22 import build_universe
from structure_v25 import cycle_judgement

HERE=Path(__file__).resolve().parents[1]

class CanonicalEventTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        history=json.loads((HERE/'storage/history.json').read_text(encoding='utf-8'))
        cls.sample=next(x for x in history['stocks'] if x['market']=='上市' and x['code']=='1808')

    def prefix(self,date):
        return {**self.sample,'bars':[b for b in self.sample['bars'] if b[0]<=date]}

    def test_first_is_not_reset_on_second_cross(self):
        first=scan_stock(self.prefix('2026-10-12'))
        second=scan_stock(self.prefix('2026-10-13'))
        self.assertTrue(first['priceConfirmed'])
        self.assertFalse(second['priceConfirmed'])
        self.assertNotIn('first',second['tags'])
        self.assertEqual(second['followDay'],1)
        self.assertEqual(second['breakoutDate'],'2026-10-12')
        self.assertEqual(second['neck'],first['neck'])
        self.assertEqual(second['secondaryCrossedNeck'],34.9)
        # The historical neckline was crossed before this episode; its next
        # trading day must not be mislabelled as a first-breakout second bar.
        self.assertEqual(cycle_judgement(self.prefix('2026-10-13')['bars'])['breakoutSequence']['phase'],'reclaim-follow')

    def test_first_result_not_affected_by_future(self):
        early=scan_stock(self.prefix('2026-10-12'))
        _=scan_stock(self.prefix('2026-10-20'))
        self.assertEqual(early,scan_stock(self.prefix('2026-10-12')))

    def test_weak_follow_day_remains_alert(self):
        from test_launch_v14 import taihong_fixture
        s=taihong_fixture()
        s['bars'].append(['2026-07-14',162,164,158,160,18000,None])
        out=scan_stock(s)
        self.assertIsNotNone(out)
        self.assertEqual(out['followStatus'],'假突破警戒')

    def test_public_snapshots_share_canonical_event(self):
        # Do not use the latest live history.json for a *positive* test: the
        # sample may legitimately stop qualifying after a new session.
        # This fixed synthetic first-breakout fixture is independent of EOD.
        from test_launch_v14 import taihong_fixture
        stock=taihong_fixture()
        stocks={(stock['market'],stock['code']):stock}
        snap=build_snapshot(stocks)
        self.assertEqual(snap['asOf'],'2026-07-13')
        self.assertEqual(len(snap['candidates']),1)
        self.assertIn('first',snap['candidates'][0]['tags'])
        uni=build_universe(stocks,snap,snap['asOf'])
        a=snap['candidates'][0]
        b=uni['rows'][0]
        for k in ('neck','neckDate','distancePct','priceConfirmed','preLaunch','launchStage','tags','followStatus','trading'):
            self.assertEqual(a.get(k),b.get(k),k)
        self.assertIn('legacySignal',a)
        self.assertEqual(snap['counts']['first'],sum('first' in c.get('tags',[]) for c in snap['candidates']))

    def test_public_snapshots_allow_zero_candidates(self):
        # A normal, quiet trading day has no entry signal; do not fabricate one.
        # The public universe must still contain the stock for manual lookup.
        import datetime as dt
        start=dt.date(2026,5,1)
        dates=[(start+dt.timedelta(days=i)).isoformat()
               for i in range(120) if (start+dt.timedelta(days=i)).weekday()<5]
        stock={'market':'上市','code':'9998','name':'固定無訊號測試',
               'bars':[[day,100.,100.5,99.5,100.,2000,None] for day in dates]}
        stocks={(stock['market'],stock['code']):stock}
        snap=build_snapshot(stocks)
        self.assertEqual(snap['candidates'],[])
        self.assertEqual(snap['candidateCount'],0)
        uni=build_universe(stocks,snap,snap['asOf'])
        self.assertEqual(len(uni['rows']),1)
        self.assertEqual(uni['rows'][0]['code'],'9998')
        self.assertTrue(all(v==0 for v in snap['counts'].values()))

    def test_unmatched_candidate_blocks_publication(self):
        snap={'asOf':'2026-10-20','candidates':[{'market':'上市','code':'9999'}]}
        with self.assertRaisesRegex(ValueError,'unmapped radar candidates'):
            build_universe({},snap,'2026-10-20')

if __name__=='__main__': unittest.main()
