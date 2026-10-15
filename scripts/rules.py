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


def _five_day_change(history, close):
    if len(history) < 5 or float(history[-5][4]) <= 0:
        return 0.0
    return 100 * (close / float(history[-5][4]) - 1)


def scan_stock(stock, detect_follow=True):
    """V1.4: completed day K only; priority is FIRST price crossing, regardless of volume.

    A lock-limit candle with low turnover still qualifies. Prelaunch is a speculative
    watch signal, not an assertion that tomorrow will rise. Old V1.3 tags preserved.
    """
    bars = sorted(stock.get('bars', []), key=lambda r:r[0])
    if len(bars) < MIN_SESSIONS:
        return None
    t, history = bars[-1], bars[:-1][-LOOKBACK:]
    if len(history) < 54:
        return None
    close, high, low, opn, vol = map(float,(t[4],t[2],t[3],t[1],t[5]))
    if min(close,high,low,opn,vol) <= 0 or high < low or close > high + .011 or close < low - .011:
        return None
    prior10,prior20=bars[-11:-1],bars[-21:-1]
    if len(prior20) < 20:
        return None
    avg10=mean(float(b[5]) for b in prior10)
    avg20=mean(float(b[5]) for b in prior20)
    if avg20 < MIN_AVG_LOTS:
        return None
    vol_ratio=round(vol/avg10,2) if avg10 else 0
    prev_close=float(bars[-2][4])
    pct90=percentile([float(b[5]) for b in history], .9)
    anchors=[]
    first_index=len(bars)-1-len(history)
    for j,b in enumerate(history):
        i=first_index+j
        prev20=bars[max(0,i-20):i]
        if len(prev20)<20:continue
        a_vol=float(b[5]);a_high=float(b[2]);
        if not(a_vol>=pct90 and a_vol>=1.8*mean(float(r[5]) for r in prev20)):
            continue
        # A historical close ABOVE this high before today invalidates a fresh signal.
        if any(float(r[4])>a_high+1e-7 for r in bars[i+1:-1]):
            continue
        anchors.append({'date':b[0],'high':a_high,'close':float(b[4]),
                        'vol':round(a_vol),'index':i})

    crossings=[a for a in anchors if prev_close <= a['high'] < close]
    # A: reference the heaviest intact anchor that today's close crosses.
    anchor=max(crossings,key=lambda a:(a['vol'],a['high'])) if crossings else None
    if not anchor:
        # B and legacy near signal: closest unbroken upper resistance.
        ceilings=[a for a in anchors if a['high']>=close]
        anchor=min(ceilings,key=lambda a:(a['high']-close,-a['vol'])) if ceilings else None
    neck=anchor['high'] if anchor else None
    dist=round(100*(close/neck-1),2) if neck else None
    first=bool(anchor and anchor in crossings)
    near=bool(anchor and dist is not None and -3 <= dist <= 0 and not first)
    # B: 3%-10% below anchor, but MUST show improving price/volume; not pure sideways.
    sma10=mean(float(b[4]) for b in prior10)
    price_change5=_five_day_change(history,close)
    recent_high=max(float(b[4]) for b in history[-10:])
    momentum=bool(close>=sma10 and (price_change5>=2 or vol_ratio>=1.3 or close>recent_high))
    prep=bool(anchor and dist is not None and -10 <= dist < -3 and momentum)
    old_max=max(history,key=lambda b:float(b[5]))
    new_volume=bool(vol>float(old_max[5]) and close>float(old_max[4]))
    broke_old_high=close>float(old_max[2])
    limit20=limit_up_count(bars)
    close_in_top=(close-low)/(high-low) if high>low else 1.
    one_price=abs(opn-high)<.011 and abs(opn-low)<.011 and abs(opn-close)<.011
    limit_target=(float(bars[-2][6]) if len(bars[-2])>6 and bars[-2][6] is not None
                  else approximate_limit_up(prev_close))
    locked_limit=bool(first and one_price and close>=limit_target-.011 and
                      1.085<=close/prev_close<=1.115)
    # A is price-confirmed on close even with low trading volume.
    price_confirmed=first
    volume_confirmed=bool(first and vol_ratio>=1.5 and close_in_top>=.7)
    confirmed=volume_confirmed  # backward-compatible V1.3 meaning
    # Follow breakout events recorded 1-5 actual trading sessions earlier.
    # Replay only the historical prefix, never inspect any future candle.
    recent_event=None
    if detect_follow and not first:
        for lag in range(1,min(6,len(bars)-54)):
            older=dict(stock,bars=bars[:-lag])
            old_signal=scan_stock(older, detect_follow=False)
            if old_signal and old_signal.get('priceConfirmed'):
                recent_event=(lag,old_signal)
                break
    follow_status=None
    if recent_event:
        lag,old_signal=recent_event
        old_neck=old_signal['neck']; breakout_close=old_signal['close']
        breakout_vol=old_signal['lots']
        if close < old_neck*.99:
            follow_status='假突破警戒'
        elif close>=breakout_close and close>=sma10:
            follow_status='突破續強'
        elif close>=old_neck*.985 and vol<=breakout_vol*.75:
            follow_status='縮量回測'
        else:
            follow_status='突破後觀察'
        if anchor is None:
            anchor={'high':old_neck,'date':old_signal['neckDate'],'vol':old_signal['neckLots']}
            neck=old_neck;dist=round(100*(close/neck-1),2)
    valid=first or prep or near or new_volume or limit20>=2 or bool(recent_event)
    if not valid:return None
    tags=[]
    if first:tags.append('first')
    if prep:tags.append('prep')
    if near:tags.append('near')
    if new_volume:tags.append('volume')
    if limit20>=2:tags.append('limit')
    if recent_event:tags.append('follow')
    points=(70 if first else 0)+(49 if prep else 0)+(32 if near else 0)+ (28 if new_volume else 0)+min(limit20,5)*7
    points+=min(vol_ratio,5)*6 if first or new_volume else min(vol_ratio,3)*2
    if volume_confirmed:points+=12
    if locked_limit:points+=16
    if first and dist is not None and dist>8:points-=30
    if new_volume and not broke_old_high:points-=5
    if near and dist is not None:points+=6-max(0,abs(dist))*2
    if prep:points+=max(0,min(10,price_change5))
    if follow_status=='突破續強':points+=35
    elif follow_status=='縮量回測':points+=22
    elif follow_status=='假突破警戒':points-=45
    launch_stage='首次發動' if first else '突破後追蹤' if recent_event else '發動前預備' if prep else '接近頸線' if near else '大量確認' if new_volume else '漲停動能'
    launch_rank=5 if first else 4 if recent_event else 4 if prep else 3 if new_volume else 2 if near else 1
    launch_reason=( ('突破後第%d個交易日：%s' % (recent_event[0],follow_status)) if recent_event and not first else
                    '一字漲停突破大量K高點；成交量非必要條件' if locked_limit else
                    '今天收盤首次站上有效歷史大量K高點' if first else
                    '尚未突破：位於大量K高點下3%～10%，且短期價量改善' if prep else
                    '距歷史大量K高點3%以內，尚未正式突破' if near else
                    '今日成交量大於前120日最大量' if new_volume else
                    '20日內有多次漲停，但不能代替突破')
    return {
        'code':stock['code'],'name':stock['name'],'market':stock['market'],
        'date':t[0],'open':opn,'high':high,'low':low,'close':close,'lots':round(vol),
        'prevClose':prev_close,'changePct':round(100*(close/prev_close-1),2) if prev_close>0 else None,
        'neck':neck,'neckDate':anchor['date'] if anchor else None,
        'neckLots':anchor['vol'] if anchor else None,'distancePct':dist,
        'volumeRatio':vol_ratio,'limit20':limit20,
        'oldMaxLots':round(float(old_max[5])),'oldMaxDate':old_max[0],
        'oldMaxClose':float(old_max[4]),'oldMaxHigh':float(old_max[2]),
        'newVolumeAboveOldHigh':broke_old_high,'confirmed':confirmed,
        'priceConfirmed':price_confirmed,'volumeConfirmed':volume_confirmed,
        'onePriceLimit':locked_limit,'preLaunch':prep,'launchStage':launch_stage,
        'followStatus':follow_status,'followDay':recent_event[0] if recent_event else None,
        'breakoutDate':recent_event[1]['date'] if recent_event else t[0] if first else None,
        'breakoutClose':recent_event[1]['close'] if recent_event else close if first else None,
        'launchReason':launch_reason,'launchRank':launch_rank,
        'momentum5Pct':round(price_change5,2),'overextended':bool(first and dist>8),
        'tags':tags,'score':round(points),
        'bars':[[b[0],float(b[1]),float(b[2]),float(b[3]),float(b[4]),round(float(b[5]))]
                for b in bars[-120:]],
    }


