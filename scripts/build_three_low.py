"""Rebuild the four three-low site payloads from a validated EOD snapshot.
No network calls, no fabricated dates; refuses mixed-date inputs.
"""
import json
import math
import os
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ('three-low-data.json','three-low-price-context.json','three-low-volume-context.json','ma240-three-low-context.json')

def load(path):
    return json.loads(path.read_text(encoding='utf-8'))

def finite(x):
    return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)

def series(closes, span, label):
    if len(closes)<span+3:return {'state':'資料不足','ma':None,'deduct':[],'projected':[],'last':closes[-1] if closes else None}
    ma=sum(closes[-span:])/span
    deduct=closes[-span:-span+3]
    projected=[]
    for n in range(1,4):
        projected.append(round((sum(closes[-span+n:]) + closes[-1]*n)/span,3))
    # Conservative observation only: current close above MA, three outgoing closes below current.
    qualifies=closes[-1]>=ma and all(closes[-1]>x for x in deduct)
    return {'state':'符合' if qualifies else '不符合','ma':round(ma,3),'deduct':[round(x,3) for x in deduct], 'projected':projected,'last':round(closes[-1],3)}

def period_closes(bars, mode, asof):
    grouped={}
    for b in bars:
        d=date.fromisoformat(b[0]); k=d.isocalendar()[:2] if mode=='week' else (d.year,d.month)
        grouped[k]=float(b[4])
    # The current week/month is incomplete; use completed periods only.
    now=date.fromisoformat(asof)
    current=now.isocalendar()[:2] if mode=='week' else (now.year,now.month)
    return [v for k,v in sorted(grouped.items()) if k!=current]

def main(root=ROOT):
    history=load(root/'storage/history.json')
    universe=load(root/'data/universe.json')
    radar=load(root/'data/radar.json')
    asof=universe.get('asOf')
    if not asof or asof!=radar.get('asOf') or any(v!=asof for v in universe.get('marketAsOf',{}).values()):
        raise ValueError('Market snapshot dates disagree; three-low generation stopped')
    date.fromisoformat(asof)
    rows_by_code={str(x['code']):x for x in universe.get('rows',[]) if x.get('date')==asof}
    three=[]; contexts=[]; volume={}; ma={}
    for stock in history.get('stocks',[]):
        code=str(stock.get('code',''))
        u=rows_by_code.get(code)
        if not u:continue
        bars=sorted((b for b in stock.get('bars',[]) if len(b)>5 and b[0]<=asof and finite(b[4]) and finite(b[5]) and b[4]>0 and b[5]>=0),key=lambda b:b[0])
        if not bars or bars[-1][0]!=asof:continue
        closes=[float(b[4]) for b in bars]
        day=series(closes,20,'day')
        week=series(period_closes(bars,'week',asof),5,'week')
        month={'state':'尚未驗證','ma':None,'deduct':[],'projected':[],'last':None}
        three.append({'code':code,'name':stock.get('name',u.get('name','')),'market':stock.get('market',u.get('market','')),'close':closes[-1],'day':day,'week':week,'month':month,'score':int(day['state']=='符合')+int(week['state']=='符合')})
        contexts.append({k:u.get(k) for k in ('code','close','changePct','volumeRatio','neck','priceConfirmed','preLaunch','riskLevel','distancePct','supportEvidence','riskEvidence','launchStage','lots','relMarket5Pct')})
        volume[code]={'avg20Lots':round(sum(float(b[5]) for b in bars[-20:])/min(20,len(bars)),2),'todayLots':float(bars[-1][5]),'close':closes[-1],'asOf':asof}
        discontinuity=any(abs(closes[i]/closes[i-1]-1)>.55 for i in range(1,len(closes)) if closes[i-1]>0)
        valid=len(closes)>=260 and not discontinuity
        ma240=sum(closes[-240:])/240 if len(closes)>=240 else None
        prev=sum(closes[-260:-20])/240 if len(closes)>=260 else None
        ma[code]={'ma240':round(ma240,4) if ma240 is not None else None,'ma240Prev20':round(prev,4) if prev is not None else None,'close':closes[-1],'asOf':asof,'up':bool(valid and ma240>prev),'above':bool(valid and closes[-1]>ma240),'valid':valid,'reason':'疑似未還原價格跳變' if discontinuity else ('歷史不足260根' if len(closes)<260 else '')}
    if len(three)<1000:raise ValueError(f'Only {len(three)} fresh stocks; refuse partial publication')
    payloads={
        'three-low-data.json':{'asOf':asof,'method':'日MA20、已完成週MA5；以現價模擬未來三期扣抵；月線未驗證；非買進訊號','rows':three},
        'three-low-price-context.json':{'asOf':asof,'rows':contexts},
        'three-low-volume-context.json':{'asOf':asof,'source':'storage/history.json','byCode':volume},
        'ma240-three-low-context.json':{'asOf':asof,'source':'storage/history.json','method':'MA240 SMA; slope vs 20 trading days earlier; >=260 bars; suspected split >55% excluded','stats':{'historyStocks':len(history.get('stocks',[])),'eligible240':sum(len(s.get('bars',[]))>=240 for s in history['stocks']),'eligible260':sum(len(s.get('bars',[]))>=260 for s in history['stocks']),'excludedDiscontinuity':sum(v['reason']=='疑似未還原價格跳變' for v in ma.values()),'candidates':sum(v['valid'] and v['above'] and v['up'] for v in ma.values())},'byCode':ma}}
    for name,payload in payloads.items():
        tmp=root/(name+'.tmp')
        tmp.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        os.replace(tmp,root/name)
    print(f'Three-low rebuilt: {asof}, {len(three)} stocks, {len(ma)} MA records')

if __name__=='__main__':
    main()
