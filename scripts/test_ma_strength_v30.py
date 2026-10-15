import unittest
from ma_strength_v30 import moving_average_context


def bars(closes):
    return [[f'2026-09-{i+1:02d}', c, c+1, c-1, c, 1000] for i,c in enumerate(closes)]

class MaEvidenceTests(unittest.TestCase):
    def test_three_averages_independent(self):
        x=moving_average_context(bars([100]*20+[102,104,106,108,110]))
        self.assertEqual(x['ma5'],106)
        self.assertEqual(x['ma10'],103)
        self.assertAlmostEqual(x['ma20'],101.5)
        self.assertTrue(x['bullAligned'])
    def test_no_fake_hold_without_event(self):
        x=moving_average_context(bars([100]*30))
        self.assertIsNone(x['necklineHoldDays'])
    def test_original_neckline_hold_and_reset(self):
        b=bars([100]*20+[105,107,99,102,103]);ev={'initialDate':b[20][0],'level':101}
        x=moving_average_context(b,ev)
        self.assertEqual(x['necklineHoldDays'],2)
        self.assertEqual(x['originalNeckline'],101)
    def test_no_lookahead(self):
        b=bars([100]*20+[105,106]);ev={'initialDate':b[20][0],'level':101}
        old=moving_average_context(b,ev)
        _=moving_average_context(b+bars([80]),ev)
        self.assertEqual(old,moving_average_context(b,ev))
    def test_insufficient(self):
        self.assertEqual(moving_average_context(bars([100]*19))['maStage'],'資料不足')

if __name__=='__main__': unittest.main()
