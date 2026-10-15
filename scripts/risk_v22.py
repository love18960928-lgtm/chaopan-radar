"""V2.2 EOD risk and opportunity assessment for ALL TWSE/TPEx stocks.

Published only as heuristic *evidence*, not identified trader activity, a
probability or an automatic sell order. Every comparison uses data no later
than the row's as-of trading day. Bars in 1,000-share lots.
"""
from statistics import median, mean
from collections import defaultdict
from rules import scan_stock
from trader import trader_overlay
from support_v22 import support_evidence
from intraday_plan_v26 import build_intraday_plan
from structure_v25 import cycle_judgement


def _ret(bars,days):
    if len(bars)<=days or float(bars[-days-1][4])<=0:return None
    return 100*(float(bars[-1][4])/float(bars[-days-1][4])-1)


def market_context(stocks, asof):
    broad=defaultdict(list);sectors=defaultdict(list)
    for st in stocks.values():
        b=st.get('bars') or []
        if len(b)<21 or b[-1][0]!=asof:continue
        for days in (5,20):
            r=_ret(b,days)
            if r is None:continue
            broad[(st['market'],days)].append(r)
            sec=(st.get('fundamentals') or {}).get('industry')
            if sec:sectors[(st['market'],sec,days)].append(r)
    breadth_ma20={}
    for market in ('上市','上櫃'):
        pool=[s['bars'] for s in stocks.values() if s.get('market')==market and len(s.get('bars') or [])>=20 and s['bars'][-1][0]==asof]
        breadth_ma20[market]=round(100*sum(float(z[-1][4])>=mean(float(x[4]) for x in z[-20:]) for z in pool)/len(pool),1) if len(pool)>=50 else None
    return {'breadthMa20':breadth_ma20,'broad':{k:median(v) for k,v in broad.items() if len(v)>=50},
            'sectors':{k:(median(v),len(v)) for k,v in sectors.items() if len(v)>=8}}


