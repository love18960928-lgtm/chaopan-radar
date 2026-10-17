"""Official EOD ancillary feed with strict as-of and missing-data semantics.

Do not guess the meaning of brokerage branches, infer short positions, or mix
an index's latest date with a different date's institutional-flow data.
This optional task cannot break the existing price-volume collector.
"""
import argparse
import csv
import io
import datetime as dt
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.error
import json
import logging
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

LOG = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'data' / 'market-intel.json'
SCHEMA = 'chaopan.market.v311'

def number(value):
    if isinstance(value, bool) or value is None: return None
    try:
        x = float(str(value).replace(',', '').replace('＋', '+').replace('−', '-').replace('－', '-').strip())
        return x if -1e16 < x < 1e16 else None
    except (ValueError, TypeError): return None

def date_iso(value):
    """Normalise ISO/Gregorian/ROC source dates without confusing YYYY/MM/DD with ROC.

    TPEx and TWSE sources use both full Gregorian and ROC 3-digit dates.
    Handle YYYY/MM/DD before ROC substring matching; reject invalid dates.
    """
    s = str(value or '').strip()
    # Full Gregorian dates, including calendar dates inside published headers.
    m = re.search(r'(?<!\d)(\d{4})[年/\-.](\d{1,2})[月/\-.](\d{1,2})(?:日)?(?!\d)', s)
    if m:
        y, mo, d = map(int, m.groups())
    else:
        # Republic-of-China date with separators, optionally inside a header.
        m = re.search(r'(?<!\d)(\d{2,3})[年/\-.](\d{1,2})[月/\-.](\d{1,2})(?:日)?(?!\d)', s)
        if m:
            y, mo, d = map(int, m.groups()); y += 1911
        else:
            m = re.fullmatch(r'(\d{3})(\d{2})(\d{2})', s)
            if m:
                y, mo, d = map(int, m.groups()); y += 1911
            else:
                m = re.fullmatch(r'(\d{4})(\d{2})(\d{2})', s)
                if not m: return None
                y, mo, d = map(int, m.groups())
    try:
        return dt.date(y, mo, d).isoformat()
    except ValueError:
        return None

def twse_t86(payload, target):
    """Parse the named-column TWSE T86; figures are in shares, not lots."""
    if not isinstance(payload,dict) or payload.get('stat') not in (None,'OK'):return {}
    dated=date_iso(payload.get('date') or payload.get('title'))
    if dated != target: return {}
    columns=payload.get('fields') or []
    rows=payload.get('data') or []
    def index(*patterns):
        for pat in patterns:
            for j,key in enumerate(columns):
                if pat in str(key):return j
        return None
    col=index('證券代號','股票代號')
    name_col=index('證券名稱','股票名稱','名稱')
    fr=index('外陸資買賣超股數(不含外資自營商)','外陸資買賣超股數')
    tr=index('投信買賣超股數')
    dl=index('自營商買賣超股數')
    if None in (col,fr,tr,dl):return {}
    result={}
    for row in rows:
        if not isinstance(row,list) or len(row)<=max(col,fr,tr,dl):continue
        code=str(row[col]).strip()
        if not re.fullmatch(r'(?:\d{4}|0\d{4,5}[A-Z]?)',code):continue
        vals=[number(row[i]) for i in (fr,tr,dl)]
        if any(v is None for v in vals):continue
        label=str(row[name_col]).strip() if name_col is not None and len(row)>name_col else ''
        record={'date':target,'foreignLots':round(vals[0]/1000,3),'trustLots':round(vals[1]/1000,3),'dealerLots':round(vals[2]/1000,3),'source':'TWSE T86','broker':None}
        if label and label not in ('-', '—', 'None'):record['name']=label
        result['上市-'+code]=record
    return result

