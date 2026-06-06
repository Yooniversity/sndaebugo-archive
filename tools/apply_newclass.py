# -*- coding: utf-8 -*-
"""
신규 기사 분류+요약 결과(tools/_new_out/b*.json)를 데이터에 반영(append-only).

각 배치 파일: [{"id": "...", "relevant": bool, "summary2": "..."}, ...]

- summary2 → candidates.json 에 추가(이미 있으면 보존, 덮어쓰지 않음).
- relevant=false → data/rejected.json 에 추가(관련없음). 단, 이미 검수완료(curation)거나
  이미 rejected 면 건드리지 않는다(사용자 결정 보존).
- relevant=true → 아무것도 안 함(전체 후보로 남아 사람이 검수).

기존 데이터는 절대 덮어쓰지 않는다.

사용법:
  python tools/apply_newclass.py
"""
import os
import sys
import json
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CANDIDATES = os.path.join(ROOT, "data", "candidates.json")
REJECTED = os.path.join(ROOT, "data", "rejected.json")
CURATION = os.path.join(HERE, "curation.json")
OUTDIR = os.path.join(HERE, "_new_out")


def load(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    cands = json.load(open(CANDIDATES, encoding="utf-8"))
    by = {r["content_id"]: r for r in cands}
    rejected = load(REJECTED, [])
    rejected_set = set(rejected)
    curation = load(CURATION, {})

    recs = {}
    bad = 0
    for fp in sorted(glob.glob(os.path.join(OUTDIR, "b*.json"))):
        try:
            for o in json.load(open(fp, encoding="utf-8")):
                cid = str(o.get("id") or "").strip()
                if cid:
                    recs[cid] = {
                        "relevant": bool(o.get("relevant")),
                        "summary2": (o.get("summary2") or "").strip(),
                    }
        except Exception as e:
            bad += 1
            print("  [경고] 배치 파싱 실패:", os.path.basename(fp), e)

    summ_added = summ_kept = 0
    new_rejected = 0
    rel = irrel = 0
    for cid, info in recs.items():
        r = by.get(cid)
        if not r:
            continue
        # 요약: 없을 때만 추가(보존)
        if info["summary2"]:
            if r.get("summary2"):
                summ_kept += 1
            else:
                r["summary2"] = info["summary2"]
                summ_added += 1
        # 관련성
        if info["relevant"]:
            rel += 1
        else:
            irrel += 1
            # 이미 검수완료/관련없음이면 보존
            if cid in curation or cid in rejected_set:
                continue
            rejected.append(cid)
            rejected_set.add(cid)
            new_rejected += 1

    json.dump(cands, open(CANDIDATES, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    json.dump(sorted(rejected), open(REJECTED, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    print("결과 %d건 (깨짐 배치 %d)" % (len(recs), bad))
    print("관련 %d | 무관 %d → 신규 관련없음 %d" % (rel, irrel, new_rejected))
    print("요약 추가 %d | 기존 보존 %d" % (summ_added, summ_kept))
    print("관련없음 총 %d건" % len(rejected))


if __name__ == "__main__":
    main()
