"""Synthetic regression: historic high-volume neckline should beat nearby minor volume K."""
import unittest
import datetime as dt
from rules import scan_stock

class VolumeNecklinePriority(unittest.TestCase):
    def fixture(self, last_close=99):
        start=dt.date(2026, 1, 1)
        dates=[]
        while len(dates)<125:
            if start.weekday()<5: dates.append(start.isoformat())
            start+=dt.timedelta(days=1)
        bars=[[d,95,99,94,95,1500,None] for d in dates]
        bars[42]=[dates[42],98,105,95,99,32000,None]
        bars[100]=[dates[100],96,101,94,97,8000,None]
        bars[-1]=[dates[-1],97,max(101,last_close),96,last_close,2400,None]
        return {'code':'9999','name':'test','market':'上市','bars':bars}
    def test_dominant_older_volume_anchor(self):
        x=scan_stock(self.fixture(),include_all=True)
        self.assertEqual(x['neck'],105)
        self.assertEqual(x['neckLots'],32000)
    def test_crossing_first_has_priority(self):
        x=scan_stock(self.fixture(106),include_all=True)
        self.assertEqual(x['neck'],105)
        self.assertTrue(x['priceConfirmed'])
    def test_no_lookahead(self):
        x=scan_stock(self.fixture(),include_all=True)
        self.assertLess(x['neckDate'],x['date'])
if __name__=='__main__': unittest.main()
