import unittest
from continuation_v303 import continuation_context


def sample(extension=18):
    bars=[]
    for i in range(62):
        d=f'2026-01-{i+1:03d}'
        bars.append([d, 100.0, 101.0, 99.0, 100.0, 1000])
    bars.append(['2026-03-063',102.0,108.0,101.0,107.0,2200])
    for j in range(extension):
        close=107+0.8*(j+1)
        bars.append([f'2026-04-{j+1:03d}',close-1.0,close+0.8,close-2.0,close,1200])
    return bars

class ContinuationTests(unittest.TestCase):
    def test_long_held_break(self):
        b=sample(35)
        x=continuation_context(b)
        self.assertEqual(x['kind'],'trend', x)
        self.assertGreater(x['daysSinceBreakout'],30)
        self.assertEqual(x['breakoutDate'],'2026-03-063')
        self.assertEqual(x['holdDays'],len(b)-62)
    def test_strict_ma510_traces_every_candle_since_break(self):
        b=sample(24)
        self.assertTrue(continuation_context(b)['strictMA510Hold'])
        # Still above old 107 neckline and eventually recovered, but the
        # intermediate close went below historical MA5 and MA10.
        b[71][4]=107.05;b[71][1]=108;b[71][3]=106
        x=continuation_context(b)
        self.assertFalse(x['strictMA510Hold'])
        self.assertIn(b[71][0],x['ma510CloseBreakDays'])
        self.assertEqual(x['breakoutDate'],'2026-03-063')

    def test_pullback_not_distribution(self):
        b=sample(20)
        last=b[-1]
        last[1]=last[4]-0.3
        last[4]-=2.7
        last[3]=last[4]-1.0
        last[5]=700
        x=continuation_context(b)
        self.assertEqual(x['kind'],'pullback',x)
    def test_broken_anchor_not_confirmed(self):
        b=sample(8)
        for j in range(2):
            b.append([f'2026-05-0{j+1}',99.0,100.0,97.0,98.0,2200])
        x=continuation_context(b)
        self.assertNotIn(x['kind'],('trend','pullback'))
    def test_no_broken_premature(self):
        b=sample(35)
        a=continuation_context(b[:65])
        z=continuation_context(b)
        self.assertEqual(a['breakoutDate'],z['breakoutDate'])
        self.assertLess(a['holdDays'],z['holdDays'])
    def test_no_event_no_invent(self):
        b=[[str(i),100.,101.,99.,100.,1000] for i in range(90)]
        x=continuation_context(b)
        self.assertEqual(x['kind'],'unverified')
        self.assertIsNone(x['originalNeckline'])
    def test_recorded_event_preserved(self):
        b=sample(14)
        x=continuation_context(b,{'initialDate':'2026-03-063','level':101})
        self.assertEqual(x['source'],'既有大量K突破事件')
        self.assertEqual(x['originalNeckline'],101)
    def test_volume_down_pressure(self):
        b=sample(20)
        b[-1][1]=132;b[-1][2]=134;b[-1][3]=115;b[-1][4]=116;b[-1][5]=3600
        x=continuation_context(b)
        self.assertNotEqual(x['kind'],'trend')
        self.assertTrue(any('放量收低' in f for f in x['riskFlags']))
    def test_short_history(self):
        self.assertEqual(continuation_context(sample(0)[:40])['kind'],'unverified')

if __name__=='__main__':unittest.main()
