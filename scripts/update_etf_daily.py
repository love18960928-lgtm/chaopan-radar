#!/usr/bin/env python3
"""Daily ETF EOD ingestion from Taiwan Stock Exchange public open data.

R177 adds ETF as a SEPARATE asset universe. Equity breakout/risk rules are not reused.
No fabricated prices, NAV, distributions, or institutional holdings.

Default: full TWSE ETF directory + one verified exchange session of quotes,
with 00406A history backfilled from monthly official STOCK_DAY data.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://www.twse.com.tw"
API = "https://openapi.twse.com.tw/v1"
ETF_ID = re.compile(r"^\d{4,6}[A-Za-z]?$", re.I)
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PRIORITY = {"00406A": "主動中信台灣收益"}
REQUIRED_BARS = 1

class OfficialDataError(RuntimeError):
    pass


def num(v):
    if v is None or isinstance(v, bool):
        return None
    s = str(v).strip().replace(",", "").replace("＋", "+").replace("−", "-")
    if not s or s in ("--", "---", "N/A", "-", "X", "除權息", "無", "不適用"):
        return None
    try:
        v = float(s)
        return v if v == v and abs(v) != float("inf") else None
    except (TypeError, ValueError):
        return None


def official_json(url, retries=3):
    headers = {"User-Agent": "Chaopan-Radar-ETF-EOD/1.0 (+public TWSE open data)", "Accept": "application/json"}
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=25) as response:
                payload = json.load(response)
            return payload
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            last = exc
            if attempt < retries - 1:
                time.sleep(1.8 * (attempt + 1))
    raise OfficialDataError(f"Official source unavailable: {url}: {last}")


def iso(s):
    s = str(s or "").strip()
    if DATE.fullmatch(s):
        try: return dt.date.fromisoformat(s).isoformat()
        except ValueError: return None
    x = re.fullmatch(r"(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})", s)
    if not x: return None
    yr, mon, day = map(int, x.groups())
    yr += 1911 if yr < 1911 else 0
    try: return dt.date(yr, mon, day).isoformat()
    except ValueError: return None


def nfield(r, *labels):
    for label in labels:
        if label in r and r[label] is not None and str(r[label]).strip():
            return r[label]
    return None


def parse_etf_master(data):
    if not isinstance(data, list): raise OfficialDataError("ETF master is not a list")
    out = {}
    for r in data:
        if not isinstance(r, dict): continue
        code = str(nfield(r, "基金代號", "證券代號", "證券代碼", "基金代碼", "Code", "code") or "").strip().upper()
        name = str(nfield(r, "基金簡稱", "證券簡稱", "基金名稱", "證券名稱", "Name", "name") or "").strip()
        if ETF_ID.fullmatch(code) and name:
            out[code] = {"code":code,"name":name,"market":"上市","assetType":"ETF",
                         "fundType":str(nfield(r, "基金類型", "類型") or "ETF"),
                         "listedDate":iso(nfield(r, "上市日期", "掛牌日期")),
                         "benchmark":str(nfield(r,"標的指數/追蹤指數名稱","標的指數名稱") or "") }
    # Known, separately confirmed TWSE ETF; classification only, never a price.
    out.setdefault("00406A", {"code":"00406A", "name": PRIORITY["00406A"], "market":"上市", "assetType":"ETF"})
    return out


def quote_record(r):
    code = str(nfield(r,"Code","證券代號","股票代號","code") or "").strip().upper()
    date = iso(nfield(r, "Date", "日期", "date"))
    vals = [num(nfield(r,*labels)) for labels in (
       ("OpeningPrice", "開盤價", "open"), ("HighestPrice", "最高價", "high"),
       ("LowestPrice", "最低價", "low"), ("ClosingPrice", "收盤價", "close"))]
    volume = num(nfield(r,"TradeVolume","成交股數","volumeShares"))
    if not ETF_ID.fullmatch(code) or any(v is None or v<=0 for v in vals): return None
    o,h,l,c = vals
    if l > min(o,c,h) or h < max(o,c,l) or volume is None or volume < 0: return None
    return {"code":code,"date":date,"open":o,"high":h,"low":l,"close":c,"volumeShares":int(volume)}


def monthly_bars(payload):
    if not isinstance(payload,dict) or payload.get("stat") not in ("OK","ok"):
        raise OfficialDataError("STOCK_DAY historical response is not OK")
    fields = payload.get("fields") or []
    rows = payload.get("data") or []
    if not isinstance(rows,list) or not isinstance(fields,list): raise OfficialDataError("Bad STOCK_DAY fields")
    # Exchange monthly report stable column order:
    # Date, Volume shares, Value, Open, High, Low, Close, Change, Trades.
    out=[]
    for r in rows:
        if not isinstance(r,list) or len(r)<7: continue
        date = iso(r[0]); vol = num(r[1]); vals = [num(v) for v in r[3:7]]
        if not date or vol is None or vol<0 or any(v is None or v<=0 for v in vals): continue
        o,h,l,c = vals
        if l>min(o,h,c) or h<max(o,l,c):continue
        out.append([date,o,h,l,c,round(vol/1000,3)])
    return out


def months(end: dt.date, count: int):
    y,m=end.year,end.month
    for _ in range(count):
        yield dt.date(y,m,1)
        if m==1:y,m=y-1,12
        else:m-=1


def fetch_history(code, ending, month_count=8, source=official_json):
    bars={}
    for mon in months(ending,month_count):
        args=urllib.parse.urlencode({"response":"json","date":mon.strftime("%Y%m%d"),"stockNo":code})
        url=f"{BASE}/exchangeReport/STOCK_DAY?{args}"
        try:
            batch=monthly_bars(source(url))
        except OfficialDataError as exc:
            # Historical source may lack a month for newly listed funds; retain other valid months.
            print(f"[ETF history] {code} {mon}: {exc}",file=sys.stderr)
            continue
        for b in batch:
            if b[0] <= ending.isoformat():bars[b[0]]=b
        time.sleep(.15)
    return [bars[d] for d in sorted(bars)]


def clean_history(bars):
    out={}
    for b in bars or []:
        if not isinstance(b,list) or len(b)<6 or not iso(b[0]) or iso(b[0])!=b[0]:continue
        vals=[num(v) for v in b[1:6]]
        if any(v is None for v in vals):continue
        o,h,l,c,v=vals
        if min(o,h,l,c)<=0 or v<0 or h<max(o,l,c) or l>min(o,h,c):continue
        out[b[0]]=[b[0],o,h,l,c,v]
    return [out[d] for d in sorted(out)]


def assemble(master,snapshot,histories,previous,session):
    if not DATE.fullmatch(session):raise OfficialDataError("Missing verified session date")
    prev={r.get('code'):r for r in previous.get('rows',[]) if isinstance(r,dict)}
    by_code={q['code']:q for q in snapshot if q and q['code'] in master}
    entries=[]
    for code,meta in sorted(master.items()):
        q=by_code.get(code)
        prior=prev.get(code,{})
        if not q and not prior and code not in histories:
            # Keep verified official ETF identifiers searchable, never invent a quote.
            entries.append({**meta,"date":None,"priceAsOf":None,"open":None,"high":None,
                            "low":None,"close":None,"volumeShares":None,"bars":[],
                            "source":"TWSE ETF master (no verified close)"})
            continue
        # Existing K bars are retained across later runs; never convert a failed quote to zero.
        bars=clean_history(list(prior.get('bars') or [])+list(histories.get(code) or []))
        if q:
            bar=[session,q['open'],q['high'],q['low'],q['close'],round(q['volumeShares']/1000,3)]
            bars=clean_history(bars+[bar])
            quote={**{k:q[k] for k in ('open','high','low','close','volumeShares')},'date':session}
        elif bars:
            b=bars[-1]
            quote={'open':b[1],'high':b[2],'low':b[3],'close':b[4],
                   'volumeShares':round(b[5]*1000),'date':b[0]}
        else:continue
        # Avoid treating an old quote as same-day. Each ETF has its own date.
        entry={**meta,**quote,"bars":bars[-260:],"source":"TWSE STOCK_DAY/STOCK_DAY_ALL", "priceAsOf":quote['date']}
        entries.append(entry)
    return {"schema":1,"asOf":session,"source":"臺灣證券交易所 TWSE 官方盤後／OpenAPI", "nonRealtime":True,
            "notes":"ETF資料獨立於個股突破判斷；無配息還原、淨值與同日法人核對時不推算。", "rows":entries}


def latest_day_from_priority(bars):
    return bars[-1][0] if bars else None


def update(path, source=official_json, now=None, months_back=9):
    now=now or dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
    today=now.date()
    previous={}
    if path.exists():
        try:previous=json.loads(path.read_text(encoding='utf-8'))
        except (OSError,ValueError):raise OfficialDataError("Existing etf JSON corrupt; refusing overwrite")
    # Read official ETF master; fallback only to confirmed priority ETF if endpoint is down.
    try:master=parse_etf_master(source(f"{API}/opendata/t187ap47_L"))
    except (OfficialDataError,TypeError,ValueError) as exc:
        print(f"[ETF] official master unavailable, priority only: {exc}",file=sys.stderr)
        master=parse_etf_master([])
    hist=fetch_history("00406A",today,months_back,source)
    if not hist:raise OfficialDataError("No validated 00406A official historical K bars. Refuse to publish empty ETF data")
    session=latest_day_from_priority(hist)
    if (today-dt.date.fromisoformat(session)).days > 7:raise OfficialDataError("Official 00406A session stale >7 days; refuse publication")
    snapshot_data=source(f"{API}/exchangeReport/STOCK_DAY_ALL")
    if not isinstance(snapshot_data,list):raise OfficialDataError("STOCK_DAY_ALL did not return an array")
    snapshot=[quote_record(x) for x in snapshot_data]
    snapshot=[x for x in snapshot if x]
    # A mismatched daily snapshot must never be assigned an arbitrary official date.
    p=[r for r in snapshot if r['code']=='00406A']
    last=hist[-1]
    same=bool(p) and abs(p[0]['close']-last[4])<=.011 and abs(p[0]['open']-last[1])<=.011 and abs(p[0]['high']-last[2])<=.011 and abs(p[0]['low']-last[3])<=.011
    if not same:
        print("[ETF] STOCK_DAY_ALL differs from last 00406A historical day; using validated 00406A history only, other ETF prices retained at their own older dates",file=sys.stderr)
        snapshot=[]
    else:
        print(f"[ETF] TWSE latest session validated: {session}, {len(snapshot)} quotation rows")
    data=assemble(master,snapshot,{"00406A":hist},previous,session)
    # A daily snapshot cannot be rolled backward by intermittent API failure.
    if previous.get('asOf') and previous['asOf']>session:
        raise OfficialDataError("New session older than existing published file")
    if not any(r.get('code')=='00406A' and r.get('bars') for r in data['rows']):
        raise OfficialDataError("00406A absent after validation")
    path.parent.mkdir(parents=True,exist_ok=True)
    new=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n'
    if path.exists() and path.read_text('utf-8')==new:
        print(f"[ETF] no change; session {session}; rows {len(data['rows'])}")
        return data
    tmp=path.with_suffix('.json.tmp');tmp.write_text(new,encoding='utf-8');os.replace(tmp,path)
    print(f"[ETF] wrote {path}, session={session}, etfs={len(data['rows'])}, 00406A bars={len(hist)}")
    return data


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--output',default='data/etf-daily.json')
    ap.add_argument('--months',type=int,default=9)
    args=ap.parse_args()
    if not 2<=args.months<=24:ap.error('--months must be 2..24')
    try:update(Path(args.output),months_back=args.months)
    except OfficialDataError as exc:
        print(f"ETF_DATA_FAILED: {exc}",file=sys.stderr);return 1
    return 0

if __name__=='__main__':sys.exit(main())
