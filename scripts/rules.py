"""Daily, non-real-time volume-price breakout rules. All volumes in lots (1 lot = 1,000 shares)."""
import math
from statistics import mean

LOOKBACK = 120
MIN_SESSIONS = 55
MIN_AVG_LOTS = 1000


def percentile(values, fraction):
    x = sorted(values)
    if not x:
        return 0
    k = (len(x) - 1) * fraction
    lo = math.floor(k)
    hi = math.ceil(k)
    return x[lo] + (x[hi] - x[lo]) * (k - lo)


def tick(price):
    if price < 10: return .01
    if price < 50: return .05
    if price < 100: return .1
    if price < 500: return .5
    if price < 1000: return 1.
    return 5.


def approximate_limit_up(reference):
    """Approximation only. Actual exchange limits may differ on ex-rights, exempt shares, etc."""
    raw = reference * 1.1
    step = tick(raw)
    return round(math.floor((raw + 1e-8) / step) * step, 2)


def limit_up_count(bars):
    """Count approximate close-at-limit sessions in last 20 trade days, using OTC official next day when available."""
    count = 0
    for index in range(max(1, len(bars)-20), len(bars)):
        before, now = bars[index-1], bars[index]
        prev_close = float(before[4]); close = float(now[4]); hi = float(now[2]);
        official_prev_next = before[6] if len(before)>6 else None
        target = float(official_prev_next) if official_prev_next is not None else approximate_limit_up(prev_close)
        if prev_close > 0 and close > 0 and close >= target - 0.001 and hi >= close - 0.001 \
           and close / prev_close >= 1.085 and close / prev_close <= 1.115:
            count += 1
    return count


def scan_stock(stock):
    """One stock -> candidate or None, using ONLY completed daily candles."""
    bars = sorted(stock.get('bars', []), key=lambda r: r[0])
    if len(bars) < MIN_SESSIONS:
        return None
    t = bars[-1]
    history = bars[:-1][-LOOKBACK:]
    if len(history)<54:
        return None
    close, high, low, opn, vol = (float(t[4]),float(t[2]),float(t[3]),float(t[1]),float(t[5]))
    if min(close, high, low, opn) <= 0 or vol <= 0:
        return None
    prior10 = bars[-11:-1]
    prior20 = bars[-21:-1]
    if len(prior20)<20:
        return None
    avg10 = mean(float(b[5]) for b in prior10)
    avg20 = mean(float(b[5]) for b in prior20)
    if avg20<MIN_AVG_LOTS:
        return None
    vol_ratio = round(vol/avg10, 2) if avg10 else 0
    recent = history[-LOOKBACK:]
    pct90 = percentile([float(b[5]) for b in recent], .9)
    anchors = []
    for i, b in enumerate(bars[:-1]):
        if b[0] < recent[0][0]: continue
        prev20 = bars[max(0,i-20):i]
        if len(prev20)<20: continue
        anchor_vol = float(b[5]); anchor_high = float(b[2])
        if not (anchor_vol >= pct90 and anchor_vol >= 1.8*mean(float(x[5]) for x in prev20)):
            continue
        # An intact resistance: no following CLOSE exceeded anchor high prior to today.
        if any(float(x[4]) > anchor_high + 1e-7 for x in bars[i+1:-1]):
            continue
        anchors.append({'date':b[0], 'high':anchor_high, 'close':float(b[4]), 'vol':round(anchor_vol), 'index':i})
    prev_close = float(bars[-2][4])
    # The highest intact volume-K resistance is the most conservative resistance line.
    anchor = max(anchors, key=lambda a:(a['high'],a['vol'])) if anchors else None
    neck = anchor['high'] if anchor else None
    dist = round(100*(close/neck-1),2) if neck else None
    first = bool(anchor and prev_close <= neck and close > neck)
    near = bool(anchor and -3.0 <= dist <= 0)
    old_max = max(history, key=lambda b:float(b[5]))
    new_volume = vol>float(old_max[5]) and close>float(old_max[4])
    broke_old_high = close > float(old_max[2])
    limit20 = limit_up_count(bars)
    close_in_top = ((close-low)/(high-low)) if high>low else 1.
    confirmed = bool(first and vol_ratio>=1.5 and close_in_top >= .7)
    valid = first or near or new_volume or limit20 >=2
    if not valid: return None
    tags = []
    if first: tags.append('first')
    if near: tags.append('near')
    if new_volume: tags.append('volume')
    if limit20 >=2: tags.append('limit')
    points = (70 if first else 0) + (32 if near else 0) + (28 if new_volume else 0) + min(limit20, 5)*7
    points += min(vol_ratio,5)*6 if first or new_volume else min(vol_ratio,3)*2
    if confirmed: points += 12
    if first and dist is not None and dist>8: points -= 30
    if new_volume and not broke_old_high: points -= 5
    if near and dist is not None: points += 6-max(0,abs(dist))*2
    points = round(points)
    return {
        'code':stock['code'],'name':stock['name'],'market':stock['market'],
        'date':t[0], 'open':opn,'high':high,'low':low,'close':close,'lots':round(vol),
        'prevClose':prev_close,'changePct':round(100*(close/prev_close-1),2) if prev_close>0 else None,
        'neck':neck,'neckDate':anchor['date'] if anchor else None,'neckLots':anchor['vol'] if anchor else None,
        'distancePct':dist,'volumeRatio':vol_ratio, 'limit20':limit20,
        'oldMaxLots':round(float(old_max[5])),'oldMaxDate':old_max[0],
        'oldMaxClose':float(old_max[4]),'oldMaxHigh':float(old_max[2]),
        'newVolumeAboveOldHigh':broke_old_high,'confirmed':confirmed,'overextended':bool(first and dist>8),
        'tags':tags,'score':points,
        'bars':[[b[0],float(b[1]),float(b[2]),float(b[3]),float(b[4]),round(float(b[5]))] for b in bars[-120:]],
    }


