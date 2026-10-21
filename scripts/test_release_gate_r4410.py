"""Regression: never publish partial, mismatched, stale or invented snapshots."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_release_gate_r4410 import verify, ReleaseGateError
from build_stock_lookup import build


def minimal_fixture(folder):
    folder=Path(folder)
    (folder/'data').mkdir(parents=True, exist_ok=True)
    day='2026-10-20'
    bars=[['2026-10-19',49.5,50,49,49.8,123], [day,49.9,50.2,49.7,50,200]]
    rows=[]
    for market,n in [('上市',700),('上櫃',450)]:
        for i in range(n):
            code=str(1000+i if market=='上市' else 5000+i)
            rows.append({'market':market,'code':code,'name':'測試'+code,'date':day,
                         'close':50,'neck':49.8,'neckDate':'2026-10-19',
                         'priceConfirmed':True,'unifiedStage':'突破','unifiedScore':70,
                         'launchStage':'first','riskLevel':'low',
                         'intradayPlan':{'asOf':day,'crossPrice':49.85},'bars':copy.deepcopy(bars)})
    radar={'asOf':day,'mode':'live','candidates':[copy.deepcopy(rows[0])]}
    universe={'asOf':day,'coverage':len(rows),'rows':rows}
    (folder/'data/radar.json').write_text(json.dumps(radar,ensure_ascii=False))
    (folder/'data/universe.json').write_text(json.dumps(universe,ensure_ascii=False))
    build(folder)
    return radar,universe


class ReleaseGateTests(unittest.TestCase):
    def setUp(self):
        self.dir=tempfile.TemporaryDirectory()
        self.root=Path(self.dir.name)
        self.r,self.u=minimal_fixture(self.root)

    def tearDown(self):self.dir.cleanup()

    def save(self,radar=None,universe=None):
        if radar is not None:
            (self.root/'data/radar.json').write_text(json.dumps(radar,ensure_ascii=False))
        if universe is not None:
            (self.root/'data/universe.json').write_text(json.dumps(universe,ensure_ascii=False))

    def test_valid_snapshot_with_all_search_shards(self):
        self.assertEqual(verify(self.root)['stocks'],1150)

    def test_cross_neckline_does_not_publish(self):
        r=copy.deepcopy(self.r);r['candidates'][0]['neck']=48
        self.save(radar=r)
        with self.assertRaisesRegex(ReleaseGateError,'canonical field conflict'):verify(self.root)

    def test_cross_breakout_confirmation_does_not_publish(self):
        r=copy.deepcopy(self.r);r['candidates'][0]['priceConfirmed']=False
        self.save(radar=r)
        with self.assertRaisesRegex(ReleaseGateError,'canonical field conflict'):verify(self.root)

    def test_partial_snapshot_does_not_publish(self):
        r=copy.deepcopy(self.r);r['mode']='partial';self.save(radar=r)
        with self.assertRaisesRegex(ReleaseGateError,'not live'):verify(self.root)

    def test_old_stock_index_does_not_publish(self):
        p=self.root/'data/stock-lookup/index.json';i=json.loads(p.read_text());i['asOf']='2026-10-19';p.write_text(json.dumps(i))
        with self.assertRaisesRegex(ReleaseGateError,'directory date/count'):verify(self.root)

    def test_one_missing_shard_stock_does_not_publish(self):
        p=self.root/'data/stock-lookup/1.json';s=json.loads(p.read_text());s['rows'].pop();s['count']-=1;p.write_text(json.dumps(s))
        with self.assertRaisesRegex(ReleaseGateError,'shard coverage'):verify(self.root)

    def test_broken_open_outside_high_is_rejected(self):
        u=copy.deepcopy(self.u);u['rows'][0]['bars'][-1][1]=55;self.save(universe=u)
        with self.assertRaisesRegex(ReleaseGateError,'invalid OHLCV'):verify(self.root)

    def test_bad_date_or_stale_bar_rejected(self):
        u=copy.deepcopy(self.u);u['rows'][0]['bars'][-1][0]='2026-10-19';self.save(universe=u)
        with self.assertRaisesRegex(ReleaseGateError,'date/last candle'):verify(self.root)

    def test_market_coverage_drop_vs_prior_session_is_rejected(self):
        # Both exchanges exceed the absolute minimum, yet listed shares
        # collapsed vs the previous complete day; this must not go live.
        history={'stocks':[{'market':'上市','code':str(1000+i),
                 'bars':[['2026-10-19',49.5,50,49,49.8,123]]} for i in range(900)]}
        (self.root/'storage').mkdir(parents=True,exist_ok=True)
        (self.root/'storage/history.json').write_text(json.dumps(history))
        with self.assertRaisesRegex(ReleaseGateError,'coverage dropped'):
            verify(self.root)

    def test_intraday_plan_date_mismatch_rejected(self):
        u=copy.deepcopy(self.u);u['rows'][0]['intradayPlan']['asOf']='2026-10-19';self.save(universe=u)
        with self.assertRaisesRegex(ReleaseGateError,'plan asOf mismatch'):verify(self.root)

if __name__=='__main__':unittest.main()
