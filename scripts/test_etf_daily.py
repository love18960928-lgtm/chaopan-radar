#!/usr/bin/env python3
"""Offline TWSE ETF ingestion tests; no online data is fabricated."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('etf_update',HERE/'update_etf_daily.py')
etf=importlib.util.module_from_spec(spec);spec.loader.exec_module(etf)

FIELDS=['日期','成交股數','成交金額','開盤價','最高價','最低價','收盤價','漲跌價差','成交筆數']
SAMPLE={'stat':'OK','title':'115年11月 00406A 主動中信台灣收益 各日成交資訊','fields':FIELDS,
 'data':[['115/11/20','1,401,612,317','8,350,741,197','6.06','6.12','5.85','5.87','-0.50','241,443'],
         ['115/11/23','1,224,087,559','7,273,182,926','5.77','6.20','5.70','6.16','+0.29','111,991']]}

class TestETFData(unittest.TestCase):
 def test_real_official_fixture(self):
  bars=etf.parse_month(SAMPLE,'00406A')
  self.assertEqual(len(bars),2)
  self.assertEqual(bars[-1]['date'],'2026-11-23')
  self.assertEqual(bars[-1]['close'],6.16)
  self.assertEqual(bars[-1]['volumeShares'],1224087559)
  self.assertEqual(bars[-1]['changeAmount'],.29)
 def test_reject_other_ticker(self):
  with self.assertRaisesRegex(ValueError,'mismatch'):etf.parse_month(SAMPLE,'0050')
 def test_skip_invalid_ohlc_and_price(self):
  d={**SAMPLE,'data':[SAMPLE['data'][0][:]]}
  d['data'][0][5]='6.30'
  with self.assertRaisesRegex(ValueError,'no valid price'):etf.parse_month(d,'00406A')
 def test_missing_data_no_false_candles(self):
  self.assertEqual(etf.parse_month({'stat':'很抱歉，沒有符合條件的資料！','data':[]},'00406A'),[])
 def test_unknown_error_not_silenced(self):
  with self.assertRaises(ValueError):etf.parse_month({'stat':'internal failure','data':[]},'00406A')
 def test_month_offset(self):
  import datetime
  self.assertEqual(list(etf.month_starts(datetime.date(2026,1,24),3)),['202601','202512','202511'])
 def test_build_one_incomplete_month_and_date_safe(self):
  import datetime
  def fake(url):
   return SAMPLE if '20261101' in url else {'stat':'很抱歉，沒有符合條件的資料！','data':[]}
  row,issues=etf.build_one('00406A',3,datetime.date(2026,11,23),0,fake)
  self.assertEqual(issues,[])
  self.assertEqual(row['name'],'主動中信台灣收益')
  self.assertEqual(row['latestDate'],'2026-11-23')
  self.assertEqual(row['changePct'],round(.29/5.87*100,4))
  self.assertEqual(row['bars'][0][0],'2026-11-20')
  self.assertIsNone(row['nav'])
 def test_no_future_leak(self):
  import datetime
  row,_=etf.build_one('00406A',1,datetime.date(2026,11,20),0,lambda _: SAMPLE)
  self.assertEqual(row['latestDate'],'2026-11-20')
  self.assertEqual(len(row['bars']),1)
 def test_no_blank_publish_on_failure(self):
  import datetime
  with self.assertRaisesRegex(RuntimeError,'不發布空資料'):
   etf.make_payload(['00406A'],1,datetime.date(2026,11,24),0,lambda _: {'stat':'沒有符合條件的資料','data':[]})
 def test_seed_official_one_day_only(self):
  seed=json.loads((HERE/'data/etf-daily.json').read_text(encoding='utf-8'))
  self.assertEqual(seed['asOf'],'2026-11-23')
  self.assertEqual(seed['rows'][0]['code'],'00406A')
  self.assertEqual(seed['rows'][0]['bars'][0][4],6.16)
  self.assertEqual(len(seed['rows'][0]['bars']),1)

if __name__=='__main__':unittest.main()
