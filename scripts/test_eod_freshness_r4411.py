import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from eod_freshness_report_r4411 import inspect, render

TZ=timezone(timedelta(hours=8))
class TestFreshness(unittest.TestCase):
    def fixture(self, price='2026-10-21', institution='2026-10-21', source='ok', values=True):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name)
        (root/'data').mkdir()
        reports={
          'radar.json': {'asOf':price},
          'universe.json': {'asOf':price,'rows':[{'code':'2454'}]},
          'market-intel.json':{'asOf':institution,'sources':{'twse_bfi':{'status':source}},
            'institutional':{'listed':{'date':institution,'unit':'億元',**({'foreign':9,'trust':129,'dealer':-133} if values else {})}}}
        }
        for key,content in reports.items():
            (root/'data'/key).write_text(json.dumps(content),encoding='utf-8')
        return root
    def at(self): return datetime(2026,10,21,20,30,tzinfo=TZ)
    def test_same_day_official_total_is_verified(self):
        r=inspect(self.fixture(),self.at())
        self.assertTrue(r['institutionalTotalVerifiedSameDay'])
        self.assertTrue(r['marketDatedToday'])
        self.assertTrue(r['institutionalDatedToday'])
        self.assertFalse(r['issues'])
    def test_old_market_date_warns_even_when_feeds_agree(self):
        r=inspect(self.fixture('2026-10-20','2026-10-20'),self.at())
        self.assertFalse(r['marketDatedToday'])
        self.assertFalse(r['institutionalDatedToday'])
        self.assertTrue(any('行情仍非今日' in s for s in r['issues']))
    def test_old_institution_never_becomes_today(self):
        r=inspect(self.fixture(institution='2026-10-20'),self.at())
        self.assertFalse(r['institutionalTotalVerifiedSameDay'])
        self.assertTrue(any('法人與行情日期不同' in s for s in r['issues']))
    def test_invalid_official_source_cannot_pass(self):
        r=inspect(self.fixture(source='invalid'),self.at())
        self.assertFalse(r['institutionalTotalVerifiedSameDay'])
    def test_missing_figures_cannot_pass(self):
        r=inspect(self.fixture(values=False),self.at())
        self.assertFalse(r['institutionalTotalVerifiedSameDay'])
    def test_missing_files_produce_report_not_exception(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=inspect(tmp,self.at());self.assertGreater(len(r['issues']),0)
            self.assertIn('待資料',render(r))
if __name__=='__main__':unittest.main()
