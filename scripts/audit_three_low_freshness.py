"""Read-only consistency audit; never treats stale EOD as intraday data."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SOURCES = ('three-low-data.json','three-low-price-context.json','three-low-volume-context.json','ma240-three-low-context.json','data/universe.json')
def audit():
    dates = {}
    for name in SOURCES:
        path = ROOT/name
        try:
            doc=json.loads(path.read_text(encoding='utf-8'))
            dates[name]=doc.get('asOf')
        except (OSError,ValueError) as exc:
            dates[name]=f'ERROR: {exc}'
    same=len(set(dates.values()))==1 and all(dates.values())
    return dates,bool(same)
if __name__=='__main__':
    dates, same=audit()
    for name,date in dates.items(): print(f'{name}: {date}')
    print('一致性:', '通過（不代表即時）' if same else '失敗：暫停精選訊號')
    raise SystemExit(0 if same else 1)
