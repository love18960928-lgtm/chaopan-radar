import unittest
from performance import update_diary

class PerformanceVersionTests(unittest.TestCase):
 def test_legacy_events_excluded_from_all_new_rule_statistics(self):
  old={'date':'2026-10-19','market':'上市','code':'1101','name':'台泥','signalClose':30,'neck':28,'nextOpen':31,'fillableModel':True,'return5Pct':30.0,'netReturn5Pct':29.2,'return10Pct':30.0,'netReturn10Pct':29.2,'return20Pct':30.0,'netReturn20Pct':29.2}
  report,events=update_diary([old],{},[],'2026-10-20','canonical-structure-v25')
  self.assertEqual(report['recorded'],1)
  self.assertEqual(report['legacyRecorded'],1)
  self.assertEqual(report['sample5'],0)
  self.assertEqual(report['sample10'],0)
  self.assertEqual(report['sample20'],0)
 def test_same_day_rerun_does_not_duplicate_new_rule_signal(self):
  row={'date':'2026-10-20','market':'上市','code':'2454','name':'聯發科','priceConfirmed':True,'close':1400,'neck':1350}
  report,entries=update_diary([],{},[row],'2026-10-20','canonical-structure-v25')
  report2,entries2=update_diary(entries,{},[row],'2026-10-20','canonical-structure-v25')
  self.assertEqual(len(entries2),1)
  self.assertEqual(report2['cohortRecorded'],1)
 def test_new_cohort_separate_from_old_same_day(self):
  old={'date':'2026-10-20','market':'上市','code':'2454','name':'聯發科','signalClose':1400,'neck':1350,'nextOpen':None}
  row={'date':'2026-10-20','market':'上市','code':'2454','name':'聯發科','priceConfirmed':True,'close':1400,'neck':1350}
  report,entries=update_diary([old],{},[row],'2026-10-20','canonical-structure-v25')
  self.assertEqual(len(entries),2)
  self.assertEqual(report['cohortRecorded'],1)
  self.assertEqual(report['legacyRecorded'],1)
