#!/usr/bin/env python3
"""Build the date-locked all-stock lookup. No prices are invented."""
import argparse
import json
from pathlib import Path


def build(root):
    root=Path(root)
    uni=json.loads((root/'data/universe.json').read_text(encoding='utf-8'))
    rows=uni.get('rows') or []
    day=uni.get('asOf')
    if not isinstance(day,str) or len(day)!=10 or len(rows)<500:
        raise ValueError('valid full-universe file and session date required')
    out=root/'data/stock-lookup'
    out.mkdir(parents=True,exist_ok=True)
    groups={str(i):[] for i in range(10)}
    index=[]
    seen=set()
    for row in rows:
        code=str(row.get('code','')).strip()
        market=str(row.get('market','')).strip()
        name=str(row.get('name','')).strip()
        row_day=row.get('date')
        if not code or not name or market not in ('上市','上櫃') or row_day!=day:
            continue
        key=(market,code)
        if key in seen:raise ValueError(f'duplicate market+code {key}')
        seen.add(key)
        if not code[0].isdigit():continue
        groups[code[0]].append(row)
        index.append({'code':code,'name':name,'market':market,'date':day,'close':row.get('close')})
    if len(index)<500 or len(index)!=len(rows):
        raise ValueError('directory coverage differs from the verified full-universe rows')
    index.sort(key=lambda r:(r['code'],r['market']))
    payload={'asOf':day,'count':len(index),'rows':index}
    (out/'index.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    for digit,part in groups.items():
        f=out/f'{digit}.json'
        f.write_text(json.dumps({'asOf':day,'count':len(part),'rows':part},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    return len(index)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',default='.')
    args=parser.parse_args()
    print(f'Generated {build(args.root)} searchable stock rows')
