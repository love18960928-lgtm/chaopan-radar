#!/usr/bin/env python3
"""Enrich data/radar.json with validated same-day TWSE T86 institutional data.
Never fabricate institutional flows. On failure exit nonzero and preserve the input file.
"""
import argparse
import datetime as dt
import json
import pathlib
import time
import urllib.error
import sys
import urllib.parse
import urllib.request


class T86Unavailable(Exception):
    """Official daily file temporarily unavailable. Never interpret as zero flows."""


def fetch_t86(url, attempts=3, delay=8):
    urls = [url]
    if '/rwd/zh/fund/T86' in url:
        urls.append(url.replace('/rwd/zh/fund/T86', '/fund/T86'))
    errors = []
    for current in urls:
        for attempt in range(1, attempts + 1):
            try:
                req = urllib.request.Request(current, headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; RADAR-EOD/1.0)',
                    'Accept': 'application/json',
                })
                with urllib.request.urlopen(req, timeout=30) as response:
                    payload = json.load(response)
                stat = payload.get('stat') if isinstance(payload, dict) else None
                print(f'T86_FETCH url={current.split("?")[0]} try={attempt} stat={stat!r}', flush=True)
                if stat == 'OK':
                    return payload
                errors.append(f'stat={stat!r}')
            except (OSError, ValueError, UnicodeError, json.JSONDecodeError) as exc:
                errors.append(f'{type(exc).__name__}:{exc}')
            if attempt < attempts and delay:
                time.sleep(delay)
    raise T86Unavailable('official T86 not ready or inaccessible: ' + str(errors[-3:]))


def mark_unavailable(path, reason):
    obj = json.loads(path.read_text(encoding='utf-8'))
    day = str(obj.get('asOf', ''))
    dt.date.fromisoformat(day)
    cleared = 0
    for c in obj.get('candidates') or []:
        if c.get('market') != '上市':
            continue
        inst = c.get('institutional')
        if isinstance(inst, dict) and str(inst.get('date') or '') != day:
            c.pop('institutional', None)
            cleared += 1
    obj['institutionalCoverage'] = {
        'date': day, 'status': 'unavailable', 'reason': 'T86_NO_VERIFIED_ROWS',
        'note': '官方同日資料未取得；非法人買賣超為0。不得將前日法人資料當成當日訊號。',
        'removedStaleCandidateRecords': cleared,
        'source': 'TWSE T86 official EOD',
        'markets': {'上市': {'status': '待核對'}, '上櫃': {'status': '未接入，維持待核對'}},
        'matchedToStockCount': 0,
    }
    tmp = path.with_name(path.name + '.tmp')
    try:
        tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)
    print(f'::warning::T86_UNAVAILABLE for {day}: {reason}; no fabricated institutional data; stale records removed={cleared}', flush=True)


def col(fields, name):
    exact = [i for i, f in enumerate(fields) if str(f).strip() == name]
    if len(exact) == 1:
        return exact[0]
    raise ValueError(f'T86 missing or ambiguous column: {name}')


def parse_t86(payload, day):
    if payload.get('stat') != 'OK':
        raise ValueError(f"T86 response not OK: {payload.get('stat')!r}")
    fields = payload.get('fields') or []
    rows = payload.get('data') or []
    if not rows:
        raise T86Unavailable('official T86 returned no rows for requested date')
    code_idx = col(fields, '證券代號')
    foreign_name = next((x for x in ('外陸資買賣超股數(不含外資自營商)', '外陸資買賣超股數') if x in fields), None)
    if not foreign_name:
        raise ValueError('T86 foreign net column missing')
    idx = [col(fields, x) for x in (foreign_name, '投信買賣超股數', '自營商買賣超股數')]
    out = {}
    for row in rows:
        if len(row) < len(fields):
            continue
        code = str(row[code_idx]).strip()
        if not code or code in out:
            continue
        try:
            vals = [int(str(row[i]).replace(',', '').strip()) for i in idx]
        except (ValueError, TypeError):
            continue
        out[code] = {
            'date': day, 'foreignNetShares': vals[0], 'trustNetShares': vals[1],
            'dealerNetShares': vals[2], 'totalNetShares': sum(vals),
            'source': 'TWSE T86 official EOD', 'sourceUrl': 'https://www.twse.com.tw/rwd/zh/fund/T86',
        }
    if len(out) < 500:
        raise ValueError(f'T86 too few valid securities: {len(out)}')
    return out


