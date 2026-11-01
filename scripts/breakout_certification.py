"""Conservative EOD-only breakout certification. No invented missing market data."""
import math


def finite(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def certify_row(row):
    """Mutates an existing universe row. Never manufactures a breakout event."""
    for key in ('breakoutEvent','continuationEligible','breakoutQuality','breakoutQualityReasons',
                'abovePrevHigh','breakoutVolumeRatio20','breakoutCloseLocation','breakoutUpperWickRatio'):
        row.pop(key, None)
    seq = row.get('breakoutSequence') or {}
    phase = seq.get('phase')
    if phase not in ('first', 'second', 'third', 'fourth'):
        return row
    bars = row.get('bars') or []
    level = finite(seq.get('level'))
    if level is None or level <= 0 or not bars or bars[-1][0] != row.get('date'):
        return row  # missing source data must remain pending
    row['breakoutEvent'] = {'level': level, 'initialDate': seq.get('initialDate'), 'source': 'breakoutSequence'}
    if len(bars) < 21:
        return row
    today, yesterday = bars[-1], bars[-2]
    o, hi, lo, close, volume = (finite(today[i]) for i in (1, 2, 3, 4, 5))
    prev_high = finite(yesterday[2])
    volumes = [finite(b[5]) for b in bars[-21:-1]]
    if any(v is None or v < 0 for v in volumes) or any(v is None for v in (o,hi,lo,close,volume,prev_high)):
        return row
    if not (hi >= max(o,close) and min(o,close) >= lo and hi >= lo and lo > 0 and volume >= 0):
        return row
    avg_volume = sum(volumes) / len(volumes)
    if avg_volume <= 0:
        return row
    candle_range = hi - lo
    close_location = (close-lo)/candle_range if candle_range > 0 else 0.5
    upper_wick = (hi-max(o,close))/candle_range if candle_range > 0 else 0.0
    ratio = volume/avg_volume
    row['abovePrevHigh'] = close > prev_high  # close, not intraday high
    row['breakoutVolumeRatio20'] = round(ratio, 3)
    row['breakoutCloseLocation'] = round(close_location, 3)
    row['breakoutUpperWickRatio'] = round(upper_wick, 3)
    if close < level:
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
    for row in universe.get('rows', []):
        certify_row(row)
    return universe
