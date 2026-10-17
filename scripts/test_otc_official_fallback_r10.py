"""Regression/negative tests for TPEx index open-data fallback (no network)."""
import unittest
from market_intel_v311 import build, tpex_otc_historical_csv

DAY='2026-10-16'
HEADER='資料日期,開市,最高價,最低價,收市,漲跌\n'

class OfficialOtcFallbackTests(unittest.TestCase):
    def test_official_gregorian_csv(self):
        x=tpex_otc_historical_csv(HEADER+'2026/10/15,401,410,398,402.20,-3\n2026/10/16,405,412,399,407.20,+5.10\n',DAY)
        self.assertEqual(x['date'],DAY)
        self.assertEqual(x['close'],407.2)
        self.assertEqual(x['change'],5.1)
        self.assertEqual(x['pct'],1.27)

    def test_roc_csv_and_preamble(self):
        x=tpex_otc_historical_csv('櫃買指數歷史資料\n'+HEADER+'115/10/16,405,412,399,407.20,▼5.10\n',DAY)
        self.assertEqual(x['change'],-5.1)

    def test_wrong_day_is_not_current(self):
        self.assertIsNone(tpex_otc_historical_csv(HEADER+'115/10/15,405,412,399,407.20,+5.10\n',DAY))

    def test_no_date_is_rejected(self):
        self.assertIsNone(tpex_otc_historical_csv('收市,漲跌\n407.2,5.1\n',DAY))

    def test_bad_value_is_rejected(self):
        self.assertIsNone(tpex_otc_historical_csv(HEADER+'115/10/16,405,412,399,--,+5.10\n',DAY))

    def test_no_zero_as_success(self):
        self.assertIsNone(tpex_otc_historical_csv(HEADER+'115/10/16,405,412,399,0,+5.10\n',DAY))

    def test_does_not_parse_html(self):
        self.assertIsNone(tpex_otc_historical_csv('<html>bad gateway</html>',DAY))

    def test_fallback_records_source_and_keeps_other_indices(self):
        calls=[]
        def fetch(url):
            calls.append(url)
            if 'FMTQIK' in url:
                return {'fields':['日期','發行量加權股價指數','漲跌點數'],'data':[['115/10/16','47111','140']]}
            raise OSError('simulated JSON unavailable')
        def csv_feed(url):
            self.assertEqual(url,'https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?response=data')
            return HEADER+'115/10/16,405,412,399,407.2,+5.1\n'
        out=build(DAY,fetch=fetch,text_fetch=csv_feed)
        self.assertEqual(len(calls),7)
        self.assertEqual(out['indices']['otc']['close'],407.2)
        self.assertEqual(out['sources']['otc']['status'],'ok')
        self.assertEqual(out['indices']['taiex']['date'],DAY)
        self.assertEqual(out['sources']['otc_primary']['status'],'error')

    def test_bad_fallback_does_not_invent(self):
        def fetch(url):raise OSError('no network')
        out=build(DAY,fetch=fetch,text_fetch=lambda url:HEADER+'115/10/15,405,412,399,407.2,+5.1\n')
        self.assertNotIn('otc',out['indices'])
        self.assertEqual(out['sources']['otc_fallback']['status'],'invalid')

    def test_exception_not_bring_down_build(self):
        def fetch(url):raise OSError('no network')
        def csv_feed(url):raise PermissionError('blocked')
        out=build(DAY,fetch=fetch,text_fetch=csv_feed)
        self.assertEqual(out['sources']['otc_fallback']['status'],'error')

    def test_numeric_change_not_percent(self):
        x=tpex_otc_historical_csv(HEADER+'115/10/16,405,412,399,407.20,+5.10\n',DAY)
        self.assertNotEqual(x['pct'],x['change'])

    def test_multiple_dates_pick_exact_target(self):
        x=tpex_otc_historical_csv(HEADER+'115/10/14,404,406,400,401,+1\n115/10/16,405,412,399,407,+5\n115/10/17,410,420,405,414,+7\n',DAY)
        self.assertEqual(x['close'],407)

if __name__=='__main__': unittest.main()
