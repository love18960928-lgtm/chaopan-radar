#!/usr/bin/env python3
"""Fail closed before publishing EOD radar, universe and sharded stock lookup.

This gate checks structural consistency; it is NOT a verification of remote
exchange data, live quotes, a trading signal, or investment profitability.
"""
import argparse
from collections import Counter
from datetime import date, datetime, timezone, timedelta
import json
import math
from pathlib import Path

MARKETS = {'上市', '上櫃'}
FIELDS = ('neck', 'neckDate', 'priceConfirmed', 'unifiedStage',
          'unifiedScore', 'launchStage', 'riskLevel')
MINIMUM = {'上市': 700, '上櫃': 450}


class ReleaseGateError(ValueError):
    pass


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise ReleaseGateError(f'{path}: missing or invalid JSON: {exc}') from exc


def finite_positive(value, zero_ok=False):
    try:
        v = float(value)
        return math.isfinite(v) and (v >= 0 if zero_ok else v > 0)
    except (TypeError, ValueError, OverflowError):
        return False


def valid_bar(bar):
    if not isinstance(bar, list) or len(bar) < 6:
        return False
    try:
        date.fromisoformat(bar[0])
    except (ValueError, TypeError):
        return False
    if not all(finite_positive(v) for v in bar[1:5]) or not finite_positive(bar[5], zero_ok=True):
        return False
    o, hi, lo, close = map(float, bar[1:5])
    return hi >= lo and lo-1e-7 <= min(o, close) <= max(o, close) <= hi+1e-7


def identity(record):
    market, code = str(record.get('market', '')), str(record.get('code', ''))
    if market not in MARKETS or not code or not code[0].isdigit():
        raise ReleaseGateError(f'invalid stock market/code: {market} {code}')
    return market, code


