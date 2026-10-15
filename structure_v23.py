"""V2.3 independent historical high-volume necklines and structural support.

All levels are retrospective observations from raw, unadjusted daily bars. Price
breakouts and volume breakouts stay independent. A new ceiling does not silently
reset established support; a crossed ceiling becomes support only after actual
later retests. A confirmed break is based on two consecutive closing prices.
"""
from statistics import mean, median

MAX_BARS = 780  # 24-36 calendar months if collected; never imply absent data

def _p(v): return round(float(v), 3)

def _valid_bars(bars):
    out=[]
    for x in sorted(bars or [], key=lambda x: x[0])[-MAX_BARS:]:
        try:
            d=str(x[0]);o,h,l,c,v=map(float,x[1:6])
        except (ValueError,TypeError,IndexError):continue
        if min(o,h,l,c)>0 and v>=0 and h>=max(o,l,c) and l<=min(o,c):out.append((d,o,h,l,c,v))
    return out

def _cluster(events, tolerance):
    groups=[]
    for ev in events:
        group=next((g for g in groups if abs(median(x['price'] for x in g)-ev['price'])<=tolerance),None)
        if group is None:groups.append([ev])
        else:group.append(ev)
    return groups

def structure_evidence(bars):
    b=_valid_bars(bars)
    if len(b)<40:
        return {'historyDays':len(b),'historyComplete24m':False,'neckline':None,
                'necklineDate':None,'necklineState':'資料不足','necklines':[],
                'supports':[],'mainDefense':None,'note':'歷史日K不足，無法認定關鍵頸線或支撐'}
    curr,previous=b[-1][4],b[-2][4]
    # Scale zone tolerance to price and to recent volatility, with a tick-sized floor.
    recent=[x[2]-x[3] for x in b[-20:]]
    tolerance=max(curr*.009,median(recent)*.22)
    anchors=[]
    for i in range(20,len(b)-1):
        prev20=[x[5] for x in b[i-20:i]]
        avg=mean(prev20)
        if avg<=0:continue
        rel=b[i][5]/avg
        # Strong high-volume bar AND local context; old levels persist when younger candles arrive.
        past60=sorted(x[5] for x in b[max(0,i-60):i])
        top_decile=bool(len(past60)>=30 and b[i][5]>past60[int((len(past60)-1)*.9)] and
                        b[i][5]>=mean(past60)*1.25)
        if rel<1.8 and not top_decile:continue
        anchors.append({'index':i,'date':b[i][0],'price':b[i][2],
                        'volumeLots':round(b[i][5]),'volumeRatio':round(rel,2),
                        'low':b[i][3],'close':b[i][4], 'topDecile':top_decile})
    # Today's exceptionally high-volume candle can create a NEW reference for
    # the NEXT session. It cannot become its own confirmed breakout or support.
    latest_average=mean(x[5] for x in b[-21:-1])
    old_vol=max(x[5] for x in b[-121:-1])
    latest_ratio=b[-1][5]/latest_average if latest_average>0 else 0
    latest_anchor=None
    if latest_ratio>=1.8 or b[-1][5]>old_vol:
        latest_anchor={'price':_p(b[-1][2]),'date':b[-1][0],
                       'volumeLots':round(b[-1][5]),'sourceCount':1,
                       'status':'今日大量K形成／下次突破參考','todayCross':False,
                       'promotedSupport':False,'retestCount':0,'formedToday':True}
    necks=[];promoted=[]
    for group in _cluster(anchors,tolerance):
        # Weighted toward the highest high in a clustered resistance band.
        reference=max(group,key=lambda a:(a['volumeLots'],a['index']))
        level=max(x['price'] for x in group)
        formed=max(x['index'] for x in group)
        # Did price ever close through this resistance after it was formed?
        cross=[j for j in range(formed+1,len(b)) if b[j-1][4]<=level and b[j][4]>level]
        last_cross=cross[-1] if cross else None
        broken_before=bool(cross and cross[0]<len(b)-1)
        crosses_today=bool(previous<=level<curr and not broken_before)
        support_hold=False;retests=[]
        if broken_before:
            # Count a RETEST on a day AFTER breakout, not the breakout itself.
            first_cross=cross[0]
            for j in range(first_cross+1,len(b)):
                if b[j][3]<=level+tolerance and b[j][4]>=level-tolerance*.35:
                    if not retests or j-retests[-1]>=3:retests.append(j)
            support_hold=(len(retests)>=2 and curr>=level-tolerance*.35 and
                          b[-2][4]>=level-tolerance*.35)
        if level>curr+tolerance:status='上方待突破'
        elif crosses_today:status='今日首次突破'
        elif curr>=level:status='已突破／觀察回測' if not support_hold else '回測成立／可觀察支撐'
        elif cross and curr>=level-tolerance:status='頸線附近回測／尚未重新站穩'
        else:status='頸線下方／觀察壓力'
        necks.append({'price':_p(level),'date':reference['date'],'volumeLots':reference['volumeLots'],
                      'sourceCount':len(group),'status':status,'todayCross':crosses_today,
                      'promotedSupport':support_hold,'retestCount':len(retests)})
        if support_hold:
            promoted.append({'kind':'neckRetest','label':'突破頸線後回測成立',
                 'lower':_p(level-tolerance),'upper':_p(level+tolerance),
                 'date':b[retests[-1]][0],'touches':len(retests),
                 'originDate':reference['date'],'strength':3+min(len(retests),4)})
    # Preserve multiple price levels. Prefer a new first-time crossing, otherwise next
    # overhead level, otherwise the nearest previously crossed level below the close.
    if latest_anchor:necks.append(latest_anchor)
    crossed=sorted((n for n in necks if n['todayCross']),key=lambda n:(-n['sourceCount'],-n['volumeLots']))
    upper=sorted((n for n in necks if n['price']>=curr),key=lambda n:(n['price']-curr,-n['sourceCount']))
    behind=sorted((n for n in necks if n['price']<curr),key=lambda n:(curr-n['price'],-n['sourceCount']))
    # Recent newly formed maximum-volume bar is a forward-looking reference, not
    # a claim that today's own high was already broken.
    selected=([latest_anchor] if latest_anchor else crossed or upper or behind)
    neck=selected[0] if selected else None
    ordered=[]
    if neck:ordered.append(neck)
    for n in upper+behind:
        if n not in ordered:ordered.append(n)
    # Independent historical support: clustered confirmed swing lows, abnormal-volume
    # lows, unfilled up-gaps and proven former necklines. Never use TODAY as anchor.
    events=[]
    for i in range(2,len(b)-3):
        low=b[i][3]
        if all(low<=b[j][3] for j in (i-2,i-1,i+1,i+2)):
            events.append({'price':low,'index':i,'date':b[i][0],'kind':'swing'})
    pivot_groups=[]
    for g in _cluster(events,tolerance):
        spaced=[]
        for e in g:
            if not spaced or e['index']-spaced[-1]['index']>=4:spaced.append(e)
        if len(spaced)>=2:
            center=median(e['price'] for e in spaced)
            pivot_groups.append({'kind':'swing','label':'歷史多次低點',
                'lower':_p(center-tolerance*.5),'upper':_p(center+tolerance*.5),
                'date':spaced[-1]['date'],'touches':len(spaced),
                'originDate':spaced[0]['date'],'strength':2+min(len(spaced),6)})
    vol_candidates=[]
    for anchor in anchors:
        lo=anchor['low'];cl=anchor['close']
        # Always retain old, meaningful large-volume low as candidate support.
        vol_candidates.append({'kind':'volume','label':'歷史大量K收盤／低點價區',
            'lower':_p(lo),'upper':_p(max(lo,cl)),'keyPrice':_p(cl),
            'date':anchor['date'],'originDate':anchor['date'],'originIndex':anchor['index'],'touches':1,
            'volumeLots':anchor['volumeLots'],
            'strength':1+min(anchor['volumeRatio']/1.8,4)+(1 if anchor['topDecile'] else 0)})
    gaps=[]
    for i in range(1,len(b)-1):
        bottom,top=b[i-1][2],b[i][3]
        if top<=bottom*1.005:continue
        if any(x[3]<=bottom for x in b[i+1:-1]):continue
        gaps.append({'kind':'gap','label':'未回補向上跳空缺口',
              'lower':_p(bottom),'upper':_p(top),'date':b[i][0],
              'originDate':b[i][0],'touches':1,'strength':2.0})
    candidates=pivot_groups+vol_candidates+gaps+promoted
    levels=[]
    for level in candidates:
        low,high=level['lower'],level['upper']
        if not low>0 or high<low:continue
        # Include old key support down to 60% of current price, and recent resistance
        # only to 15% above. Old broken support is displayed separately.
        if low>curr*1.15 or high<curr*.60:continue
        was_above=any(x[4]>=low*.995 for x in b[-7:-2])
        below_now=curr<low*.995
        confirmed=bool(below_now and b[-2][4]<low*.995 and was_above)
        one_day=bool(below_now and b[-2][4]>=low*.995)
        old_break=bool(below_now and not confirmed and not one_day)
        # If close has been back above the floor for several days, do not keep an
        # outdated 'broken' flag. Confirmation requires as-of price observation.
        label='近5日確認跌破' if confirmed else '今日初破待確認' if one_day else '歷史已跌破／可能轉壓力' if old_break else '有效歷史支撐參考'
        levels.append({**level,'confirmedBreak':confirmed,'oneDayBreak':one_day,
                       'historicBreak':old_break,'state':label})
    # Remove near-duplicate zones but preserve the stronger/more-tested history.
    chosen=[]
    for x in sorted(levels,key=lambda x:(-x['strength'],-x['touches'],x['originDate'])):
        if any(abs(x['lower']-y['lower'])<=tolerance*.60 and abs(x['upper']-y['upper'])<=tolerance*1.5 for y in chosen):continue
        chosen.append(x)
    valid=[x for x in chosen if not(x['confirmedBreak'] or x['oneDayBreak'] or x['historicBreak']) and x['lower']<=curr and x['upper']<=curr*1.01]
    valid.sort(key=lambda x:(-x['upper'],-x['strength']))
    # A deep, repeated historical structure is 'main defense', not whichever
    # smaller candle formed most recently. Creation of a new neck cannot move it.
    structural=[x for x in valid if x['kind']=='swing' and x['touches']>=2]
    durable=structural if structural else [x for x in valid if x['strength']>=2.6]
    # Preserve the deepest significant recent large-volume close as the last
    # historical defense, rather than moving that defense up for every new neck.
    major_history=[x for x in valid if x['kind']=='volume' and
                   curr*.70<=x['keyPrice']<=curr and x['strength']>=2.25]
    deep=[x for x in major_history if x['keyPrice']<=curr*.90]
    if deep:major_history=deep
    # The base belongs to the latest established lower-volume cluster/wave,
    # not a rolling 90-day window. It remains in history as time passes.
    if major_history:
        recent_wave=max(x['originIndex'] for x in major_history)
        wave=[x for x in major_history if x['originIndex']>=recent_wave-30]
        defense=min(wave,key=lambda x:(x['keyPrice'],x['originDate']))
    else:
        defense=max(durable,key=lambda x:(x['strength'],x['touches'],-x['upper'])) if durable else None
    if not defense and valid:defense=max(valid,key=lambda x:(x['strength'],-x['upper']))
    first=valid[0] if valid else None
    second=next((x for x in valid[1:] if first and abs(x['lower']-first['lower'])>tolerance*.6),None)
    # Keep two nearest supports plus the main defensive support even if farther away.
    supports=[]
    for x in (first,second,defense):
        if x is not None and x not in supports:supports.append(x)
    volume_keys=sorted(vol_candidates,key=lambda x:(-x['originIndex'],-x['strength']))
    return {'historyDays':len(b),'historyComplete24m':len(b)>=480,
       'neckline':neck['price'] if neck else None,
       'necklineDate':neck['date'] if neck else None,
       'necklineState':neck['status'] if neck else '無可靠大量K錨點',
       'necklines':ordered[:10], 'supports':supports, 'mainDefense':defense,
       'volumeKeyLevels':[{'date':x['date'],'close':x['keyPrice'],
              'low':x['lower'],'volumeLots':x['volumeLots']} for x in volume_keys[:16]],
       'brokenSupport':sorted([x for x in chosen if x['oneDayBreak'] or x['confirmedBreak']],key=lambda x:-x['lower'])[:5],
       'notes':'依可用歷史日K計算；頸線與支撐獨立。僅實際突破後回測至少兩次才升格支撐。未還原權息，支撐不是保證價格。'}
