"""Optional, conservative model valuation for EOD cards.

FinMind public historical EPS/PER feed is used only as a secondary source; the
latest financial period and PER must agree with the primary official snapshots.
Never promote the model estimate to an analyst target or live trading quote.
Failures do not change the technical radar or published EOD snapshot.
"""
import datetime as dt
import json
import logging
import math
import os
import statistics
import urllib.parse
import urllib.request

LOG = logging.getLogger('valuation')
API = 'https://api.finmindtrade.com/api/v4/data'
MAX_STOCKS = 8   # limit free API pressure and GitHub job duration


def finite(value):
    try:
        if isinstance(value, bool) or value is None:return None
        n=float(str(value).replace(',',''))
        return n if math.isfinite(n) else None
    except (ValueError,TypeError):return None


def published_quarter(date):
    # Conservative release boundaries; actual issuer filing date still matters.
    yr,mo=date.year,date.month
    q=(mo-1)//3+1
    release=dt.date(yr,5,16) if q==1 else dt.date(yr,8,16) if q==2 else dt.date(yr,11,16) if q==3 else dt.date(yr+1,4,1)
    return release


def quarter_dates(start):
    y=start.year; q=(start.month-1)//3+1
    out=[]
    for delta in (3,2,1,0):
        idx=y*4+(q-1)-delta; yy=idx//4; qq=idx%4+1
        month=qq*3; day=31 if month in (3,12) else 30
        out.append(f'{yy:04d}-{month:02d}-{day:02d}')
    return out


def derive_model(fin, price, eps_rows, pe_rows, asof):
    """Only create a model when all fundamental evidence is present and dated.

    EPS are *unadjusted historical single-quarter observations* (possible stock
    split discontinuity); cross-check last YTD with MOPS official EPS, and label
    the result an estimate. Quarterly EPS history must be consecutive.
    """
    try: d=dt.date.fromisoformat(str(asof))
    except (ValueError,TypeError):return None
    px=finite(price)
    if px is None or px<=0:return None
    rev=fin.get('revenuePeriod'); eq=fin.get('epsPeriod'); vdate=fin.get('valuationDate')
    if not (rev and eq and vdate and fin.get('revenueYoY') is not None and finite(fin.get('pe'))):return None
    try:
        vy=dt.date.fromisoformat(vdate)
        ry=dt.date.fromisoformat(rev+'-01')
        year,q=int(eq[:4]),int(eq[-1]); assert eq[4]=='Q' and q in (1,2,3,4)
        current=dt.date(year,q*3,31 if q in (1,4) else 30)
    except (TypeError,ValueError,AssertionError):return None
    # Dated government snapshot may be earlier than standard reporting deadline.
    # When no official issue date is supplied, keep the conservative deadline.
    try:
        availability=dt.date.fromisoformat(str(fin['epsStatementDate'])) if fin.get('epsStatementDate') else published_quarter(current)
    except ValueError:return None
    if availability<current:return None
    if not (0<=(d-vy).days<=20 and 0<=(d-ry).days<=100 and availability<=d):return None
    official_eps=finite(fin.get('eps'))
    if official_eps is None:return None
    dates=quarter_dates(current)
    present={}
    for row in eps_rows:
        if not isinstance(row,dict) or row.get('type')!='EPS':continue
        date=str(row.get('date',''))
        eps=finite(row.get('value'))
        if date in dates and eps is not None and -500<=eps<=500:
            present[date]=eps
    if len(present)!=4:return None
    # Last fiscal year-to-date vs reported official accumulated EPS: protects
    # against missing/mixed quarterly data or large split adjustments.
    this_year=sum(present[x] for x in dates if x[:4]==f'{year:04d}')
    if abs(this_year-official_eps)>max(.18,abs(official_eps)*.10):return None
    trailing=round(sum(present.values()),3)
    if trailing<=0:return None  # P/E valuation not appropriate for losses
    multiples={}
    for row in pe_rows:
        if not isinstance(row,dict):continue
        try: rd=dt.date.fromisoformat(str(row.get('date','')))
        except (ValueError,TypeError):continue
        x=finite(row.get('PER'))
        if x is None or not (3<=x<=100) or not ((d-dt.timedelta(days=3*366))<=rd<=d):continue
        multiples[rd]=x
    if len(multiples)<120 or max(multiples)<d-dt.timedelta(days=21):return None
    values=sorted(multiples.values())
    def percentile(p):
        pos=(len(values)-1)*p; i=int(pos); fraction=pos-i
        return values[i]+(values[min(i+1,len(values)-1)]-values[i])*fraction
    pes=[round(percentile(x),2) for x in (.2,.5,.8)]
    target=[round(trailing*pe,2) for pe in pes]
    return {
        'epsTtm':trailing, 'epsTtmPeriod':eq, 'epsTtmSource':'FinMind TaiwanStockFinancialStatements；核對官方當期EPS',
        'peRiverLow':pes[0], 'peRiverMid':pes[1], 'peRiverHigh':pes[2], 'peRiverSample':len(values),
        'modelTargetLow':target[0], 'modelTargetMid':target[1], 'modelTargetHigh':target[2],
        'modelAsOf':str(d), 'modelType':'歷史本益比20／50／80分位數 × 估算近四季EPS',
        'modelCaveat':'研究估值情境，非外資券商目標價；配股／分割可能影響歷史EPS可比性。'
    }


