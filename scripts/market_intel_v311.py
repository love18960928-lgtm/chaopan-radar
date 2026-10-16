"""Official EOD ancillary feed with strict as-of and missing-data semantics.

Do not guess the meaning of brokerage branches, infer short positions, or mix
an index's latest date with a different date's institutional-flow data.
This optional task cannot break the existing price-volume collector.
"""
import argparse
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
    s = str(value or '').strip()
    m = re.fullmatch(r'(\d{4})-(\d{1,2})-(\d{1,2})', s)
    if m: y,mo,d = map(int,m.groups())
    else:
        m = re.search(r'(\d{2,3})[年/\-.](\d{1,2})[月/\-.](\d{1,2})',s)
        if m: y,mo,d = map(int,m.groups());y+=1911
        else:
            m = re.fullmatch(r'(\d{3})(\d{2})(\d{2})',s)
            if m:y,mo,d=map(int,m.groups());y+=1911
            else:
                m = re.fullmatch(r'(\d{4})(\d{2})(\d{2})',s)
                if not m:return None
                y,mo,d=map(int,m.groups())
    try:return dt.date(y,mo,d).isoformat()
    except ValueError:return None

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
    fr=index('外陸資買賣超股數(不含外資自營商)','外陸資買賣超股數')
    tr=index('投信買賣超股數')
    dl=index('自營商買賣超股數')
    if None in (col,fr,tr,dl):return {}
    result={}
    for row in rows:
        if not isinstance(row,list) or len(row)<=max(col,fr,tr,dl):continue
        code=str(row[col]).strip()
        if not re.fullmatch(r'\d{4}',code):continue
        vals=[number(row[i]) for i in (fr,tr,dl)]
        if any(v is None for v in vals):continue
        result['上市-'+code]={'date':target,'foreignLots':round(vals[0]/1000,3),'trustLots':round(vals[1]/1000,3),'dealerLots':round(vals[2]/1000,3),'source':'TWSE T86','broker':None}
    return result

def tpex_3insti(payload, target):
    """Accept only explicitly recognised, day-stamped official TPEx fields."""
    if not isinstance(payload,list):return {}
    result={}
    keys={'code':('證券代號','股票代號','SecuritiesCompanyCode','SecuritiesCode'),
          'foreign':('外資及陸資買賣超股數','外資及陸資買賣超','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference'),
          'trust':('投信買賣超股數','投信買賣超','SecuritiesInvestmentTrustCompanies-Difference'),
          'dealer':('自營商買賣超股數合計','自營商買賣超股數','自營商買賣超','Dealers-Difference'),
          'date':('資料日期','日期','Date','TradeDate')}
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
        result['上櫃-'+code]={'date':target,'foreignLots':round(vals[0]/1000,3),'trustLots':round(vals[1]/1000,3),'dealerLots':round(vals[2]/1000,3),'source':'TPEx 3insti','broker':None}
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

def build(target, fetch=fetch_json):
    compact=target.replace('-','')
    urls={
      'twse_t86':f'https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date={compact}&selectType=ALLBUT0999',
      'tpex': 'https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading',
      'taiex':f'https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?response=json&date={compact}',
      'twse_bfi':f'https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json&dayDate={compact}&type=day',
      'tx':'https://openapi.taifex.com.tw/v1/DailyMarketReportFut',
      'twse_margin':f'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={compact}&response=json&selectType=ALL',
      'otc':f'https://www.tpex.org.tw/www/zh-tw/afterTrading/indexSummary?date={int(target[:4])-1911}/{target[5:7]}&response=json',
    }
    out={'schema':SCHEMA,'asOf':target,'indices':{},'institutional':{},'stocks':{},'coverage':{},'notice':'官方盤後；不同資料源可能延遲。未取得則顯示待資料；分點不能推斷多空持倉。'}
    mapping={'twse_t86':lambda x:twse_t86(x,target),'tpex':lambda x:tpex_3insti(x,target),'taiex':lambda x:twse_fmtqik(x,target),'twse_bfi':lambda x:twse_bfi(x,target),'tx':lambda x:taifex_tx(x,target),'twse_margin':lambda x:twse_margin(x,target),'otc':lambda x:tpex_otc_index(x,target)}
    for key,url in urls.items():
        try:data=mapping[key](fetch(url));LOG.info('%s accepted=%s',key,len(data) if isinstance(data,dict) else bool(data))
        except Exception as ex:LOG.warning('%s skipped: %s',key,str(ex)[:150]);data=None
        if key=='twse_margin':
            if data:
                for code,record in data.items():
                    out.setdefault('margin',{})[code]=record
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
        time.sleep(.25)
    return out

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
        except (ValueError,OSError,TypeError):pass
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
