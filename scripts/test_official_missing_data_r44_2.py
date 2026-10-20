"""Source-return-shape diagnostics and strict no-fabrication checks."""
import os
import json
import tempfile
import unittest
from pathlib import Path
from market_intel_v311 import report_date, twse_t86, twse_margin, tpex_3insti, build, save
D='2026-10-20'

class MissingDataDiagnosticsTests(unittest.TestCase):
    def test_title_roc_date_and_invalid_day(self):
        self.assertEqual(report_date('115年10月20日三大法人買賣超'),'2026-10-20')
        self.assertEqual(report_date('20261020 資料日'),'2026-10-20')
        self.assertIsNone(report_date('10月20日報告'))
        self.assertIsNone(report_date('115年02月30日'))

    def test_t86_title_dated_and_dealer_column_exact(self):
        fields=['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','外資自營商買賣超股數','自營商買賣超股數']
        fixture={'stat':'OK','title':'115年10月20日 三大法人買賣超','fields':fields,
                 'data':[['2330','台積電','15,000','4,000','0','-2,000']]}
        result=twse_t86(fixture,D)
        self.assertEqual(result['上市-2330']['dealerLots'],-2)
        self.assertEqual(result['上市-2330']['foreignLots'],15)
        self.assertEqual(twse_t86({**fixture,'title':'115年10月19日 三大法人'},D),{})
        self.assertEqual(twse_t86({**fixture,'fields':fields[:-1]},D),{})

    def test_margin_credit_list_dated_and_missing_balance_fails(self):
        fixture={'stat':'OK','creditTitle':'115年10月20日 信用交易統計',
                 'creditFields':['代號','前日餘額','今日餘額','前日餘額','今日餘額'],
                 'creditList':[['2330','101','103','5','6']]}
        x=twse_margin(fixture,D)
        self.assertEqual(x['上市-2330']['marginDeltaLots'],2)
        self.assertEqual(x['上市-2330']['shortDeltaLots'],1)
        self.assertEqual(twse_margin({**fixture,'creditTitle':'115年10月19日'},D),{})
        self.assertEqual(twse_margin({**fixture,'creditList':[['2330','x','103','5','6']]},D),{})

    def test_tpex_envelope_requires_verifiable_date(self):
        payload={'date':'2026-10-20','data':[{'證券代號':'1234','外資及陸資買賣超股數':'2000','投信買賣超股數':'3000', '自營商買賣超股數合計':'4000'}]}
        self.assertEqual(tpex_3insti(payload,D)['上櫃-1234']['trustLots'],3)
        self.assertEqual(tpex_3insti({**payload,'date':'2026-10-19'},D),{})
        self.assertEqual(tpex_3insti({'data':payload['data']},D),{})

    def test_fetch_failure_has_diagnostic_and_partial_source_kept(self):
        def fetch(url):
            if 'FMTQIK' in url: return {'fields':['日期','發行量加權股價指數','漲跌點數'],
                                          'data':[['115/10/20','46292.93','-529.15']]}
            if 'T86' in url: return {'stat':'OK','title':'115年10月20日','fields':['錯誤欄位'],'data':[['1']]}
            raise OSError('offline test provider')
        obj=build(D,fetch=fetch)
        self.assertIn('taiex',obj['indices'])
        self.assertEqual(obj['sources']['twse_t86']['status'],'invalid')
        self.assertIn('fields=',obj['sources']['twse_t86']['reason'])
        self.assertEqual(obj['sources']['tpex']['status'],'error')
        self.assertNotIn('twse_t86',obj.get('institutional',{}))

if __name__=='__main__':unittest.main()
