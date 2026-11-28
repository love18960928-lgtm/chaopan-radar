import copy
import datetime as dt
import unittest
from collector import compact_structure_journal, update_structure_journal

class JournalRetention(unittest.TestCase):
    def sample(self, i, **extra):
        date=(dt.date(2025,1,1)+dt.timedelta(days=i)).isoformat()
        r=dict(market='上市',code='2330',date=date,unifiedStage='觀察',neck=100+i,riskLevel='low',unifiedScore=20,cycle={'initialDate':'2025-01-01'},continuationContext={'kind':'watch','breakoutDate':'2025-01-01'})
        r.update(extra);return r
    def put(self,j,i,**extra):
        r=self.sample(i,**extra);update_structure_journal(j,r,r['date']);return r
    def build(self):
        j={}
        for i in range(250):
            self.put(j,i,riskLevel='high' if 5<=i<=8 else 'low',cycle={'initialDate':'2025-01-01' if i<30 else '2025-01-31'},continuationContext={'kind':'watch','breakoutDate':'2025-01-01' if i<50 else '2025-02-20'})
        return j
    def test_ordinary_changes_compact(self):
        j={}
        for i in range(250):self.put(j,i)
        self.assertEqual(len(j['上市2330']),91)
        self.assertEqual(j['上市2330'][0]['date'],self.sample(0)['date'])
    def test_early_high_and_recovery_retained(self):
        j=self.build();e={x['date']:x for x in j['上市2330']}
        for i,r in [(4,'low'),(5,'high'),(8,'high'),(9,'low')]:self.assertEqual(e[self.sample(i)['date']]['risk'],r)
    def test_event_origin_retained(self):
        e={x['date']:x for x in self.build()['上市2330']}
        for i in [29,30]:self.assertIn(self.sample(i)['date'],e)
        self.assertNotEqual(e[self.sample(29)['date']]['origin'],e[self.sample(30)['date']]['origin'])
    def test_historical_breakout_retained(self):
        e={x['date']:x for x in self.build()['上市2330']}
        for i in [49,50]:self.assertIn(self.sample(i)['date'],e)
        self.assertNotEqual(e[self.sample(49)['date']]['historicalBreakout'],e[self.sample(50)['date']]['historicalBreakout'])
    def test_recent_90_complete(self):
        e=self.build()['上市2330'];self.assertEqual([x['date'] for x in e[-90:]],[self.sample(i)['date'] for i in range(160,250)])
    def test_order_unique(self):
        dates=[x['date'] for x in self.build()['上市2330']];self.assertEqual(dates,sorted(set(dates)))
    def test_replay_no_future_no_write(self):
        j=self.build();before=copy.deepcopy(j);r=self.put(j,6);self.assertEqual(j,before);self.assertTrue(r['stageHistory']);self.assertTrue(all(x['date']<=r['date'] for x in r['stageHistory']))
    def test_idempotent_compaction(self):
        e=self.build()['上市2330'];self.assertEqual(compact_structure_journal(e),e)
    def test_same_day_replace(self):
        j=self.build();r=self.put(j,249,riskLevel='high');self.assertEqual(j['上市2330'][-1]['risk'],'high');self.assertEqual(len(r['stageHistory']),12);self.assertEqual(len({x['date'] for x in j['上市2330']}),len(j['上市2330']))
    def test_all_risk_transitions_kept(self):
        j={}
        for i in range(250):self.put(j,i,riskLevel='high' if i%2 else 'low')
        self.assertEqual(len(j['上市2330']),250)
    def test_old_unknown_retained(self):
        j={}
        for i in range(250):self.put(j,i,riskLevel='unknown' if i==2 else 'low')
        self.assertIn('unknown',[x['risk'] for x in j['上市2330']])
    def test_ui_copy_not_alias(self):
        j=self.build();r=self.put(j,250);r['stageHistory'][-1]['risk']='mutated';self.assertNotEqual(j['上市2330'][-1]['risk'],'mutated')

if __name__=='__main__':unittest.main()
