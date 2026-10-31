"""Focused EOD star lifecycle tests. Synthetic fixture; no network."""
import unittest
from rules import scan_stock
from test_launch_v14 import taihong_fixture

class StarLifecycleTests(unittest.TestCase):
    def test_close_below_resets_and_recross_is_new_first(self):
        s=taihong_fixture()
        first=scan_stock(s)
        self.assertEqual(first['starPhase'],'first')
        s['bars'].append(['2026-07-14',169,170,168.5,169.5,5000,None])
        second=scan_stock(s)
        self.assertEqual(second['starPhase'],'second')
        s['bars'].append(['2026-07-15',169,170,167,168.4,5000,None])
        invalid=scan_stock(s)
        self.assertEqual(invalid['starPhase'],'invalid')
        self.assertEqual(invalid['starLabel'],'⚠')
        s['bars'].append(['2026-07-16',168,170,167,169.5,5000,None])
        renewed=scan_stock(s)
        self.assertEqual(renewed['starPhase'],'first')
        self.assertEqual(renewed['starLabel'],'★1')
        self.assertNotEqual(first['breakoutEvent']['id'],renewed['breakoutEvent']['id'])
        self.assertEqual(renewed['breakoutEvent']['firstDate'],'2026-07-16')
    def test_equal_neck_after_below_does_not_restore_star(self):
        s=taihong_fixture()
        s['bars'].append(['2026-07-14',169,170,167,168.4,5000,None])
        self.assertEqual(scan_stock(s)['starPhase'],'invalid')
        s['bars'].append(['2026-07-15',168,169,168,168.5,5000,None])
        self.assertEqual(scan_stock(s)['starPhase'],'invalid')

if __name__=='__main__':unittest.main()
