"""Synthetic, no-look-ahead regression checks for operator-quality release.

These are algorithmic tests, NOT empirical profitability validation.
"""
import unittest
from copy import deepcopy
from trader import trader_overlay
from performance import update_diary
from test_launch_v14 import taihong_fixture
from rules import scan_stock,build_snapshot

class TraderV16(unittest.TestCase):
    def test_taihong_first_still_triggers_without_volume(self):
        c=scan_stock(taihong_fixture())
        self.assertTrue(c['priceConfirmed'])
        self.assertTrue(c['onePriceLimit'])
        self.assertEqual(c['oldMaxLots'],41300)
        self.assertIn('first',c['tags'])

    def test_following_day_not_a_new_first(self):
        s=taihong_fixture()
        s['bars'].append(['2026-07-14',170,172,168.8,171,3500,None])
        c=scan_stock(s)
        self.assertIn('follow',c['tags'])
        self.assertEqual(c['followDay'],1)
        self.assertEqual(c['breakoutDate'],'2026-07-13')
        self.assertEqual(c['followStatus'],'突破續強')
        self.assertNotIn('first',c['tags'])

    def test_broken_neck_is_warned(self):
        s=taihong_fixture();s['bars'].append(['2026-07-14',162,164,158,160,18000,None])
        c=scan_stock(s)
        self.assertEqual(c['followStatus'],'假突破警戒')
        self.assertIn('follow',c['tags'])

    def test_no_signals_beyond_five_sessions(self):
        s=taihong_fixture()
        for i in range(14,22):
            s['bars'].append([f'2026-07-{i}',185,188,180,185,3500,None])
        c=scan_stock(s)
        self.assertTrue(c is None or c.get('followDay') is None)

    def test_trading_has_no_fake_probability(self):
        c=scan_stock(taihong_fixture());tr=trader_overlay(c)
        self.assertTrue(0<=tr['score']<=100)
        self.assertIn('trend',tr);self.assertIn('entryQuality',tr)
        self.assertEqual(tr['status'],'不宜追價')
        self.assertIn('一字漲停，可能無法買到',tr['risks'])
        self.assertNotIn('winRate',tr)

    def test_diary_only_once_and_cannot_fabricate_future(self):
        s=taihong_fixture();c=scan_stock(s)
        stocks={'上市8039':s}
        perf,entries=update_diary([],stocks,[c],'2026-07-13')
        self.assertEqual(perf['recorded'],1)
        self.assertIsNone(perf['winRate5'])
        self.assertIsNone(entries[0]['nextOpen'])
        perf,entries=update_diary(entries,stocks,[c],'2026-07-13')
        self.assertEqual(len(entries),1)

    def test_diary_next_day_one_price_not_tradeable(self):
        s=taihong_fixture();c=scan_stock(s)
        s['bars'].append(['2026-07-14',185,185,185,185,350,None])
        perf,entries=update_diary([],{'上市8039':s},[c],'2026-07-13')
        self.assertFalse(entries[0]['fillableModel'])
        self.assertIsNone(entries[0]['return5Pct'])

    def test_can_evaluate_only_after_full_five_days(self):
        s=taihong_fixture();c=scan_stock(s)
        for i in range(14,20):
            s['bars'].append([f'2026-07-{i}',170+i-14,178+i-14,168+i-14,171+i-14,6000,None])
        perf,entries=update_diary([],{'上市8039':s},[c],'2026-07-13')
        self.assertEqual(entries[0]['nextOpen'],170)
        self.assertIsNotNone(entries[0]['return5Pct'])
        self.assertIsNone(entries[0]['return10Pct'])

    def test_rules_snapshot_has_trader_version(self):
        snap=build_snapshot({'上市8039':taihong_fixture()})
        self.assertEqual(snap['rulesVersion'],'eod-v2.0-core')

if __name__=='__main__':unittest.main()
