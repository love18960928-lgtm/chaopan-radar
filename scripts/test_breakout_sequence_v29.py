"""Synthetic deterministic checks: bar classification is not verified trading performance."""
import unittest
from test_structure_v25 import fake_bars,append
from structure_v25 import cycle_judgement

class BreakoutSequenceV29Tests(unittest.TestCase):
    def setUp(self):
        self.first=append(fake_bars(),100.5,107,100,106.5,3800)
    def test_first_is_as_of_and_second_not_precalled(self):
        x=cycle_judgement(self.first)['breakoutSequence']
        self.assertEqual(x['phase'],'first')
        self.assertEqual(x['label'],'突破頸線｜第一根')
        self.assertEqual(x['initialDate'],self.first[-1][0])
        self.assertNotIn('secondDate',x)
    def test_second_strong(self):
        x=cycle_judgement(append(self.first,107,110,106,109.5,3700))['breakoutSequence']
        self.assertEqual(x['phase'],'second')
        self.assertIn('第二根續強',x['label'])
        self.assertEqual(x['level'],105.)
    def test_second_lower_volume_consolidation(self):
        x=cycle_judgement(append(self.first,106.2,107,104.5,105.8,1600))['breakoutSequence']
        self.assertIn('量縮整理',x['label'])
        self.assertNotIn('出貨',x['assessment'])
    def test_second_high_volume_sell_pressure(self):
        x=cycle_judgement(append(self.first,107,112,104.7,105.,7000))['breakoutSequence']
        self.assertIn('疑似賣壓',x['label'])
        self.assertIn('無法證實出貨',x['assessment'])
    def test_first_breaks_with_bearish_candle_warning(self):
        b=append(fake_bars(),109,111,103,106.5,6800)
        x=cycle_judgement(b)['breakoutSequence']
        self.assertEqual(x['phase'],'first')
        self.assertIn('賣壓',x['label'])
    def test_second_high_volume_fades_although_above_first_close(self):
        x=cycle_judgement(append(self.first,113,115,106,108,7800))['breakoutSequence']
        self.assertEqual(x['phase'],'second')
        self.assertIn('疑似賣壓',x['label'])
        self.assertNotIn('確認出貨',x['assessment'])
    def test_second_breaks_neck_warning(self):
        x=cycle_judgement(append(self.first,105,106,99,101,5700))['breakoutSequence']
        self.assertEqual(x['phase'],'second')
        self.assertEqual(x['tone'],'danger')
    def test_second_then_reclaim_never_first_again(self):
        b=append(self.first,105,106,99,101,5700)
        later=cycle_judgement(append(b,102,108,101,107,2400))
        self.assertNotEqual(later['breakoutSequence']['phase'],'first')
        self.assertFalse(later['priceBreakout'])
    def test_no_future_leak_in_first(self):
        early=cycle_judgement(self.first)['breakoutSequence']
        _=cycle_judgement(append(self.first,107,112,104.7,105.,7000))
        self.assertEqual(early,cycle_judgement(self.first)['breakoutSequence'])

if __name__=='__main__':unittest.main()
