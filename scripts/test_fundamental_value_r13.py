import unittest
from collector import financial_fields
from risk_v22 import published_fundamentals


class FundamentalR13Tests(unittest.TestCase):
    def fixture(self):
        return {
            'industry':'半導體', 'revenuePeriod':'2026-09',
            'revenueMonthThousand':125000000, 'revenueCumThousand':985000000,
            'revenueYoY':27.4, 'revenueCumYoY':18.3,
            'epsPeriod':'2026Q2','eps':7.8,'grossMargin':54.4,
            'valuationDate':'2026-10-16','pe':21.3,'pb':4.2
        }
    def test_parse_roc_revenue_with_thousand_unit(self):
        row={'資料年月':'11509','營業收入-當月營收':'125,000,000',
             '累計營業收入-當月累計營收':'985,000,000',
             '營業收入-去年同月增減(%)':'27.4',
             '累計營業收入-前期比較增減(%)':'18.3','產業別':'半導體'}
        res=financial_fields('revenue',row)
        self.assertEqual(res['revenuePeriod'],'2026-09')
        self.assertEqual(res['revenueMonthThousand'],125000000)
        self.assertEqual(res['revenueCumThousand'],985000000)
        self.assertEqual(res['revenueYoY'],27.4)
    def test_valid_public_fields_same_month(self):
        f=published_fundamentals(self.fixture(),'2026-10-16')
        self.assertEqual(f['revenueMonthThousand'],125000000)
        self.assertEqual(f['eps'],7.8)
        self.assertEqual(f['pe'],21.3)
    def test_revenue_not_yet_published_before_gate(self):
        f=published_fundamentals(self.fixture(),'2026-10-09')
        self.assertNotIn('revenueYoY',f)
        self.assertNotIn('revenueMonthThousand',f)
    def test_current_q3_not_public_in_october(self):
        f=self.fixture();f['epsPeriod']='2026Q3';f['eps']=99
        self.assertNotIn('eps',published_fundamentals(f,'2026-10-16'))
    def test_future_revenue_excluded(self):
        f=self.fixture();f['revenuePeriod']='2026-11'
        self.assertNotIn('revenueMonthThousand',published_fundamentals(f,'2026-10-16'))
    def test_stale_revenue_excluded(self):
        f=self.fixture();f['revenuePeriod']='2026-01'
        self.assertNotIn('revenueYoY',published_fundamentals(f,'2026-10-16'))
    def test_no_eps_without_report_period(self):
        f=self.fixture();del f['epsPeriod']
        self.assertNotIn('eps',published_fundamentals(f,'2026-10-16'))
    def test_valuation_future_or_stale_excluded(self):
        f=self.fixture();f['valuationDate']='2026-10-17'
        self.assertNotIn('pe',published_fundamentals(f,'2026-10-16'))
        f['valuationDate']='2026-09-01'
        self.assertNotIn('pe',published_fundamentals(f,'2026-10-16'))
    def test_invalid_asof_exposes_only_industry(self):
        f=published_fundamentals(self.fixture(),'garbage')
        self.assertEqual(f,{'industry':'半導體'})
    def test_annual_eps_not_invented(self):
        f=published_fundamentals(self.fixture(),'2026-10-16')
        self.assertNotIn('epsTTM',f)
        self.assertNotIn('forwardEPS',f)
        self.assertNotIn('targetPrice',f)

if __name__=='__main__':unittest.main()
