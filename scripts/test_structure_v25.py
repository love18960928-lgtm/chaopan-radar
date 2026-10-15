"""Behavioral regression cases, synthetic (NOT empirical win-rate evidence)."""
import unittest
from datetime import date,timedelta
from structure_v25 import cycle_judgement


def fake_bars():
    d=date(2026,1,1);b=[]
    for i in range(80):
        while d.weekday()>=5:d+=timedelta(days=1)
        close=99+(.1 if i%3==0 else 0)
        hi,lo=100.6,97.8
        v=1800+i%200
        if i==45:hi=105;v=9500
        b.append([d.isoformat(),close,hi,lo,close,v]);d+=timedelta(days=1)
    return b


def append(b, o,h,l,c,v):
    day=date.fromisoformat(b[-1][0])+timedelta(days=1)
    while day.weekday()>=5:day+=timedelta(days=1)
    return b+[[day.isoformat(),o,h,l,c,v]]

class CycleTests(unittest.TestCase):
    def test_first_fail_reclaim_confirm_sequence(self):
        b=fake_bars()
        r0=cycle_judgement(b)
        b=append(b,100.5,107,100,106.5,3800)
        r1=cycle_judgement(b)
        self.assertTrue(r1['priceBreakout'])
        self.assertTrue('待驗證' in r1['unifiedStage'] or '品質偏弱' in r1['unifiedStage'])
        b=append(b,105,105.2,100,102.5,2600)
        r2=cycle_judgement(b)
        self.assertIn('突破失敗',r2['unifiedStage'])
        b=append(b,102.7,107,102,106.3,2400)
        r3=cycle_judgement(b)
        self.assertIn('重新站回',r3['unifiedStage'])
        self.assertFalse(r3['priceBreakout'])
        b=append(b,106,108,105.5,107.5,2200)
        r4=cycle_judgement(b)
        self.assertIn('確認',r4['unifiedStage'])
    def test_initial_weak_breakout_requires_second_day(self):
        b=fake_bars();b=append(b,100.5,111,100,105.5,850)
        r=cycle_judgement(b)
        self.assertIn('品質偏弱',r['unifiedStage'])
    def test_lookahead_by_prefix(self):
        b=fake_bars();b=append(b,100.5,107,100,106.5,3800)
        early=cycle_judgement(b);later=cycle_judgement(append(b,105,105.2,100,102.5,2600))
        self.assertEqual(early['cycle']['initialDate'],later['cycle']['initialDate'])
        self.assertEqual(early['cycle']['level'],later['cycle']['level'])
    def test_risk_first_can_override_near_breakout(self):
        b=fake_bars();b=append(b,105,106.5,95,95.2,8000)
        r=cycle_judgement(b)
        self.assertTrue(r['riskFirst'])
        self.assertIn('風險優先',r['unifiedStage'])
    def test_umc_neckline_not_historical_failed_160(self):
        import json
        from pathlib import Path
        b=json.loads((Path(__file__).parent/'umc_20261014_fixture.json').read_text())['bars']
        r=cycle_judgement(b)
        self.assertEqual(r['primaryNeckline'],143)
        self.assertFalse(r['priceBreakout'])

    def test_insufficient_history_not_a_first_break(self):
        b=fake_bars()[-59:]
        r=cycle_judgement(b)
        self.assertEqual(r['unifiedStage'],'資料不足')
        self.assertFalse(r['priceBreakout'])
        self.assertIsNone(r['unifiedScore'])
    def test_profit_review_not_forced_sell(self):
        b=fake_bars()
        b=append(b,100.5,107,100,106.5,3800)
        b=append(b,107,116,106,114.5,3300)
        b=append(b,122,125,113,114.5,8000)
        r=cycle_judgement(b)
        self.assertIn('獲利',r['profitReview'])
        self.assertNotIn('必須賣',r['entryReadiness'])

if __name__=='__main__':unittest.main()
