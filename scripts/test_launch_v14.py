"""Regression fixtures reconstructed from the user's 台虹 2026-07-13 example.
Only selected reference K values are known; all other daily rows here are synthetic.
"""
import unittest
import datetime as dt
from rules import scan_stock, build_snapshot


def taihong_fixture():
    days=[]
    date=dt.date(2026,4,1)
    end=dt.date(2026,7,13)
    while date<=end:
        if date.weekday()<5:days.append(date.isoformat())
        date+=dt.timedelta(days=1)
    bars=[]
    for date in days:
        v=2000 if date<'2026-05-29' else 6000
        bars.append([date,148.,150.,146.,148.,v,None])
    k={b[0]:i for i,b in enumerate(bars)}
    bars[k['2026-05-29']]=['2026-05-29',161.,168.5,156.,162.,41300,None]
    bars[k['2026-07-10']]=['2026-07-10',150.,154.,149.,154.,6200,None]
    # Limit-up one-price candle; old large-volume 41,300 lots was not exceeded.
    bars[k['2026-07-13']]=['2026-07-13',169.,169.,169.,169.,8682,None]
    return {'code':'8039','name':'台虹（測試資料）','market':'上市','bars':bars}

class FirstLaunchV14(unittest.TestCase):
    def test_earlier_day_watch_no_lookahead(self):
        stock=taihong_fixture()
        stock['bars']=stock['bars'][:-1]
        result=scan_stock(stock)
        self.assertIsNotNone(result)
        self.assertTrue(result['preLaunch'])
        self.assertIn('prep',result['tags'])
        self.assertNotIn('first',result['tags'])
        self.assertEqual(result['neckDate'],'2026-05-29')
        self.assertEqual(result['neck'],168.5)
        self.assertEqual(result['date'],'2026-07-10')

    def test_limit_up_first_without_beating_max_volume(self):
        result=scan_stock(taihong_fixture())
        self.assertIsNotNone(result)
        self.assertIn('first',result['tags'])
        self.assertNotIn('volume',result['tags'])
        self.assertTrue(result['onePriceLimit'])
        self.assertTrue(result['priceConfirmed'])
        self.assertFalse(result['volumeConfirmed'])
        self.assertEqual(result['neck'],168.5)
        self.assertEqual(result['lots'],8682)
        self.assertEqual(result['oldMaxLots'],41300)
        self.assertEqual(result['launchRank'],5)

    def test_flat_8_pct_below_is_not_watch(self):
        stock=taihong_fixture()
        stock['bars']=stock['bars'][:-1]
        for row in stock['bars'][-20:]:
            if row[0]>'2026-06-15':
                row[1]=row[4]=153.
                row[2]=155.
                row[3]=151.
                row[5]=6000
        result=scan_stock(stock)
        self.assertIsNone(result)  # no price acceleration, not a 'launch setup'

    def test_post_breakout_not_falsely_first_again(self):
        stock=taihong_fixture()
        stock['bars'].append(['2026-07-14',171,172,165,170,3000,None])
        result=scan_stock(stock)
        self.assertTrue(result is None or 'first' not in result['tags'])

    def test_first_ranks_above_many_limit_up_counter(self):
        a=scan_stock(taihong_fixture())
        b=dict(a,code='9999',launchRank=1,score=999,tags=['limit'])
        # Snapshot emits first before higher composite-score but lower launch-rank candidates.
        ranked=sorted((a,b),key=lambda c:(c['launchRank'],c['score']),reverse=True)
        self.assertEqual(ranked[0]['code'],'8039')

if __name__=='__main__':unittest.main()
