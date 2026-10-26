#!/usr/bin/env python3
"""MA120/MA240 coverage audit; does not synthesize missing history."""
import argparse, json, math, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser()
p.add_argument('--min-coverage',type=float,default=0.75)
a=p.parse_args()
data=json.loads((root/'storage/history.json').read_text(encoding='utf-8'))
stocks=[s for s in data.get('stocks',[]) if isinstance(s.get('bars'),list) and s.get('code')]
def valid(b):
 try: return len(b)>=5 and isinstance(b[0],str) and math.isfinite(float(b[4])) and float(b[4])>0
 except (TypeError,ValueError,IndexError): return False
lengths=[]
for s in stocks:
 dates={b[0] for b in s['bars'] if valid(b)}
 lengths.append(len(dates))
n=len(lengths)
ma120=sum(x>=120 for x in lengths)
ma240=sum(x>=240 for x in lengths)
print(f'MA HISTORY AUDIT: stocks={n}, >=120 bars={ma120}, >=240 bars={ma240}, MA240 coverage={ma240/max(n,1):.1%}')
if not n or ma240/n<a.min_coverage:
 print(f'FAIL: MA240 coverage below {a.min_coverage:.0%}; do not mark all stocks verified.',file=sys.stderr)
 sys.exit(1)
