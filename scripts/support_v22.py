"""Prior-swing, abnormal-volume candle and gap price-zone evidence.

No inference about identified institutions, inventory or guaranteed support.
Only daily OHLCV available by `as_of` is inspected. Prices are unadjusted;
corporate-action gaps are flagged for manual validation elsewhere.
"""
from statistics import mean, median


def _round(x):
    return round(float(x), 3)


def support_evidence(bars):
    """Return candidate historical levels and observable breaks.

    Bars: [ISO date, open, high, low, close, volumeLots, ...], oldest first.
    Latest bar is the observation; all price zones originate from *earlier* bars.
    A confirmed break is two consecutive closes below a prior level's LOWER edge,
    not an intraday low touching the line.
    """
    b = sorted((x for x in (bars or []) if len(x) >= 6), key=lambda x:x[0])[-150:]
    if len(b) < 25:
        return {'levels': [], 'nearest': None, 'broken': [], 'note': '歷史日K不足，支撐辨識不可用'}
    valid=[]
    for x in b:
        try:
            dt=str(x[0]);o,h,l,c,v=[float(n) for n in x[1:6]]
            if o<=0 or h<=0 or l<=0 or c<=0 or v<0 or h<l or not l<=c<=h:continue
            valid.append((dt,o,h,l,c,v))
        except (ValueError,TypeError):
            continue
    b=valid
    if len(b) < 25:
        return {'levels': [], 'nearest': None, 'broken': [], 'note': '可用交易資料不足'}
    current=b[-1][4]
    # Conservative scale for band clustering, not a precise stop-loss formula.
    tr=[max(b[i][2]-b[i][3],abs(b[i][2]-b[i-1][4]),abs(b[i][3]-b[i-1][4]))
        for i in range(max(1,len(b)-15),len(b))]
    atr=mean(tr) if tr else current*.015
    tolerance=max(current*.012,atr*.35)
    out=[]

    def append(kind,label,low,high,date,touches=1,extra=''):
        if low<=0 or high<low:return
        # If wildly distant, show neither stale long-range resistance nor irrelevant support.
        if low>current*1.15 or high<current*.60:return
        # Do not count a low touch as a decisive confirmed break.
        # Do not treat a months-old broken level as a NEW distribution signal.
        prior_close_above=any(x[4]>=low*.995 for x in b[-7:-2])
        below_two=(b[-1][4] < low*.995 and b[-2][4] < low*.995)
        confirmed=below_two and prior_close_above
        last_break=(b[-1][4]<low*.995 and b[-2][4]>=low*.995)
        stale_break=(b[-1][4]<low*.995 and not confirmed and not last_break)
        state='近5日確認跌破' if confirmed else '今天收盤跌破待確認' if last_break else '歷史已跌破（可能轉為壓力）' if stale_break else '已回測區域' if b[-1][3]<=high else '尚在支撐上方'
        out.append({'kind':kind,'label':label,'lower':_round(low),'upper':_round(high),
                    'date':date,'touches':touches,'state':state,'confirmedBreak':confirmed,
                    'oneDayBreak':last_break,'historicBreak':stale_break,'note':extra})

    # Confirmed pivot lows; two later bars needed. Only PREVIOUS bars serve as anchors.
    piv=[]
    for i in range(max(2,len(b)-101),len(b)-3):
        low=b[i][3]
        if low<=min(b[j][3] for j in range(i-2,i)) and low<=min(b[j][3] for j in range(i+1,i+3)):
            piv.append((i,low))
    # Cluster at least two pivots, spaced >= 4 days; latest/highest support relevance.
    groups=[]
    for idx,low in piv:
        match=None
        for g in groups:
            if abs(median(v for _,v in g)-low)<=tolerance:
                match=g;break
        if match is None:groups.append([(idx,low)])
        elif idx-match[-1][0]>=4:match.append((idx,low))
    clusters=[g for g in groups if len(g)>=2]
    clusters.sort(key=lambda g:(abs(current-median(v for _,v in g)), -g[-1][0]))
    for g in clusters[:2]:
        center=median(v for _,v in g)
        append('swing','前波多次低點',center-tolerance*.5,center+tolerance*.5,b[g[-1][0]][0],len(g),'歷史低點形成的區間；非保證支撐')

    # Abnormally high-volume daily candle. Volume test uses only earlier 20 days.
    abnormal=[]
    for i in range(20,len(b)-1):
        avg=mean(x[5] for x in b[i-20:i])
        if avg>0 and b[i][5]>=avg*1.8:
            abnormal.append((i,b[i][5]/avg))
    # Strongest three in last 120 bars; near current price prioritized.
    abnormal=[x for x in abnormal if x[0]>=len(b)-121]
    abnormal.sort(key=lambda x:(abs(current-b[x[0]][3]),-x[1]))
    for i,ratio in abnormal[:2]:
        append('volume','歷史大量K低點／收盤區',b[i][3],max(b[i][3],b[i][4]),b[i][0],1,
               '量比約%.1f倍；不能當作已知主力成本' % ratio)

    # Up gaps on daily candles; future observations until AS-OF may partially fill
    # or entirely invalidate the prior gap. Gaps around corporate actions unverified.
    gaps=[]
    for i in range(max(1,len(b)-100),len(b)-1):
        bottom=b[i-1][2]; top=b[i][3]
        if top<=bottom*1.005:continue
        lows_after=[x[3] for x in b[i+1:-1]]
        if lows_after and min(lows_after)<=bottom:
            continue  # Gap was already filled before today's observation.
        gaps.append((i,bottom,top))
    gaps.sort(key=lambda x:abs(current-x[1]))
    for i,bottom,top in gaps[:2]:
        append('gap','向上跳空缺口',bottom,top,b[i][0],1,'缺口下緣為重要觀察點；須人工排除除權息缺口')

    broken=[x for x in out if x['confirmedBreak']]
    below=[x for x in out if x['upper']<=current*1.01]
    below.sort(key=lambda x:(abs(current-x['upper']),x['kind']!='swing'))
    nearest=below[0] if below else None
    return {'levels':out[:6], 'nearest':nearest, 'broken':broken[:4],
            'note':'未還原日K，缺口與大量K需核對除權息；支撐不保證有效，並非主力成本'}
