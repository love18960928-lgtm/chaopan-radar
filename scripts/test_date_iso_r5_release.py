"""Regression: Gregorian slash dates must not be interpreted as ROC subsets."""
import unittest
from market_intel_v311 import date_iso, tpex_otc_index

class CalendarNormalisation(unittest.TestCase):
    def test_gregorian_slash_not_roc(self):
        self.assertEqual(date_iso('2026/10/16'), '2026-10-16')
    def test_roc_slash(self):
        self.assertEqual(date_iso('115/10/16'), '2026-10-16')
    def test_bad_date_rejected(self):
        self.assertIsNone(date_iso('2026/02/30'))
    def test_otc_gregorian_date(self):
        self.assertEqual(tpex_otc_index({'date':'2026/10/16','tables':[{'fields':['指數','收市指數','漲跌','漲跌百分比'], 'data':[['櫃買指數','400.80','1.20','0.30']]}]},'2026-10-16')['close'],400.8)

if __name__=='__main__':unittest.main()
