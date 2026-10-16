"""Bounded isolated source failures and strict trading-day retention for V3.1.1-r4."""
import json
import tempfile
import time
import unittest
from pathlib import Path
from market_intel_v311 import build, save

D = '2026-10-16'

class ResilienceTests(unittest.TestCase):
    def test_one_provider_error_keeps_healthy_providers(self):
        def fetch(url):
            if 'FMTQIK' in url:
                return {'fields':['日期','發行量加權股價指數','漲跌點數'], 'data':[['115/10/16','47111.26','140.00']]}
            raise OSError('simulated blocked provider')
        result = build(D, fetch=fetch)
        self.assertEqual(result['indices']['taiex']['date'], D)
        self.assertEqual(result['sources']['taiex']['status'], 'ok')
        self.assertEqual(result['sources']['twse_bfi']['status'], 'error')
        self.assertEqual(result['sources']['tpex']['status'], 'error')
        self.assertEqual(result['stocks'], {})

    def test_same_day_keeps_verified_values_and_older_day_cannot_override(self):
        base = {'schema':'chaopan.market.v311','asOf':D,
                'indices':{'taiex':{'date':D,'close':47111.26,'change':140,'pct':0.3}},
                'institutional':{'listed':{'date':D,'unit':'億元','foreign':-300}},
                'stocks':{'上市-0050':{'date':D,'name':'元大台灣50','foreignLots':15,'trustLots':2,'dealerLots':0}},
                'sources':{'taiex':{'status':'ok'},'twse_t86':{'status':'ok'}}, 'margin':{}}
        with tempfile.TemporaryDirectory() as dir:
            dest = Path(dir)/'market-intel.json'
            dest.write_text(json.dumps(base, ensure_ascii=False), encoding='utf8')
            partial={'schema':'chaopan.market.v311','asOf':D,'indices':{},
                     'institutional':{},'stocks':{},'coverage':{},'margin':{},
                     'sources':{'taiex':{'status':'error'},'twse_t86':{'status':'error'}}}
            # A fully empty subsequent fetch refuses to overwrite even if there was a previous good record.
            self.assertFalse(save(partial,dest))
            partial['indices']={'otc':{'date':D,'close':390,'change':2,'pct':0.5}}
            self.assertTrue(save(partial,dest))
            actual=json.loads(dest.read_text(encoding='utf8'))
            self.assertEqual(actual['indices']['taiex']['close'],47111.26)
            self.assertEqual(actual['stocks']['上市-0050']['name'],'元大台灣50')
            self.assertEqual(actual['sources']['taiex']['status'],'retained')
            self.assertEqual(actual['indices']['otc']['date'],D)

    def test_otc_full_trading_date_and_official_named_table(self):
        from market_intel_v311 import tpex_otc_index
        result=tpex_otc_index({'date':'115/10/16','tables':[
            {'fields':['指數','收市指數','漲跌','漲跌幅度 (%)'],
             'data':[['櫃買指數','407.20','+5.10','1.27'],
                     ['富櫃200指數','19,111.11','100.01','0.53']]}
        ]}, D)
        self.assertEqual(result['close'],407.2)
        self.assertEqual(result['source'],'TPEx indexSummary')
        self.assertIsNone(tpex_otc_index({'date':'115/10/15','tables':[
            {'fields':['指數','收市指數','漲跌','漲跌幅度 (%)'],
             'data':[['櫃買指數','407.20','+5.10','1.27']]}
        ]}, D))
        urls=[]
        def fetch(url):
            urls.append(url)
            raise OSError('offline fixture')
        build(D,fetch=fetch)
        self.assertTrue(any('indexSummary?date=115/10/16' in url for url in urls))

    def test_urls_call_target_date_not_device_today(self):
        called=[]
        def fetch(url):called.append(url);raise OSError('offline')
        build(D,fetch=fetch)
        self.assertEqual(len(called),7)
        self.assertTrue(any('20261016' in x for x in called))
        self.assertFalse(any('20261017' in x for x in called))

if __name__=='__main__':unittest.main()