def tpex_3insti(payload, target):
    """Accept only explicitly recognised, day-stamped official TPEx fields."""
    if not isinstance(payload,list):return {}
    result={}
    keys={'code':('證券代號','股票代號','SecuritiesCompanyCode','SecuritiesCode'),
          'foreign':('外資及陸資買賣超股數','外資及陸資買賣超','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference'),
          'trust':('投信買賣超股數','投信買賣超','SecuritiesInvestmentTrustCompanies-Difference'),
          'dealer':('自營商買賣超股數合計','自營商買賣超股數','自營商買賣超','Dealers-Difference'),
          'date':('資料日期','日期','Date','TradeDate'),
          'name':('證券名稱','股票名稱','名稱','SecuritiesCompanyName','CompanyName','Name')}
    def pick(row, names):
        for name in names:
            if name in row:return row[name]
        return None
    for row in payload:
        if not isinstance(row,dict) or date_iso(pick(row,keys['date']))!=target:continue
        code=str(pick(row,keys['code']) or '').strip()
        if not re.fullmatch(r'(?:\d{4}|0\d{4,5}[A-Z]?)',code):continue
        vals=[number(pick(row,keys[k])) for k in ('foreign','trust','dealer')]
        if any(v is None for v in vals):continue
        label=str(pick(row,keys['name']) or '').strip()
        record={'date':target,'foreignLots':round(vals[0]/1000,3),'trustLots':round(vals[1]/1000,3),'dealerLots':round(vals[2]/1000,3),'source':'TPEx 3insti','broker':None}
        if label and label not in ('-', '—', 'None'):record['name']=label
        result['上櫃-'+code]=record
    return result

def twse_fmtqik(payload,target):
    if not isinstance(payload,dict) or payload.get('stat') not in (None,'OK'):return None
    fields=payload.get('fields') or []
    for row in payload.get('data') or []:
        if not isinstance(row,list) or len(row)!=len(fields):continue
        d=date_iso(row[0]);label=str(fields[0])
        if d!=target or ('日期' not in label and 'date' not in label.lower()):continue
        j=next((i for i,k in enumerate(fields) if '發行量加權股價指數' in str(k) or '加權股價指數' in str(k)),None)
        k=next((i for i,k in enumerate(fields) if '漲跌點數' in str(k) or '漲跌點' in str(k)),None)
        if j is None or k is None:continue
        close=number(row[j]);change=number(row[k]);
        if close is None or change is None or close-change<=0:continue
        return {'date':target,'close':close,'change':change,'pct':round(change/(close-change)*100,2),'source':'TWSE FMTQIK'}
    return None


def twse_bfi(payload,target):
    """Official cash net-buy totals: per row NTD, convert to NTD 100m (億元)."""
    if not isinstance(payload,dict) or payload.get('stat') not in (None,'OK') or date_iso(payload.get('date') or payload.get('title'))!=target:
        return None
    fields=payload.get('fields') or []
    name_idx=next((j for j,f in enumerate(fields) if '單位名稱' in str(f)),None)
    net_idx=next((j for j,f in enumerate(fields) if '買賣差額' in str(f)),None)
    if None in (name_idx,net_idx):return None
    v={'foreign':None,'trust':None,'dealerSelf':None,'dealerHedge':None}
    for row in payload.get('data') or []:
        if not isinstance(row,list) or len(row)<=max(name_idx,net_idx):continue
        label=str(row[name_idx]);amount=number(row[net_idx]);
        if amount is None:continue
        if label.startswith('外資及陸資'):v['foreign']=amount
        elif label.strip()=='投信':v['trust']=amount
        elif '自營商' in label and '自行' in label:v['dealerSelf']=amount
        elif '自營商' in label and '避險' in label:v['dealerHedge']=amount
    if any(x is None for x in v.values()):return None
    return {'date':target,'unit':'億元','foreign':round(v['foreign']/1e8,3),
            'trust':round(v['trust']/1e8,3),'dealer':round((v['dealerSelf']+v['dealerHedge'])/1e8,3),
            'dealerSelf':round(v['dealerSelf']/1e8,3),'dealerHedge':round(v['dealerHedge']/1e8,3),'source':'TWSE BFI82U'}

def taifex_tx(payload,target):
    """Report only when fields positively identify daytime TX near-month close."""
    if not isinstance(payload,list):return None
    candidates=[]
    for row in payload:
        if not isinstance(row,dict):continue
        def get(*names):
            for n in names:
                if n in row:return str(row[n]).strip()
            return ''
        date=date_iso(get('交易日期','TradeDate','Date'))
        product=get('商品代號','商品','Product','ProductCode','Contract')
        session=get('交易時段','TradingSession','Session')
        contract=get('到期月份(週別)','到期月份','ContractMonth(Week)','ContractMonth')
        if date!=target or product not in ('TX','臺股期貨','台股期貨') or session not in ('一般','一般交易時段','日盤','Regular','0') or not re.match(r'^\d{6}$',contract):continue
        close=number(get('Last','收盤價','最後成交價','ClosingPrice','Close'))
        change=number(get('漲跌價','漲跌','Change'))
        if close is None or change is None or close-change<=0:continue
        candidates.append((contract,{'date':target,'close':close,'change':change,'pct':round(change/(close-change)*100,2),'contract':contract,'session':'日盤','source':'TAIFEX DailyMarketReportFut'}))
    return min(candidates,key=lambda x:x[0])[1] if candidates else None

