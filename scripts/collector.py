"""Free TWSE + TPEx EOD updater (no API key). Intended to run in GitHub Actions.

Usage: python scripts/collector.py --backfill 210
       python scripts/collector.py

Network access to the exchanges can be blocked, throttled, or changed; errors are NOT
swallowed into empty/counterfeit signals. No snapshot is published if markets are incomplete.
"""
import argparse
import csv
import io
import datetime as dt
import json
import logging
import math
import os
import random
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from html import unescape
from rules import build_snapshot
from trader import trader_overlay,apply_sector_relative_strength
from performance import update_diary
from market_quality import breadth
from risk_v22 import build_universe, published_fundamentals
from valuation_verified_v14 import enrich_verified_targets

ROOT = Path(__file__).resolve().parents[1]
HISTORY = ROOT / 'storage' / 'history.json'
SNAPSHOT = ROOT / 'data' / 'radar.json'
UNIVERSE = ROOT / 'data' / 'universe.json'
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


# Optional company fundamentals: official/public snapshots; never fabricate missing values.
FIN_SOURCES = (
 ('上市','revenue','https://openapi.twse.com.tw/v1/opendata/t187ap05_L','json'),
 ('上櫃','revenue','https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O','json'),
 ('上櫃','revenue','https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv','csv'),
 ('上市','valuation','https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL','json'),
 ('上市','income','https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci','json'),
 ('上櫃','income','https://mopsfin.twse.com.tw/opendata/t187ap06_O_ci.csv','csv'),
)


def financial_rows(url,kind):
    if kind=='json':
        data=get_json(url)
        return data if isinstance(data,list) else data.get('data',[]) if isinstance(data,dict) else []
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'text/csv,*/*'})
    with urllib.request.urlopen(req,timeout=35) as resp:raw=resp.read()
    for encoding in ('utf-8-sig','big5','cp950'):
        try:return list(csv.DictReader(io.StringIO(raw.decode(encoding))))
        except UnicodeDecodeError:continue
    raise RuntimeError('Cannot decode financial CSV')


def findval(row,*keys):
    for key in keys:
        value=row.get(key)
        if value is not None and str(value).strip() not in ('','--','-','N/A','—'):
            return value
    return None


def validnum(value,low=-1e12,high=1e12):
    x=num(value)
    return round(x,3) if x is not None and math.isfinite(x) and low<=x<=high else None


def financial_fields(kind,row):
    if kind=='revenue':
        period=str(findval(row,'資料年月','資料月份','年月') or '').strip()
        if not re.fullmatch(r'\d{5,6}',period):return None
        month=int(period[-2:]); year=int(period[:-2])+1911
        if not (2000<=year<=2100 and 1<=month<=12):return None
        return {'revenuePeriod':f'{year:04d}-{month:02d}',
                # Official open-data revenue amounts are in NT$1,000 (NOT NT$1).
                'revenueMonthThousand':validnum(findval(row,'營業收入-當月營收','當月營收'),0),
                'revenueCumThousand':validnum(findval(row,'累計營業收入-當月累計營收','當年累計營收'),0),
                'revenueYoY':validnum(findval(row,'營業收入-去年同月增減(%)','營業收入-去年同月增減％','當月營收較去年同期增減(%)'),-1000,10000),
                'revenueCumYoY':validnum(findval(row,'累計營業收入-前期比較增減(%)','累計營業收入-前期比較增減％','累計營收較去年同期增減(%)'),-1000,10000),
                'industry':str(findval(row,'產業別','產業類別') or '')[:60]}
    if kind=='valuation':
        date=str(findval(row,'Date') or '').strip()
        if not re.fullmatch(r'\d{7}',date):return None
        return {'valuationDate':f'{int(date[:3])+1911:04d}-{date[3:5]}-{date[5:]}',
                'pe':validnum(findval(row,'PEratio'),0,10000),
                'pb':validnum(findval(row,'PBratio'),0,10000),
                'dividendYield':validnum(findval(row,'DividendYield'),0,100)}
    if kind=='income':
        yy=str(findval(row,'年度','報表年度') or '').strip()
        season=str(findval(row,'季別','季度') or '').strip().replace('第','').replace('季','')
        if not (yy.isdigit() and season.isdigit() and int(season) in (1,2,3,4)):return None
        year=int(yy)+(1911 if int(yy)<1911 else 0)
        eps=validnum(findval(row,'基本每股盈餘（元）','基本每股盈餘(元)','基本每股盈餘'),-10000,10000)
        gross=validnum(findval(row,'營業毛利（毛損）','營業毛利(毛損)','營業毛利淨額（毛損）'))
        sales=validnum(findval(row,'營業收入','收入'))
        margin=round(gross/sales*100,2) if gross is not None and sales is not None and sales>0 else None
        return {'epsPeriod':f'{year}Q{int(season)}','eps':eps,'grossMargin':margin}
    return None


