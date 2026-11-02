"""Conservative EOD-only breakout certification. No invented missing market data."""
import math
import re
import datetime as dt


def finite(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def certify_row(row):
    """Mutates an existing universe row. Never manufactures a breakout event."""
    if not isinstance(row, dict):
        return row
    for key in ('breakoutEvent','continuationEligible','breakoutQuality','breakoutQualityReasons',
                'abovePrevHigh','breakoutVolumeRatio20','breakoutCloseLocation','breakoutUpperWickRatio'):
        row.pop(key, None)
    seq = row.get('breakoutSequence')
    if not isinstance(seq, dict):
        return row  # malformed event metadata is not a valid breakout
    phase = seq.get('phase')
    # structure_v25 reports day 3+ as 'follow', while the frontend has
    # distinct third/fourth groups. Only map genuine FIRST historical events;
    # reclaim-follow must never become a new breakout.
    cycle = row.get('cycle')
    if phase == 'follow' and isinstance(cycle, dict) and cycle.get('firstHistoricalBreakout') is True:
        days = cycle.get('daysSinceFirst')
        if type(days) is int and days == 2:
            phase = 'third'
        elif type(days) is int and days == 3:
            phase = 'fourth'
    if phase not in ('first', 'second', 'third', 'fourth', 'fourth_plus'):
        return row
    bars = row.get('bars')
    if not isinstance(bars, (list, tuple)):
        return row
    level = finite(seq.get('level'))
    if level is None or level <= 0 or not isinstance(bars, (list, tuple)) or not bars:
        return row
    if not isinstance(bars[-1], (list, tuple)) or len(bars[-1]) < 6 or not isinstance(row.get('date'), str) or bars[-1][0] != row['date']:
        return row  # missing source data must remain pending
    row['breakoutEvent'] = {'level': level, 'initialDate': seq.get('initialDate'), 'source': 'breakoutSequence'}
    if len(bars) < 21:
        return row
    today, yesterday = bars[-1], bars[-2]
    # A duplicated or out-of-order final session cannot establish a new daily candle.
    if not all(isinstance(b, (list, tuple)) and len(b) >= 6 for b in bars[-21:]):
        return row
    dates = [str(b[0]) for b in bars[-21:]]
    if dates != sorted(set(dates)) or any(not re.fullmatch(r'\d{4}-\d{2}-\d{2}', d) for d in dates):
        return row
    try:
        # ISO-shaped strings such as 2026-02-30 are not real sessions.
        for date in dates:
            dt.date.fromisoformat(date)
    except ValueError:
        return row
    o, hi, lo, close, volume = (finite(today[i]) for i in (1, 2, 3, 4, 5))
    prev_high = finite(yesterday[2])
    prev_open, prev_low, prev_close = (finite(yesterday[i]) for i in (1, 3, 4))
    volumes = [finite(b[5]) for b in bars[-21:-1]]
    # Do not certify from corrupt historical OHLCV bars even if their volume looks valid.
    for bar in bars[-21:-1]:
        bo, bh, bl, bc = (finite(bar[i]) for i in (1, 2, 3, 4))
        if any(v is None for v in (bo, bh, bl, bc)) or bl <= 0 or bh < max(bo, bc) or min(bo, bc) < bl:
            return row
    if any(v is None or v < 0 for v in volumes) or any(v is None for v in (o,hi,lo,close,volume,prev_high,prev_open,prev_low,prev_close)):
        return row
    if not (hi >= max(o,close) and min(o,close) >= lo and hi >= lo and lo > 0 and volume >= 0
            and prev_high >= max(prev_open,prev_close) and min(prev_open,prev_close) >= prev_low
            and prev_low > 0):
        return row
    avg_volume = sum(volumes) / len(volumes)
    if avg_volume <= 0:
        return row
    # The universe row and its last OHLCV bar must describe the same close.
    row_close = finite(row.get('close'))
    if row_close is not None and abs(row_close - close) > max(0.00001, abs(close) * 0.000001):
        return row
    candle_range = hi - lo
    close_location = (close-lo)/candle_range if candle_range > 0 else 0.5
    upper_wick = (hi-max(o,close))/candle_range if candle_range > 0 else 0.0
    ratio = volume/avg_volume
    row['abovePrevHigh'] = close > prev_high  # close, not intraday high
    row['breakoutVolumeRatio20'] = round(ratio, 3)
    row['breakoutCloseLocation'] = round(close_location, 3)
    row['breakoutUpperWickRatio'] = round(upper_wick, 3)
    # A first breakout must CLOSE strictly above the event neckline.
    # Subsequent candles may touch it without breaking the established event.
    if close < level or (phase == 'first' and close <= level):
        row['continuationEligible'] = False
        row['breakoutQuality'] = 'invalid'
        row['breakoutQualityReasons'] = ['收盤跌破固定頸線']
        return row
    reasons = []
    if close_location < 0.65: reasons.append('收盤位置未達K棒上方35%')
    if upper_wick > 0.30: reasons.append('上影線超過K棒30%')
    if ratio < 1.2: reasons.append('成交量低於20日均量1.2倍')
    if phase != 'first' and close <= prev_high: reasons.append('未收盤突破昨日高點')
    eligible = not reasons
    row['continuationEligible'] = eligible
    row['breakoutQuality'] = 'strong' if eligible else 'watch'
    row['breakoutQualityReasons'] = reasons or ['量價與固定頸線條件通過']
    return row


def certify_universe(universe):
    if not isinstance(universe, dict):
        return universe
    rows = universe.get('rows')
    if not isinstance(rows, list):
        return universe
    for row in rows:
        certify_row(row)
    return universe
