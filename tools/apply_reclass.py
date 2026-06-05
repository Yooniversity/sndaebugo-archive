# -*- coding: utf-8 -*-
"""
재분류+요약 워크플로우 결과(tools/_class_out2/b*.json)를 데이터에 반영.

각 배치 파일: [{"id","relevant":bool,"summary2":"..."}, ...]
- relevant → 관련없음(rejected)에서 제외(후보/검수완료로). irrelevant → 관련없음에 추가.
  검수완료(curation)라도 irrelevant면 curation에서 제거(사용자 선택: LLM 재평가 허용).
- summary2(자체 표현 2줄 요약)를 candidates.json 레코드에 저장 → articles.json 재생성에 반영.
- 분류 누락(배치 파일 없음/깨짐) 기사는 현 상태 유지(안전).

사용법:
  python tools/apply_reclass.py
"""
import os
import sys
import json
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import curate  # build_articles, load/save  # noqa: E402

ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
CANDIDATES = os.path.join(DATA, "candidates.json")
REJECTED = os.path.join(DATA, "rejected.json")
CURATION = os.path.join(HERE, "curation.json")
OUTDIR = os.path.join(HERE, "_class_out2")


def main():
    cands = json.load(open(CANDIDATES, encoding="utf-8"))
    cand_ids = {r["content_id"] for r in cands}
    curation = json.load(open(CURATION, encoding="utf-8"))
    rejected = set(json.load(open(REJECTED, encoding="utf-8")))

    classmap = {}
    bad = 0
    for fp in sorted(glob.glob(os.path.join(OUTDIR, "b*.json"))):
        try:
            for o in json.load(open(fp, encoding="utf-8")):
                cid = str(o.get("id") or "").strip()
                if cid:
                    classmap[cid] = {
                        "relevant": bool(o.get("relevant")),
                        "summary2": (o.get("summary2") or "").strip(),
                    }
        except Exception as e:
            bad += 1
            print("  [경고] 배치 파싱 실패:", os.path.basename(fp), e)

    print("분류 결과 %d건 (깨짐 배치 %d)" % (len(classmap), bad))

    moved_to_rejected = 0
    rescued = 0
    demoted_curation = 0
    summ_set = 0
    for r in cands:
        cid = r["content_id"]
        info = classmap.get(cid)
        if not info:
            continue  # 미분류 → 현 상태 유지
        if info["summary2"]:
            r["summary2"] = info["summary2"]
            summ_set += 1
        else:
            r.pop("summary2", None)
        if info["relevant"]:
            if cid in rejected:
                rejected.discard(cid)
                rescued += 1
        else:
            if cid in curation:
                curation.pop(cid, None)
                demoted_curation += 1
            if cid not in rejected:
                rejected.add(cid)
                moved_to_rejected += 1

    # 검수완료가 아니게 된 것 외 curation 은 유지. rejected 와 curation 겹치면 curation 우선 제거됨.
    json.dump(cands, open(CANDIDATES, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    curate.save_curation(curation)
    json.dump(sorted(rejected), open(REJECTED, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    out, missing = curate.build_articles(curation)  # articles.json 재생성(summary2 포함)

    pending = sum(1 for r in cands if r["content_id"] not in curation and r["content_id"] not in rejected)
    print("요약 저장 %d | 구제(관련없음→후보) %d | 신규 관련없음 %d | 검수완료 강등 %d"
          % (summ_set, rescued, moved_to_rejected, demoted_curation))
    print("검수완료 %d | 후보 %d | 관련없음 %d" % (len(out), pending, len(rejected)))
    if missing:
        print("[경고] candidates 에 없는 curation id:", missing)


if __name__ == "__main__":
    main()