def enrich_financials(allstocks):
    # Update only valid official data; preserve previous fields after transient failures.
    fetched={}
    for market,kind,url,format_type in FIN_SOURCES:
        try:
            rows=financial_rows(url,format_type)
            if len(rows)<50:raise RuntimeError(f'incomplete financial response: {len(rows)} rows')
            count=0
            for row in rows:
                if not isinstance(row,dict):continue
                code=str(findval(row,'公司代號','股票代號','證券代號','Code','代號') or '').strip()
                stock=allstocks.get(market+code)
                if not stock:continue
                fields=financial_fields(kind,row)
                if not fields:continue
                previous=stock.setdefault('fundamentals',{})
                anchor='revenuePeriod' if kind=='revenue' else 'epsPeriod' if kind=='income' else 'valuationDate'
                # Prevent latest-request ordering or stale official response from overwriting newer values.
                if str(fields.get(anchor,'')) < str(previous.get(anchor,'')):continue
                for key,value in fields.items():
                    if value is not None and value!='':previous[key]=value
                count+=1
            fetched[market+':'+kind]=count
            LOG.info('Financial feed %s %s: %d matched stocks',market,kind,count)
        except Exception as ex:
            LOG.warning('Optional financial feed %s %s unavailable: %s',market,kind,ex)
    return fetched




def score_company(stock, candidate):
    """Transparent rule-based scores, not forecasts or probabilities. None if source missing."""
    f=dict(stock.get('fundamentals') or {})
    trade_date=candidate.get('date','')
    # Date parsing is independent of monthly revenue presence; EPS-only data remains valid.
    try: td=dt.date.fromisoformat(trade_date)
    except (TypeError,ValueError):td=None
    # Explicit freshness gates. Do not score a company using stale last-known facts.
    try:
        rd=dt.date.fromisoformat(str(f.get('revenuePeriod',''))+'-01')
        if td is None:raise ValueError('Invalid trade date')
        month_age=(td.year-rd.year)*12+td.month-rd.month
        # A prior month's public revenue is conservatively usable only from the 11th
        # of the following calendar month (not from month-end). This is an
        # availability assumption, NOT the company's exact announcement time.
        available_yr=rd.year + (1 if rd.month==12 else 0)
        available_mo=1 if rd.month==12 else rd.month+1
        public_from=dt.date(available_yr,available_mo,11)
        if td<public_from or month_age>3:
            f.pop('revenueYoY',None);f.pop('revenueCumYoY',None)
    except (ValueError,TypeError):
        f.pop('revenueYoY',None);f.pop('revenueCumYoY',None)
    try:
        vd=dt.date.fromisoformat(str(f.get('valuationDate','')))
        if td is None or (td-vd).days<0 or (td-vd).days>20:f.pop('pe',None)
    except (ValueError,TypeError):f.pop('pe',None)
    # Quarterly EPS is not evergreen. Never allow a stale/future report into ranking.
    try:
        period=str(f.get('epsPeriod',''))
        yr,q=int(period[:4]),int(period[-1])
        if len(period)!=6 or period[4]!='Q' or q not in (1,2,3,4):raise ValueError
        nextyear,nextmonth=(yr+1,1) if q==4 else (yr,q*3+1)
        quarter_end=dt.date(nextyear,nextmonth,1)-dt.timedelta(days=1)
        # Conservative regulatory-publication windows; no published-at timestamp
        # is available in the feed. Never use a quarter before this cutoff.
        if q==1: published_from=dt.date(yr,5,16)
        elif q==2: published_from=dt.date(yr,8,16)
        elif q==3: published_from=dt.date(yr,11,16)
        else: published_from=dt.date(yr+1,4,1)
        if td is None or td<published_from or (td-quarter_end).days > 245:
            f.pop('eps',None);f.pop('grossMargin',None)
    except (ValueError,TypeError,UnboundLocalError):
        f.pop('eps',None);f.pop('grossMargin',None)
    def scaled(value,tiers):
        if value is None:return None
        for minv,points in tiers:
            if value>=minv:return points
        return 0
    r1=scaled(f.get('revenueYoY'),[(40,25),(25,22),(15,18),(8,14),(0,9),(-10,4),(-1e9,0)])
    r2=scaled(f.get('revenueCumYoY'),[(30,25),(20,22),(12,18),(5,14),(0,9),(-10,4),(-1e9,0)])
    # EPS absolute amount and gross margin are not comparable across industries.
    # EPS is only a positive/breakeven/loss indicator until as-of YoY EPS exists.
    eps_value=f.get('eps')
    eps_quality=None if eps_value is None else 15 if eps_value>0 else 5 if eps_value==0 else 0
    weighted=[(25,r1),(25,r2),(15,eps_quality)]
    avail=sum(w for w,v in weighted if v is not None)
    earned=sum(v for w,v in weighted if v is not None)
    growth=round(earned / avail * 100) if avail>=50 and r1 is not None and r2 is not None else None
    pe=f.get('pe')
    pe_score=scaled(pe,[(0,0)]) if pe is not None else None
    if pe is not None and pe>0:
        pe_score=15 if pe<=12 else 12 if pe<=22 else 9 if pe<=35 else 5 if pe<=55 else 0
    tech=min(100,max(0,round(float(candidate.get('score') or 0)/1.45)))
    c_coverage=round(avail/65*100)
    if f.get('pe') is not None: c_coverage=min(100,c_coverage+12)
    bars=candidate.get('bars',[])
    ret20=round((bars[-1][4]/bars[-21][4]-1)*100,2) if len(bars)>20 and bars[-21][4]>0 else None
    penalties=0
    if candidate.get('overextended'): penalties+=15
    if ret20 is not None and ret20>=45: penalties+=15
    if candidate.get('distancePct') is not None and candidate['distancePct']>8:penalties+=10
    # Avoid ranking unverified low-coverage financial data as confirmed high-conviction picks.
    if growth is None:
        overall=None
        label='待基本面資料'
    else:
        weights=.40+.45+(.15 if pe_score is not None else 0)
        weighted_sum=.40*tech+.45*growth*(.7+.3*c_coverage/100)
        if pe_score is not None:weighted_sum+=.15*(pe_score/15*100)
        overall=max(0,min(100,round(weighted_sum/weights-penalties)))
        label='優先研究' if overall>=75 and c_coverage>=75 else '持續觀察' if overall>=60 and c_coverage>=60 else '謹慎追蹤'
    return {'technical':tech,'growth':growth,'overall':overall,'grade':label,
            'coverage':c_coverage,'valuation':None if pe_score is None else round(pe_score/15*100),
            'overheatPenalty':penalties,'return20Pct':ret20,
            'valuationMissing':pe_score is None,'valuationScored':pe_score is not None,
            'methodNote':'月營收年增與累計年增為主；EPS僅區分正負，不以EPS金額跨產業加分；毛利率僅展示',
            'datePolicy':'月營收至少次月11日、季報依保守揭露期限、本益比不得使用未來日期（並非實際公告時刻）'}

