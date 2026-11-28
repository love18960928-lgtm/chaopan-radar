import copy
import unittest
from collector import update_structure_journal

class Journal(unittest.TestCase):
    def row(self, date='2026-11-26', **kw):
        return dict(market='上市',code='2330',date=date,unifiedStage='觀察',neck=100,riskLevel='low',unifiedScore=20,cycle={'initialDate':'2026-11-20'},continuationContext={'kind':'watch','breakoutDate':'2026-11-20'}, **kw)
    def put(self, j, date, **changes):
        r=self.row(date);r.update(changes);update_structure_journal(j,r,date);return r
    def test_risk_only(self):
        j={};self.put(j,'2026-11-25');r=self.put(j,'2026-11-26',riskLevel='high');self.assertEqual([e['risk'] for e in r['stageHistory']],['low','high'])
    def test_risk_relaxation_keeps_history(self):
        j={};self.put(j,'2026-11-24',riskLevel='high');r=self.put(j,'2026-11-25');self.assertEqual([e['risk'] for e in r['stageHistory']],['high','low'])
    def test_origin_change(self):
        j={};self.put(j,'2026-11-25');r=self.put(j,'2026-11-26',cycle={'initialDate':'2026-11-26'});self.assertEqual(len(r['stageHistory']),2)
    def test_historical_breakout_change(self):
        j={};self.put(j,'2026-11-25');r=self.put(j,'2026-11-26',continuationContext={'kind':'watch','breakoutDate':'2026-11-24'});self.assertEqual(len(r['stageHistory']),2)
    def test_unchanged(self):
        j={};self.put(j,'2026-11-25');r=self.put(j,'2026-11-26',unifiedScore=45);self.assertEqual(len(r['stageHistory']),1)
    def test_same_day_replace(self):
        j={};self.put(j,'2026-11-26');r=self.put(j,'2026-11-26',riskLevel='high');self.assertEqual(len(r['stageHistory']),1);self.assertEqual(r['stageHistory'][0]['risk'],'high')
    def test_older_replay(self):
        j={};self.put(j,'2026-11-24');self.put(j,'2026-11-26',riskLevel='high');before=copy.deepcopy(j);r=self.put(j,'2026-11-25');self.assertEqual(j,before);self.assertEqual([e['date'] for e in r['stageHistory']],['2026-11-24'])
    def test_stale_row(self):
        j={};r=self.row('2026-11-25');update_structure_journal(j,r,'2026-11-26');self.assertEqual(j,{});self.assertEqual(r['stageHistory'],[])
    def test_no_future_for_new_stock(self):
        j={};self.put(j,'2026-11-26');r=self.put(j,'2026-11-25');self.assertEqual(r['stageHistory'],[])
    def test_bounds(self):
        import datetime as dt
        j={};start=dt.date(2026,1,1)
        for i in range(100):r=self.put(j,(start+dt.timedelta(days=i)).isoformat(),neck=100+i)
        self.assertEqual(len(j['上市2330']),91);self.assertEqual(j['上市2330'][0]['date'],start.isoformat());self.assertEqual(len(r['stageHistory']),12)
    def test_no_alias(self):
        j={};r=self.put(j,'2026-11-26');r['stageHistory'][0]['risk']='changed';self.assertEqual(j['上市2330'][0]['risk'],'low')
    def test_market_identity(self):
        j={};self.put(j,'2026-11-26');r=self.row();r['market']='上櫃';update_structure_journal(j,r,r['date']);self.assertEqual(len(j),2)
