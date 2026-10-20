import json,tempfile,unittest
from pathlib import Path
from build_stock_lookup import build

class StockLookupTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory()
  self.root=Path(self.temp.name)
  (self.root/'data').mkdir()
  self.rows=[{'code':str(1000+i),'name':f'樣本{i}','market':'上市','date':'2026-10-20','close':50+i,'bars':[]} for i in range(501)]
  self.rows[0]={'code':'2454','name':'聯發科','market':'上市','date':'2026-10-20','close':1400,'bars':[['2026-10-20',1400,1410,1390,1400,1000]]}
 def tearDown(self):self.temp.cleanup()
 def save(self):
  (self.root/'data/universe.json').write_text(json.dumps({'asOf':'2026-10-20','rows':self.rows},ensure_ascii=False))
 def test_index_search_and_shard(self):
  self.save();self.assertEqual(build(self.root),501)
  path=self.root/'data/stock-lookup'
  idx=json.loads((path/'index.json').read_text())
  row=next(x for x in idx['rows'] if x['code']=='2454')
  self.assertEqual(row['name'],'聯發科')
  shard=json.loads((path/'2.json').read_text())
  self.assertEqual(next(x for x in shard['rows'] if x['code']=='2454')['bars'][-1][4],1400)
 def test_rejects_date_mismatch_without_publishing(self):
  self.rows[0]['date']='2026-10-19';self.save()
  with self.assertRaises(ValueError):build(self.root)
 def test_rejects_duplicate_code_same_market(self):
  self.rows[1]['code']='2454';self.save()
  with self.assertRaises(ValueError):build(self.root)
