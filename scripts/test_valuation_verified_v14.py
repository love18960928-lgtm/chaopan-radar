import datetime as dt
import math
import unittest
from valuation_verified_v14 import derive_model,quarter_dates
from risk_v22 import published_fundamentals

ASOF='2026-10-16'
FIN={'revenuePeriod':'2026-09','revenueYoY':31.5,'epsPeriod':'2026Q2','eps':3.5,
     'valuationDate':ASOF,'pe':18.0,'revenueMonthThousand':230000,'industry':'半導體'}
EPS=[{'date':x,'type':'EPS','value':v} for x,v in zip(
     ['2025-09-30','2025-12-31','2026-03-31','2026-06-30'],[1.1,1.4,1.5,2.0])]
PES=[{'date':(dt.date(2026,10,16)-dt.timedelta(days=240-i)).isoformat(),
      'PER':12+i%31*0.35} for i in range(220)]

class TestValidatedModel(unittest.TestCase):
    def model(self,f=None,eps=None,pe=None,asof=ASOF):return derive_model(f or FIN,50,EPS if eps is None else eps,PES if pe is None else pe,asof)
    def test_four_expected_quarters(self):self.assertEqual(quarter_dates(dt.date(2026,6,30)),[r['date'] for r in EPS])
    def test_valid_model(self):
        x=self.model();self.assertIsNotNone(x);self.assertEqual(x['epsTtm'],6.0)
        self.assertLess(x['modelTargetLow'],x['modelTargetMid']);self.assertLess(x['modelTargetMid'],x['modelTargetHigh'])
        self.assertEqual(x['peRiverSample'],220)
    def test_nonprofit_eps_hidden(self):
        e=[{**x,'value':-5} for x in EPS];self.assertIsNone(self.model(eps=e))
    def test_missing_quarter_hidden(self):self.assertIsNone(self.model(eps=EPS[:3]))
    def test_wrong_quarter_hidden(self):self.assertIsNone(self.model(eps=EPS[:3]+[{'date':'2026-09-30','type':'EPS','value':2}]))
    def test_official_eps_mismatch_hidden(self):self.assertIsNone(self.model(f={**FIN,'eps':40}))
    def test_old_valuation_hidden(self):self.assertIsNone(self.model(f={**FIN,'valuationDate':'2026-09-01'}))
    def test_old_revenue_hidden(self):self.assertIsNone(self.model(f={**FIN,'revenuePeriod':'2025-06'}))
    def test_future_earnings_hidden(self):self.assertIsNone(self.model(f={**FIN,'epsPeriod':'2026Q3'}))
    def test_future_per_history_hidden(self):self.assertIsNone(self.model(pe=[{**x,'date':'2026-10-17'} for x in PES]))
    def test_missing_per_history_hidden(self):self.assertIsNone(self.model(pe=PES[:119]))
    def test_nonfinite_history_hidden(self):self.assertIsNone(self.model(pe=[{**x,'PER':float('nan')} for x in PES]))
    def test_incomplete_revenue_hidden(self):self.assertIsNone(self.model(f={**FIN,'revenueYoY':None}))
    def test_incomplete_price_hidden(self):self.assertIsNone(derive_model(FIN,None,EPS,PES,ASOF))
    def test_output_date_guard(self):
        x=self.model();self.assertIsNotNone(x)
        f={**FIN,**x};out=published_fundamentals(f,ASOF)
        self.assertEqual(out['modelTargetMid'],x['modelTargetMid'])
        self.assertNotIn('modelTargetMid',published_fundamentals(f,'2026-11-18'))
        self.assertNotIn('modelTargetMid',published_fundamentals({**f,'modelTargetMid':99},ASOF))
        self.assertNotIn('modelTargetMid',published_fundamentals({**f,'modelAsOf':'2026-10-20'},ASOF))
    def test_no_fake_price_without_financials(self):
        self.assertNotIn('modelTargetMid',published_fundamentals({'eps':1.2},ASOF))

if __name__=='__main__': unittest.main()
