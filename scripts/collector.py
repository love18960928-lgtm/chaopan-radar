"""Free TWSE + TPEx EOD updater (no API key). Intended to run in GitHub Actions.

Usage: python scripts/collector.py --backfill 210
       python scripts/collector.py

Network access to the exchanges can be blocked, throttled, or changed; errors are NOT
swallowed into empty/counterfeit signals. No snapshot is published if markets are incomplete.
"""
import argparse
import datetime as dt
import json
import logging
import os
import random
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from html import unescape
from rules import build_snapshot

ROOT = Path(__file__).resolve().parents[1]
HISTORY = ROOT / 'storage' / 'history.json'
SNAPSHOT = ROOT / 'data' / 'radar.json'
UA = 'Mozilla/5.0 (compatible; TaiwanEODResearch/1.0; personal research)'
LOG = logging.getLogger('collector')


def get_json(url):
    last=None
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json,text/plain,*/*','Referer':'https://www.twse.com.tw/'})
            with urllib.request.urlopen(req,timeout=27) as resp:
                raw=resp.read()
            if len(raw)>6_000_000: raise ValueError('Unexpectedly large response')
            return json.loads(raw.decode('utf-8-sig'))
        except (Exception) as ex:
            last=ex
            LOG.warning('Fetch failed attempt %d: %s %s',attempt+1,url[:90],ex)
            if attempt<2: time.sleep((attempt+1)*2 + random.random())
    raise RuntimeError(f'Cannot fetch: {url}: {last}')


def num(value):
    if value is None: return None
    if isinstance(value,(float,int)): return float(value)
    s=unescape(str(value)).replace(',','').replace(' ','').replace('\u3000','').replace('\xa0','')
    s=re.sub('<[^>]+>','',s).strip().replace('＋','+').replace('－','-')
    if s in ('','--','---','-','除息','除權','N/A'): return None
    try: return float(s)
    except ValueError: return None


def four_digits(x):
    return re.fullmatch(r'\d{4}',str(x).strip()) is not None and not str(x).strip().startswith('0')


def make_bar(date,code,name,market,opn,high,low,close,shares,next_limit=None):
    values=[num(n) for n in (opn,high,low,close,shares)]
    if not four_digits(code) or any(v is None or v<=0 for v in values):return None
    opn,high,low,close,shares=values
    if high<low or close>high+0.01 or close<low-0.01: return None
    return {'code':str(code).strip(),'name':str(name).strip(),'market':market,
            'bar':[date,round(opn,3),round(high,3),round(low,3),round(close,3),round(shares/1000,2),num(next_limit)]}


def parse_twse_rwd(resp,date):
    result={}
    if resp.get('stat')!='OK':return result
    for tbl in resp.get('tables',[]):
        fields=[str(x).strip() for x in tbl.get('fields',[])]
        if not all(k in fields for k in ('證券代號','證券名稱','開盤價','最高價','最低價','收盤價','成交股數')):continue
        ix={k:fields.index(k) for k in ('證券代號','證券名稱','開盤價','最高價','最低價','收盤價','成交股數')}
        for row in tbl.get('data',[]):
            try: item=make_bar(date,row[ix['證券代號']],row[ix['證券名稱']],'上市',row[ix['開盤價']],row[ix['最高價']],row[ix['最低價']],row[ix['收盤價']],row[ix['成交股數']])
            except (IndexError,TypeError):continue
            if item:result[item['code']]=item
        if result:break
    return result


def parse_otc_historical(resp,date):
    """TPEx historical JSON: data/aaData arrays in format code,name,close,change,open,high,low,shares,..."""
    result={}
    if not isinstance(resp,dict):return result
    records=resp.get('aaData') or resp.get('data') or resp.get('iData') or []
    for r in records:
        if isinstance(r,dict):
            code=r.get('代號') or r.get('SecuritiesCompanyCode') or r.get('Code')
            name=r.get('名稱') or r.get('CompanyName') or r.get('Name')
            it=make_bar(date,code,name,'上櫃',r.get('開盤') or r.get('Open'),r.get('最高') or r.get('High'),r.get('最低') or r.get('Low'),r.get('收盤') or r.get('Close'),r.get('成交股數') or r.get('TradingShares'),r.get('次日漲停價') or r.get('NextLimitUp'))
        elif isinstance(r,(list,tuple)) and len(r)>=8:
            # TPEx historical format: [股票代碼, 名稱, 收盤, 漲跌, 開盤, 最高, 最低, 成交股數, ...]
            it=make_bar(date,r[0],r[1],'上櫃',r[4],r[5],r[6],r[2],r[7],r[13] if len(r)>13 else None)
        else: it=None
        if it:result[it['code']]=it
    return result


def parse_otc_modern(resp,date):
    """TPEx newer /www/zh-tw/afterTrading/dailyQuotes response, columns selected by names."""
    result={}
    if not isinstance(resp,dict): return result
    for table in resp.get('tables',[]):
        fields=[str(x).strip().replace(' ','') for x in table.get('fields',[])]
        def col(*variants):
            for name in variants:
                for j,f in enumerate(fields):
                    if name == f: return j
            return None
        columns={
            'code':col('代號','股票代號','證券代號'),
            'name':col('名稱','股票名稱','證券名稱'),
            'open':col('開盤','開盤價'),
            'high':col('最高','最高價'),
            'low':col('最低','最低價'),
            'close':col('收盤','收盤價'),
            'shares':col('成交股數','成交股數(股)'),
            'next':col('次日漲停價'),
        }
        if any(columns[k] is None for k in ('code','name','open','high','low','close','shares')):continue
        for row in table.get('data',[]):
            try:
                r=lambda k:row[columns[k]] if columns[k] is not None else None
                item=make_bar(date,r('code'),r('name'),'上櫃',r('open'),r('high'),r('low'),r('close'),r('shares'),r('next'))
            except (IndexError,TypeError):continue
            if item:result[item['code']]=item
        if result:break
    return result


def parse_latest_twse(rows,expected):
    result={}
    if not isinstance(rows,list):return result
    for r in rows:
        if not isinstance(r,dict):continue
        d=str(r.get('Date','')).strip()
        if len(d)!=7 or not d.isdigit():continue
        actual=f'{int(d[:3])+1911:04d}-{d[3:5]}-{d[5:7]}'
        if actual!=expected:continue
        x=make_bar(expected,r.get('Code'),r.get('Name'),'上市',r.get('OpeningPrice'),r.get('HighestPrice'),r.get('LowestPrice'),r.get('ClosingPrice'),r.get('TradeVolume'))
        if x:result[x['code']]=x
    return result


def parse_latest_otc(rows,expected):
    result={}
    if not isinstance(rows,list):return result
    for r in rows:
        if not isinstance(r,dict):continue
        d=str(r.get('Date','')).strip()
        if len(d)!=7 or not d.isdigit():continue
        actual=f'{int(d[:3])+1911:04d}-{d[3:5]}-{d[5:7]}'
        if actual!=expected:continue
        x=make_bar(expected,r.get('SecuritiesCompanyCode'),r.get('CompanyName'),'上櫃',r.get('Open'),r.get('High'),r.get('Low'),r.get('Close'),r.get('TradingShares'),r.get('NextLimitUp'))
        if x:result[x['code']]=x
    return result


def fetch_market(date,market,allow_latest):
    ymd=date.replace('-','')
    if market=='上市':
        params=urllib.parse.urlencode({'date':ymd,'type':'ALLBUT0999','response':'json'})
        url=f'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?{params}'
        try: data=parse_twse_rwd(get_json(url),date)
        except Exception as ex:LOG.warning('TWSE historical request failed: %s',ex);data={}
        if len(data)>=700:return data
        if allow_latest:
            try: data=parse_latest_twse(get_json('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),date)
            except Exception as ex:LOG.warning('TWSE open data failed: %s',ex)
        return data
    roc=dt.date.fromisoformat(date)
    rocstr=f'{roc.year-1911}/{roc.month:02d}/{roc.day:02d}'
    # Modern TPEx whole-market historical daily report (preferred)
    modern=f'https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?{urllib.parse.urlencode({"response":"json","date":rocstr})}'
    try:
        data=parse_otc_modern(get_json(modern),date)
        if len(data)>=450:return data
    except Exception as ex:LOG.warning('TPEx modern historic request failed: %s',ex)
    params=urllib.parse.urlencode({'l':'zh-tw','d':rocstr,'se':'EW'})
    url=f'https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php?{params}'
    try: data=parse_otc_historical(get_json(url),date)
    except Exception as ex:LOG.warning('TPEx historical request failed: %s',ex);data={}
    if len(data)>=450:return data
    if allow_latest:
        try:data=parse_latest_otc(get_json('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes'),date)
        except Exception as ex:LOG.warning('TPEx open data failed: %s',ex)
    return data


def read_existing():
    if HISTORY.exists():
        try:
            data=json.loads(HISTORY.read_text('utf-8'))
            return {s['market']+s['code']:s for s in data.get('stocks',[])}
        except (ValueError,KeyError) as ex:raise RuntimeError('history.json invalid, refusing to overwrite') from ex
    return {}


def atomic_json(path,payload):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.new')
    temp.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    os.replace(temp,path)


def run(days,delay,as_of=None):
    now=(dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()) if as_of is None else dt.date.fromisoformat(as_of)
    allstocks=read_existing()
    known={(s['market'],row[0]) for s in allstocks.values() for row in s.get('bars',[])}
    if days>0:
        dates=[now-dt.timedelta(days=i) for i in range(days-1,-1,-1)]
    else:
        dates=[now-dt.timedelta(days=i) for i in range(6,-1,-1)]  # repair missed weekday/holiday jobs
    modified=0
    for date in dates:
        if date.weekday()>=5:continue
        stamp=date.isoformat()
        needed=[market for market in ('上市','上櫃') if (market,stamp) not in known]
        if not needed:continue
        fetched={}
        for market in needed:
            data=fetch_market(stamp,market,allow_latest=(date==now or date==now-dt.timedelta(days=1)))
            if len(data)<(700 if market=='上市' else 450):
                LOG.warning('%s %s ignored incomplete payload (%s records).',stamp,market,len(data))
            else:
                fetched[market]=data
            time.sleep(delay)
        for market,rows in fetched.items():
            for it in rows.values():
                key=market+it['code']
                stock=allstocks.setdefault(key,{'code':it['code'],'name':it['name'],'market':market,'bars':[]})
                stock['name']=it['name']
                stock['bars']=[b for b in stock['bars'] if b[0]!=stamp]
                stock['bars'].append(it['bar']);stock['bars'].sort(key=lambda b:b[0]);stock['bars']=stock['bars'][-190:]
            modified+=len(rows);known.add((market,stamp))
        LOG.info('%s TWSE/OTC records: %s/%s',stamp,len(fetched.get('上市',{})),len(fetched.get('上櫃',{})))
    # Preserve prior valid snapshot if no adequate history updated.
    if not allstocks:
        LOG.warning('No history acquired; keep APP in empty setup state')
        return
    atomic_json(HISTORY,{'schema':1,'stocks':list(allstocks.values())})
    snapshot=build_snapshot(allstocks)
    snapshot['generatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    atomic_json(SNAPSHOT,snapshot)
    LOG.info('Wrote %s records, %s eligible stocks, %s candidates on %s',modified,snapshot['eligibleCount'],snapshot['candidateCount'],snapshot['asOf'])


if __name__=='__main__':
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s')
    ap=argparse.ArgumentParser()
    ap.add_argument('--backfill',type=int,default=0,metavar='CALENDAR_DAYS',help='Backfill past N calendar days (e.g. 220)')
    ap.add_argument('--delay',type=float,default=1.1,help='Sleep between each market request')
    ap.add_argument('--as-of',help='Test date YYYY-MM-DD')
    args=ap.parse_args()
    run(args.backfill,max(.35,args.delay),args.as_of)
