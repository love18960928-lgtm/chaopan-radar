"""V3.0.3: as-of-only continuation and pullback observation for EOD OHLCV.

This does not detect actual institutional positions or guarantee future returns.
Recorded breakout event is preferred when older, otherwise an objectively dated
32-session price-range breakout is used and explicitly labeled as such (NOT a
proven high-volume-K neckline). No price from a future day is used to create a
historical anchor. The earliest still-valid event in the current uninterrupted
hold episode is preferred to repeated 'new first bars' in a stair-step rally.
"""
from statistics import mean


def continuation_context(bars, recorded_event=None):
    b = sorted([x for x in bars if len(x)>=6 and x[4] is not None and float(x[4]) > 0], key=lambda x: str(x[0]))
    base = dict(kind='unverified', label='持續強勢待確認', source=None,
                breakoutDate=None, originalNeckline=None, daysSinceBreakout=None,
                holdDays=None, strictMA510Hold=None, ma510CloseBreakDays=None, ma510WickBreakDays=None, ma5=None, ma10=None, ma20=None, ma60=None,
                riskFlags=[], reason='歷史資料不足，不能編造突破事件')
    if len(b)<61:
        return base
    n=len(b)
    c=[float(x[4]) for x in b]
    m=lambda p,k: mean(c[k-p+1:k+1]) if k>=p-1 else None
    ma5,ma10,ma20,ma60=(m(x,n-1) for x in (5,10,20,60))
    base.update(ma5=round(ma5,3),ma10=round(ma10,3),ma20=round(ma20,3),ma60=round(ma60,3))
    candidates=[]
    start=max(55,n-150)
    for i in range(start,n):
        prior=b[i-32:i]
        if len(prior)<32:continue
        resistance=max(float(x[2]) for x in prior)
        previous=c[i-1];close=c[i]
        if previous>resistance*1.002 or close<=resistance*1.002:continue
        o,h,l,v=(float(b[i][j]) for j in (1,2,3,5))
        loc=(close-l)/(h-l) if h>l else 1.0
        avg20=mean(float(x[5]) for x in b[i-20:i])
        # EOD-confirmed price-range break with an as-of-evaluable quality signal.
        if loc<.55 or not (close>=o or close>=resistance*1.01):continue
        if not (avg20>0 and v/avg20>=1.1 or close>=resistance*1.015):continue
        candidates.append((i,resistance,'歷史32日區間高點'))
    if recorded_event and recorded_event.get('initialDate') and recorded_event.get('level'):
        ix=next((j for j,x in enumerate(b) if str(x[0])==str(recorded_event['initialDate'])),None)
        if ix is not None and ix<n and float(recorded_event['level'])>0:
            candidates.append((ix,float(recorded_event['level']),'既有大量K突破事件'))
    eligible=[]
    for i,level,source in candidates:
        # A genuinely continuous closing hold; two consecutive breaks terminate
        # the old episode, even if a future price later reclaims the same level.
        if c[-1]<=level:continue
        hold=0
        for j in range(n-1,i-1,-1):
            if c[j]>level:hold+=1
            else:break
        if hold<2 or hold<n-i:continue
        eligible.append((i,level,source,hold))
    if not eligible:
        base['reason']='未發現可核對、仍連續守住的歷史突破事件；不以現價推造原頸線'
        return base
    i,level,source,hold=sorted(eligible,key=lambda z:(z[0],0 if z[2]=='既有大量K突破事件' else 1))[0]
    age=n-1-i
    # Every candle from initial breakout through current as-of date must have
    # closed above both same-day averages. Do not confuse today-only MA5/10
    # positioning with an uninterrupted historical episode.
    broken=[];wick=[]
    for j in range(i,n):
        m5=m(5,j);m10=m(10,j)
        if m5 is None or m10 is None:
            broken.append(str(b[j][0]));continue
        if c[j]<m5 or c[j]<m10:broken.append(str(b[j][0]))
        if float(b[j][3])<m5 or float(b[j][3])<m10:wick.append(str(b[j][0]))
    strict_ma510=not broken
    avg20=mean(float(x[5]) for x in b[-21:-1]);v=float(b[-1][5]);o,h,l=map(float,(b[-1][1],b[-1][2],b[-1][3]))
    loc=(c[-1]-l)/(h-l) if h>l else 1
    heavy_sell=bool(avg20>0 and v>=avg20*1.65 and c[-1]<o and loc<.38 and c[-1]<c[-2])
    recent_down=bool(c[-1]<c[-2]<c[-3])
    ma20rising=bool(ma20>m(20,n-4))
    multi=ma5>ma10>ma20 and ma20rising
    risk=[]
    if heavy_sell:risk.append('放量收低，疑似賣壓')
    if c[-1]<ma10 and recent_down:risk.append('連兩日下跌且失守MA10')
    if c[-1]<=ma20:risk.append('跌回MA20下方')
    if c[-1]>ma5*1.10:risk.append('偏離MA5超過10%，防追高')
    if c[-1]>level*1.65:risk.append('遠離早期突破基準，須以近期均線控制風險')
    if c[-1]>ma5 and multi and not heavy_sell and age>=2:
        kind='trend';label='持續強勢／沿均線續行';reason='連續站穩歷史突破價、MA5>MA10>MA20且MA20上升'
    elif c[-1]>ma20 and c[-1]>=ma10*.985 and (c[-1]<ma5 or recent_down) and not heavy_sell:
        kind='pullback';label='強勢回測／觀察MA10與MA20';reason='原突破價仍守住，短線回檔；不能直接判定出貨'
    elif heavy_sell or c[-1]<=ma20 or (c[-1]<ma10 and recent_down):
        kind='warning';label='原強勢股轉弱警戒';reason='有量價回弱，須檢查原頸線及中短期支撐'
    else:
        kind='watch';label='頸線上方整理／尚未確認續強';reason='原突破區尚在，但均線強度未達持續強勢標準'
    base.update(kind=kind,label=label,source=source,breakoutDate=str(b[i][0]),
        originalNeckline=round(level,3),daysSinceBreakout=age,holdDays=hold,
        strictMA510Hold=strict_ma510,ma510CloseBreakDays=broken[:8],
        ma510WickBreakDays=wick[:8],riskFlags=risk,reason=reason)
    return base
