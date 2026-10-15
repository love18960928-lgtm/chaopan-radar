"""V1.6 operator-quality overlay for free, EOD Taiwan stock radar.

All scores are *heuristics*, NOT calibrated probabilities. Uses only as-of OHLCV
and already-collected optional fundamentals. No real-time data, broker fills,
foreign-investor holdings, or industry news are implied.
"""
from statistics import mean
import math


def _avg(xs):
    return mean(xs) if xs else None


def trader_overlay(candidate):
    bars=candidate.get('bars') or []
    closes=[float(x[4]) for x in bars]
    highs=[float(x[2]) for x in bars]
    lows=[float(x[3]) for x in bars]
    volumes=[float(x[5]) for x in bars]
    n=len(bars)
    if n<61 or not closes[-1]:
        return {'score':None,'grade':'資料不足','evidence':'需要至少61根日K'}
    close=closes[-1]
    ma5=mean(closes[-5:]);ma10=mean(closes[-10:]);ma20=mean(closes[-20:]);ma60=mean(closes[-60:]);
    prev20=mean(closes[-40:-20])
    tr=[max(highs[i]-lows[i],abs(highs[i]-closes[i-1]),abs(lows[i]-closes[i-1])) for i in range(max(1,n-14),n)]
    atr=mean(tr) if tr else None
    atr_pct=100*atr/close if atr is not None else None
    r5=100*(close/closes[-6]-1) if closes[-6] else None
    r20=100*(close/closes[-21]-1) if closes[-21] else None
    r60=100*(close/closes[-61]-1) if closes[-61] else None
    up_days=sum(closes[-i]>closes[-i-1] for i in range(1,11))
    ups=[volumes[i] for i in range(n-20,n) if closes[i]>=closes[i-1]]
    downs=[volumes[i] for i in range(n-20,n) if closes[i]<closes[i-1]]
    accumulation=(mean(ups)/mean(downs)) if ups and downs and mean(downs)>0 else None
    # Technical trend continuity (100-point heuristic; no market benchmark data assumed).
    trend=0
    trend+=25 if close>=ma20 else 0
    trend+=20 if ma20>=ma60 else 0
    trend+=15 if ma5>=ma20 else 0
    trend+=15 if ma20>prev20 else 0
    trend+=15 if 0<=r5<=18 else 5 if r5>18 else 0
    trend+=10 if up_days>=6 else 5 if up_days>=5 else 0
    if r20 is not None and r20>60: trend-=15
    trend=max(0,min(100,trend))
    neck=candidate.get('neck')
    stop=None; downside=None; hypothetical_2r=None
    if neck is not None and 0<float(neck) and float(neck)/close>.75 and atr is not None:
        # An *illustrative structure invalidation* below the anchor; not a stop order.
        stop=round(max(0,float(neck)-max(.5*atr,.01)),2)
        downside=round((close-stop)/close*100,2) if stop<close else None
        hypothetical_2r=round(close+2*(close-stop),2) if stop<close else None
    dist=candidate.get('distancePct')
    dist=float(dist) if dist is not None else None
    one_price=candidate.get('onePriceLimit',False)
    entry=0
    if 'first' in candidate.get('tags',[]):entry+=25
    elif candidate.get('followStatus')=='縮量回測':entry+=25
    elif 'prep' in candidate.get('tags',[]):entry+=10
    if dist is not None:
        if 0<=dist<=3:entry+=30
        elif -3<=dist<0:entry+=22
        elif 3<dist<=6:entry+=14
        elif -8<=dist<-3:entry+=10
    if downside is not None:
        entry+=25 if downside<=5 else 12 if downside<=8 else 0
    if atr_pct is not None:entry+=20 if atr_pct<=4.5 else 10 if atr_pct<=7 else 0
    overhead=candidate.get('historicalPeakGapPct')
    if overhead is not None and 0<overhead<=8:entry-=15
    elif overhead is not None and 8<overhead<=15:entry-=8
    if not candidate.get('complete120',False):entry-=20
    if one_price:entry-=30
    if r20 is not None and r20>45:entry-=20
    if candidate.get('followStatus')=='假突破警戒':entry-=40
    entry=max(0,min(100,entry))
    avg_vol20=mean(volumes[-21:-1])
    cash20_m=mean(closes[j]*volumes[j]/1000 for j in range(n-21,n-1))
    # OHLCV is in lots; close*lots/1000 = NT$ millions. Liquidity should track cash value.
    liquid=100 if cash20_m>=300 else 80 if cash20_m>=100 else 55 if cash20_m>=30 else 20
    if one_price:liquid-=35
    liquid=max(0,liquid)
    score=round(.45*trend+.40*entry+.15*liquid)
    risks=[]
    if one_price:risks.append('一字漲停，可能無法買到')
    if overhead is not None and 0<overhead<=8:
        risks.append('距過去可得歷史高點8%內，留意上方價格壓力；不是實際套牢成本')
    if downside is not None and downside>8:risks.append('距結構參考防守價過遠')
    if r20 is not None and r20>45:risks.append('20日漲幅大，追高風險')
    if atr_pct is not None and atr_pct>7:risks.append('14日波動幅度偏高')
    if candidate.get('followStatus')=='假突破警戒':risks.append('跌回前波大量K頸線下方')
    if trend<45:risks.append('多頭趨勢尚未確認')
    if not candidate.get('complete120',True):risks.append('歷史日K未滿120根，頸線可信度較低')
    if candidate.get('possiblePriceAdjustment'):risks.append('歷史價差異常，可能有除權息／減資或特殊交易，須核對')
    tradability='資料需核對' if candidate.get('possiblePriceAdjustment') or not candidate.get('complete120',False) else '不宜追價' if one_price or (downside is not None and downside>8) or (r20 is not None and r20>60) else '先觀察轉強' if candidate.get('followStatus')=='假突破警戒' or trend<45 else '關注回測' if candidate.get('followStatus')=='縮量回測' else '等待觸發／觀察'
    return {'score':score,'grade':'技術優先追蹤' if score>=75 and not risks else '持續觀察' if score>=55 else '風險偏高',
            'trend':trend,'entryQuality':entry,'liquidity':liquid,'atr14':round(atr,3) if atr else None,
            'atrPct':round(atr_pct,2) if atr_pct else None,'ma5':round(ma5,2),'ma20':round(ma20,2),'ma60':round(ma60,2),
            'return5Pct':round(r5,2),'return20Pct':round(r20,2),'return60Pct':round(r60,2),
            'upDays10':up_days,'avgTurnover20Millions':round(cash20_m,2),
            'holdQuality':trend,'newEntryQuality':entry,
            'historicalPeakHigh':candidate.get('historicalPeakHigh'),
            'historicalPeakGapPct':overhead,
            'historicalPeakSessions':candidate.get('historicalPeakSessions'),
            'complete250':candidate.get('complete250',False),
            'upDownVolumeRatio':round(accumulation,2) if accumulation else None,
            'structureInvalidation':stop,'structureDistancePct':downside,'illustrativeTwoR':hypothetical_2r,
            'status':tradability,'risks':risks,
            'dataNotes':['技術評分不是上漲機率','結構價與2R只是假設情境，非未來目標或實際成交價','過去高點僅為可取得日K的未還原價參考；未納入真實套牢量', '未納入大盤、法人籌碼、公司新聞及除權息調整']}