def twse_margin(payload,target):
    """TWSE MI_MARGN day-identified, 4-digit common shares only.

    Table has repeated column names under 融資 and 融券: take first and second
    exact pairs, with the published unit 張. Report current-day balance as
    preliminary until next-day institution corrections are incorporated.
    """
    if not isinstance(payload,dict) or payload.get('stat') not in (None,'OK') or date_iso(payload.get('date'))!=target:return {}
    for table in payload.get('tables') or []:
        if not isinstance(table,dict):continue
        fields=[str(x).strip() for x in table.get('fields') or []]
        balances=[i for i,f in enumerate(fields) if f=='今日餘額']
        priors=[i for i,f in enumerate(fields) if f=='前日餘額']
        if len(balances)!=2 or len(priors)!=2 or '代號' not in fields:continue
        ci=fields.index('代號');out={}
        for row in table.get('data') or []:
            if not isinstance(row,list) or len(row)<=max(ci,*balances,*priors):continue
            code=str(row[ci]).strip()
            if not re.fullmatch(r'(?:\d{4}|0\d{4,5}[A-Z]?)',code):continue
            vals=[number(row[i]) for i in [priors[0],balances[0],priors[1],balances[1]]]
            if any(v is None or v<0 for v in vals):continue
            out['上市-'+code]={
                'date':target,'marginPreviousLots':vals[0],'marginLots':vals[1],
                'shortPreviousLots':vals[2],'shortLots':vals[3],
                'marginDeltaLots':vals[1]-vals[0],'shortDeltaLots':vals[3]-vals[2],
                'provisional':True,'source':'TWSE MI_MARGN'}
        if out:return out
    return {}

def tpex_otc_index(payload, target):
    """Strictly verify TPEx OTC index as-of; percent is optional.

    Official public historical columns include date, open, high, low, close,
    change, and do not necessarily include a percent column. This parser
    supports the named table representation and single-index dated records.
    Unknown dates and inconsistent numbers never become a trading signal.
    """
    def col_index(fields, names):
        for name in names:
            for index, field in enumerate(fields):
                if str(field).strip() == name:
                    return index
        return None

    def change_number(raw):
        if raw is None: return None
        result = number(raw)
        if result is not None: return result
        label = str(raw).strip()
        sign = -1 if ('▼' in label or '▽' in label or '跌' in label or label.startswith(('-', '−', '－'))) else 1
        cleaned = re.sub(r'[▲△▼▽＋+\-－−,\s]', '', label)
        parsed = number(cleaned)
        return sign * parsed if parsed is not None else None

    def verified(close_raw, change_raw, pct_raw, published, source):
        if date_iso(published) != target:
            return None
        close, change = number(close_raw), change_number(change_raw)
        if close is None or change is None or close <= 0 or close - change <= 0:
            return None
        computed = round(100 * change / (close - change), 2)
        if pct_raw not in (None, '', '--', '—'):
            given = number(str(pct_raw).rstrip('%％'))
            if given is not None and abs(given - computed) > 0.25:
                return None
        return {'date':target, 'close':close, 'change':change,
                'pct':computed, 'source':source}

    if isinstance(payload, dict):
        published = payload.get('date') or payload.get('Date') or payload.get('reportDate')
        for table in (payload.get('tables') or []):
            if not isinstance(table, dict): continue
            fields = table.get('fields') or []
            if not isinstance(fields, list): continue
            label_i=col_index(fields,('指數','指數名稱','名稱'))
            close_i=col_index(fields,('收市指數','收市','收盤指數','收盤'))
            change_i=col_index(fields,('漲跌點數','指數漲跌','漲跌'))
            pct_i=col_index(fields,('漲跌幅(%)','漲跌幅%','漲跌百分比','漲跌幅'))
            date_i=col_index(fields,('資料日期','日期','交易日期'))
            if close_i is None or change_i is None: continue
            for row in (table.get('data') or []):
                if not isinstance(row,list) or len(row)!=len(fields):continue
                if label_i is not None:
                    label=str(row[label_i]).strip()
                    if label not in ('櫃買指數','櫃買指數(OTC)','上櫃指數'):
                        continue
                # A table with no explicit index label must have a matching
                # published date and a unique row; otherwise its identity is
                # ambiguous and we must reject it.
                elif len(table.get('data') or [])!=1:
                    continue
                day=row[date_i] if date_i is not None else published
                result=verified(row[close_i],row[change_i],
                                row[pct_i] if pct_i is not None else None,
                                day,'TPEx indexSummary')
                if result:return result
        # Public historical feed might be a single dated record.
        row=payload
        day=row.get('資料日期') or row.get('日期') or published
        name=row.get('指數名稱') or row.get('指數') or '櫃買指數'
        if name in ('櫃買指數','上櫃指數'):
            return verified(row.get('收市') or row.get('收市指數'),
                            row.get('漲跌') or row.get('指數漲跌'),
                            row.get('漲跌幅'),day,'TPEx dated OTC record')
    elif isinstance(payload,list):
        for row in payload:
            if not isinstance(row,dict):continue
            day=row.get('資料日期') or row.get('日期') or row.get('Date')
            if row.get('指數名稱') not in (None,'櫃買指數','上櫃指數'):
                continue
            result=verified(row.get('收市') or row.get('收市指數'),
                            row.get('漲跌') or row.get('指數漲跌'),
                            row.get('漲跌幅'),day,'TPEx historical OTC')
            if result:return result
    return None

