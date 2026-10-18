"""Official EOD ancillary feed with strict as-of and missing-data semantics.

Do not guess the meaning of brokerage branches, infer short positions, or mix
an index's latest date with a different date's institutional-flow data.
This optional task cannot break the existing price-volume collector.
"""
import argparse
import csv
import io
import datetime as dt
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
    """Recognise ISO/Gregorian/ROC dates without confusing 2026/10/16 and ROC 115/10/16."""
    s = str(value or '').strip()
    m = re.fullmatch(r'(\d{3,4})[-/\.](\d{1,2})[-/\.](\d{1,2})', s)
    if m:
        y, mo, d = map(int,m.groups())
        if y < 1911: y += 1911
    else:
        m = re.fullmatch(r'(\d{2,3})年(\d{1,2})月(\d{1,2})日?',s)
        if m:
            y,mo,d = map(int,m.groups());y+=1911
        else:
            m=re.fullmatch(r'(\d{7,8})',s)
            if not m:return None
            q=m.group(1); y=int(q[:-4]);mo=int(q[-4:-2]);d=int(q[-2:]);
            if y<1911:y+=1911
    try: return dt.date(y,mo,d).isoformat()
    except ValueError: return None


def twse_t86(payload, target):
    """Parse the named-column TWSE T86; figures are in shares, not lots."""
    if not isinstance(payload,dict) or payload.get('stat') not in (None,'OK'):return {}
    dated=date_iso(payload.get('date') or payload.get('title'))
    if dated != target: return {}
    columns=payload.get('fields') or []
    rows=payload.get('data') or []
    fields = [re.sub(r'\s+', '', str(x)).replace('（','(').replace('）',')') for x in columns]
    # Exact column names are critical: 外資自營商買賣超股數 and
    # 自營商買賣超股數 are distinct. A substring match silently returns
    # the former (often zero), corrupting the listed dealer total.
    def exact(*candidates):
        return next((i for candidate in candidates for i, field in enumerate(fields)
                     if field == candidate), None)
    col=exact('證券代號','股票代號')
    name_col=exact('證券名稱','股票名稱')
    fr=exact('外陸資買賣超股數(不含外資自營商)', '外陸資買賣超股數')
    tr=exact('投信買賣超股數')
    dl=exact('自營商買賣超股數')
    if None in (col,fr,tr,dl):return {}
    result={}
    for row in rows:
        if not isinstance(row,list) or len(row)<=max(col,fr,tr,dl):continue
        code=str(row[col]).strip()
        if not re.fullmatch(r'\d{4}',code):continue
        vals=[number(row[i]) for i in (fr,tr,dl)]
        if any(v is None for v in vals):continue
        result['上市-'+code]={'date':target,'foreignLots':round(vals[0]/1000,3),'trustLots':round(vals[1]/1000,3),'dealerLots':round(vals[2]/1000,3),'source':'TWSE T86','broker':None,
            'name':str(row[name_col]).strip() if name_col is not None and len(row)>name_col else ''}
    return result

def tpex_3insti(payload, target):
    """Accept only explicitly recognised, day-stamped official TPEx fields."""
    if not isinstance(payload,list):return {}
    result={}
    keys={'code':('證券代號','股票代號','代號','SecuritiesCompanyCode','SecuritiesCode'),
          'foreign':('外資及陸資買賣超股數','外資及陸資買賣超','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference'),
          'trust':('投信買賣超股數','投信買賣超','SecuritiesInvestmentTrustCompanies-Difference'),
          'dealer':('自營商買賣超股數合計','自營商買賣超股數','自營商買賣超','Dealers-Difference'),
          'date':('資料日期','日期','Date','TradeDate'),
          'name':('名稱','證券名稱','CompanyName','Name')}
    def pick(row, names):
        for name in names:
            if name in row:return row[name]
        return None
    for row in payload:
        if not isinstance(row,dict) or date_iso(pick(row,keys['date']))!=target:continue
        code=str(pick(row,keys['code']) or '').strip()
        if not re.fullmatch(r'\d{4}',code):continue
        vals=[number(pick(row,keys[k])) for k in ('foreign','trust','dealer')]
        if any(v is None for v in vals):continue
        result['上櫃-'+code]={'date':target,'foreignLots':round(vals[0]/1000,3),'trustLots':round(vals[1]/1000,3),'dealerLots':round(vals[2]/1000,3),'source':'TPEx 3insti','broker':None,
            'name':str(pick(row,keys['name']) or '').strip()}
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
            if not re.fullmatch(r'\d{4}',code):continue
            vals=[number(row[i]) for i in [priors[0],balances[0],priors[1],balances[1]]]
            if any(v is None or v<0 for v in vals):continue
            out['上市-'+code]={
                'date':target,'marginPreviousLots':vals[0],'marginLots':vals[1],
                'shortPreviousLots':vals[2],'shortLots':vals[3],
                'marginDeltaLots':vals[1]-vals[0],'shortDeltaLots':vals[3]-vals[2],
                'provisional':True,'source':'TWSE MI_MARGN'}
        if out:return out
    return {}

