"""V2.6 PRE-SESSION conditional playbook from fully known EOD data.

No intraday source: this is a dated plan for a human to check, not a live
signal, a probability or advice to place an order. Cumulative volume curve is
an UNCALIBRATED heuristic and must never be labelled as measured same-time RVOL.
"""
from statistics import mean
from math import ceil, isfinite
from structure_v23 import _valid_bars


# Typical Taiwan ordinary-share price steps. Some security types and unusual
# regimes differ: display as estimates, verify the broker's valid quote tick.
def tick(price):
    if price < 10: return .01
    if price < 50: return .05
    if price < 100: return .1
    if price < 500: return .5
    if price < 1000: return 1.
    return 5.


def next_tick(level):
    """Smallest VALID Taiwan ordinary-share tick strictly above an anchor.

    A tick-size change at 10/50/100/500/1000 must be evaluated using the
    *resulting* quote, not the increment at the old price. For instance,
    the quote after 49.99 is 50.00, never 50.05.
    """
    if level is None or not isfinite(float(level)) or float(level) <= 0:
        return None
    level=float(level)
    candidate=ceil_tick(level)
    if candidate is not None and candidate>level+1e-9:
        return candidate
    # Already on a tradable tick: move a small positive fraction of an old
    # tick and let ceil_tick resolve a possible tier transition.
    return ceil_tick(level+max(tick(level)*.0001,1e-7))


def ceil_tick(value):
    if value <= 0: return None
    x = float(value)
    for _ in range(10):
        t = tick(x)
        new = round(ceil((x-1e-8)/t)*t,4)
        if tick(new)==t: return new
        x = new
    return round(x,4)


# Approximate proportion of DAILY volume by clock time; not calibrated to
# stock-specific historical minute bars, therefore advisory only.
ROUGH_CURVE = {'10:00': .30, '11:00': .55, '12:00': .75,
               '13:00': .94, '13:30': 1.00}


def build_intraday_plan(bars, structure, risk_level=None, asof=None):
    b = _valid_bars(bars)
    result = {'version':'next-session-v2.6','asOf':asof or (b[-1][0] if b else None),
              'session':'下一交易日（交易所休市日順延）','status':'資料不足',
              'neckline':None,'crossPrice':None,'strengthPrice':None,
              'ma20':None,'avg20Lots':None,'supportFloor':None,
              'volumeTargets':None,'riskNotes':[],
              'volumeMethod':'以歷史日均量及未校準的分時比例粗估；不是同時段真實量比'}
    if len(b)<61:return result
    today=b[-1];close=today[4]
    level=structure.get('primaryNeckline')
    # If today's level has already been cleared, V2.5 cycle's original level
    # is informative for RE-TEST but not another first breakout.
    if not level:
        result['status']='無可靠近期上方頸線，暫不預設突破觸發價'
        return result
    level=float(level)
    if not isfinite(level) or level<=0:return result
    average=mean(x[5] for x in b[-20:])
    support=structure.get('primarySupport') or {}
    support_floor=support.get('lower')
    ma20=mean(x[4] for x in b[-20:])
    cross=next_tick(level)
    strength=ceil_tick(max(cross or level, level*1.003))
    chase=ceil_tick(level*1.03)
    target={clock:round(average*fraction*1.3) for clock,fraction in ROUGH_CURVE.items()}
    distance=(level/close-1)*100 if close else None
    if (risk_level or '').lower()=='high' or structure.get('riskFirst'):
        status='結構風險優先；盤中穿越不代表適合追價'
    elif close > level + 1e-8:
        status='已在頸線上方；優先追蹤回測，不認定下一日首次突破'
    elif distance is not None and distance>10:
        status='距頸線尚遠；預先掛入追蹤，不是即將突破'
    elif distance is not None and distance>3:
        status='發動前觀察；尚未進入頸線3%以內'
    else:
        status='近期接近頸線／等待盤中觀察'
    notes=[]
    if (risk_level or '').lower()=='high' or structure.get('riskFirst'):
        notes.append('前一交易日風險優先：不因當天碰到頸線就忽略已存在的弱勢')
    if support_floor is not None and cross and cross/float(support_floor)>1.05:
        notes.append('觸發價至最近結構支撐超過5%，須另評估風險額度，勿當作固定停損')
    if close<ma20:
        notes.append('前收低於MA20，盤中突破仍需留意均線及上方壓力')
    return {**result,'status':status,'neckline':round(level,3),
            'crossPrice':cross,'strengthPrice':strength,'chaseLine':chase,
            'ma20':round(ma20,3),'avg20Lots':round(average),
            'supportFloor':round(float(support_floor),3) if support_floor is not None else None,
            'volumeTargets':target,'riskNotes':notes,
            'referenceClose':round(float(close),3),
            'gapCautionPct':3.0,'bodyRequired':'盤中暫時紅K（現價高於當日開盤）',
            'rangeLocationMin':.70,'upperWickMax':.30,
            'requireHeldMinutes':15,
            'volumeRatioMin':1.3}