def tpex_otc_historical_csv(raw, target):
    """Fallback official open-data CSV: 日期/開市/最高/最低/收市/漲跌.

    Open-data dataset 11391 links to TPEx /www/zh-tw/indexInfo/inx?response=data.
    Never choose the last row, website crawl date, or the request day as an
    implied source date: the *record* must explicitly match target.
    """
    if not isinstance(raw, str) or len(raw) > 6_000_000:
        return None
    fields = None
    rows = csv.reader(io.StringIO(raw.lstrip('\ufeff')))
    for raw_row in rows:
        row = [str(v).replace('\ufeff', '').strip() for v in raw_row]
        if not row or not any(row):
            continue
        if fields is None:
            if any(h in row for h in ('資料日期', '日期')) and any(h in row for h in ('收市', '收市指數', '收盤')):
                fields = row
            continue
        if len(row) < len(fields):
            continue
        rec = dict(zip(fields,row))
        day = date_iso(rec.get('資料日期') or rec.get('日期'))
        if day != target:
            continue
        close = number(rec.get('收市') or rec.get('收市指數') or rec.get('收盤'))
        change_text = rec.get('漲跌') or rec.get('指數漲跌')
        change = number(change_text)
        if change is None and change_text:
            label = str(change_text).strip()
            if re.match(r'^[▼▽△▲]', label):
                mag = number(label[1:])
                change = (-1 if label.startswith(('▼','▽')) else 1)*mag if mag is not None else None
        if close is None or change is None or close <= 0 or close-change <= 0:
            return None
        return {'date':target,'close':close,'change':change,
                'pct':round(100*change/(close-change),2),
                'source':'TPEx official open-data index history CSV'}
    return None


def fetch_official_csv(url, timeout=8):
    """Bounded, optional official-source fallback; reject HTML denial pages."""
    req=urllib.request.Request(url, headers={
        'User-Agent':'Mozilla/5.0 (compatible; ChaopanRadar/3.1.1; public daily EOD)',
        'Accept':'text/csv,text/plain;q=0.9,*/*;q=0.2'})
    with urllib.request.urlopen(req,timeout=timeout) as response:
        if response.status != 200:
            raise IOError('TPEx historical CSV HTTP '+str(response.status))
        raw = response.read(6_000_001)
    if len(raw)>6_000_000:
        raise ValueError('TPEx CSV exceeds bounded size')
    for encoding in ('utf-8-sig','cp950'):
        try:
            data=raw.decode(encoding)
            if '<html' in data[:200].lower() or '<!doctype' in data[:200].lower():
                raise ValueError('TPEx returned HTML rather than CSV')
            return data
        except UnicodeDecodeError:
            continue
    raise ValueError('TPEx CSV encoding unrecognised')