def apply_sector_relative_strength(stocks, candidates, asof):
    """Current-day relative return vs all same *official industry label* peers.

    Industry is taken only from optional official company fundamentals; this is
    not a claim of AI-theme exposure or money-flow data.
    """
    groups={}
    for st in stocks.values():
        bars=st.get('bars') or []
        industry=(st.get('fundamentals') or {}).get('industry')
        if not industry or len(bars)<21 or bars[-1][0]!=asof:continue
        now=float(bars[-1][4]);old=float(bars[-21][4])
        if old<=0:continue
        groups.setdefault(industry,[]).append(100*(now/old-1))
    for c in candidates:
        industry=(c.get('fundamentals') or {}).get('industry')
        t=c.get('trading',{})
        peers=groups.get(industry,[])
        if len(peers)<8 or t.get('return20Pct') is None:
            t['sectorRelative20Pct']=None;t['sectorPeerCount']=len(peers);t['sectorPriceRank']=None
            t['sectorLabel']='產業同業資料不足';continue
        r=t['return20Pct']
        median=sorted(peers)[len(peers)//2] if len(peers)%2 else (sorted(peers)[len(peers)//2-1]+sorted(peers)[len(peers)//2])/2
        excess=r-median
        t['sectorRelative20Pct']=round(excess,2);t['sectorPeerCount']=len(peers)
        t['sectorPriceRank']=1+sum(q>r for q in peers)
        t['sectorLabel']='強於產業中位數' if excess>=5 else '弱於產業中位數' if excess<=-5 else '接近產業中位數'
        if excess>=5:t['score']=min(100,t['score']+4)
        elif excess<=-5:t['score']=max(0,t['score']-4)