def tpex_otc_index(payload,target):
    """TPEx indexSummary named table; reject if published date cannot match."""
    if not isinstance(payload,dict):return None
    dated=date_iso(payload.get('date') or payload.get('Date') or payload.get('reportDate'))
    if dated!=target:return None
    for table in payload.get('tables') or []:
        fields=[str(x) for x in table.get('fields') or []]
        if not all(any(key in f for f in fields) for key in ('指數','收市指數')):continue
        labeli=next((i for i,f in enumerate(fields) if f=='指數'),None)
        closei=next((i for i,f in enumerate(fields) if '收市指數' in f),None)
        changei=next((i for i,f in enumerate(fields) if f=='漲跌'),None)
        pcti=next((i for i,f in enumerate(fields) if '%' in f or '百分比' in f),None)
        if None in (labeli,closei,changei,pcti):continue
        for row in table.get('data') or []:
            if not isinstance(row,list) or len(row)!=len(fields) or str(row[labeli]).strip()!='櫃買指數':continue
            close,change,pct=[number(row[i]) for i in (closei,changei,pcti)]
            if any(x is None for x in (close,change,pct)) or close<=0:return None
            if abs(change/(close-change)*100-pct)>0.25:return None
            return {'date':target,'close':close,'change':change,'pct':pct,'source':'TPEx indexSummary'}
    return None

