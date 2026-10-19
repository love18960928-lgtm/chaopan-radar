#!/usr/bin/env python3
"""Read-only Chaopan pre-release data diagnostics. Does not fetch, trade, commit or modify site."""
import argparse
import datetime as dt
import json
import math
from collections import Counter
from pathlib import Path


def iso_date(s):
    try:
        d=dt.date.fromisoformat(str(s))
        return d if d.isoformat()==str(s) else None
    except (ValueError, TypeError):
        return None


def num(v):
    try:
        f=float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def diagnose(root):
    failures=[]; warnings=[]; facts={}
    upath=root/'data/universe.json'; mpath=root/'data/market-intel.json'
    for path in [upath,mpath]:
        if not path.is_file():failures.append(f'必要檔案不存在：{path.relative_to(root)}')
    if failures:return {'failures':failures,'warnings':warnings,'facts':facts,'state':'FAIL'}
    try:
        u=json.loads(upath.read_text('utf-8')); m=json.loads(mpath.read_text('utf-8'))
    except (json.JSONDecodeError,UnicodeDecodeError) as e:
        return {'failures':[f'JSON解析失敗：{e}'],'warnings':[],'facts':{},'state':'FAIL'}
    rows=u.get('rows')
    if not isinstance(rows,list) or not rows:return {'failures':['universe.rows 缺失或空白'],'warnings':warnings,'facts':facts,'state':'FAIL'}
    a=iso_date(u.get('asOf')); b=iso_date(m.get('asOf'))
    facts.update({'universe_date':u.get('asOf'),'market_intel_date':m.get('asOf'),'rows':len(rows), 'universe_bytes':upath.stat().st_size})
    if a is None or b is None:failures.append('交易日格式不合法或無法解析')
    elif a!=b:failures.append('universe 與 market-intel 交易日不一致')
    else:
        taiwan_today=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
        weekdays=sum((a+dt.timedelta(days=i)).weekday()<5 for i in range(1,max(0,(taiwan_today-a).days)+1))
        if weekdays>=2:warnings.append(f'封存行情已落後約 {weekdays} 個工作日（未排除休市），請核對最新盤後更新')
    invalid=0;last_mismatch=0;maxlen=0;ma240_ready=0;lengths=Counter()
    for row in rows:
        if not isinstance(row,dict):invalid+=1;continue
        bars=row.get('bars');day=iso_date(row.get('date'))
        if not isinstance(bars,list) or not bars or day is None:invalid+=1;continue
        lengths[len(bars)]+=1;maxlen=max(maxlen,len(bars));ma240_ready+=(len(bars)>=240)
        if not isinstance(bars[-1],list) or not bars[-1] or bars[-1][0]!=row['date']:last_mismatch+=1
        prior=None
        good=True
        for c in bars:
            if not isinstance(c,list) or len(c)<6:good=False;break
            y=iso_date(c[0]); vals=[num(q) for q in c[1:6]]
            if not y or (prior and y<=prior) or any(v is None for v in vals):good=False;break
            op,hi,lo,cl,vol=vals
            if min(op,hi,lo,cl)<=0 or vol<0 or hi<max(op,cl,lo) or lo>min(op,cl,hi):good=False;break
            prior=y
        if not good:invalid+=1
    facts.update({'invalid_bar_rows':invalid,'last_day_mismatch':last_mismatch, 'ma240_recomputable':ma240_ready,'max_bars':maxlen,'bar_lengths_common':lengths.most_common(3)})
    if invalid:failures.append(f'{invalid} 檔 OHLCV / 日期不合法，應回頭核對')
    if last_mismatch:failures.append(f'{last_mismatch} 檔末筆K日期與個股交易日不一致')
    if ma240_ready==0:warnings.append('0 檔有 240 根日K，MA240 不能由這份快照重算')
    stocks=m.get('stocks',{})
    if isinstance(stocks,dict):
        ls=[v for k,v in stocks.items() if k.startswith('上市-') and isinstance(v,dict)]
        if ls:
            dealer=[num(v.get('dealerLots')) for v in ls]
            allzero=sum(1 for v in dealer if v==0)
            facts.update({'listed_inst_entries':len(ls),'listed_dealer_zero':allzero})
            if allzero==len(ls):warnings.append('上市法人個股自營商全部為 0：可能抓錯欄位，應核對官方來源')
    ix=m.get('indices',{})
    if isinstance(ix,dict):
        diffs={k:v.get('date') for k,v in ix.items() if isinstance(v,dict) and v.get('date')!=m.get('asOf')}
        if diffs: warnings.append(f'指數交易日與行情不同：{diffs}')
    sources=m.get('sources',{})
    facts['sources_summary']={k:(v.get('status') if isinstance(v,dict) else '?') for k,v in sources.items()} if isinstance(sources,dict) else {}
    futures=m.get('futures') if isinstance(m.get('futures'),dict) else {}
    if 'txForeign' not in m and 'txForeign' not in futures:warnings.append('沒有可辨認的外資TX未平倉多空淨口數欄位：sources.tx=ok 不代表已完成串接')
    if not any(k in m for k in ['vixTW','vixTaiwan','vixTwn']):warnings.append('沒有可辨認的台灣VIX獨立數值欄位')
    if not any(k in m for k in ['vixUS','vixAmerica']):warnings.append('沒有可辨認的美國VIX獨立數值欄位')
    facts['script_exists']=(root/'scripts/market_intel_v311.py').exists()
    facts['html_exists']=(root/'index.html').exists()
    if not facts['script_exists'] or not facts['html_exists']:failures.append('網站主檔或盤後來源腳本不存在')
    return {'state':'FAIL' if failures else 'WARN' if warnings else 'PASS','failures':failures,'warnings':warnings,'facts':facts,'checked_utc':dt.datetime.now(dt.timezone.utc).isoformat()}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',default='.');parser.add_argument('--output',default='chaopan_preflight_r39_report.json');args=parser.parse_args()
    r=diagnose(Path(args.root).resolve());Path(args.output).write_text(json.dumps(r,ensure_ascii=False,indent=2,default=str)+'\n',encoding='utf-8')
    print('超盤手 r39 盤後資料驗證：'+r['state'])
    print('資料問題：',*r['failures'],sep='\n - ')
    print('待核對：',*r['warnings'],sep='\n - ')
    print('摘要：'+json.dumps(r['facts'],ensure_ascii=False))
    # Quality gate fails for either ERRORS or WARNINGS; never mistake incomplete data for approval.
    return 0 if r['state']=='PASS' else 2 if r['state']=='WARN' else 1
if __name__=='__main__':raise SystemExit(main())
