import unittest
from rules import scan_stock
from test_launch_v14 import taihong_fixture

class QualityTests(unittest.TestCase):
    def test_first_quality_is_independent_of_star(self):
        s=taihong_fixture();r=scan_stock(s)
        self.assertEqual(r['starPhase'],'first')
        self.assertIn(r['breakoutQuality'],('strong','watch'))
    def test_second_can_be_weak_without_erasing_star(self):
        s=taihong_fixture();s['bars'].append(['2026-07-14',169.5,170,168.6,168.7,15000,None])
        r=scan_stock(s)
        self.assertEqual(r['starPhase'],'second')
        self.assertIn(r['breakoutQuality'],('weak','watch'))
    def test_below_neck_always_invalid(self):
        s=taihong_fixture();s['bars'].append(['2026-07-14',169,170,167,168.4,5000,None])
        r=scan_stock(s)
        self.assertEqual(r['starPhase'],'invalid')
        self.assertEqual(r['breakoutQuality'],'invalid')
    def test_recross_resets_to_first(self):
        s=taihong_fixture();s['bars'].append(['2026-07-14',169,170,167,168.4,5000,None]);s['bars'].append(['2026-07-15',168,170,167,169.5,5000,None])
        r=scan_stock(s)
        self.assertEqual(r['starPhase'],'first')
        self.assertNotEqual(r['breakoutQuality'],'invalid')

if __name__=='__main__': unittest.main()