def fetch_json(url, timeout=9):
    """Two bounded attempts for transient official API errors; never invent data."""
    req=urllib.request.Request(url,headers={
        'User-Agent':'Mozilla/5.0 (compatible; ChaopanRadar/3.1.1; public daily EOD)',
        'Accept':'application/json'})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req,timeout=timeout) as response:
                if response.status!=200:raise IOError('HTTP status '+str(response.status))
                raw=response.read(14000001)
                if len(raw)>14000000:raise ValueError('JSON payload too large')
            return json.loads(raw)
        except (urllib.error.URLError,TimeoutError,OSError) as err:
            if attempt:raise
            LOG.warning('Retry official feed after %s',type(err).__name__)
            time.sleep(.45)

def build(target, fetch=fetch_json, text_fetch=None):
    """Check independent official sources concurrently (max 3 at once).

    One slow/blocked endpoint must not delay all the other endpoints. Sources
    expose per-feed health; partial data is explicitly marked as such.
    """
    compact=target.replace('-','')
    urls={
      'twse_t86':f'https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date={compact}&selectType=ALLBUT0999',
      'tpex':'https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading',
      'taiex':f'https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?response=json&date={compact}',
      'twse_bfi':f'https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json&dayDate={compact}&type=day',
      'tx':'https://openapi.taifex.com.tw/v1/DailyMarketReportFut',
      'twse_margin':f'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={compact}&response=json&selectType=ALL',
      'otc':f'https://www.tpex.org.tw/www/zh-tw/afterTrading/indexSummary?date={int(target[:4])-1911}/{target[5:7]}/{target[8:10]}&response=json',
    }
    out={'schema':SCHEMA,'asOf':target,'indices':{},'institutional':{},'stocks':{},'coverage':{},
         'sources':{},'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
         'notice':'官方盤後來源獨立核對交易日；未取得資料不推估，可能部分來源失敗。'}
    mapping={'twse_t86':lambda x:twse_t86(x,target),
             'tpex':lambda x:tpex_3insti(x,target),
             'taiex':lambda x:twse_fmtqik(x,target),
             'twse_bfi':lambda x:twse_bfi(x,target),
             'tx':lambda x:taifex_tx(x,target),
             'twse_margin':lambda x:twse_margin(x,target),
             'otc':lambda x:tpex_otc_index(x,target)}
    def task(key,url):
        began=time.monotonic()
        try:
            result=mapping[key](fetch(url))
            ok=bool(result)
            return key,result,{'status':'ok' if ok else 'invalid','durationMs':round((time.monotonic()-began)*1000),
                               'detail': '通過日期和格式驗證' if ok else '官方資料空白、欄位不合或交易日不符'}
        except Exception as err:
            return key,None,{'status':'error','durationMs':round((time.monotonic()-began)*1000),
                             'detail':type(err).__name__}
    results={}
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures=[pool.submit(task,key,url) for key,url in urls.items()]
        for f in as_completed(futures):
            key,data,health=f.result();results[key]=(data,health)
    for key in urls:
        data,health=results[key]
        out['sources'][key]=health
        LOG.info('%s status=%s count=%s durationMs=%s',key,health['status'],len(data) if isinstance(data,dict) else bool(data),health['durationMs'])
        if key=='twse_margin':
            if data:out.setdefault('margin',{}).update(data)
            out['coverage'][key]=len(data or {})
        elif key=='twse_bfi':
            if data:out['institutional']['listed']=data
            out['coverage'][key]=bool(data)
        elif key in ('twse_t86','tpex'):
            if data:out['stocks'].update(data)
            out['coverage'][key]=len(data or {})
        else:
            if data:out['indices'][{'taiex':'taiex','tx':'taifex','otc':'otc'}.get(key,key)]=data
            out['coverage'][key]=bool(data)
    # The public indexSummary endpoint sometimes changes response shape or is
    # blocked by the cloud runner. Fall back ONLY to the independently dated
    # TPEx open-data index-history CSV, never to an undated third-party quote.
    # An injected JSON fetch in tests does not silently perform real network IO.
    if not out['indices'].get('otc') and (text_fetch is not None or fetch is fetch_json):
        csv_source=text_fetch if text_fetch is not None else fetch_official_csv
        fallback_url='https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?response=data'
        began=time.monotonic()
        try:
            recovered=tpex_otc_historical_csv(csv_source(fallback_url),target)
            if recovered:
                out['indices']['otc']=recovered
                out['coverage']['otc']=True
                out['sources']['otc_primary']=out['sources']['otc']
                out['sources']['otc']={'status':'ok','durationMs':round((time.monotonic()-began)*1000),
                                     'detail':'櫃買官方歷史CSV備援，同交易日已驗證'}
            else:
                out['sources']['otc_fallback']={'status':'invalid','detail':'官方歷史CSV未找到同交易日完整指數資料'}
        except Exception as exc:
            detail=type(exc).__name__
            if isinstance(exc,urllib.error.HTTPError):
                detail+=' HTTP '+str(exc.code)
            out['sources']['otc_fallback']={'status':'error','detail':detail}
            LOG.warning('TPEx index history fallback unsuccessful: %s',detail)
    return out


