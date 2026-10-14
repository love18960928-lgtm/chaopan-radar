import unittest
from rules import scan_stock, limit_up_count, build_snapshot
from collector import parse_twse_rwd, parse_otc_historical, parse_latest_twse, parse_latest_otc, parse_otc_modern


def make_series():
    bars=[]
    # 80 candles, prices below a 100.0 resistance; low-volume background
    for i in range(80):
        day=f'2026-01-{i+1:02d}'  # sortable string is enough for unit tests
        volume=1100 if i%2 else 1400
        bars.append([day,94,96,92,95,volume,None])
    # Volume-K anchor 12 days before today, requires prior 20 history and relative threshold.
    bars[67]=[bars[67][0],95,100,93,97,12000,None]
    # Previous day stays below 100; today closes above.
    bars[-1]=['2026-10-01',99,106,98,104,16000,None]
    return {'code':'2492','name':'測試股','market':'上市','bars':bars}

class RadarTests(unittest.TestCase):
    def test_first_price_and_new_volume(self):
        s=make_series()
        x=scan_stock(s)
        self.assertIn('first',x['tags'])
        self.assertIn('volume',x['tags'])
        self.assertEqual(x['neck'],100)
        self.assertTrue(x['confirmed'])
        self.assertEqual(x['oldMaxLots'],12000)
    def test_near_resistance(self):
        s=make_series(); s['bars'][-1]=['2026-10-01',97,99,96,98,1800,None]
        x=scan_stock(s)
        self.assertIn('near',x['tags']);self.assertNotIn('first',x['tags'])
    def test_absent_breakout(self):
        s=make_series();s['bars'][-1]=['2026-10-01',94,96,92,95,1500,None]
        x=scan_stock(s)
        self.assertIsNone(x)
    def test_prev_close_above_prevents_new_breakout(self):
        s=make_series();s['bars'][-2][4]=101
        x=scan_stock(s)
        self.assertTrue(x is None or 'first' not in x['tags'])
    def test_limit_estimate(self):
        bars=[['d01',10,10,10,10,1000,None]]
        for i in range(3):
            prev=bars[-1][4];v=round(prev*1.1/0.05)*0.05
            bars.append([f'd{i+2:02}',v,v,v,v,1000,None])
        self.assertGreaterEqual(limit_up_count(bars),1)
    def test_zero_history(self):
        x=build_snapshot({'one':{'code':'1234','name':'A','market':'上市','bars':[]}})
        self.assertEqual(x['mode'],'warming')
    def test_twse_dynamic_columns(self):
        data={'stat':'OK','tables':[{'fields':['證券代號','證券名稱','成交股數','開盤價','最高價','最低價','收盤價'],'data':[['2330','台積電','12,000,000','100','110','98','106'],['0050','ETF','2,000,000','100','110','98','106']]}]}
        out=parse_twse_rwd(data,'2026-10-13')
        self.assertEqual(out['2330']['bar'][5],12000)
        self.assertNotIn('0050',out)
    def test_otc_old_schema(self):
        out=parse_otc_historical({'aaData':[['6488','環球晶','500','+5','495','502','494','2,500,000']]},'2026-10-13')
        self.assertEqual(out['6488']['bar'][5],2500)
    def test_otc_modern_schema(self):
        payload={'tables':[{'fields':['代號','名稱','收盤','開盤','最高','最低','成交股數','次日漲停價'],'data':[['6488','環球晶','510','498','512','494','3,250,000','561']]}]}
        out=parse_otc_modern(payload,'2026-10-13')
        self.assertEqual(out['6488']['bar'][5],3250)
        self.assertEqual(out['6488']['bar'][6],561)
    def test_latest_snapshots(self):
        x=parse_latest_twse([{'Date':'1151013','Code':'2454','Name':'聯發科','OpeningPrice':'1000','HighestPrice':'1100','LowestPrice':'990','ClosingPrice':'1010','TradeVolume':'5,000,000'}],'2026-10-13')
        self.assertEqual(x['2454']['bar'][5],5000)
        y=parse_latest_otc([{'Date':'1151013','SecuritiesCompanyCode':'6488','CompanyName':'環球晶','Open':'490','High':'500','Low':'480','Close':'495','TradingShares':'700,000','NextLimitUp':'540'}],'2026-10-13')
        self.assertEqual(y['6488']['bar'][6],540)

if __name__ == '__main__':unittest.main()
