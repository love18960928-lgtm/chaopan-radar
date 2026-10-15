import unittest
from datetime import date,timedelta
from risk_v22 import assess_stock,build_universe,market_context
from rules import build_snapshot


D=date(2026,10,14)
def stock(code,levels,volumes=None,market='上市',industry='測試工業'):
    volumes=volumes or [1300]*len(levels)
    first=D-timedelta(days=len(levels)-1)
    bars=[]
    for i,(close,v) in enumerate(zip(levels,volumes)):
        prev=levels[i-1] if i else close
        # high/low deliberately include realistic intraday range
        op=(prev+close)/2
        bars.append([(first+timedelta(days=i)).isoformat(),op,max(close,op)*1.006,min(close,op)*.994,close,v])
    return {'code':code,'name':'測試'+code,'market':market,'fundamentals':{'industry':industry},'bars':bars}

class RiskTests(unittest.TestCase):
    def setUp(self):
        levels=[100+ i*.20 for i in range(65)]
        self.base=stock('5551',levels)
        self.stocks={'上市5551':self.base}
        self.ctx=market_context(self.stocks,D.isoformat())
    def check(self,s,ctx=None):
        return assess_stock(s,None,ctx or {'broad':{},'sectors':{}},D.isoformat())
    def test_non_candidate_still_searchable(self):
        r=self.check(self.base);self.assertEqual('5551',r['code']);self.assertIn('riskReasons',r)
    def test_neutral_is_not_certified_safe(self):
        r=self.check(self.base);self.assertNotEqual('主力吸籌',r['riskStatus'])
    def test_stale_stock_is_not_certified(self):
        r=self.base.copy();r['bars']=r['bars'][:-1]
        a=self.check(r);self.assertEqual('unknown',a['riskLevel'])
    def test_early_history_explicitly_unknown(self):
        r=self.base.copy();r['bars']=r['bars'][-30:]
        a=self.check(r);self.assertEqual('unknown',a['riskLevel'])
    def test_relative_weak_alone_not_proven_distribution(self):
        flat=stock('5560',[120]*65)
        ctx={'broad':{('上市',5):8},'sectors':{('上市','測試工業',5):(8,30)}}
        a=self.check(flat,ctx);self.assertNotEqual('high',a['riskLevel'])
    def test_independent_weakness_high_warning(self):
        prices=[100+i*.7 for i in range(45)]+[130-2*i for i in range(20)]
        vols=[1300]*45+[5000 if i>=10 else 1100 for i in range(20)]
        r=stock('5577',prices,vols)
        ctx={'broad':{('上市',5):2},'sectors':{('上市','測試工業',5):(2,30)}}
        a=self.check(r,ctx)
        self.assertEqual('high',a['riskLevel'])
        self.assertGreaterEqual(len(a['riskReasons']),2)
    def test_protect_absent_real_institutional(self):
        a=self.check(self.base);self.assertNotIn('主力已出貨',' '.join(a['riskReasons']))
    def test_score_never_probability(self):
        a=self.check(self.base);self.assertLessEqual(a['opportunityScore'],100)
        self.assertGreaterEqual(a['opportunityScore'],0)
    def test_market_proxy_not_index(self):
        a=self.check(self.base)
        self.assertIn('並非加權或櫃買指數',a['marketProxyNote'])
    def test_build_universe_fresh_covers_unscreened(self):
        # At least one synthetic stock with good dates and no breakout
        snapshot={'asOf':D.isoformat(),'candidates':[], 'marketAsOf':{'上市':D.isoformat()}}
        u=build_universe(self.stocks,snapshot,D.isoformat())
        self.assertEqual(1,u['coverage']);self.assertEqual('5551',u['rows'][0]['code'])

if __name__=='__main__':unittest.main()