# r9: official daily OHLCV for listed ETFs appearing in the institutional top-20.
# Keep ETF history separate from the ordinary-equity breakout universe: no
# stock breakout labels or trading alerts may be transferred to ETF rows.
def parse_twse_etf_month(payload, code, month, target):
    """Validate TWSE STOCK_DAY monthly bars; TWSE volume is SHARES."""
    if not isinstance(payload, dict) or payload.get('stat') != 'OK':
        return []
    # A monthly endpoint returns an entire month even for weekend queries.
    # Do not mistake its request date for the final daily trading date.
    title = str(payload.get('title') or '')
    if code not in title and str(payload.get('stockNo') or '') != code:
        return []
    bars = []
    for row in payload.get('data') or []:
        if not isinstance(row, list) or len(row) < 7:
            continue
        day = date_iso(row[0])
        if not day or not day.startswith(month) or day > target:
            continue
        o,h,l,c,shares = (number(row[3]),number(row[4]),number(row[5]),number(row[6]),number(row[1]))
        if any(v is None or v <= 0 for v in (o,h,l,c,shares)) or not (l<=o<=h and l<=c<=h):
            continue
        bars.append([day, o, h, l, c, round(shares / 1000,3)])
    return sorted({b[0]: b for b in bars}.values(), key=lambda b:b[0])


def month_starts(as_of, count=6):
    y,m=map(int,as_of[:7].split('-'))
    out=[]
    for _ in range(count):
        out.append(f'{y:04d}-{m:02d}')
        m-=1
        if m==0:y-=1;m=12
    return list(reversed(out))


def build_etf_histories(intel, target, old=None, fetch=fetch_json, max_etfs=40):
    """Optional enrichment. Never fail the base market-intel update."""
    if intel.get('asOf')!=target:return {}
    # ETF charts only for the actual displayed institutional top-20 per side,
    # not for an arbitrary set of funds with the largest absolute flows.
    available=[]
    for ident, rec in (intel.get('stocks') or {}).items():
        if rec.get('date') != target:
            continue
        vals=[number(rec.get(k)) for k in ('foreignLots','trustLots','dealerLots')]
        if any(v is None for v in vals):
            continue
        available.append((sum(vals),ident,rec))
    buys=sorted((x for x in available if x[0]>0),key=lambda x:-x[0])[:20]
    sells=sorted((x for x in available if x[0]<0),key=lambda x:x[0])[:20]
    chosen=[(abs(flow),ident,rec) for flow,ident,rec in buys+sells
            if re.fullmatch(r'上市-0\d{3,5}[A-Z]?', ident)][:max_etfs]
    cached=(old or {}).get('etfOHLCV') or {}
    months=month_starts(target)
    result={}
    def scan(pair):
        _,ident,rec=pair;code=ident.split('-')[1]
        prior=cached.get(ident) or {}
        prior_bars=prior.get('bars') or []
        collected={b[0]:b for b in prior_bars if isinstance(b,list) and len(b)==6 and isinstance(b[0],str) and b[0]<=target}
        fetched=0
        for month in months:
            # Always recheck current month, to pick up the new trading day.
            if month != target[:7] and sum(b[0].startswith(month) for b in collected.values())>=12:
                continue
            url=('https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?'
                 +urllib.parse.urlencode({'date':month.replace('-','')+'01','stockNo':code,'response':'json'}))
            try:
                part=parse_twse_etf_month(fetch(url),code,month,target)
            except (OSError,ValueError,TypeError,KeyError) as error:
                LOG.warning('ETF %s %s fetch failed: %s',code,month,type(error).__name__)
                continue
            for b in part:collected[b[0]]=b
            fetched+=bool(part)
        bars=sorted(collected.values(),key=lambda b:b[0])[-135:]
        if not bars:return ident,None
        # Listing metadata is indicative only. A chart may NOT claim current
        # as-of unless the latest confirmed daily bar matches that date.
        item={'name':rec.get('name') or prior.get('name') or '', 'market':'上市',
              'bars':bars,'latestDate':bars[-1][0],
              'source':'TWSE STOCK_DAY（日收盤，成交量單位張）'}
        return ident,item
    with ThreadPoolExecutor(max_workers=4) as pool:
        for ident,item in pool.map(scan,chosen):
            if item:result[ident]=item
    LOG.info('ETF listed historical charts: %d / %d; source may be incomplete',len(result),len(chosen))
    return result

