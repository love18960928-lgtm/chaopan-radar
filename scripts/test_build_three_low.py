import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_three_low import series, period_closes

class ThreeLowGenerationTests(unittest.TestCase):
    def test_deduction_requires_enough_history(self):
        self.assertEqual(series([1]*10,20,'day')['state'],'資料不足')
    def test_deduction_is_not_buy_signal(self):
        d=series([10]*20+[11]*4,20,'day')
        self.assertIn(d['state'],('符合','不符合'))
        self.assertEqual(len(d['projected']),3)
    def test_current_incomplete_week_excluded(self):
        bars=[['2026-10-19',0,0,0,11,100],['2026-10-23',0,0,0,12,100],['2026-10-26',0,0,0,13,100]]
        self.assertEqual(period_closes(bars,'week','2026-10-28'),[12.0])

if __name__=='__main__':unittest.main()