def verify(root, require_lookup=True):
    root = Path(root)
    radar = read_json(root/'data/radar.json')
    universe = read_json(root/'data/universe.json')
    day = radar.get('asOf')
    try:
        date.fromisoformat(day)
    except (ValueError, TypeError):
        raise ReleaseGateError(f'radar.asOf invalid: {day!r}')
    if day > datetime.now(timezone(timedelta(hours=8))).date().isoformat():
        raise ReleaseGateError(f'future-dated EOD {day}')
    if universe.get('asOf') != day:
        raise ReleaseGateError('radar and universe asOf differ')
    if radar.get('mode') != 'live':
        raise ReleaseGateError('radar.mode is not live (do not publish partial snapshot)')
    rows = universe.get('rows')
    candidates = radar.get('candidates')
    if not isinstance(rows, list) or len(rows) < sum(MINIMUM.values()):
        raise ReleaseGateError('universe too small or missing')
    if not isinstance(candidates, list):
        raise ReleaseGateError('radar.candidates missing')
    if universe.get('coverage') != len(rows):
        raise ReleaseGateError('universe.coverage differs from actual rows')
    seen, canonical = set(), {}
    counts = Counter()
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ReleaseGateError(f'universe row {i} is not an object')
        key = identity(row)
        if key in seen:
            raise ReleaseGateError(f'duplicate universe id: {key}')
        seen.add(key)
        counts[key[0]] += 1
        bars = row.get('bars')
        if row.get('date') != day or not isinstance(bars, list) or not bars or bars[-1][0] != day:
            raise ReleaseGateError(f'row date/last candle inconsistent: {key}')
        dates = [bar[0] for bar in bars if isinstance(bar, list) and bar]
        if len(dates) != len(bars) or dates != sorted(set(dates)):
            raise ReleaseGateError(f'unsorted/duplicate candle dates: {key}')
        if any(not valid_bar(bar) for bar in bars):
            raise ReleaseGateError(f'invalid OHLCV row: {key}')
        if not finite_positive(row.get('close')) or abs(float(row['close'])-float(bars[-1][4])) > 0.001:
            raise ReleaseGateError(f'close disagrees with last candle: {key}')
        if row.get('intradayPlan') and row['intradayPlan'].get('asOf') != day:
            raise ReleaseGateError(f'next session plan asOf mismatch: {key}')
        canonical[key] = row
    for market, lower in MINIMUM.items():
        if counts[market] < lower:
            raise ReleaseGateError(f'{market} coverage {counts[market]} under {lower}')
    # Absolute floors cannot catch a day missing hundreds of securities while
    # still above 700/450. Compare to the latest prior same-market session in
    # historical storage when available. Unusually large coverage drops stop
    # publication for manual examination; holidays remain data-agnostic.
    history_path = root/'storage/history.json'
    prior_coverage = {}
    if history_path.exists():
        history = read_json(history_path)
        by_market_date = {market: {} for market in MARKETS}
        for stock in history.get('stocks', []):
            if not isinstance(stock, dict) or stock.get('market') not in MARKETS:
                continue
            market, code = identity(stock)
            for candle in stock.get('bars', []):
                if isinstance(candle, list) and candle and isinstance(candle[0], str) and candle[0] < day:
                    by_market_date[market].setdefault(candle[0], set()).add(code)
        for market in MARKETS:
            if not by_market_date[market]:
                continue
            previous = max(by_market_date[market])
            previous_count = len(by_market_date[market][previous])
            prior_coverage[market] = {'day': previous, 'stocks': previous_count}
            if previous_count >= MINIMUM[market] and counts[market] < math.ceil(previous_count*.90):
                raise ReleaseGateError(f'{market} coverage dropped from {previous_count} to {counts[market]} vs {previous}; investigate missing rows')
    ckeys = set()
    for c in candidates:
        key = identity(c)
        if key in ckeys:
            raise ReleaseGateError(f'duplicate radar candidate {key}')
        ckeys.add(key)
        row = canonical.get(key)
        if row is None or c.get('date') != day:
            raise ReleaseGateError(f'radar candidate missing/different date {key}')
        for field in FIELDS:
            if c.get(field) != row.get(field):
                raise ReleaseGateError(f'canonical field conflict {key} field={field} radar={c.get(field)} universe={row.get(field)}')
        cp, up = c.get('intradayPlan'), row.get('intradayPlan')
        if cp and up and (cp.get('asOf') != up.get('asOf') or cp.get('crossPrice') != up.get('crossPrice')):
            raise ReleaseGateError(f'next-session plan inconsistent {key}')
    result = {'asOf':day, 'stocks':len(rows), 'candidates':len(candidates),
              'listed':counts['上市'], 'otc':counts['上櫃'], 'priorCoverage':prior_coverage, 'lookup':'not checked'}
    if require_lookup:
        path = root/'data/stock-lookup'
        listing = read_json(path/'index.json')
        indices = listing.get('rows')
        if listing.get('asOf') != day or listing.get('count') != len(rows) or not isinstance(indices, list) or len(indices) != len(rows):
            raise ReleaseGateError('search directory date/count differs from universe')
        lookup = {}
        for x in indices:
            key = identity(x)
            if key in lookup:
                raise ReleaseGateError(f'index duplicate {key}')
            lookup[key] = x
        if set(lookup) != set(canonical):
            raise ReleaseGateError('search directory missing/extra stock codes')
        for key, x in lookup.items():
            src = canonical[key]
            if x.get('date') != day or x.get('name') != src.get('name') or x.get('close') != src.get('close'):
                raise ReleaseGateError(f'search directory content differs: {key}')
        shard_seen=set()
        for digit in '0123456789':
            shard = read_json(path/(digit+'.json'))
            srows = shard.get('rows')
            if shard.get('asOf') != day or not isinstance(srows, list) or shard.get('count') != len(srows):
                raise ReleaseGateError(f'search shard {digit} dated/count invalid')
            for x in srows:
                key=identity(x)
                if not key[1].startswith(digit) or key in shard_seen or key not in canonical:
                    raise ReleaseGateError(f'search shard {digit} wrong/duplicated: {key}')
                shard_seen.add(key)
                shard_bars=x.get('bars')
                if x.get('date') != day or not isinstance(shard_bars,list) or not shard_bars or not isinstance(shard_bars[-1],list) or shard_bars[-1][0] != day:
                    raise ReleaseGateError(f'search shard {digit} stale bars: {key}')
        if shard_seen != set(canonical):
            raise ReleaseGateError('stock shard coverage differs from universe')
        result['lookup'] = 'all 11 JSON files coherent'
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--root', default='.')
    p.add_argument('--skip-lookup', action='store_true')
    args = p.parse_args()
    try:
        outcome = verify(args.root, not args.skip_lookup)
    except ReleaseGateError as err:
        print('BLOCKED release:', err)
        raise SystemExit(1)
    print('PASS release gate:', json.dumps(outcome, ensure_ascii=False))
