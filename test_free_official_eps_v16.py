"""Regression tests for free official listed EPS fallback and publication dates."""
import datetime as dt
import unittest
from collector import financial_fields, earnings_available_at,parse_financial_issue_date
from risk_v22 import published_fundamentals
from valuation_verified_v14 import derive_model
from test_valuation_verified_v14 import FIN,EPS,PES

class FreeOfficialEpsTests(unittest.TestCase):
    def test_gov_roc_issue_date(self):
        self.assertEqual(parse_financial_issue_date('1151015'),'2026-10-15')
        self.assertEqual(parse_financial_issue_date('20261015'),'2026-10-15')
        self.assertEqual(parse_financial_issue_date('2026/10/15'),'2026-10-15')
        self.assertIsNone(parse_financial_issue_date('1151399'))
    def test_q2_ytd_labeled_explicitly(self):
        row={'年度':'115','季別':'2','基本每股盈餘(元)':'49.33','出表日期':'1150810'}
        fin=financial_fields('income',row)
        self.assertEqual(fin['eps'],49.33)
        self.assertEqual(fin['epsBasis'],'年初累計')
        self.assertEqual(fin['epsStatementDate'],'2026-08-10')
        self.assertEqual(fin['epsPeriod'],'2026Q2')
    def test_issuer_early_q3_official_snapshot_available(self):
        f={'epsPeriod':'2026Q3','eps':78.76,'epsStatementDate':'2026-10-15'}
        self.assertTrue(earnings_available_at(f,'2026-10-16'))
        self.assertIn('eps',published_fundamentals(f,'2026-10-16'))
        self.assertEqual(published_fundamentals(f,'2026-10-16')['epsBasis'],'年初累計')
    def test_early_report_cannot_appear_before_its_date(self):
        f={'epsPeriod':'2026Q3','eps':78.76,'epsStatementDate':'2026-10-15'}
        self.assertFalse(earnings_available_at(f,'2026-10-14'))
        self.assertNotIn('eps',published_fundamentals(f,'2026-10-14'))
    def test_no_issue_date_uses_conservative_cutoff(self):
        f={'epsPeriod':'2026Q3','eps':78.76}
        self.assertFalse(earnings_available_at(f,'2026-10-16'))
        self.assertNotIn('eps',published_fundamentals(f,'2026-10-16'))
    def test_impossible_issue_date_is_rejected(self):
        f={'epsPeriod':'2026Q3','eps':78.76,'epsStatementDate':'2026-01-01'}
        self.assertFalse(earnings_available_at(f,'2026-10-16'))
        self.assertNotIn('eps',published_fundamentals(f,'2026-10-16'))
    def test_valuation_model_respects_issue_date(self):
        f={**FIN,'epsStatementDate':'2026-08-10'}
        self.assertIsNotNone(derive_model(f,50,EPS,PES,'2026-10-16'))
        f['epsStatementDate']='2026-10-17'
        self.assertIsNone(derive_model(f,50,EPS,PES,'2026-10-16'))
    def test_pe_without_history_cannot_fake_target(self):
        f={'epsPeriod':'2026Q3','eps':50,'epsStatementDate':'2026-10-15','pe':20}
        self.assertNotIn('modelTargetMid',published_fundamentals(f,'2026-10-16'))

if __name__=='__main__':unittest.main()
