import unittest
from risk_v22 import assess_stock, market_context, build_universe

class SixMATests(unittest.TestCase):
    def test_full_history_six_ma_with_260_chart_candles(self):
        b=[]
        from datetime import date,timedelta
        start=date(2025,1,1)
        for i in range(260):
            c=110 if i<230 else 130+(i-230)*.1
            b.append([(start+timedelta(days=i)).isoformat(),c-1,c+1,c-2,c,1200])
        st={'market':'上市','code':'6672','name':'測試個股','bars':b,'fundamentals':{'industry':'電子'}}
        asof=b[-1][0]
        snapshot={'candidates':[],'asOf':asof,'marketAsOf':{'上市':asof,'上櫃':asof},'activeMarketCount':1}
        ctx=market_context({'x':st},asof)
        result=assess_stock(st,None,ctx,asof)
        self.assertEqual(len(result['bars']),260)
        self.assertEqual(result['maAll']['count'],260)
        self.assertEqual(result['maAll']['asOf'],asof)
        self.assertIsNotNone(result['maAll']['values']['240'])
        data=build_universe({'x':st},snapshot,asof)
        self.assertEqual(len(data['rows']),1)
        self.assertEqual(data['rows'][0]['maAll']['values']['240'],result['maAll']['values']['240'])

if __name__=='__main__':unittest.main()
