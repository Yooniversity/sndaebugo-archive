# -*- coding: utf-8 -*-
"""
기사 풀이(현대어 해설) 결과(tools/_det_out/b*.json)를 candidates.json 에 반영(append-only).

각 배치 파일: [{"id": "...", "detail": "..."}, ...]
- detail 필드를 candidates 레코드에 추가/갱신(검수완료 기사 모달에 표시).
- detail 은 우리가 만든 해설이므로 갱신 허용(--keep 로 기존 보존 가능).

사용법:
  python tools/apply_detail.py          # 새 풀이로 갱신
  python tools/apply_detail.py --keep    # 기존 detail 있으면 보존
"""
import os
import sys
import json
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CANDIDATES = os.path.join(ROOT, "data", "candidates.json")
OUTDIR = os.path.join(HERE, "_det_out")


def main():
    keep = "--keep" in sys.argv
    cands = json.load(open(CANDIDATES, encoding="utf-8"))
    by = {r["content_id"]: r for r in cands}

    recs = {}
    bad = 0
    for fp in sorted(glob.glob(os.path.join(OUTDIR, "b*.json"))):
        try:
            for o in json.load(open(fp, encoding="utf-8")):
                cid = str(o.get("id") or "").strip()
                d = (o.get("detail") or "").strip()
                if cid and d:
                    recs[cid] = d
        except Exception as e:
            bad += 1
            print("  [경고] 배치 파싱 실패:", os.path.basename(fp), e)

    added = kept = missing = 0
    for cid, d in recs.items():
        r = by.get(cid)
        if not r:
            missing += 1
            continue
        if r.get("detail") and keep:
            kept += 1
            continue
        r["detail"] = d
        added += 1

    json.dump(cands, open(CANDIDATES, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("풀이 %d건 (깨짐 %d)" % (len(recs), bad))
    print("적용 %d | 보존 %d | candidates 없음 %d" % (added, kept, missing))


if __name__ == "__main__":
    main()
