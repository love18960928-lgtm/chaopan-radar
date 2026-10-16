"""Read-only release guard for Chaopan Radar; no fabricated market values."""
import json,sys
from pathlib import Path
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
p=root/'data/radar.json';q=root/'data/universe.json';t=root/'data/market-intel.json'
try:
    radar=json.loads(p.read_text(encoding='utf8'))
    universe=json.loads(q.read_text(encoding='utf8'))
except (OSError,ValueError) as exc:
    sys.exit(f'BLOCK: cannot parse radar/universe JSON: {type(exc).__name__}')
a=radar.get('asOf');b=universe.get('asOf');rows=universe.get('rows')
if not(a and a==b and isinstance(rows,list) and len(rows)>500):
    sys.exit(f'BLOCK: radar {a!r} universe {b!r} rows {len(rows) if isinstance(rows,list) else "missing"}')
print(f'CHECK: same-day base EOD {a}, universe rows={len(rows)} (coverage not asserted)')
if t.exists():
    try:
        intel=json.loads(t.read_text(encoding='utf8'))
        if intel.get('asOf')==a:
            print('CHECK: market-intel date matches, actual field availability requires official source health validation')
            print('SOURCES:',{k:v.get('status') for k,v in intel.get('sources',{}).items()})
        else:
            print(f'WARNING: institutional / index data stale ({intel.get("asOf")}); UI must hide it instead of showing as current day')
    except (OSError,ValueError):
        print('WARNING: market-intel malformed; do not display index/institutional panel')
else:
    print('WARNING: no market-intel.json; index/institutional panel must explicitly show unavailable')
