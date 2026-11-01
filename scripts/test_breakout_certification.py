import unittest
from breakout_certification import certify_row


def row(close=110, high=111, low=100, volume=200, phase='first', prevhigh=105):
    bars = [[f'2026-09-{i:02}', 100, 105, 95, 100, 100] for i in range(1,21)]
    bars += [['2026-09-21',100,prevhigh,95,100,100],['2026-09-22',102,high,low,close,volume]]
    return {'date':'2026-09-22','bars':bars,'breakoutSequence':{'phase':phase,'level':101,'initialDate':'2026-09-22'}}

class TestCertification(unittest.TestCase):
    def test_strong(self):
        r=certify_row(row());self.assertTrue(r['continuationEligible']);self.assertEqual(r['breakoutQuality'],'strong')
    def test_weak_upper_wick(self):
        r=certify_row(row(close=104,high=120));self.assertFalse(r['continuationEligible'])
    def test_low_volume(self):
        r=certify_row(row(volume=50));self.assertFalse(r['continuationEligible'])
    def test_below_neckline(self):
        r=certify_row(row(close=100,low=99));self.assertEqual(r['breakoutQuality'],'invalid')
    def test_second_prev_high(self):
        r=certify_row(row(phase='second',prevhigh=115));self.assertFalse(r['abovePrevHigh']);self.assertFalse(r['continuationEligible'])
    def test_missing_bars_pending(self):
        r=row();r['bars']=[];certify_row(r);self.assertNotIn('continuationEligible',r)
    def test_invalid_ohlc_is_pending(self):
        r=certify_row(row(close=110, high=111, low=99, volume=200))
        self.assertIn('continuationEligible',r)
        r=certify_row(row(close=110, high=111, low=112, volume=200))
        self.assertNotIn('continuationEligible',r)

    def test_invalid_previous_day_ohlc_remains_pending(self):
        r=row()
        r['bars'][-2][2]=90  # previous high below its open/close
        certify_row(r)
        self.assertNotIn('continuationEligible',r)

    def test_stale_certification_cleared_when_bars_missing(self):
        r=certify_row(row())
        self.assertTrue(r['continuationEligible'])
        r['bars']=[]
        certify_row(r)
        self.assertNotIn('continuationEligible',r)
        self.assertNotIn('breakoutQuality',r)

    def test_first_candle_equal_neckline_is_not_breakout(self):
        r=row(close=101, low=99)
        certify_row(r)
        self.assertFalse(r['continuationEligible'])
        self.assertEqual(r['breakoutQuality'], 'invalid')

    def test_fourth_plus_can_be_certified(self):
        r=certify_row(row(phase='fourth_plus'))
        self.assertTrue(r['continuationEligible'])

    def test_mismatched_snapshot_close_remains_pending(self):
        r=row()
        r['close']=90
        certify_row(r)
        self.assertNotIn('continuationEligible',r)

    def test_duplicate_latest_bar_remains_pending(self):
        r=row()
        r['bars'][-2][0]=r['bars'][-1][0]
        certify_row(r)
        self.assertNotIn('continuationEligible',r)

    def test_malformed_history_remains_pending(self):
        r=row()
        r['bars'][-5]=['2026-09-17']
        certify_row(r)
        self.assertNotIn('continuationEligible',r)

    def test_malformed_breakout_sequence_is_pending(self):
        r=row(); r['breakoutSequence']='invalid-event'
        certify_row(r)
        self.assertNotIn('continuationEligible',r)

    def test_malformed_last_bar_is_pending(self):
        r=row(); r['bars'][-1]='bad-bar'
        certify_row(r)
        self.assertNotIn('continuationEligible',r)

    def test_missing_snapshot_date_is_pending(self):
        r=row(); r['date']=None; r['bars'][-1][0]=None
        certify_row(r)
        self.assertNotIn('continuationEligible',r)

    def test_no_event_no_certification(self):
        r=row(phase='ready');certify_row(r);self.assertNotIn('breakoutEvent',r)

if __name__=='__main__':unittest.main()
