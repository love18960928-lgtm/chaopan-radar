"""V2.4 unified recent neckline/support judgement.

The SAME as-of OHLCV structure drives risk, screening and the detail page.
Prior breakout, recent overhead pressure and tested support are different roles;
today's new high-volume high is only a *future* reference. No lookahead.
"""
from statistics import median, mean
from structure_v23 import structure_evidence, _valid_bars


def unified_structure(bars):
    b = _valid_bars(bars)
    historical = structure_evidence(b)
    result = {**historical, 'rules': 'recent-structure-v2.4',
              'primaryNeckline': None, 'primaryNecklineDate': None,
              'primaryNecklineStatus': '資料不足', 'nextResistance': None,
              'recentSupports': historical.get('supports', []),
              'primarySupport': None, 'secondarySupport': None,
              'unifiedStage': '資料不足', 'unifiedScore': None,
              'unifiedReasons': [], 'volumeBreakout': False, 'priceBreakout': False}
    if len(b)<55: return result
    curr,prev=float(b[-1][4]),float(b[-2][4]); n=len(b)
    avg20=mean(x[5] for x in b[-21:-1]); volume_ratio=b[-1][5]/avg20 if avg20>0 else 0
    oldmax=max(x[5] for x in b[-121:-1]); max_vol_today=b[-1][5]>oldmax
    vol_keys=historical.get('volumeKeyLevels') or []
    oldmax_high=next((x[2] for x in b[-121:-1] if x[5]==oldmax),None)
    confirmed_volume=bool(max_vol_today and oldmax_high is not None and curr>oldmax_high and curr>=b[-1][1])
    result['volumeBreakout']=confirmed_volume
    result['newVolumeReference']=next((x for x in historical.get('necklines',[]) if x.get('formedToday')),None)
    # Reference points: high-volume highs retained by v2.3, plus true local
    # pivot highs with confirmation on BOTH sides; minor single-day highs
    # cannot arbitrarily overwrite the resistance. No data later than today.
    events=[]
    for x in historical.get('necklines', []):
        if x.get('formedToday'): continue
        index=next((j for j in range(n-2,-1,-1) if b[j][0]==x.get('date')),None)
        if index is None:continue
        events.append({'price':float(x['price']),'date':x['date'],'index':index,
            'weight':2.5+min(2.5,float(x.get('volumeLots',0))/max(avg20,1)),
            'source':'歷史大量K高點'})
    localvol=[x[5] for x in b[-61:-1]]
    high_quantile=sorted(localvol)[int(.75*(len(localvol)-1))] if localvol else 0
    for i in range(max(2,n-91),n-3):
        high=float(b[i][2]);prior=[b[j][2] for j in (i-2,i-1)];after=[b[j][2] for j in (i+1,i+2)]
        if high<max(prior) or high<=max(after):continue
        # A pivot requires notable turnover OR multiple touches of same high.
        nearby=sum(abs(b[j][2]-high)<=high*.012 for j in range(max(0,i-22),min(n-1,i+23)) if j!=i)
        if b[i][5]<high_quantile and nearby<2:continue
        events.append({'price':high,'date':b[i][0],'index':i,'weight':1.5+min(2,nearby*.5),'source':'近期波段壓力'})
    # Combine nearby levels, retaining the most strongly evidenced area.
    tol=max(curr*.012,median([x[2]-x[3] for x in b[-20:]])*.25)
    groups=[]
    for e in sorted(events,key=lambda x:x['price']):
        if groups and e['price']-max(x['price'] for x in groups[-1])<=tol:
            groups[-1].append(e)
        else:groups.append([e])
    zones=[]
    for group in groups:
        best=max(group,key=lambda x:(x['weight'],x['index']))
        # Resistance is the highest high in a significant band; displaying a
        # precise anchor of a weak daily bar would overstate precision.
        price=max(x['price'] for x in group)
        zones.append({'price':round(price,3),'date':best['date'],
                      'source':best['source'],'strength':round(max(x['weight'] for x in group)+.35*(len(group)-1),2),
                      'recent':any(x['index']>=n-91 for x in group),'formedIndex':max(x['index'] for x in group)})
    recent=[x for x in zones if x['recent'] and x['strength']>=2.4]
    # A recently crossed pressure level belongs to the breakout stage even
    # when price has moved above it. Otherwise select nearest overhead level.
    crosses=[x for x in recent if prev<=x['price']<curr and x['formedIndex']<n-1]
    overhead=[x for x in recent if x['price']>=curr*.998]
    if crosses:main=max(crosses,key=lambda x:(x['strength'],-(curr-x['price'])))
    elif overhead:main=min(overhead,key=lambda x:(x['price']-curr,-x['strength']))
    else:
        # Do not mislabel a historical support as the *overhead* neckline.
        main=None
    if main:
        result['primaryNeckline']=main['price'];result['primaryNecklineDate']=main['date']
        result['primaryNecklineStatus']='今日首次突破' if main in crosses else '近期上方待突破／回測壓力'
    next_upper=sorted((x for x in recent if x is not main and x['price']>curr*.998),key=lambda x:x['price'])
    if next_upper:result['nextResistance']=next_upper[0]
    result['recentResistanceLevels']=sorted(recent,key=lambda x:x['price'])
    # Only levels at/below today's price remain possible support. An already
    # broken level remains shown separately as resistance (not relabelled as support).
    valid=[x for x in historical.get('supports',[]) if not(x.get('confirmedBreak') or x.get('oneDayBreak') or x.get('historicBreak'))
           and float(x.get('lower',1e10))<=curr and float(x.get('upper',1e10))<=curr*1.015]
    valid.sort(key=lambda x:(-x['upper'],-x.get('strength',0)))
    result['recentSupports']=valid
    result['primarySupport']=valid[0] if valid else None
    result['secondarySupport']=next((x for x in valid[1:] if valid and abs(x['lower']-valid[0]['lower'])>tol*.4),None)
    broken_recent=[x for x in historical.get('brokenSupport',[]) if (x.get('oneDayBreak') or x.get('confirmedBreak')) and float(x.get('lower',0))<=curr*1.065 and float(x.get('upper',0))>=curr*.94]
    first=result['primarySupport']
    near_support=bool(first and curr<=float(first['upper'])*1.025)
    price_break=bool(crosses and curr>prev)  # include one-price limit-up candles
    result['priceBreakout']=price_break
    result['distanceToNeckPct']=round(100*(main['price']/curr-1),2) if main else None
    # One judgement for every share. The labels explain why, instead of being
    # independent AND-gated filters that silently remove otherwise valid stocks.
    reasons=[];stage='一般觀察';priority=10
    if price_break:
        stage='近期頸線首次突破';priority=95;reasons.append('收盤穿越近期有效壓力')
    elif main and curr<main['price'] and 0<=100*(main['price']/curr-1)<=3:
        stage='接近近期頸線';priority=70;reasons.append('距近期壓力在3%內')
    elif any(x.get('confirmedBreak') for x in broken_recent):
        stage='支撐確認跌破';priority=0;reasons.append('連續收盤失守歷史價區')
    elif any(x.get('oneDayBreak') for x in broken_recent):
        stage='支撐初破待確認';priority=12;reasons.append('收盤首次失守，不能視為已連續確認')
    elif main and curr<main['price'] and 3<100*(main['price']/curr-1)<=10 and curr>=prev and curr>=mean(x[4] for x in b[-10:]):
        stage='發動前觀察';priority=55;reasons.append('距近期壓力3–10%，短線價位開始改善')
    elif near_support:
        stage='近期支撐回測';priority=35;reasons.append('貼近尚未確認跌破的歷史支撐')
    elif not main and recent:
        stage='站上已知壓力／觀察續強';priority=60;reasons.append('已在近期已知壓力之上，需追蹤站穩')
    if broken_recent:
        reasons.append('另有附近歷史支撐破位紀錄，屬風險而非選股排除條件')
    if confirmed_volume:
        reasons.append('量超越前120日最大量、且收盤高於舊最大量K高點')
        priority+=18
    if price_break and main and curr>main['price']*1.08:
        reasons.append('突破後偏離頸線超過8%，追價風險加重');priority-=22
    if curr<mean(x[4] for x in b[-20:]):
        reasons.append('收盤低於MA20，優先注意反彈壓力');priority-=12
    if curr<prev:priority-=min(12,4*abs(curr/prev-1)*100)
    if not main:reasons.append('目前無可靠上方近期大量K／波段壓力，不以舊支撐冒充頸線')
    result['unifiedStage']=stage;result['unifiedScore']=round(max(0,priority),2)
    result['unifiedReasons']=reasons
    result['neckline']=result['primaryNeckline']
    result['necklineDate']=result['primaryNecklineDate']
    result['necklineState']=result['primaryNecklineStatus']
    return result
