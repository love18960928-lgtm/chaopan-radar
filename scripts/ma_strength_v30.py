"""Close-based 5/10/20-day SMA structure and ORIGINAL breakout-level hold count.

No forward prices, external identities or inferred institutional positions.
Input OHLCV bars are chronologically increasing; OHLC prices unadjusted.
"""
from statistics import mean


def moving_average_context(bars, event=None):
    bars = [b for b in bars if len(b) >= 5 and isinstance(b[4], (int, float)) and b[4] > 0]
    closes = [float(b[4]) for b in bars]
    count = len(closes)
    out = {'ma5': None, 'ma10': None, 'ma20': None,
           'ma5SlopePct': None, 'ma10SlopePct': None, 'ma20SlopePct': None,
           'aboveAll': None, 'bullAligned': None, 'nearMa5': None,
           'maStage': '資料不足', 'maRisk': None,
           'necklineHoldDays': None, 'originalNeckline': None, 'breakoutDate': None,
           'necklineHoldLabel': '尚無固定突破事件'}
    if count >= 20:
        av = {n: mean(closes[-n:]) for n in (5,10,20)}
        old = {n: mean(closes[-n-1:-1]) for n in (5,10,20)} if count >= 21 else {}
        ma5, ma10, ma20 = (av[n] for n in (5,10,20))
        above = closes[-1] >= ma5 and closes[-1] >= ma10 and closes[-1] >= ma20
        stacked = ma5 > ma10 > ma20
        rising = count >= 21 and all(av[n] >= old[n] for n in (5,10,20))
        near5 = 0 <= closes[-1]/ma5 - 1 <= .03
        if above and stacked and rising and near5:
            stage = '沿5日線強勢／多頭排列'
        elif above and stacked and rising:
            stage = '均線多頭／偏離5日線'
        elif above:
            stage = '站上三線／排列待確認'
        elif closes[-1]>=ma10 and closes[-1]>=ma20 and stacked:
            stage = '回測5日線／觀察10日線'
        elif closes[-1]<ma20:
            stage = '跌回20日線下方／警戒'
        else:
            stage = '均線交錯／盤整'
        out.update({'ma5':round(ma5,3),'ma10':round(ma10,3),'ma20':round(ma20,3),
                    'ma5SlopePct':round(100*(av[5]/old[5]-1),2) if old else None,
                    'ma10SlopePct':round(100*(av[10]/old[10]-1),2) if old else None,
                    'ma20SlopePct':round(100*(av[20]/old[20]-1),2) if old else None,
                    'aboveAll':above,'bullAligned':stacked and rising,'nearMa5':near5,
                    'maStage':stage,
                    'maRisk':'股價距5日線逾8%，追高風險' if closes[-1]>ma5*1.08 else None})
    # Only count after a recorded, already occurred event; never pick a nearby
    # historical resistance and pretend it is the original breakout anchor.
    if event and event.get('initialDate') and event.get('level') is not None:
        level=float(event['level']); date=str(event['initialDate'])
        dates=[str(b[0]) for b in bars]
        if level>0 and date in dates:
            start=dates.index(date)
            today_days=0
            for bar in reversed(bars[start:]):
                if float(bar[4]) > level:
                    today_days += 1
                else: break
            out.update({'originalNeckline':level,'breakoutDate':date,
                        'necklineHoldDays':today_days,
                        'necklineHoldLabel':f'連續站上原頸線 {today_days} 日' if today_days else '目前未站穩原頸線'})
    return out