def candidate_date(candidate):
    """Use only an explicitly known date; never infer a date from today."""
    day = candidate.get('date') or candidate.get('asOf')
    if day:
        return str(day)[:10]
    # Some radar snapshots store trading date in the final OHLCV bar only.
    for key in ('bars', 'history', 'ohlcv'):
        bars = candidate.get(key)
        if isinstance(bars, list) and bars:
            last = bars[-1]
            if isinstance(last, list) and last:
                return str(last[0])[:10]
    return ''


def run(path, fetcher=None):
    obj = json.loads(path.read_text(encoding='utf-8'))
    day = str(obj.get('asOf', ''))
    dt.date.fromisoformat(day)
    url = 'https://www.twse.com.tw/rwd/zh/fund/T86?' + urllib.parse.urlencode({
        'date': day.replace('-', ''), 'selectType': 'ALL', 'response': 'json'
    })
    payload = fetch_t86(url) if fetcher is None else fetcher(url)
    official = parse_t86(payload, day)
    candidates = obj.get('candidates') or []
    counts = {'totalCandidates': len(candidates), 'listed': 0, 'dateMatched': 0, 'codeMatched': 0, 'enriched': 0}
    for c in candidates:
        if c.get('market') != '上市':
            continue
        counts['listed'] += 1
        if candidate_date(c) != day:
            continue
        counts['dateMatched'] += 1
        record = official.get(str(c.get('code', '')).strip())
        if record is None:
            continue
        counts['codeMatched'] += 1
        c['institutional'] = dict(record)
        counts['enriched'] += 1
    print('T86_DIAGNOSTICS ' + json.dumps({'asOf': day, 'officialRecords': len(official), **counts}, ensure_ascii=False), flush=True)
    for code in ('2454', '1303'):
        match = next((c for c in candidates if str(c.get('code', '')).strip() == code), None)
        if match:
            status = 'MATCHED' if match.get('institutional', {}).get('date') == day else 'UNVERIFIED'
            print(f'T86_STOCK {code}: {status}; market={match.get("market")}; candidateDate={candidate_date(match)}', flush=True)
    if not counts['enriched']:
        raise ValueError('T86 zero same-day listed candidates matched; radar.json unchanged')
    obj['institutionalCoverage'] = {
        'date': day,
        'markets': {'上市': {'source': 'TWSE T86', 'records': len(official), 'matchedCandidates': counts['enriched']},
                    '上櫃': {'status': '未接入，維持待核對'}},
        'matchedToStockCount': counts['enriched'],
        'policy': '僅同日官方資料；未驗證不推定法人方向',
    }
    temp = path.with_name(path.name + '.tmp')
    try:
        temp.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)
    return counts['enriched']


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--radar', default='data/radar.json')
    parser.add_argument('--allow-unavailable', action='store_true',
                        help='Allow a missing official T86 response only; mark as unavailable, never zero.')
    args = parser.parse_args()
    try:
        count = run(pathlib.Path(args.radar))
        print(f'T86_SUCCESS official same-day candidates matched={count}')
    except (T86Unavailable, ValueError) as exc:
        # A non-OK response is a known no-data state; malformed schemas, unexpected
        # columns and zero candidate matches remain hard failures.
        no_data = isinstance(exc, T86Unavailable) or str(exc).startswith('T86 response not OK:')
        if args.allow_unavailable and no_data:
            mark_unavailable(pathlib.Path(args.radar), str(exc))
        else:
            print(f'::error::T86_FAILED {type(exc).__name__}: {exc}', file=sys.stderr)
            sys.exit(1)
    except Exception as exc:
        print(f'::error::T86_FAILED {type(exc).__name__}: {exc}', file=sys.stderr)
        sys.exit(1)
