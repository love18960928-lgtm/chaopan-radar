"""V2.0 release-candidate unit checks. These are NOT trading profitability backtests."""
import unittest
from copy import deepcopy
from rules import scan_stock,build_snapshot
from trader import trader_overlay,apply_sector_relative_strength
from market_quality import breadth
from collector import score_company
from performance import update_diary,MODEL_ROUNDTRIP_COST_PCT
from test_rules import make_series
from test_launch_v14 import taihong_fixture

class CandidateDataSafety(unittest.TestCase):
    def test_volume_needs_to_clear_previous_high_not_just_close(self):
        st=make_series()
        st['bars'][-1]=['2026-10-01',98,100,97,99,16000,None]
        result=scan_stock(st)
        self.assertIsNotNone(result)
        self.assertTrue(result['volumeOverOldClose'])
        self.assertFalse(result['newVolumeAboveOldHigh'])
        self.assertNotIn('volume',result['tags'])

    def test_taihong_first_retained(self):
        signal=scan_stock(taihong_fixture())
        self.assertTrue(signal['priceConfirmed'])
        self.assertTrue(signal['onePriceLimit'])
        self.assertIn('first',signal['tags'])

    def test_short_history_is_disclosed(self):
        st=make_series()
        signal=scan_stock(st)
        self.assertEqual(signal['historicalSessions'],len(st['bars'])-1)
        self.assertFalse(signal['complete120'])
        score=trader_overlay(signal)
        self.assertIn('歷史日K未滿120根，頸線可信度較低',score['risks'])

    def test_possible_large_price_jump_warns(self):
        st=make_series()
        # historical price split/corporate-action-like discontinuity
        st['bars'][40][4]=180
        signal=scan_stock(st)
        self.assertTrue(signal['possiblePriceAdjustment'])
        self.assertEqual(trader_overlay(signal)['status'],'資料需核對')

    def test_incomplete_market_not_live(self):
        a=make_series()
        b=deepcopy(a);b['code']='9998';b['market']='上櫃'
        snapshot=build_snapshot({'上市2492':a,'上櫃9998':b})
        self.assertNotEqual(snapshot['mode'],'live')

    def test_missing_pe_does_not_act_like_pe_zero(self):
        st=make_series()
        st['fundamentals']={'revenuePeriod':'2026-09','revenueYoY':35,'revenueCumYoY':28,
                           'epsPeriod':'2026Q2','eps':3,'grossMargin':30}
        x=scan_stock(st)
        a=score_company(st,x)
        self.assertIsNotNone(a['overall'])
        self.assertTrue(a['valuationMissing'])
        with_pe=deepcopy(st);with_pe['fundamentals']['pe']=12;with_pe['fundamentals']['valuationDate']='2026-10-01'
        b=score_company(with_pe,x)
        self.assertFalse(b['valuationMissing'])
        self.assertGreaterEqual(a['overall'],0)

    def test_eps_is_available_without_revenue_feed(self):
        st=make_series();x=scan_stock(st)
        st['fundamentals']={'epsPeriod':'2026Q2','eps':3,'grossMargin':25}
        result=score_company(st,x)
        # Growth remains unavailable (no revenue), but EPS is not mistakenly treated as stale.
        self.assertIsNone(result['growth'])
        self.assertGreater(result['coverage'],0)

    def test_future_or_stale_eps_not_used(self):
        st=make_series();x=scan_stock(st)
        st['fundamentals']={'revenuePeriod':'2026-09','revenueYoY':35,'revenueCumYoY':28,
                            'epsPeriod':'2027Q2','eps':20,'grossMargin':50}
        forward=score_company(st,x)
        st['fundamentals']['epsPeriod']='2024Q1'
        stale=score_company(st,x)
        self.assertEqual(forward['growth'],stale['growth'])

    def test_market_breadth_derived_not_index_quote(self):
        st=make_series()
        x=breadth({'上市2492':st},'2026-10-01')
        self.assertEqual(x['markets']['上市']['up'],1)
        self.assertEqual(x['markets']['上市']['count'],1)
        self.assertEqual(x['markets']['上櫃']['count'],0)
        self.assertIn('非',x['source'])

    def test_cash_liquidity_is_not_volume_only(self):
        st=make_series();c=scan_stock(st)
        report=trader_overlay(c)
        self.assertIn('avgTurnover20Millions',report)
        self.assertGreater(report['avgTurnover20Millions'],0)

    def test_diary_20days_cost_before_statistics(self):
        st=taihong_fixture();signal=scan_stock(st)
        for i in range(20):
            st['bars'].append([f'2026-08-{i+1:02}',175,177,173,176,10000,None])
        summary,entries=update_diary([],{st['market']+st['code']:st},[signal],'2026-07-13')
        e=entries[0]
        self.assertIsNotNone(e['netReturn20Pct'])
        self.assertLess(abs((e['return20Pct']-e['netReturn20Pct'])-MODEL_ROUNDTRIP_COST_PCT),0.011)
        self.assertIsNone(summary['netWinRate20'])
        self.assertEqual(summary['sample20'],1)

if __name__=='__main__':unittest.main()
