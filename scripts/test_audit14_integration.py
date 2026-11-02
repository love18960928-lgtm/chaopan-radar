import unittest
from breakout_certification import certify_row

class TestAudit14(unittest.TestCase):
    def bars(self):
        import datetime
        d=datetime.date(2026,9,1)
        return [[(d+datetime.timedelta(days=i)).isoformat(),100,106,99,105,1000] for i in range(22)]
    def row(self,phase,days,first=True):
        bars=self.bars()
        return {'date':bars[-1][0], 'close':105, 'bars':bars, 'breakoutSequence':{'phase':phase,'level':101},'cycle':{'firstHistoricalBreakout':first,'daysSinceFirst':days}}
    def test_third(self):
        r=self.row('follow',2);certify_row(r);self.assertEqual(r['breakoutEvent']['level'],101);self.assertIn('continuationEligible',r)
    def test_fourth(self):
        r=self.row('follow',3);certify_row(r);self.assertIn('continuationEligible',r)
    def test_reclaim_not_certified(self):
        r=self.row('reclaim-follow',2);certify_row(r);self.assertNotIn('breakoutEvent',r)
    def test_old_follow_not_certified(self):
        r=self.row('follow',2,False);certify_row(r);self.assertNotIn('breakoutEvent',r)
    def test_first(self):
        r=self.row('first',0);certify_row(r);self.assertIn('continuationEligible',r)
