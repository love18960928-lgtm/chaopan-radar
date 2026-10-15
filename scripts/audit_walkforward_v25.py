"""Offline observational walk-forward for retained 65-day snippets.
Not a strategy P&L: no orders, fill assumptions, fees, slippage, corporate actions.
By design current supplied saved data lacks most of the preceding 120–780 days.
"""
import json,statistics,time
from collections import defaultdict
from pathlib import Path
from structure_v25 import cycle_judgement

ROOT=Path(__file__).resolve().parents[1]
source=json.loads((ROOT.parent/'chaopan_v24_work/data/universe.json').read_text())
groups=defaultdict(list);allreturns=[];sample_by_date=defaultdict(list);status_pair=defaultdict(int)
for row in source['rows']:
 b=row.get('bars') or []
 if len(b)<63:continue
 for k in range(61,len(b)):
  sub=b[:k]
  if not sub[-1][4] or not b[k][4]:continue
  r=cycle_judgement(sub)
  if r.get('unifiedStage')=='資料不足':continue
  ret=100*(b[k][4]/sub[-1][4]-1)
  # report only cohort after seeing T close, compare NEXT T+1 close
  stage=r['unifiedStage'];groups[stage].append(ret);allreturns.append(ret)
  sample_by_date[sub[-1][0]].append(ret)
  status_pair[(stage,b[k][0])]+=1

def stats(values):
 if not values:return None
 return {'n':len(values),'meanPct':round(statistics.mean(values),3),'positivePct':round(100*sum(v>0 for v in values)/len(values),1),'medianPct':round(statistics.median(values),3)}
summary={'dataAsOf':source['asOf'],'source':'saved 65-day-only slices from V2.2, incomplete; not independent full lookback',
         'scope':'one-day closing returns conditional on prior as-of stage, never hypothetical fill/PnL',
         'all':stats(allreturns),'dateBreadth':{k:stats(v) for k,v in sorted(sample_by_date.items())},
         'cohorts':{k:stats(v) for k,v in sorted(groups.items(),key=lambda kv:-len(kv[1]))},
         'limitations':['Not a backtest of entry/exit execution','Price levels are raw and may need adjustment','Strong selection bias and overlapping symbols','V2.5 parameters not out-of-sample tuned','Cannot claim improved win-rate over V2.4']}
(ROOT/'v25_walkforward_audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({'total':summary['all'],'dates':list(summary['dateBreadth']),'by_stage_top':list(summary['cohorts'].items())[:12]},ensure_ascii=False))
