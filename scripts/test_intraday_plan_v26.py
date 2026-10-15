"""V2.6 day-ahead rules are deterministic, as-of only, and non-trading."""
import json
import pathlib
import unittest
from intraday_plan_v26 import build_intraday_plan, next_tick, ceil_tick
from structure_v25 import cycle_judgement

HERE=pathlib.Path(__file__).parent


def fixture():
    return json.loads((HERE/'umc_20261014_fixture.json').read_text())['bars']


class IntradayPlanTests(unittest.TestCase):
    def test_tick_price_and_buffer_for_umc(self):
        self.assertEqual(next_tick(143),143.5)
        self.assertEqual(ceil_tick(143*1.003),143.5)
        self.assertEqual(next_tick(99.9),100.)
        self.assertEqual(next_tick(9.99),10.)
        self.assertEqual(ceil_tick(168*.03+168),173.5)

    def test_umc_prior_day_has_only_forward_observation(self):
        bars=fixture()
        s=cycle_judgement(bars)
        p=build_intraday_plan(bars,s,asof='2026-10-14')
        self.assertEqual(p['neckline'],143.)
        self.assertEqual(p['crossPrice'],143.5)
        self.assertEqual(p['asOf'],'2026-10-14')
        self.assertGreater(p['avg20Lots'],0)
        self.assertEqual(set(p['volumeTargets']),{'10:00','11:00','12:00','13:00','13:30'})
        self.assertLess(p['volumeTargets']['10:00'],p['volumeTargets']['13:30'])
        self.assertIn('未校準',p['volumeMethod'])
        self.assertNotIn('2026-10-15',json.dumps(p,ensure_ascii=False))

    def test_no_fake_neck_when_missing_data(self):
        b=fixture()
        self.assertIsNone(build_intraday_plan(b[:12],{},asof=b[11][0])['crossPrice'])
        self.assertIsNone(build_intraday_plan(b,{'primaryNeckline':None},asof=b[-1][0])['crossPrice'])

    def test_risk_cannot_become_auto_buy(self):
        b=fixture()
        s=cycle_judgement(b)
        p=build_intraday_plan(b,s,risk_level='high')
        self.assertIn('風險',p['status'])
        self.assertTrue(p['riskNotes'])

    def test_append_future_does_not_retro_change_past(self):
        b=fixture()
        before=build_intraday_plan(b,cycle_judgement(b))
        last=b[-1]
        nxt=['2026-10-15',last[4],last[4]*1.1,last[4]*.99,last[4]*1.08,last[5]*5]
        _=build_intraday_plan(b+[nxt],cycle_judgement(b+[nxt]))
        after=build_intraday_plan(b,cycle_judgement(b))
        self.assertEqual(before,after)

    def test_plan_exposes_no_won_trade_labels(self):
        p=build_intraday_plan(fixture(),cycle_judgement(fixture()))
        self.assertNotIn('必買',json.dumps(p,ensure_ascii=False))
        self.assertNotIn('買進',json.dumps(p,ensure_ascii=False))


if __name__=='__main__':unittest.main()
