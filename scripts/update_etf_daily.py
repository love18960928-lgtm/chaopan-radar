#!/usr/bin/env python3
"""Build an independent, EOD-only TWSE ETF OHLCV feed for CHAOPAN RADAR.

Do not mix ETF bars into stock breakout/risk files.  This module works with
Python stdlib, never makes an intraday quote or modelled trading recommendation.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import logging
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

LOG = logging.getLogger('etf_eod')
SOURCE = 'TWSE STOCK_DAY official monthly EOD'
API = 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY'
URL_TPL = API + '?date={month}01&stockNo={code}&response=json'
VALID_CODE = re.compile(r'^0[0-9]{3,5}[A-Z]?$')
NUM = re.compile(r'^[+-]?[\d,]+(?:\.\d+)?$')
DATE = re.compile(r'^\d{2,3}/\d{1,2}/\d{1,2}$')
FIELDS = {'date':'日期','volume':'成交股數','open':'開盤價','high':'最高價','low':'最低價','close':'收盤價','delta':'漲跌價差'}


def num(value):
    v=str(value or '').strip().replace(' ', '').replace('＋','+').replace('－','-')
    if not NUM.fullmatch(v):return None
    return float(v.replace(',',''))


def roc_iso(value):
    if not DATE.fullmatch(str(value).strip()):return None
    try:
        y,m,d=(int(x) for x in str(value).split('/'))
        x=dt.date(y+1911,m,d)
    except (ValueError,TypeError):return None
    return x.isoformat()


def field_indexes(fields):
    norm=[str(x).replace(' ','').replace('（','(').replace('）',')') for x in fields]
    found={}
    for key,zh in FIELDS.items():
        hits=[i for i,f in enumerate(norm) if zh in f]
        if hits:found[key]=hits[0]
    if any(k not in found for k in ('date','volume','open','high','low','close')):
        raise ValueError('TWSE fields missing OHLCV columns: '+str(fields))
    return found


def parse_month(doc,code):
    if not isinstance(doc,dict):raise ValueError('TWSE response must be JSON object')
    stat=str(doc.get('stat',''))
    if stat!='OK':
        if not doc.get('data') and ('很抱歉' in stat or '沒有' in stat or '查無' in stat or '無符合' in stat):return []
        raise ValueError('TWSE STOCK_DAY stat not OK: '+repr(stat)[:140])
    title=str(doc.get('title',''))
    if title and code not in title:raise ValueError('TWSE title code mismatch: '+title[:100])
    if not isinstance(doc.get('fields'),list) or not isinstance(doc.get('data'),list):raise ValueError('TWSE columns/data missing')
    cols=field_indexes(doc['fields']);parsed=[]
    for row in doc['data']:
        if not isinstance(row,list) or max(cols.values())>=len(row):continue
        day=roc_iso(row[cols['date']]);vals={k:num(row[i]) for k,i in cols.items() if k!='date'}
        if not day or any(vals.get(k) is None for k in ('open','high','low','close','volume')):continue
        o,h,l,c,v=(vals[k] for k in ('open','high','low','close','volume'))
        if min(o,h,l,c)<=0 or v<0 or h<max(o,c,l) or l>min(o,c,h):continue
        # Source values are *shares*, not exchange lots.
        rec={'date':day,'open':o,'high':h,'low':l,'close':c,'volumeShares':int(v)}
        if vals.get('delta') is not None:rec['changeAmount']=vals['delta']
        parsed.append(rec)
    if doc.get('data') and not parsed:raise ValueError('Official response had records, but no valid price rows')
    return parsed


def get_json(url,timeout=20,retries=2,opener=urlopen):
    err=None
    for attempt in range(retries+1):
        try:
            req=Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; ChaopanRadar-ETF-EOD/1.0)','Accept':'application/json','Referer':'https://www.twse.com.tw/'})
            with opener(req,timeout=timeout) as response:
                body=response.read(8_000_000)
                return json.loads(body.decode('utf-8-sig'))
        except (HTTPError, URLError, TimeoutError, ConnectionError, OSError, UnicodeError, json.JSONDecodeError) as e:
            err=e
            if attempt<retries:time.sleep(1+attempt*2)
    raise RuntimeError(f'fetch failed: {url}: {err}')


def month_starts(now,months):
    y,m=now.year,now.month
    for k in range(months):
        mm=m-k
        yield f'{y+(mm-1)//12:04d}{(mm-1)%12+1:02d}'


def build_one(code,months,now,delay=0.7,fetch=get_json):
    by_day={};fail=[];matched_name=None
    for month in month_starts(now,months):
        url=URL_TPL.format(month=month,code=code)
        try:
            doc=fetch(url)
            records=parse_month(doc,code)
            title=str(doc.get('title',''))
            if title:
                match=re.search(r'\b'+re.escape(code)+r'\s+(.+?)\s+各日成交',title)
                if match:matched_name=match.group(1).strip()
            for rec in records:
                if rec['date']<=now.isoformat():by_day[rec['date']]=rec
        except Exception as e:
            fail.append(f'{month}: {str(e)[:110]}');LOG.warning('%s %s: %s',code,month,e)
        if delay>0:time.sleep(delay)
    bars=[by_day[d] for d in sorted(by_day)]
    if not bars:return None,fail
    latest=bars[-1];change=latest.get('changeAmount')
    if change is None and len(bars)>=2:change=round(latest['close']-bars[-2]['close'],6)
    previous=latest['close']-change if change is not None else None
    pct=100*change/previous if previous and previous>0 else None
    return {'code':code,'name':matched_name or code,'market':'上市','assetType':'ETF','source':SOURCE,
      'sourceUrl':URL_TPL.format(month=latest['date'][:7].replace('-',''),code=code),
      'latestDate':latest['date'],'close':latest['close'],'changeAmount':change,
      'changePct':round(pct,4) if pct is not None else None,'bars':[[b[k] for k in ('date','open','high','low','close','volumeShares')] for b in bars],
      'barCount':len(bars),'dataQuality':'verified_ohlcv' if len(bars)>=20 else 'short_history',
      'nav':None,'premiumDiscountPct':None,'dividends':None,'institutional':None},fail


def make_payload(codes,months,now,delay,fetch):
    rows=[];warnings=[]
    for code in codes:
        row,errors=build_one(code,months,now,delay,fetch)
        if row:rows.append(row)
        else:warnings.append(code+' 官方歷史K線未取得')
        if errors:warnings.append(code+' 部分月份無法取得，已保留有驗證的K線')
    if not rows:raise RuntimeError('沒有任何 ETF 取得官方日K，不發布空資料取代舊資料')
    as_of=max(row['latestDate'] for row in rows)
    return {'schema':1,'kind':'etf-official-eod','asOf':as_of,'source':SOURCE,
     'note':'ETF獨立行情；配息、法人、淨值未接入不填零。日K價為未還原歷史，不是報酬率。',
     'rows':rows,'warnings':warnings}


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config',default='data/etf-watchlist.json')
    ap.add_argument('--output',default='data/etf-daily.json')
    ap.add_argument('--months',type=int,default=9)
    ap.add_argument('--delay',type=float,default=0.9)
    ap.add_argument('--today',help='YYYY-MM-DD for offline tests')
    args=ap.parse_args(argv)
    if not 1<=args.months<=18 or not 0<=args.delay<=10:ap.error('months 1..18; delay 0..10')
    now=dt.date.fromisoformat(args.today) if args.today else dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    codes=json.loads(Path(args.config).read_text(encoding='utf-8'))['codes']
    if not isinstance(codes,list) or not codes or any(not isinstance(c,str) or not VALID_CODE.fullmatch(c) for c in codes):
        raise ValueError('ETF watchlist codes invalid')
    result=make_payload(list(dict.fromkeys(codes)),args.months,now,args.delay,get_json)
    dest=Path(args.output);dest.parent.mkdir(parents=True,exist_ok=True)
    temp=dest.with_suffix('.tmp')
    temp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    temp.replace(dest)
    print(f'ETF EOD asOf={result["asOf"]} rows={len(result["rows"])} warnings={len(result["warnings"])}')
    for row in result['rows']:print(f'  {row["code"]} {row["latestDate"]} {row["close"]} ({row["barCount"]}日K)')
    return 0

if __name__=='__main__':
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(message)s')
    sys.exit(main())
