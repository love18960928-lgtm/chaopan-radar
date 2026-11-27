"""Read-only consistency audit; never treats stale EOD as intraday data."""
import json
import datetime as dt
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SOURCES = ('three-low-data.json','three-low-price-context.json','three-low-volume-context.json','ma240-three-low-context.json','data/universe.json','data/radar.json')
def valid_date(value,today):
    try: return isinstance(value,str) and dt.date.fromisoformat(value).isoformat()==value and value<=today
    except (ValueError,TypeError): return False

def audit(root=ROOT,today=None):
    today=today or dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
    dates = {}
    for name in SOURCES:
        path = root/name
        try:
            doc=json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(doc,dict): raise ValueError('not a JSON object')
            day=doc.get('asOf')
            if not valid_date(day,today): raise ValueError('invalid or future asOf')
            if name in ('data/universe.json','data/radar.json'):
                markets=doc.get('marketAsOf')
                if not isinstance(markets,dict) or any(markets.get(m)!=day for m in ('上市','上櫃')):
                    raise ValueError('market dates not aligned')
            dates[name]=day
        except (OSError,ValueError) as exc:
            dates[name]=f'ERROR: {exc}'
    same=len(set(dates.values()))==1 and all(valid_date(d,today) for d in dates.values())
    return dates,bool(same)
if __name__=='__main__':
    dates, same=audit()
    for name,date in dates.items(): print(f'{name}: {date}')
    print('一致性:', '通過（不代表即時）' if same else '失敗：暫停精選訊號')
    raise SystemExit(0 if same else 1)