def fetch_dataset(dataset,code,start_date,timeout=6):
    args={'dataset':dataset,'data_id':str(code),'start_date':str(start_date)}
    url=API+'?'+urllib.parse.urlencode(args)
    headers={'User-Agent':'TaiwanEODResearch/1.0','Accept':'application/json'}
    token=os.getenv('FINMIND_API_TOKEN','').strip()
    if token:headers['Authorization']='Bearer '+token
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=timeout) as res:
        raw=res.read(2_500_001)
    if len(raw)>2_500_000:raise ValueError('Oversized FinMind payload')
    data=json.loads(raw.decode('utf-8-sig'))
    if not isinstance(data,dict) or str(data.get('status','200')) not in ('200','success') or not isinstance(data.get('data'),list):raise ValueError('Invalid FinMind data/status')
    return data['data']


def enrich_verified_targets(stocks, ranked, asof, limit=MAX_STOCKS):
    """Bounded optional free feed; validates against primary verified statements.

    Only prioritized stock codes are fetched, up to 8/day. Cached model values
    are NEVER passed to public UI until date/quarter freshness validation.
    """
    stats={'requested':0,'verified':0,'failed':0}
    try: d=dt.date.fromisoformat(asof)
    except (ValueError,TypeError):return stats
    codes=[]
    for row in ranked:
        key=str(row.get('market',''))+str(row.get('code',''))
        if key in stocks and key not in codes:codes.append(key)
    # Only fully screened, current-quarter candidates. Do not waste free API quota.
    for key in codes:
        st=stocks[key]; f=st.get('fundamentals') or {}
        if not all((f.get('epsPeriod'), f.get('revenuePeriod'), f.get('valuationDate'),f.get('eps') is not None,f.get('pe') is not None)):
            continue
        # Historical valuation percentiles need not be redownloaded every day.
        # Refresh monthly, or immediately when the official EPS period changed.
        try: age=(d-dt.date.fromisoformat(str(f.get('modelAsOf','')))).days
        except (ValueError,TypeError): age=1000
        if 0<=age<=29 and f.get('epsTtmPeriod')==f.get('epsPeriod'):continue
        if stats['requested']>=max(0,int(limit)):break
        stats['requested']+=1
        try:
            start=str(d-dt.timedelta(days=3*366))
            er=fetch_dataset('TaiwanStockFinancialStatements',st['code'],start)
            pr=fetch_dataset('TaiwanStockPER',st['code'],start)
            bars=st.get('bars') or []
            close=bars[-1][4] if bars and bars[-1][0]==asof else None
            result=derive_model(f,close,er,pr,asof)
            if result:
                # Remove old model keys atomically before adding new ones.
                for k in list(f):
                    if k.startswith('model') or k.startswith('epsTtm') or k.startswith('peRiver'):f.pop(k,None)
                f.update(result);stats['verified']+=1
            else:stats['failed']+=1
        except Exception as exc:
            stats['failed']+=1
            LOG.warning('Verified valuation %s unavailable: %s',st.get('code'),exc)
    return stats
