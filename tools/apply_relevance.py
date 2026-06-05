# -*- coding: utf-8 -*-
"""
LLM 관련성 분류 결과(tools/_class_out/b*.json)를 모아 '관련없음'(rejected.json)에 반영.

각 배치 파일은 그 배치에서 IRRELEVANT 로 판정된 content_id 들의 JSON 배열이다.
이를 합쳐 NAVER- 후보 중 무관 기사를 rejected.json 에 append 한다(검수완료 제외).
누락 배치(파일 없음/깨짐)는 경고만 하고 해당 기사는 '유지'(보수적으로 관련없음 처리 안 함).

사용법:
  python tools/apply_relevance.py
"""
import os
import re
import json
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
CANDIDATES = os.path.join(DATA, "candidates.json")
REJECTED = os.path.join(DATA, "rejected.json")
CURATION = os.path.join(HERE, "curation.json")
OUTDIR = os.path.join(HERE, "_class_out")


def main():
    cands = json.load(open(CANDIDATES, encoding="utf-8"))
    cand_ids = {r["content_id"] for r in cands}
    naver_ids = {r["content_id"] for r in cands if r["content_id"].startswith("NAVER-")}
    curation = set(json.load(open(CURATION, encoding="utf-8"))) if os.path.exists(CURATION) else set()
    rejected = json.load(open(REJECTED, encoding="utf-8")) if os.path.exists(REJECTED) else []
    rejected_set = set(rejected)

    files = sorted(glob.glob(os.path.join(OUTDIR, "b*.json")))
    irrelevant = set()
    bad = 0
    for fp in files:
        try:
            arr = json.load(open(fp, encoding="utf-8"))
            for x in arr:
                irrelevant.add(str(x).strip())
        except Exception as e:
            bad += 1
            print("  [경고] 배치 파일 파싱 실패:", os.path.basename(fp), e)

    print("배치 파일 %d개 (깨짐 %d) | 무관 판정 id %d개" % (len(files), bad, len(irrelevant)))

    # NAVER 후보이고, 검수완료가 아니며, 아직 관련없음이 아닌 것만 추가
    to_add = [cid for cid in irrelevant
              if cid in naver_ids and cid not in curation and cid not in rejected_set]
    for cid in to_add:
        rejected.append(cid)
    json.dump(rejected, open(REJECTED, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # 분류 누락 추정(파일 수가 모자라면)
    skipped = [cid for cid in irrelevant if cid not in cand_ids]
    print("관련없음 추가: %d건 → rejected.json 총 %d건" % (len(to_add), len(rejected)))
    if skipped:
        print("  (후보에 없는 id 무시: %d개)" % len(skipped))


if __name__ == "__main__":
    main()