def assess_stock(st, snapshot_row, context, asof):
    """Assess every history-bearing stock, even if it had no breakout signal."""
    b=sorted(st.get('bars') or [],key=lambda r:r[0]); cand=snapshot_row or {}
    fallback={'code':st['code'],'name':st['name'],'market':st['market'],
              'date':b[-1][0] if b else None,'tags':[], 'score':0,'launchStage':'未出現大量K訊號'}
    # Use the same historical anchor algorithm, without its candidate gate.
    diagnostic=scan_stock(st, include_all=True) if len(b)>=55 else None
    c={**fallback,**(diagnostic or {}),**cand}
    c['fundamentals']=st.get('fundamentals') or {}
    c['industry']=c['fundamentals'].get('industry') or '產業未分類'
    if not b or b[-1][0]!=asof:
        c.update({'riskLevel':'unknown','riskStatus':'資料日期不一致','riskReasons':['缺少最新同交易日行情'],
                  'opportunityScore':None,'decision':'資料不足','relMarket5Pct':None,'relSector5Pct':None})
        c['bars']=b[-65:];return c
    n=len(b)
    c['bars']=[[x[0],float(x[1]),float(x[2]),float(x[3]),float(x[4]),round(float(x[5]))] for x in b[-65:]]
    c['date']=asof
    c['open']=float(b[-1][1]);c['high']=float(b[-1][2]);c['low']=float(b[-1][3]);c['close']=float(b[-1][4]);c['lots']=round(float(b[-1][5]))
    if n>1 and b[-2][4]>0:c['changePct']=round(100*(b[-1][4]/b[-2][4]-1),2)
    if n<61:
        short=cycle_judgement(b,market_breadth=context.get('breadthMa20',{}).get(st['market']))
        c['structureV23']=short;c['unifiedStage']=short.get('unifiedStage','資料不足')
        c['unifiedScore']=short.get('unifiedScore');c['unifiedReasons']=short.get('unifiedReasons',[])
        c['neck']=short.get('primaryNeckline');c['neckDate']=short.get('primaryNecklineDate')
        c['priceConfirmed']=False;c['confirmed']=False;c['tags']=[]
        for key in ('cycle','signalQuality','entryReadiness','holdGuidance','riskFlags','riskFirst','regime','setupEvidence','marketBreadthAboveMA20Pct','profitReview'):
            c[key]=short.get(key)
        c['intradayPlan']=build_intraday_plan(b,short,asof=asof)
        c.update({'riskLevel':'unknown','riskStatus':'資料不足','riskReasons':['不足61根交易日K線'],
                  'opportunityScore':None,'decision':'資料不足','relMarket5Pct':None,'relSector5Pct':None})
        return c
    close=float(b[-1][4]);cls=[float(x[4]) for x in b];lows=[float(x[3]) for x in b];highs=[float(x[2]) for x in b]
    volumes=[float(x[5]) for x in b];ma20=mean(cls[-20:]); ma20previous=mean(cls[-30:-10]);
    r5=_ret(b,5);r20=_ret(b,20)
    index_median=context['broad'].get((st['market'],5))
    relmarket=round(r5-index_median,2) if r5 is not None and index_median is not None else None
    sector_key=(st['market'],c['industry'],5)
    sector=context['sectors'].get(sector_key)
    relsector=round(r5-sector[0],2) if r5 is not None and sector else None
    levels=support_evidence(b)
    structure=cycle_judgement(b,market_breadth=context.get('breadthMa20',{}).get(st['market']))
    c['structureV23']=structure
    # One recent-structure engine for EVERY stock (including non-candidates).
    # Preserve historical old logic only as the supporting volume reference;
    # do not let priceConfirmed/candidate override this as-of structural level.
    c['legacyNeck']=c.get('neck')
    c['neck']=structure.get('primaryNeckline')
    c['neckDate']=structure.get('primaryNecklineDate')
    c['distancePct']=(round(100*(float(c['close'])/float(c['neck'])-1),2)
                      if c.get('neck') else None)
    c['unifiedStage']=structure.get('unifiedStage')
    c['unifiedScore']=structure.get('unifiedScore')
    c['unifiedReasons']=structure.get('unifiedReasons')
    for key in ('cycle','signalQuality','entryReadiness','holdGuidance','riskFlags','riskFirst','regime','setupEvidence','marketBreadthAboveMA20Pct','profitReview'):
        c[key]=structure.get(key)
    c['priceConfirmed']=bool(structure.get('priceBreakout'))
    c['confirmed']=bool(structure.get('volumeBreakout'))
    c['preLaunch']=(c['unifiedStage']=='發動前觀察')
    c['launchStage']=c['unifiedStage']
    c['followStatus']=('突破續強' if '續強' in c['unifiedStage'] else
                       '假突破警戒' if c['unifiedStage'].startswith('突破失敗') else None)
    # These are descriptive badges, not eligibility gates.
    c['tags']=([('first' if c['priceConfirmed'] else '')] if c['priceConfirmed'] else [])
    if c['unifiedStage']=='接近近期頸線': c['tags'].append('near')
    if c['preLaunch']: c['tags'].append('prep')
    if c['followStatus']: c['tags'].append('follow')
    if structure.get('volumeBreakout'): c['tags'].append('volume')
    if (c.get('limit20') or 0)>=2:c['tags'].append('limit')
    # The new support structure is independent from the dynamic neckline.
    c['supportEvidence']=levels
    confirmed_support_break=bool(levels['broken']) or any(x['confirmedBreak'] for x in structure.get('brokenSupport',[]))
    # Four independent evidence groups: structure, relative performance, selling volume, breakout failure.
    down_low=min(lows[-5:])<min(lows[-10:-5])*.995
    down_high=max(highs[-5:])<max(highs[-10:-5])*.995
    declining=down_low and down_high
    structure_weak=bool(close<ma20*.99 and ma20<ma20previous and declining)
    relative_weak=bool(relmarket is not None and relmarket<=-4 and (relsector is None or relsector<=-2))
    older_vol=mean(volumes[-21:-1])
    sell_pressure=(close<float(b[-1][1]) and float(b[-1][5])>older_vol*1.5 and c.get('changePct',0)<=-3)
    up=[volumes[j] for j in range(n-20,n) if cls[j]>=cls[j-1]]
    down=[volumes[j] for j in range(n-20,n) if cls[j]<cls[j-1]]
    volume_asymmetry=bool(up and down and mean(down)>mean(up)*1.4 and len(down)>=7)
    volume_weak=sell_pressure or (volume_asymmetry and declining)
    neck=c.get('neck');follow=c.get('followStatus')
    event_level=(structure.get('cycle') or {}).get('level')
    failed_break=bool(follow=='假突破警戒' or (event_level and close<float(event_level)*.985 and any(x[4]>float(event_level) for x in b[-12:-1])))
    # Raw OHLCV can be unadjusted around corporate actions. Guard, don't assert distribution.
    unadjusted=bool(c.get('possiblePriceAdjustment'))
    drawdown20=100*(close/max(highs[-20:])-1)
    c['relMarket5Pct']=relmarket;c['relSector5Pct']=relsector
    c['marketProxyNote']='同市場股票5日報酬中位數，並非加權或櫃買指數'
    c['riskEvidence']={'fallingHighsLows':declining,'belowFallingMa20':structure_weak,
       'relativeWeak':relative_weak,'sellingVolume':volume_weak,'breakoutFailed':failed_break,
       'drawdown20Pct':round(drawdown20,2),'priceAdjustmentUnverified':unadjusted}
    reasons=[]
    if declining:reasons.append('近5日高低點同時低於前5日')
    if structure_weak:reasons.append('跌破下彎MA20，且高低點下移')
    if relative_weak:reasons.append('近5日弱於同市場與可比同業')
    if sell_pressure:reasons.append('收黑放量下跌，單日賣壓偏強')
    elif volume_asymmetry and declining:reasons.append('近20日下跌量能大於上漲量能')
    if failed_break:reasons.append('近期突破後跌回大量K頸線')
    if confirmed_support_break:reasons.append('連續兩日收盤跌破歷史支撐區下緣（待核對除權息）')
    if drawdown20<=-12:reasons.append('距近20日高點回落逾12%')
    if unadjusted:reasons.append('歷史價格可能有除權息／特殊交易異常，需人工核對')
    groups=sum((structure_weak or declining,relative_weak,volume_weak,failed_break))
    if c.get('riskFirst'):reasons.append('統一訊號判斷：近期結構破壞優先於可能突破')
    severe=bool((confirmed_support_break and (relative_weak or volume_weak)) or (failed_break and (relative_weak or volume_weak)) or
       (groups>=3 and (structure_weak or declining)))
    if c.get('riskFirst') and not unadjusted:
        level='high' if failed_break or confirmed_support_break or volume_weak else 'medium'
        status='結構破壞／風險優先（非確認出貨）'
    elif severe and not unadjusted:
        level='high';status='疑似出貨／假突破風險'
    elif groups>=2 or confirmed_support_break or (drawdown20<=-12 and declining) or unadjusted:
        level='medium';status='弱勢盤整／轉弱警戒'
    elif close>ma20 and ma20>=ma20previous and (c.get('priceConfirmed') or c.get('followStatus')=='突破續強'):
        level='low';status='突破後偏強'
    elif c.get('preLaunch') or (neck and float(neck)>close and 0<100*(float(neck)/close-1)<=10):
        level='low';status='頸線下方觀察'
    elif close>=ma20 and not declining:
        level='low';status='整理／趨勢維持'
    else:
        level='medium' if groups or declining else 'low';status='方向未明盤整'
    if not reasons:reasons=['無明顯高風險組合訊號，不代表安全或主力吸籌']
    c['riskLevel']=level;c['riskStatus']=status;c['riskReasons']=reasons
    # Full-universe opportunity: include a signal OR trend, not just arbitrary watchlists.
    t=trader_overlay({**c,'bars':b[-120:]})
    if not isinstance(c.get('trading'),dict): c['trading']=t
    if not c.get('trading') or c['trading'].get('score') is None:c['trading']=t
    trend=t.get('trend') or 0
    liquidity=t.get('avgTurnover20Millions') or 0
    signal=38 if c.get('priceConfirmed') else 23 if c.get('followStatus')=='突破續強' else 19 if c.get('preLaunch') else 11 if 'near' in c.get('tags',[]) else 0
    momentum=18 if r20 is not None and 0<r20<35 else 7 if r20 is not None and r20>=35 else 0
    entry=t.get('entryQuality') or 0
    opportunity=round(.34*trend+.28*entry+.23*signal+.15*momentum)
    if c.get('riskFirst'):opportunity-=35
    if relmarket is not None and relmarket>=3:opportunity+=5
    if relsector is not None and relsector>=3:opportunity+=4
    if liquidity<10:opportunity-=15
    elif liquidity<30:opportunity-=5
    if c.get('onePriceLimit'):opportunity-=20
    if r20 is not None and r20>45:opportunity-=18
    if confirmed_support_break:opportunity-=10
    if level=='high':opportunity-=55
    elif level=='medium':opportunity-=25
    c['opportunityScore']=max(0,min(100,opportunity))
    if level=='high':c['decision']='風險優先'
    elif level=='medium':c['decision']='等待改善／警戒'
    elif c['opportunityScore']>=65 and (c.get('priceConfirmed') or trend>=75):c['decision']='優先研究（非買進建議）'
    elif trend>=65:c['decision']='強勢觀察（留意買點）'
    else:c['decision']='一般觀察'
    c['intradayPlan']=build_intraday_plan(b,structure,risk_level=c.get('riskLevel'),asof=asof)
    return c


