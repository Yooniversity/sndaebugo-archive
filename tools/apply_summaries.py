# -*- coding: utf-8 -*-
"""
요약 워크플로우 결과(tools/_summ_out/b*.json)를 candidates.json 에 반영.

각 배치 파일: [{"id": "...", "summary2": "..."}, ...]

- summary2 를 candidates.json 의 해당 레코드에 '추가'한다(append-only).
- 안전장치: 이미 summary2 가 있는 레코드는 절대 덮어쓰지 않는다(--force 로만 허용).
- 관련없음(rejected) 기사는 articles.json 에 들어가지 않으므로(검수완료만 포함)
  candidates.json 만 갱신하면 프런트엔드 관련없음 탭이 즉시 반영한다.

사용법:
  python tools/apply_summaries.py            # 기존 summary2 보존(권장)
  python tools/apply_summaries.py --force     # 기존 summary2 도 교체
"""
import os
import sys
import json
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CANDIDATES = os.path.join(ROOT, "data", "candidates.json")
OUTDIR = os.path.join(HERE, "_summ_out")


def main():
    force = "--force" in sys.argv
    cands = json.load(open(CANDIDATES, encoding="utf-8"))
    by = {r["content_id"]: r for r in cands}

    summ = {}
    bad = 0
    for fp in sorted(glob.glob(os.path.join(OUTDIR, "b*.json"))):
        try:
            for o in json.load(open(fp, encoding="utf-8")):
                cid = str(o.get("id") or "").strip()
                s2 = (o.get("summary2") or "").strip()
                if cid and s2:
                    summ[cid] = s2
        except Exception as e:
            bad += 1
            print("  [경고] 배치 파싱 실패:", os.path.basename(fp), e)

    added = skipped_existing = missing = 0
    for cid, s2 in summ.items():
        r = by.get(cid)
        if not r:
            missing += 1
            continue
        if r.get("summary2") and not force:
            skipped_existing += 1
            continue
        r["summary2"] = s2
        added += 1

    json.dump(cands, open(CANDIDATES, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    print("배치 요약 %d건 (깨짐 %d)" % (len(summ), bad))
    print("적용 %d | 기존 보존(건너뜀) %d | candidates 에 없음 %d"
          % (added, skipped_existing, missing))


if __name__ == "__main__":
    main()
