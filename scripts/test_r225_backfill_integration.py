import datetime as dt
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import collector

class BackfillIntegration(unittest.TestCase):
    today=dt.date(2026,11,27)
    def test_regular_seven_days(self):
        dates=collector.backfill_dates(self.today,0)
        self.assertEqual((len(dates),dates[0],dates[-1]),(7,self.today-dt.timedelta(days=6),self.today))
    def test_windows_adjacent_not_overlapping(self):
        a=collector.backfill_dates(self.today,90,0)
        b=collector.backfill_dates(self.today,90,90)
        self.assertEqual(len(a),90);self.assertEqual(len(b),90)
        self.assertEqual(b[-1]+dt.timedelta(days=1),a[0]);self.assertFalse(set(a)&set(b))
    def test_oldest_window(self):
        self.assertEqual(collector.backfill_dates(self.today,90,450)[-1],self.today-dt.timedelta(days=450))
    def test_bad_arguments(self):
        for d,o in [(0,90),(-1,0),(781,0),(90,-1),(90,451),(True,0),(1,False)]:
            with self.subTest(d=d,o=o),self.assertRaises(ValueError): collector.backfill_dates(self.today,d,o)
    def test_historical_window_disables_latest_fallback(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(collector,'HISTORY',Path(tmp)/'missing.json'), patch.object(collector,'read_existing',return_value={}),patch.object(collector,'fetch_market',return_value={}) as f,patch.object(collector.time,'sleep'):
            collector.run(2,0,self.today.isoformat(),7)
            self.assertEqual(len(f.call_args_list),4)
            self.assertEqual({x.args[0] for x in f.call_args_list},{'2026-11-19','2026-11-20'})
            self.assertTrue(all(x.kwargs['allow_latest'] is False for x in f.call_args_list))
    def test_current_window_latest_allowed_only_recent_days(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(collector,'HISTORY',Path(tmp)/'missing.json'),patch.object(collector,'read_existing',return_value={}),patch.object(collector,'fetch_market',return_value={}) as f,patch.object(collector.time,'sleep'):
            collector.run(3,0,self.today.isoformat())
            self.assertEqual(len(f.call_args_list),6)
            self.assertEqual({x.args[0] for x in f.call_args_list if x.kwargs['allow_latest']},{'2026-11-26','2026-11-27'})
    def test_weekend_skipped(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(collector,'HISTORY',Path(tmp)/'missing.json'),patch.object(collector,'read_existing',return_value={}),patch.object(collector,'fetch_market',return_value={}) as f,patch.object(collector.time,'sleep'):
            collector.run(3,0,'2026-11-29')
            self.assertEqual({x.args[0] for x in f.call_args_list},{'2026-11-27'})
