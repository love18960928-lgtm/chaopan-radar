import unittest
from structure_v24 import unified_structure

class TestR54(unittest.TestCase):
 def test_zone_date_matches_price_bar(self):
  b=[]
  for i in range(140):
   day=f"2026-{1+i//28:02d}-{1+i%28:02d}"
   high=120.0 if i==45 else (119.0 if i==46 else 101.0+(i%7)*.2)
   vol=60000 if i==46 else (45000 if i==45 else 1000)
   b.append([day,100.0,high,99.0,100.0,vol])
  z=unified_structure(b)
  for x in z.get("recentResistanceLevels",[]):
   self.assertTrue(any(v[0]==x["priceAnchorDate"] and abs(v[2]-x["price"])<.001 for v in b))
   self.assertEqual(x["date"],x["priceAnchorDate"])
 def test_primary_evidence_same_price_date(self):
  b=[]
  for i in range(140):
   day=f"2026-{1+i//28:02d}-{1+i%28:02d}"
   high=120.0 if i==95 else (119.0 if i==96 else 101.0+(i%7)*.2)
   vol=60000 if i==96 else (45000 if i==95 else 1000)
   b.append([day,100.0,high,99.0,100.0,vol])
  z=unified_structure(b)
  if z['primaryNecklineEvidence']:
   x=z['primaryNecklineEvidence']
   self.assertTrue(any(v[0]==x['date'] and abs(v[2]-x['price'])<.001 for v in b))
if __name__=='__main__':unittest.main()
