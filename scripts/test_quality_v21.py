"""V2.1 timing and historical-pressure tests. Synthetic fixtures, not investing forecasts."""
import copy
import unittest
from collector import score_company
from rules import scan_stock
from trader import trader_overlay
from test_rules import make_series


def with_finance(period='2026-08', eps_period='2026Q2', eps=5, pe=None, value_date=None, trade_date='2026-10-01'):
    s=make_series()
    s['bars'][-1][0]=trade_date
    s['fundamentals']={'revenuePeriod':period,'revenueYoY':35,'revenueCumYoY':28,
                       'epsPeriod':eps_period,'eps':eps,'grossMargin':40}
    if pe is not None:
        s['fundamentals']['pe']=pe
        s['fundamentals']['valuationDate']=value_date or trade_date
    return s,scan_stock(s)

class V21SafeData(unittest.TestCase):
    def test_monthly_revenue_not_available_before_next_month_11th(self):
        s,c=with_finance(period='2026-09',trade_date='2026-10-01')
        self.assertIsNone(score_company(s,c)['growth'])
        s,c=with_finance(period='2026-09',trade_date='2026-10-11')
        self.assertIsNotNone(score_company(s,c)['growth'])

    def test_future_pe_is_rejected(self):
        s,c=with_finance(pe=10,value_date='2026-10-02',trade_date='2026-10-01')
        self.assertTrue(score_company(s,c)['valuationMissing'])
        s,c=with_finance(pe=10,value_date='2026-10-01',trade_date='2026-10-01')
        self.assertFalse(score_company(s,c)['valuationMissing'])

    def test_quarter_eps_is_not_used_until_conservative_release_date(self):
        s,c=with_finance(eps_period='2026Q3',eps=30,trade_date='2026-11-14')
        self.assertEqual(score_company(s,c)['coverage'],77)  # 50/65, no EPS
        s,c=with_finance(eps_period='2026Q3',eps=30,trade_date='2026-11-16')
        self.assertEqual(score_company(s,c)['coverage'],100)

    def test_same_eps_sign_same_score_not_absolute_amount(self):
        s,c=with_finance(eps=1)
        result1=score_company(s,c)
        s['fundamentals']['eps']=20
        result2=score_company(s,c)
        self.assertEqual(result1['growth'],result2['growth'])
        self.assertEqual(result1['overall'],result2['overall'])

    def test_longer_history_high_is_context_not_verified_cost(self):
        s=make_series()
        a=scan_stock(s)
        self.assertEqual(a['historicalPeakSessions'],79)
        self.assertFalse(a['complete250'])
        self.assertIsNotNone(a['historicalPeakHigh'])
        tr=trader_overlay(a)
        self.assertEqual(tr['historicalPeakHigh'],a['historicalPeakHigh'])

    def test_near_higher_peak_reduces_entry_not_holding_trend(self):
        s=make_series()
        a=scan_stock(s)
        base=trader_overlay(a)
        high=copy.deepcopy(a)
        high['historicalPeakGapPct']=4.0
        tr=trader_overlay(high)
        self.assertLess(tr['entryQuality'],base['entryQuality'])
        self.assertEqual(tr['holdQuality'],base['holdQuality'])
        self.assertTrue(any('歷史高點' in x for x in tr['risks']))

    def test_low_history_never_promoted_as_verified_120_day(self):
        s=make_series()
        tr=trader_overlay(scan_stock(s))
        self.assertEqual(tr['status'],'資料需核對')
        self.assertIn('歷史日K未滿120根，頸線可信度較低',tr['risks'])

if __name__=='__main__':unittest.main()