def build_snapshot(stocks):
    candidates=[];eligible=0;by_market={'上市':0,'上櫃':0}
    for stock in stocks.values():
        if len(stock.get('bars',[]))>=MIN_SESSIONS:eligible+=1
        if stock.get('market') in by_market:by_market[stock['market']]+=1
        result=scan_stock(stock)
        if result:candidates.append(result)
    # CRITICAL: first breakout goes above every 20-day multi-limit or near-only pick.
    candidates.sort(key=lambda x:(x['launchRank'],x['score'],x['lots']),reverse=True)
    lastdate=max((x['bars'][-1][0] for x in stocks.values() if x.get('bars')),default=None)
    market_dates={m:max((x['bars'][-1][0] for x in stocks.values()
                         if x.get('market')==m and x.get('bars')),default=None)
                  for m in ('上市','上櫃')}
    if market_dates['上市']!=market_dates['上櫃']:
        readiness='partial'
    else:
        readiness='live' if eligible>=500 and all(
            sum(stock.get('market')==m and len(stock.get('bars',[]))>=MIN_SESSIONS
                for stock in stocks.values())>=250 for m in ('上市','上櫃')) else 'warming'
    candidates=[c for c in candidates if c['date']==lastdate]
    return {'mode':readiness,'asOf':lastdate,'tradingDate':lastdate,
            'marketAsOf':market_dates,'marketCount':by_market,'stockCount':len(stocks),
            'eligibleCount':eligible,'candidateCount':len(candidates),
            'counts':{k:sum(k in c['tags'] for c in candidates)
                      for k in ('first','prep','near','volume','limit','follow')},
            'rulesVersion':'eod-v1.6-trade-quality',
            'notes':['V1.6補充突破後5日追蹤，不使用即時行情',
                     '主力洗盤或出貨只能推估，不能直接辨識交易主體',
                     '分數是規則式排序，不是統計上的勝率或報酬承諾',
                     '僅盤後資料，無法在漲停當下預警',
                     '首次突破不要求新成交量超過舊大量K',
                     '發動前預備是機率不明的候選觀察，不能推論隔日必漲',
                     '漲停次數為價格估算，除權息或特殊交易可能誤判',
                     '價量未經除權息還原，異常跳空須額外驗證'],
            'candidates':candidates[:600]}