def run(days,delay,as_of=None):
    now=(dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()) if as_of is None else dt.date.fromisoformat(as_of)
    allstocks=read_existing()
    # Keep prospective signal diary when rebuilding/updating history.
    prior_history=json.loads(HISTORY.read_text('utf-8')) if HISTORY.exists() else {}
    historical_signals=prior_history.get('signalEvents',[])
    structure_journal=prior_history.get('structureJournal',{})
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
                stock['bars'].append(it['bar']);stock['bars'].sort(key=lambda b:b[0]);stock['bars']=stock['bars'][-780:]
            modified+=len(rows);known.add((market,stamp))
        LOG.info('%s TWSE/OTC records: %s/%s',stamp,len(fetched.get('上市',{})),len(fetched.get('上櫃',{})))
    # Preserve prior valid snapshot if no adequate history updated.
    if not allstocks:
        LOG.warning('No history acquired; keep APP in empty setup state')
        return
    financial_sources=enrich_financials(allstocks)
    snapshot=build_snapshot(allstocks)
    # The optional historical EPS/PER estimator is strictly bounded and cannot
    # prevent the technical EOD scan if its third-party source is unavailable.
    # Pick liquid/active official candidates, not all 1,900+ stocks per day.
    ranked_for_value=sorted(snapshot['candidates'], key=lambda c:(
        float(c.get('volumeRatio') or 0), float(c.get('changePct') or 0)), reverse=True)
    value_feed=enrich_verified_targets(allstocks,ranked_for_value,snapshot['asOf'])
    snapshot['valuationCoverage']={**value_feed,'method':'Optional FinMind EPS/PER × officially checked quarterly/revenue figures; research estimate only.'}
    # Unvalidated external institutional endpoints are deliberately disabled.
    # No claims about foreign/trust buying can be made without a source check.
    for c in snapshot['candidates']:
        st=allstocks.get(c['market']+c['code'],{})
        c['fundamentals']=published_fundamentals(st.get('fundamentals',{}),snapshot['asOf'])
        c['investment']=score_company(st,c)
        c['trading']=trader_overlay(c)
        c['institutional']=None
    apply_sector_relative_strength(allstocks,snapshot['candidates'],snapshot['asOf'])
    snapshot['marketBreadth']=breadth(allstocks,snapshot['asOf'])
    snapshot['institutionalCoverage']={
        'date':snapshot['asOf'], 'markets':{}, 'matchedToStockCount':0,
        'policy':'未經實際連線驗證的法人資料來源停用；不參與評分，不將缺資料當零。'
    }
    snapshot['fundamentalFeeds']=financial_sources
    snapshot['dataCoverage']={'officialIndustry':sum(bool((s.get('fundamentals') or {}).get('industry')) for s in allstocks.values()),
       'financialFeedTypes':list(financial_sources.keys()),'foreignInstitutional':'未接入；不參與評分',
       'investmentTrust':'未接入；不參與評分','internationalIndices':'未接入；不參與評分',
       'marketBreadth':'現有日K計算；非指數行情'}
    snapshot['financeRulesVersion']='finance-v2.1-date-safe'
    snapshot['traderRulesVersion']='trader-v2.1-risk'
    snapshot['performance'],updated_signals=update_diary(historical_signals,allstocks,snapshot['candidates'],snapshot['asOf'])
    snapshot['rankMethod']='V2.1: date-safe public fundamentals, historical overhead context, and separate entry/hold quality; external feeds excluded'
    snapshot['launchRulesVersion']='launch-v1.4'
    def rank_trade(c):
        t=c.get('trading',{});s=t.get('score')
        riskpenalty=100 if t.get('status')=='資料需核對' else 35 if t.get('status')=='不宜追價' else 20 if c.get('followStatus')=='假突破警戒' else 0
        growth=c.get('investment',{}).get('growth')
        return (s if s is not None else -100)+(12 if c.get('priceConfirmed') else 8 if c.get('followStatus')=='突破續強' else 4 if c.get('preLaunch') else 0)+(min(10,growth*.1) if growth is not None else 0)-riskpenalty
    snapshot['priorityTop60']=[{'code':c['code'],'market':c['market'],'priority':c['investment']['overall'],
                                'tradeScore':c['trading']['score'],'status':c['trading'].get('status')}
                               for c in sorted(snapshot['candidates'],key=rank_trade,reverse=True)[:60]]
    snapshot['generatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    universe=build_universe(allstocks,snapshot,snapshot['asOf'])
    snapshot['rulesVersion']='eod-v3.0.3-continuation'
    snapshot['rankMethod']='V3.0.3: recent neckline plus historical price-range continuation, early breakout and pullback tracked separately; EOD only'
    snapshot['performanceCaveat']='歷史績效日誌仍為舊版候選股規則，不能用來宣稱V2.5有獲利優勢；需另做樣本外、含交易成本回測'
    snapshot['universeCount']=universe['coverage']
    snapshot['unifiedCandidatesCount']=sum(x.get('unifiedStage') not in ('一般觀察','資料不足') for x in universe['rows'])
    snapshot['priorityTop60']=[{'code':x['code'],'market':x['market'],
      'tradeScore':x.get('unifiedScore'),'status':x.get('unifiedStage')}
      for x in sorted(universe['rows'],key=lambda x: (x.get('unifiedScore') if x.get('unifiedScore') is not None else -1), reverse=True)[:60]]
    # Safety: don't replace the public radar with partial market/insufficient history.
    # Keep raw observations for later recovery, but only write new public snapshot if healthy.
    if snapshot['mode']!='live':
        atomic_json(HISTORY,{'schema':1,'stocks':list(allstocks.values()),'signalEvents':historical_signals,'structureJournal':structure_journal})
        LOG.warning('BLOCKED public snapshot: market coverage/date inconsistent: %s',snapshot['marketAsOf'])
        return
    # Track stage CHANGES prospectively in source history (up to 90 events).
    # Do not manufacture observations for missed dates or recompute old results
    # with today's newer algorithm. A restart without history simply starts fresh.
    for row in universe['rows']:
        key=row['market']+row['code']
        record={'date':row['date'],'stage':row.get('unifiedStage'),
                'neck':row.get('neck'),'risk':row.get('riskLevel'),
                'score':row.get('unifiedScore'),
                'origin':(row.get('cycle') or {}).get('initialDate'),
                'strengthPhase':(row.get('continuationContext') or {}).get('kind'),
                'historicalBreakout':(row.get('continuationContext') or {}).get('breakoutDate')}
        events=structure_journal.setdefault(key,[])
        if events and events[-1]['date']==record['date']:
            events[-1]=record
        elif not events or events[-1].get('stage')!=record['stage'] or events[-1].get('neck')!=record['neck'] or events[-1].get('strengthPhase')!=record['strengthPhase']:
            events.append(record)
        if len(events)>90:del events[:-90]
        row['stageHistory']=events[-12:]
    atomic_json(HISTORY,{'schema':1,'stocks':list(allstocks.values()),'signalEvents':updated_signals,'structureJournal':structure_journal})
    atomic_json(UNIVERSE,universe)
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
