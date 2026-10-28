#!/usr/bin/env python3
"""Report three-low freshness; never relabel stale snapshots as fresh."""
import json
import os
from pathlib import Path

FILES = ["three-low-data.json", "three-low-price-context.json", "three-low-volume-context.json", "ma240-three-low-context.json"]
READY = Path(".three_low_publish_ready")

def main():
    READY.unlink(missing_ok=True)
    dates = {}
    for name in FILES + ["data/universe.json"]:
        try:
            obj = json.loads(Path(name).read_text(encoding="utf-8"))
            dates[name] = str(obj.get("asOf", ""))
        except (OSError, ValueError, TypeError) as exc:
            dates[name] = f"ERROR: {exc}"
    baseline = dates["data/universe.json"]
    ok = bool(baseline) and all(dates[n] == baseline for n in FILES)
    summary = os.getenv("GITHUB_STEP_SUMMARY")
    lines = ["## 扣3低資料發布驗證", "", "| 檔案 | 資料日期 |", "|---|---|"]
    lines += [f"| `{k}` | `{v}` |" for k, v in dates.items()]
    lines += ["", "**結果：** " + ("日期一致，可提交（不代表資料已更新至今日）" if ok else "日期不一致，禁止提交扣3低資料；需要接入重新計算產生器"), ""]
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    print("\n".join(lines))
    if ok:
        READY.write_text(baseline + "\n", encoding="utf-8")
    else:
        print("::warning::扣3低資料日期不一致，未更新的檔案不會被當成新資料提交")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