def save(out, path=DEST):
    if not out['stocks'] and not out['indices'] and not out['institutional'] and not out.get('margin'):
        LOG.warning('No verified source passed; retaining existing JSON.');return False
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.is_file():
        try:
            old=json.loads(path.read_text('utf8'))
            if old.get('asOf','')>out['asOf']:
                LOG.warning('Refuse older snapshot: %s < %s',out['asOf'],old['asOf']);return False
            # Never regress a same-day source from available to missing because an
            # endpoint briefly times out on a scheduled retry.
            if old.get('asOf')==out['asOf']:
                for key,value in old.get('indices',{}).items():out['indices'].setdefault(key,value)
                for key,value in old.get('institutional',{}).items():out['institutional'].setdefault(key,value)
                for key,value in old.get('stocks',{}).items():
                    if key not in out['stocks']:out['stocks'][key]=value
                    elif not out['stocks'][key].get('name') and isinstance(value,dict) and value.get('name'):
                        out['stocks'][key]['name']=value['name']
                for key,value in old.get('margin',{}).items():out.setdefault('margin',{}).setdefault(key,value)
                for key,value in old.get('etfOHLCV',{}).items():
                    current=out.setdefault('etfOHLCV',{}).get(key)
                    if not current or str(value.get('latestDate',''))>str(current.get('latestDate','')):
                        out['etfOHLCV'][key]=value
                source_map={'taiex':('indices','taiex'),'otc':('indices','otc'),'tx':('indices','taifex'),
                            'twse_bfi':('institutional','listed')}
                for source_key,(group,field) in source_map.items():
                    if out.get('sources',{}).get(source_key,{}).get('status')!='ok' and field in old.get(group,{}):
                        out.setdefault('sources',{})[source_key]={'status':'retained','detail':'當日先前成功資料保留；本次抓取未成功'}
                for source_key,group in [('twse_t86','stocks'),('tpex','stocks'),('twse_margin','margin')]:
                    if out.get('sources',{}).get(source_key,{}).get('status')!='ok' and old.get(group):
                        out.setdefault('sources',{})[source_key]={'status':'retained','detail':'保留已核對的同日紀錄；本次未成功'}
        except (ValueError,OSError,TypeError):pass
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8');tmp.replace(path)
    return True

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--as-of',required=True);ap.add_argument('--out',type=Path,default=DEST)
    args=ap.parse_args();date=date_iso(args.as_of)
    if not date or date!=args.as_of:ap.error('Require ISO date YYYY-MM-DD')
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(message)s')
    result=build(date)
    prior={}
    if args.out.is_file():
        try:prior=json.loads(args.out.read_text('utf8'))
        except (OSError,ValueError):pass
    # Failures of optional ETF API must not block existing official stock data.
    try:
        result['etfOHLCV']=build_etf_histories(result,date,old=prior)
        result['coverage']['etfOHLCV']=len(result['etfOHLCV'])
    except Exception as err:
        LOG.warning('ETF history enrichment failed: %s',type(err).__name__)
        result['etfOHLCV']={}
    LOG.info('Source coverage: %s',json.dumps(result['coverage'],ensure_ascii=False))
    if not save(result,args.out):LOG.warning('Ancillary feed unavailable; base scanner remains operational')

if __name__=='__main__':main()