def build_snapshot(stocks):
    candidates=[]
    eligible = 0
    by_market={'上市':0,'上櫃':0}
    for stock in stocks.values():
        if len(stock.get('bars',[])) >= MIN_SESSIONS: eligible += 1
        if stock.get('market') in by_market: by_market[stock['market']]+=1
        result=scan_stock(stock)
        if result: candidates.append(result)
    candidates.sort(key=lambda x:(x['score'],x['lots']),reverse=True)
    lastdate=max((x['bars'][-1][0] for x in stocks.values() if x.get('bars')),default=None)
    market_dates={m:max((x['bars'][-1][0] for x in stocks.values() if x.get('market')==m and x.get('bars')),default=None) for m in ('上市','上櫃')}
    if market_dates['上市']!=market_dates['上櫃']:
        readiness='partial'
    else:
        readiness='live' if eligible>=500 and all(sum(stock.get('market')==m and len(stock.get('bars',[]))>=MIN_SESSIONS for stock in stocks.values())>=250 for m in ('上市','上櫃')) else 'warming'
    # No cross-day mixing: only emit candidates whose latest bar equals the newest trading date.
    candidates=[c for c in candidates if c['date']==lastdate]
    return {
        'mode':readiness,
        'asOf':lastdate, 'tradingDate':lastdate,'marketAsOf':market_dates,'marketCount':by_market,'stockCount':len(stocks),'eligibleCount':eligible,
        'candidateCount':len(candidates),'counts':{key:sum(key in c['tags'] for c in candidates) for key in ('first','near','volume','limit')},
        'rulesVersion':'eod-v1.0',
        'notes':['僅盤後資料，不是即時行情','漲停次數為價格推估，除權息或特殊交易股票可能誤判', '新大量條件：成交量大於前120日最大量，收盤高於舊最大量K收盤'],
        'candidates':candidates[:600],
    }