def build_universe(stocks, snapshot, asof):
    context=market_context(stocks,asof)
    included={ (c['market'],c['code']):c for c in snapshot.get('candidates',[]) }
    rows=[]
    for st in stocks.values():
        if not st.get('bars') or st['bars'][-1][0]!=asof:continue
        record=assess_stock(st,included.get((st['market'],st['code'])),context,asof)
        # Avoid duplicating full 120-day candidate objects in a second large JSON.
        slim={key:record.get(key) for key in (
          'code','name','market','date','close','open','high','low','changePct','lots','neck','neckDate',
          'distancePct','volumeRatio','oldMaxLots','oldMaxDate','oldMaxHigh','oldMaxClose','limit20','tags','priceConfirmed','preLaunch','followStatus',
          'launchStage','score','complete120','possiblePriceAdjustment','onePriceLimit',
          'riskLevel','riskStatus','riskReasons','riskEvidence','supportEvidence','structureV23','unifiedStage','unifiedScore','unifiedReasons','legacyNeck','relMarket5Pct','relSector5Pct',
          'marketProxyNote','decision','opportunityScore','industry','trading','intradayPlan',
          'cycle','signalQuality','entryReadiness','holdGuidance','riskFlags','riskFirst','regime','setupEvidence','marketBreadthAboveMA20Pct','profitReview')}
        slim['fundamentals']={'industry':record['industry']}
        slim['bars']=record['bars']
        rows.append(slim)
    rows.sort(key=lambda c:(c['opportunityScore'] if c['opportunityScore'] is not None else -1), reverse=True)
    for c in snapshot.get('candidates',[]):
        matching=next((x for x in rows if x['code']==c['code'] and x['market']==c['market']),None)
        if matching:
            for key in ('riskLevel','riskStatus','riskReasons','riskEvidence','supportEvidence','structureV23','relMarket5Pct',
                        'relSector5Pct','marketProxyNote','decision','opportunityScore',
                        'cycle','signalQuality','entryReadiness','holdGuidance','riskFlags','riskFirst','regime','setupEvidence','marketBreadthAboveMA20Pct','profitReview','intradayPlan'):
                c[key]=matching.get(key)
    return {'schema':3,'rulesVersion':'eod-v2.6-next-session','asOf':asof,'marketAsOf':snapshot.get('marketAsOf'),
            'marketCount':snapshot.get('activeMarketCount'), 'coverage':len(rows),
            'notes':['全市場盤後掃描；不等於個股主力持股紀錄','同市場比較以股票等權中位數估計，非加權指數',
                     '前波低點／大量K／缺口支撐為價量參考，非主力成本或保證價','公開日K未還原權值，異常價差須核對','外資投信若無經日期驗證的可靠來源，不假造法人資料'],
            'rows':rows}
