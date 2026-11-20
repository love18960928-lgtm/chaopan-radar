#!/usr/bin/env python3
"""Collect TWSE official TAIEX daily OHLC and (optional) TWSE market volume.

Run from repository root; emits data/taiex-daily.json. Does not modify radar,
market-intel or any automatic-trading eligibility flags. Fails closed on missing
historical months instead of inventing bars or forward-filling days.
"""
import datetime as dt
import json
import os
from pathlib import Path
import random
import time
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE='https://www.twse.com.tw/rwd/zh/'
BACKUP='https://www.twse.com.tw/'
# TWSE's main historical TAIEX page uses the TAIEX endpoint; retain legacy
# indicesReport as a second official route when the current path is unavailable.
INDEX_PATHS=('TAIEX/MI_5MINS_HIST','indicesReport/MI_5MINS_HIST')

def roc_date(raw):
    value=str(raw).strip().replace('/', '').replace('-', '')
    if not value.isdigit() or len(value) not in (7,8):
        raise ValueError('Invalid ROC date '+str(raw))
    if len(value)==7:
        year=int(value[:3])+1911
        month=int(value[3:5]);day=int(value[5:7])
    else:
        year=int(value[:4]);month=int(value[4:6]);day=int(value[6:8])
    return dt.date(year,month,day).isoformat()

def num(v):
    if v is None or str(v).strip() in ('','--','-','N/A'):return None
    f=float(str(v).replace(',',''))
    if not (0<=f<1e16):return None
    return f

def monthly(month, report):
    params=urlencode({'date':month.strftime('%Y%m01'),'response':'json'})
    paths=INDEX_PATHS if report in INDEX_PATHS else (report,)
    errors=[]
    # Prefer the live TWSE rwd/zh/TAIEX route for the OHLC report.
    for path in paths:
        for root in (BASE,BACKUP):
            url=root+path+'?'+params
            for attempt in (0,1):
                try:
                    req=Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; ChaopanRadar-EOD/1.1)', 'Accept':'application/json'})
                    with urlopen(req,timeout=20) as resp:
                        raw=json.load(resp)
                    rows=raw.get('data') or []
                    if isinstance(rows,list) and rows and isinstance(rows[0],list):
                        monthly.last_index_path=path if path in INDEX_PATHS else getattr(monthly,'last_index_path',None)
                        return rows
                    errors.append(f'{url}: {raw.get("stat") or "missing rows"}')
                    break
                except (URLError,HTTPError,TimeoutError,ValueError,TypeError,KeyError) as exc:
                    errors.append(f'{url}: {str(exc)[:65]}')
                    if attempt==0:time.sleep(.5)
    raise RuntimeError('TWSE historical data unavailable: '+ '; '.join(errors[-5:]))

def months_back(today,count=9):
    out=[]
    y,m=today.year,today.month
    for _ in range(count):
        out.append(dt.date(y,m,1))
        m-=1
        if m==0:m=12;y-=1
    return list(reversed(out))

def parse_ohlc(rows):
    bars={}
    for row in rows:
        if not isinstance(row,list) or len(row)<5:continue
        day=roc_date(row[0]); vals=[num(x) for x in row[1:5]]
        if any(v is None or v<=0 for v in vals):continue
        o,h,l,c=vals
        if h<max(o,c) or l>min(o,c) or l>h:raise ValueError('TWSE OHLC invalid '+day)
        if day in bars and bars[day]!=[o,h,l,c]:raise ValueError('TWSE duplicate mismatch '+day)
        bars[day]=[o,h,l,c]
    return bars

def parse_volume(rows,index_closes):
    volumes={}
    for row in rows:
        if not isinstance(row,list) or len(row)<5:continue
        day=roc_date(row[0]);v=num(row[1]);idx=num(row[4]);cl=index_closes.get(day)
        # FMTQIK includes TAIEX closing index in column 5; verify cross-report.
        if v is not None and cl is not None and idx is not None and abs(idx-cl)<0.06:
            volumes[day]=int(v)
    return volumes

def produce(today=None,fetcher=monthly):
    today=today or dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    price={};market_vol={};processed=[];failures=[];price_paths=[]
    for month in months_back(today):
        try:
            part=parse_ohlc(fetcher(month,'TAIEX/MI_5MINS_HIST'))
            price_paths.append(getattr(fetcher,'last_index_path','TAIEX/MI_5MINS_HIST'))
            price.update(part);processed.append(month.strftime('%Y-%m'))
        except Exception as exc:
            failures.append(str(exc)[:180]);continue
        try:
            volume_rows=fetcher(month,'exchangeReport/FMTQIK')
            market_vol.update(parse_volume(volume_rows,{d:row[3] for d,row in part.items()}))
        except Exception:
            pass  # volume is optional. Never fabricate it.
    if len(price)<45:raise RuntimeError(f'Only {len(price)} official TAIEX OHLC bars available, 45 required; {failures[:3]}')
    sorted_dates=sorted(d for d in price if d<=today.isoformat())
    bars=[[d,*price[d],market_vol.get(d)] for d in sorted_dates[-200:]]
    last=bars[-1][0]
    # Conservative freshness guard: stale collectors may preserve a visible
    # historical graph, but must not claim today's same-day market validation.
    if (today-dt.date.fromisoformat(last)).days>7:
        raise RuntimeError('Official index source is over 7 calendar days old; refusing overwrite')
    return {'schema':'chaopan-taiex-daily-v1',
            'source':'TWSE/'+('TAIEX/MI_5MINS_HIST' if 'TAIEX/MI_5MINS_HIST' in price_paths else 'indicesReport/MI_5MINS_HIST'),
            'volumeSource':'TWSE/exchangeReport/FMTQIK (aligned where verified)',
            'asOf':last, 'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
            'bars':bars,'months':processed,'missingMonths':failures}

def main():
    obj=produce()
    path=Path('data/taiex-daily.json');path.parent.mkdir(exist_ok=True,parents=True)
    tmp=path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    os.replace(tmp,path)
    print('TWSE TAIEX official OHLC:',obj['asOf'],len(obj['bars']),'bars',sum(b[5] is not None for b in obj['bars']),'volume matches')
if __name__=='__main__':main()
