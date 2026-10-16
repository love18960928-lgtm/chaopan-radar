"""V3.0.3 historical breakout continuation and pullback classification.

All calculations use OHLCV through the as-of trading day. A historical
breakout anchor is reconstructed from a *prior* 20-day high, never today's
future prices. The analysis is descriptive, not institutional order flow.
"""
from statistics import mean
from math import isfinite


def _sma(values, n, end=None):
    if end is None: end = len(values)
    return mean(values[end-n:end]) if end >= n else None


def _anchor(bars):
    """Find an earlier material 20-day closing breakout, not each new high.

    Treat the oldest valid breakout with intact structural hold as the base,
    allowing later incremental highs to continue the same trend. A later
    independent event is selected only if the older base has been lost.
    """
    candidates=[]
    for i in range(21, len(bars)):
        last20=bars[i-20:i]
        resistance=max(float(b[2]) for b in last20)
        close=float(bars[i][4]); prior=float(bars[i-1][4]); hi=float(bars[i][2]); lo=float(bars[i][3]); vol=float(bars[i][5]); op=float(bars[i][1])
        if resistance<=0 or hi<=lo or close<=resistance*1.001 or prior>resistance*1.01:
            continue
        pos=(close-lo)/(hi-lo)
        avg20=mean(max(0,float(b[5])) for b in last20)
        if pos<.55 or (avg20>0 and vol<avg20*.7 and close < op):
            continue
        # If a meaningful breakout was already under way, retain it.  At
        # least 2 closes below its fixed level end its uninterrupted hold.
        candidates.append((i,resistance))
    for i,level in candidates:
        if len(bars)-1-i<2: continue
        later=[float(b[4]) for b in bars[i:]]
        if min(later)<=level:
            continue
        return i,level
    # For a previously lost base, allow a later anchored rebound; do not
    # pretend this is the first day of the older event.
    for i,level in reversed(candidates):
        if len(bars)-1-i<2:continue
        later=[float(b[4]) for b in bars[i:]]
        if min(later)>level:return i,level
    return None,None


def trend_continuation(bars, *, risk_level=None, risk_first=False, price_adjustment=False):
    clean=[]
    for b in bars or []:
        if len(b)<6: continue
        try:
            row=[str(b[0])]+[float(x) for x in b[1:6]]
            if not all(isfinite(x) for x in row[1:]) or min(row[1:5])<=0 or row[5]<0:continue
        except (TypeError, ValueError):continue
        clean.append(row)
    clean.sort(key=lambda x:x[0]); closes=[b[4] for b in clean]
    out={'stage':'insufficient','label':'資料不足／待計算', 'qualified':False,'watchPullback':False,
         'anchorDate':None,'anchorLevel':None,'daysSinceBreakout':None,'consecutiveHoldDays':None,
         'ma5':_sma(closes,5),'ma10':_sma(closes,10),'ma20':_sma(closes,20),'ma60':_sma(closes,60),
         'nearMa5Pct':None,'reasons':[],'warning':None,'source':'歷史日K回推（非主力持股）'}
    if len(clean)<63:
        out['reasons'].append('有效日K不足63根，無法判斷中期趨勢與連續斜率');return out
    current=closes[-1]; m5=out['ma5'];m10=out['ma10'];m20=out['ma20'];m60=out['ma60'];
    idx,neck=_anchor(clean)
    if idx is not None:
        out['anchorDate']=clean[idx][0];out['anchorLevel']=round(neck,3)
        out['daysSinceBreakout']=len(clean)-idx-1
        held=0
        for b in reversed(clean[idx:]):
            if b[4]>neck:held+=1
            else:break
        out['consecutiveHoldDays']=held
    else:
        out['reasons'].append('近可用日K找不到可驗證且持續守住的歷史突破點')
    out['nearMa5Pct']=round(100*(current/m5-1),2)
    if out['daysSinceBreakout'] is None or out['daysSinceBreakout']<2:
        out['stage']='not_established';out['label']='尚未形成可驗證的持續突破';return out
    if price_adjustment or risk_first or risk_level in ('high','unknown'):
        out['stage']='risk';out['label']='風險優先／不列強勢';out['reasons'].append('交易風險或調整價格待確認');return out
    slopes=(m5>_sma(closes,5,len(closes)-1)>=_sma(closes,5,len(closes)-2) and
            m10>=_sma(closes,10,len(closes)-1) and m20>=_sma(closes,20,len(closes)-1))
    aligned=m5>m10>m20 and slopes
    hold=out['consecutiveHoldDays']>=3 and current>neck
    avg20=mean(b[5] for b in clean[-21:-1]);last=clean[-1]
    candle_low=(last[2]>last[3] and (current-last[3])/(last[2]-last[3])<.35)
    distribution=(avg20>0 and last[5]>=avg20*1.8 and current<last[1] and candle_low)
    two_down=(len(closes)>=3 and closes[-1]<closes[-2]<closes[-3] and closes[-1]<m5 and clean[-1][5]>avg20*1.2)
    if distribution or two_down:
        out['stage']='risk';out['label']='放量轉弱／退出強勢候選';out['reasons'].append('放量收低或連續下跌並失守短期均線');return out
    if current<m20 or current<=neck:
        out['stage']='weak';out['label']='跌回頸線或20日線下方／轉弱';return out
    if close_is_pullback := (current<m5 and current>=m10 and current>=m20 and hold):
        out['stage']='pullback';out['label']='強勢回測／觀察5日線收復'
        out['watchPullback']=True;out['reasons'].append('守住歷史頸線與MA10/20，但未收回MA5');return out
    if hold and aligned and current>m5 and current>m10 and current>m20:
        out['stage']='continued';out['label']='持續強勢／沿均線站穩頸線'
        out['qualified']=risk_level not in ('medium','high')
        if risk_level=='medium':out['reasons'].append('另有中度風險，僅保留觀察，未列嚴格強勢排行')
        if current>m5*1.1:out['warning']='股價距MA5超過10%，屬強勢但追高風險較大'
        return out
    out['stage']='consolidation';out['label']='突破後整理／尚未達強勢資格'
    if not aligned:out['reasons'].append('MA5/10/20尚未完整多頭走升')
    return out