def fetch_json(url,timeout=18):
    req=urllib.request.Request(url,headers={'User-Agent':'ChaopanRadar/3.1.1 (GitHub Actions; public EOD data)','Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        if r.status!=200:raise IOError('HTTP status '+str(r.status))
        raw=r.read(14000000)
    return json.loads(raw)

def cboe_vix_close(csv_text, target):
    """Cboe's free daily closing VIX CSV; never label a US date as a TW date.

    A strict 5-calendar-day age guard includes US holidays/weekends but
    prevents months-old quotes from showing in a new Taiwan trading session.
    """
    try:
        target_day = dt.date.fromisoformat(target)
        rd = csv.DictReader(io.StringIO(csv_text.lstrip('\ufeff')))
        if not {'DATE', 'CLOSE'}.issubset({str(f).strip().upper() for f in (rd.fieldnames or [])}):return None
        res = []
        for row in rd:
            upper = {str(k).strip().upper(): v for k, v in row.items() if k is not None}
            raw = str(upper.get('DATE') or '').strip()
            try:
                d = dt.datetime.strptime(raw, '%m/%d/%Y').date()
            except ValueError:
                try:d = dt.date.fromisoformat(raw)
                except ValueError:continue
            val = number(upper.get('CLOSE'))
            if val is None or not 0 < val < 200 or d > target_day or (target_day-d).days > 5:continue
            res.append((d,val))
        if not res:return None
        day,val=max(res)
        return {'date':day.isoformat(),'close':round(val,2),'source':'Cboe VIX_History.csv','session':'US daily close'}
    except (ValueError,TypeError,KeyError):return None

def fetch_csv_text(url,timeout=18):
    req=urllib.request.Request(url,headers={'User-Agent':'ChaopanRadar/3.1.1 (public closing data)','Accept':'text/csv'})
    with urllib.request.urlopen(req,timeout=timeout) as resp:
        if resp.status!=200:raise IOError('HTTP status '+str(resp.status))
        return resp.read(2000000).decode('utf-8-sig')

def taifex_foreign_tx_oi(payload, target):
    """TX ONLY, foreign open interest ONLY. Net is checked against gross long-short."""
    if not isinstance(payload,list):return None
    matches=[]
    for row in payload:
        if not isinstance(row,dict):continue
        if date_iso(row.get('Date'))!=target:continue
        if str(row.get('ContractCode','')).strip() not in ('臺股期貨','台股期貨'):continue
        if str(row.get('Item','')).strip() not in ('外資及陸資','外資'):continue
        long=number(row.get('OpenInterest(Long)'))
        short=number(row.get('OpenInterest(Short)'))
        net=number(row.get('OpenInterest(Net)'))
        if any(x is None or x!=int(x) for x in (long,short,net)) or min(long,short)<0 or net!=long-short:continue
        matches.append({'date':target,'contract':'臺股期貨 TX','trader':'外資及陸資',
            'longLots':int(long),'shortLots':int(short),'netLots':int(net),
            'unit':'口','source':'TAIFEX institutional futures by contract'})
    return matches[0] if len(matches)==1 else None


def twse_margin_total(payload,target):
    """TWSE market-wide official financing turnover/stock in lots and TWD thousand.

    Never equate an equity subset with the official market subtotal.
    """
    if not isinstance(payload,dict) or payload.get('stat') not in (None,'OK'):return None
    # Legacy public TWSE MI_MARGN JSON: creditTitle/creditFields/creditList.
    # Recent responses may alternatively contain named tables or fields/data.
    title=str(payload.get('creditTitle') or '')
    stamp=re.search(r'\d{2,4}年\d{1,2}月\d{1,2}日', title)
    dated=date_iso(payload.get('date')) or (date_iso(stamp.group()) if stamp else None)
    if dated != target:return None
    tables=list(payload.get('tables') or [])
    if payload.get('fields') and payload.get('data'):
        tables.append({'fields':payload['fields'],'data':payload['data']})
    if payload.get('creditFields') and payload.get('creditList'):
        tables.append({'fields':payload['creditFields'],'data':payload['creditList']})
    for tab in tables:
        fields=[str(f).strip() for f in tab.get('fields') or []]
        if not all(k in fields for k in ('項目','前日餘額','今日餘額')):continue
        label_idx=fields.index('項目');prev_idx=fields.index('前日餘額');today_idx=fields.index('今日餘額')
        items={}
        for row in tab.get('data') or []:
            if not isinstance(row,list) or len(row)<=max(label_idx,prev_idx,today_idx):continue
            label=str(row[label_idx]).replace(' ','').strip()
            prior=number(row[prev_idx]);today=number(row[today_idx])
            if prior is None or today is None or min(prior,today)<0:continue
            if label.startswith('融資(交易單位)') or label.startswith('融資（交易單位）'):
                items['lots']=(prior,today)
            if label.startswith('融資金額') and ('仟元' in label or '千元' in label):
                items['thousand']=(prior,today)
        if 'lots' in items and 'thousand' in items:
            prev_lots,lots=items['lots'];prev_k,k=items['thousand']
            return {'date':target,'market':'上市','marginLots':int(lots),'marginDeltaLots':int(lots-prev_lots),
             'marginAmountYi':round(k/100000,3),'marginAmountDeltaYi':round((k-prev_k)/100000,3),
             'unitLots':'張','unitAmount':'億元','provisional':True,'source':'TWSE MI_MARGN MS'}
    return None


def tpex_otc_historical_csv(csv_text, target):
    """Official TPEx fallback CSV: named Date / Close / Change, strict date."""
    if not isinstance(csv_text,str) or '<html' in csv_text.lower():return None
    lines = csv_text.lstrip('\ufeff').splitlines()
    header = next((i for i, line in enumerate(lines) if '資料日期' in line and '收市' in line and '漲跌' in line),None)
    if header is None:return None
    for row in csv.DictReader(lines[header:]):
        day = date_iso(row.get('資料日期'))
        if day != target:continue
        close=number(row.get('收市'))
        raw=str(row.get('漲跌') or '').strip().replace('▼','-').replace('▲','+')
        change=number(raw)
        if close is None or change is None or close<=0 or close-change<=0:return None
        return {'date':target,'close':close,'change':change,'pct':round(change/(close-change)*100,2),
                'source':'TPEx official OTC index historical CSV'}
    return None


def build(target, fetch=fetch_json, fetch_text=fetch_csv_text, text_fetch=None):
    """Source-fault isolation with per-endpoint status; no blank-as-zero substitution."""
    if date_iso(target)!=target:raise ValueError('Invalid target trading date')
    compact=target.replace('-','')
    roc_month=f'{int(target[:4])-1911}/{target[5:7]}/{target[8:10]}'
    urls={
      'twse_t86':f'https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date={compact}&selectType=ALLBUT0999',
      'tpex': 'https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading',
      'taiex':f'https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?response=json&date={compact}',
      'twse_bfi':f'https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json&dayDate={compact}&type=day',
      'tx':'https://openapi.taifex.com.tw/v1/DailyMarketReportFut',
      'twse_margin':f'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={compact}&response=json&selectType=ALL',
      'otc':f'https://www.tpex.org.tw/www/zh-tw/afterTrading/indexSummary?date={roc_month}&response=json',
    }
    out={'schema':SCHEMA,'asOf':target,'indices':{},'institutional':{},'stocks':{},'margin':{},'coverage':{},'sources':{},
         'notice':'官方盤後；日期/單位分開核對；缺值不等於零。融資今日餘額暫定，以次日更正為準。'}
    mapping={'twse_t86':lambda x:twse_t86(x,target),'tpex':lambda x:tpex_3insti(x,target),
       'taiex':lambda x:twse_fmtqik(x,target),'twse_bfi':lambda x:twse_bfi(x,target),
       'tx':lambda x:taifex_tx(x,target),'twse_margin':lambda x:twse_margin(x,target),'otc':lambda x:tpex_otc_index(x,target)}
    for key,url in urls.items():
        start=time.monotonic();status='invalid';data=None
        try:
            data=mapping[key](fetch(url));status='ok' if data else 'invalid'
        except Exception as ex:
            LOG.warning('%s skipped: %s',key,str(ex)[:150]);status='error'
        out['sources'][key]={'status':status,'durationMs':round((time.monotonic()-start)*1000)}
        if key=='otc':out['sources']['otc_primary']={'status':status}
        if key=='twse_margin':
            if data:out['margin'].update(data)
            out['coverage'][key]=len(data or {})
        elif key=='twse_bfi':
            if data:out['institutional']['listed']=data
            out['coverage'][key]=bool(data)
        elif key in ('twse_t86','tpex'):
            if data:out['stocks'].update(data)
            out['coverage'][key]=len(data or {})
        else:
            if data:out['indices'][{'tx':'taifex'}.get(key,key)]=data
            out['coverage'][key]=bool(data)
        if fetch is fetch_json:time.sleep(.1)
    # Optional additional authoritative sources. Noncritical failures do not block trading snapshots.
    # Stock/OTC data must not be replaced by stale or other-product totals.
    if fetch is fetch_json:
        extras={
          'twse_margin_total':(f'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={compact}&response=json&selectType=MS',twse_margin_total),
          'taifex_foreign_tx':('https://openapi.taifex.com.tw/v1/MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate',taifex_foreign_tx_oi),
        }
        for key,(url,parser) in extras.items():
            try:
                record=parser(fetch(url),target)
                out['sources'][key]={'status':'ok' if record else 'invalid'}
                out['coverage'][key]=bool(record)
                if key=='twse_margin_total' and record:out['marginMarket']=record
                if key=='taifex_foreign_tx' and record:out.setdefault('derivatives',{})['foreignTxOI']=record
            except Exception as ex:
                LOG.warning('%s skipped: %s',key,str(ex)[:150]);out['sources'][key]={'status':'error'};out['coverage'][key]=False
    # Official TPEx index fallback; a failed primary must not erase other working sources.
    if not out['coverage']['otc']:
        try:
            getter = text_fetch or fetch_text
            record=tpex_otc_historical_csv(getter('https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?response=data'),target)
            if record:out['indices']['otc']=record
            out['sources']['otc_fallback']={'status':'ok' if record else 'invalid'}
            if record:out['sources']['otc']={'status':'ok','detail':'官方同交易日 CSV 備援'};out['coverage']['otc']=True
        except Exception as ex:
            LOG.warning('otc_fallback skipped: %s',str(ex)[:150]);out['sources']['otc_fallback']={'status':'error'}
    # Only fetch live VIX with real I/O, or explicit isolated CSV source injection.
    # text_fetch is the legacy TPEx fallback injectable and is NOT the VIX source.
    if fetch is fetch_json or (fetch_text is not fetch_csv_text and text_fetch is None):
        try:
            record=cboe_vix_close(fetch_text('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv'),target)
            if record:out['indices']['usVix']=record
            out['sources']['usVix']={'status':'ok' if record else 'invalid'};out['coverage']['usVix']=bool(record)
        except Exception as ex:
            LOG.warning('usVix skipped: %s',str(ex)[:150]);out['sources']['usVix']={'status':'error'};out['coverage']['usVix']=False
    else:out['sources']['usVix']={'status':'not_checked'};out['coverage']['usVix']=False
    if out['margin']:
        balances=[v['marginLots'] for v in out['margin'].values() if v.get('date')==target and number(v.get('marginLots')) is not None]
        prev=[v['marginPreviousLots'] for v in out['margin'].values() if v.get('date')==target and number(v.get('marginPreviousLots')) is not None]
        if balances and len(balances)==len(prev):
            out['marginCoverage']={'date':target,'market':'上市','source':'TWSE MI_MARGN 個股小計（非上市全市場正式餘額）',
              'matchedStocks':len(balances),'marginLotsSubtotal':round(sum(balances),3),
              'marginPreviousLotsSubtotal':round(sum(prev),3),'marginDeltaLotsSubtotal':round(sum(balances)-sum(prev),3),
              'provisional':True}
    return out

def verified_trading_days(target, path=ROOT / 'data' / 'universe.json'):
    """Cross-check days against the real OHLCV calendar, not arbitrary snapshot count.

    If the source file is absent or stale, return [] and do not label N records N days.
    """
    try:
        data=json.loads(path.read_text('utf8'))
        if data.get('asOf')!=target:return []
        counts={}
        for row in (data.get('rows') or [])[:300]:
            for bar in row.get('bars') or []:
                if isinstance(bar,list) and date_iso(bar[0])==bar[0] and bar[0]<=target:
                    counts[bar[0]]=counts.get(bar[0],0)+1
        return sorted(day for day,count in counts.items() if count>=min(100,max(1,len(data.get('rows',[]))//10)))
    except (OSError,ValueError,TypeError,IndexError):return []


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
                for key,value in old.get('stocks',{}).items():out['stocks'].setdefault(key,value)
                for key,value in old.get('margin',{}).items():out.setdefault('margin',{}).setdefault(key,value)
                for key,value in old.get('sources',{}).items():
                    if value.get('status') in ('ok','retained') and out.setdefault('sources',{}).get(key,{}).get('status') not in ('ok','retained'):
                        out['sources'][key]={**value,'status':'retained'}
                for key,value in old.get('coverage',{}).items():
                    if not out.setdefault('coverage',{}).get(key):out['coverage'][key]=value
                for optional in ('marginMarket','derivatives'):
                    if old.get(optional) and not out.get(optional):out[optional]=old[optional]
                if old.get('marginCoverage') and not out.get('marginCoverage'):
                    out['marginCoverage']=old['marginCoverage']
        except (ValueError,OSError,TypeError):pass
    # Historical margin is a separate official-EOD time series. Incomplete past days
    # never become artificial zeros, and 5/20-day changes require 6/21 actual records.
    history={}
    if 'old' in locals() and isinstance(old,dict):
        prior=old.get('marginHistory')
        if isinstance(prior,dict):
            history={k:v for k,v in prior.items() if date_iso(k)==k and isinstance(v,dict)}
        if old.get('asOf') and old.get('margin') and isinstance(old['margin'],dict):
            previous_day=old['asOf']
            if date_iso(previous_day)==previous_day:
                history.setdefault(previous_day,{k:int(v['marginLots']) for k,v in old['margin'].items()
                    if isinstance(v,dict) and v.get('date')==previous_day and number(v.get('marginLots')) is not None})
    if out.get('margin'):
        history[out['asOf']]={k:int(v['marginLots']) for k,v in out['margin'].items()
            if isinstance(v,dict) and v.get('date')==out['asOf'] and number(v.get('marginLots')) is not None}
    history={k:history[k] for k in sorted(history)[-30:]}
    out['marginHistory']=history
    trading_days=verified_trading_days(out['asOf'])
    if out['asOf'] in trading_days:
        day_index=trading_days.index(out['asOf'])
        for code,record in out.get('margin',{}).items():
            if not isinstance(record,dict) or record.get('date')!=out['asOf']:continue
            for days in (5,20):
                # Missing any real trading day invalidates the comparison.
                if day_index<days:continue
                expected=trading_days[day_index-days:day_index+1]
                if any(day not in history or code not in history[day] for day in expected):continue
                past=number(history[expected[0]].get(code));cur=number(record.get('marginLots'))
                if past is not None and cur is not None:
                    record[f'margin{days}DayDeltaLots']=round(cur-past,1)
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8');tmp.replace(path)
    return True

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--as-of',required=True);ap.add_argument('--out',type=Path,default=DEST)
    args=ap.parse_args();date=date_iso(args.as_of)
    if not date or date!=args.as_of:ap.error('Require ISO date YYYY-MM-DD')
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(message)s')
    result=build(date)
    LOG.info('Source coverage: %s',json.dumps(result['coverage'],ensure_ascii=False))
    if not save(result,args.out):LOG.warning('Ancillary feed unavailable; base scanner remains operational')

if __name__=='__main__':main()
