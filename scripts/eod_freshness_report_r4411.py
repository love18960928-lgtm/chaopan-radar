#!/usr/bin/env python3
"""GitHub Actions EOD freshness/status dashboard; no new financial data is synthesized."""
import argparse
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

TZ_TAIPEI = timezone(timedelta(hours=8))


def inspect(root, now=None):
    root = Path(root)
    now = now or datetime.now(TZ_TAIPEI)
    today = now.date().isoformat()
    def load(name):
        path = root / 'data' / name
        try:
            return json.loads(path.read_text(encoding='utf-8')), ''
        except (OSError, ValueError) as exc:
            return {}, f'{name} 無法載入：{type(exc).__name__}'
    radar, e1 = load('radar.json')
    universe, e2 = load('universe.json')
    intel, e3 = load('market-intel.json')
    stock_day = str(radar.get('asOf') or '')
    universe_day = str(universe.get('asOf') or '')
    inst_day = str(intel.get('asOf') or '')
    bfi = (intel.get('institutional') or {}).get('listed') or {}
    sources = intel.get('sources') or {}
    source_status = (sources.get('twse_bfi') or {}).get('status', 'not_checked')
    institution_verified = bool(inst_day and inst_day == stock_day and
        bfi.get('date') == inst_day and bfi.get('unit') == '億元' and
        source_status in ('ok', 'retained') and
        all(isinstance(bfi.get(k), (int,float)) and not isinstance(bfi.get(k), bool)
            for k in ('foreign','trust','dealer')))
    count = len(universe.get('rows') or [])
    issues = [x for x in (e1,e2,e3) if x]
    if stock_day != universe_day or not stock_day:
        issues.append('行情和全市場快照日期不一致')
    # The exchange calendar is not inferred from weekdays alone: holidays exist.
    # Warnings are advisory, not a basis for inventing today's market session.
    if now.weekday()<5 and now.hour>=16 and stock_day!=today:
        issues.append('今日已過16:00，行情仍非今日交易日；請檢查交易所休市或 collector/Actions 日誌')
    if institution_verified is False:
        issues.append('同日上市三大法人金額未驗證：請檢查官方來源回應、日期與解析欄位')
    if inst_day != stock_day:
        issues.append('法人與行情日期不同：畫面應顯示待資料，不能借用舊資料')
    result = {
        'checkedAtTaipei': now.isoformat(timespec='seconds'),
        'marketAsOf': stock_day or '缺資料',
        'universeAsOf': universe_day or '缺資料',
        'universeStockCount': count,
        'institutionalAsOf': inst_day or '缺資料',
        'institutionalTotalVerifiedSameDay': institution_verified,
        'marketDatedToday': stock_day == today,
        'institutionalDatedToday': institution_verified and inst_day == today,
        'twseBFI82USource': source_status,
        'twseT86StockSource': (sources.get('twse_t86') or {}).get('status','not_checked'),
        'tpexInstitutionalSource': (sources.get('tpex') or {}).get('status','not_checked'),
        'institutionalStockRecords': len(intel.get('stocks') or {}),
        'issues': issues,
    }
    return result


def render(result):
    r = result
    lines = [
        '## 超盤手｜盤後資料日期與法人檢查（r44.11）',
        '',
        '| 檢查項目 | 結果 |',
        '| --- | --- |',
        f"| 台灣時間 | {r['checkedAtTaipei']} |",
        f"| 行情 radar.json | {r['marketAsOf']} |",
        f"| 全市場 universe.json | {r['universeAsOf']}（{r['universeStockCount']} 檔） |",
        f"| 法人 market-intel.json | {r['institutionalAsOf']} |",
        f"| 上市法人金額（與本次行情同日） | {'通過，但需另看是否今日' if r['institutionalTotalVerifiedSameDay'] else '待資料／未通過'} |",
        f"| 行情是否為今天 | {'是' if r['marketDatedToday'] else '否／休市待人工判斷'} |",
        f"| 法人是否為今天 | {'是' if r['institutionalDatedToday'] else '否／待資料'} |",
        f"| 證交所 BFI82U | {r['twseBFI82USource']} |",
        f"| 證交所個股 T86 | {r['twseT86StockSource']} |",
        f"| 櫃買個股法人 | {r['tpexInstitutionalSource']} |",
        f"| 已核對個股法人筆數 | {r['institutionalStockRecords']} |",
        '',
        '**注意：程式成功執行不代表官方當日資料一定成功抓取。**',
        '下載日期不同時，舊資料不可當作今日買賣參考。',
    ]
    if r['issues']:
        lines += ['', '### 待檢查', *('- '+issue for issue in r['issues'])]
    return '\n'.join(lines)+'\n'


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--root',default='.')
    args = p.parse_args()
    r = inspect(args.root)
    msg = render(r)
    print(msg)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a',encoding='utf-8') as out:out.write(msg)
    for issue in r['issues']:
        print('::warning::'+issue.replace('\n',' '))
    # Reporting a missing OPTIONAL feed must not erase valid price-volume data.
    # Release consistency still enforced by the separate verify_release_gate tool.
    return 0


if __name__=='__main__':
    raise SystemExit(main())
