#!/usr/bin/env python3
"""Safely enrich existing radar.json with TWSE T86 official EOD institutional net shares.
Never overwrite valid stock data with guesses; fail closed when unavailable.
"""
import argparse, datetime as dt, json, pathlib, urllib.parse, urllib.request

def parse_t86(payload, expected):
    if payload.get('stat') != 'OK':
        raise ValueError('TWSE stat not OK')
    fields=payload.get('fields') or []
    rows=payload.get('data') or []
    def ix(part):
        matches=[i for i,f in enumerate(fields) if part in f]
        if len(matches)!=1: raise ValueError('ambiguous/missing column '+part)
        return matches[0]
    code_i=ix('證券代號'); foreign_i=ix('外陸資買賣超股數(不含外資自營商)') if any('外陸資買賣超股數(不含外資自營商)' in f for f in fields) else ix('外陸資買賣超股數'); trust_i=ix('投信買賣超股數'); dealer_i=fields.index('自營商買賣超股數') if '自營商買賣超股數' in fields else ix('自營商買賣超股數')
    def integer(s):
        s=str(s).replace(',','').strip()
        if not s or s in ('--','-'): raise ValueError('missing numeric data')
        return int(s)
    out={}
    for r in rows:
        if len(r)<len(fields):continue
        code=str(r[code_i]).strip()
        if not code or code in out: continue
        try:
            f,t,d=[integer(r[i]) for i in (foreign_i,trust_i,dealer_i)]
        except ValueError:continue
        out[code]={'date':expected,'foreignNetShares':f,'trustNetShares':t,'dealerNetShares':d,'totalNetShares':f+t+d,'source':'TWSE T86 official EOD','sourceUrl':'https://www.twse.com.tw/fund/T86'}
    if len(out)<500: raise ValueError('too few validated TWSE records: '+str(len(out)))
    return out

def run(path, fetcher=None):
    obj=json.loads(path.read_text(encoding='utf-8'))
    day=obj.get('asOf','')
    dt.date.fromisoformat(day)
    url='https://www.twse.com.tw/rwd/zh/fund/T86?'+urllib.parse.urlencode({'date':day.replace('-',''),'selectType':'ALL','response':'json'})
    if fetcher is None:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; ChaopanRadar/1.0)','Accept':'application/json'})
        with urllib.request.urlopen(req,timeout=25) as resp: payload=json.load(resp)
    else:payload=fetcher(url)
    parsed=parse_t86(payload,day)
    count=0
    for c in obj.get('candidates',[]):
        if c.get('market')=='上市' and str(c.get('date'))==day and str(c.get('code')) in parsed:
            c['institutional']=parsed[str(c['code'])];count+=1
    obj['institutionalCoverage']={'date':day,'markets':{'上市':{'source':'TWSE T86','records':len(parsed),'matchedCandidates':count},'上櫃':{'status':'未接入，維持待核對'}},'matchedToStockCount':count,'policy':'僅同日官方資料；上櫃不補零、不推定法人方向'}
    if not count:raise ValueError('no candidate matched, not writing')
    tmp=path.with_suffix('.json.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':')),encoding='utf-8');tmp.replace(path)
    return count

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--radar',default='data/radar.json');a=p.parse_args()
    try: print('TWSE official institutional matched:',run(pathlib.Path(a.radar)))
    except Exception as e: print('WARNING: official institution update skipped:',e);raise SystemExit(1)
