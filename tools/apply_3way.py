# -*- coding: utf-8 -*-
"""
3분류(검수완료/전체후보/관계없음)+요약 결과(tools/_new_out/b*.json)를 반영(append-only).

각 배치 파일: [{"id","state":"featured"|"all"|"rejected","summary2"}, ...]

- summary2 → candidates.json 에 추가(이미 있으면 보존).
- state=featured → curation.json 에 추가(이미 있으면 보존) + rejected 에서 제거. articles.json 재생성.
- state=rejected → rejected.json 에 추가(이미 curation/rejected 면 보존).
- state=all → 아무것도 안 함(전체후보로 남김).
기존 데이터는 절대 덮어쓰지 않는다.

사용법: python tools/apply_3way.py
"""
import os
import sys
import json
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import curate

CANDIDATES = os.path.join(ROOT, "data", "candidates.json")
REJECTED = os.path.join(ROOT, "data", "rejected.json")
OUTDIR = os.path.join(HERE, "_new_out")


def era_by_date(d):
    if d >= "2001-03-01":
        return "부설고"
    if d >= "1951-09-01":
        return "부속고"
    if d >= "1946-09-01":
        return "부속중학교"
    return "경성사범"


def load(p, d):
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else d


def main():
    cands = json.load(open(CANDIDATES, encoding="utf-8"))
    by = {r["content_id"]: r for r in cands}
    curation = curate.load_curation()
    rejected = load(REJECTED, [])
    rejected_set = set(rejected)

    recs = {}
    bad = 0
    for fp in sorted(glob.glob(os.path.join(OUTDIR, "b*.json"))):
        try:
            for o in json.load(open(fp, encoding="utf-8")):
                cid = str(o.get("id") or "").strip()
                if cid:
                    recs[cid] = {
                        "state": (o.get("state") or "all").strip(),
                        "summary2": (o.get("summary2") or "").strip(),
                    }
        except Exception as e:
            bad += 1
            print("  [경고] 배치 파싱 실패:", os.path.basename(fp), e)

    summ_added = 0
    n_feat = n_rej = n_all = 0
    for cid, info in recs.items():
        r = by.get(cid)
        if not r:
            continue
        if info["summary2"] and not r.get("summary2"):
            r["summary2"] = info["summary2"]
            summ_added += 1
        st = info["state"]
        if st == "featured":
            n_feat += 1
            if cid not in curation:
                curation[cid] = {"era": era_by_date(r.get("date", "")),
                                 "school_name": "", "summary": ""}
            if cid in rejected_set:
                rejected_set.discard(cid)
        elif st == "rejected":
            n_rej += 1
            if cid not in curation and cid not in rejected_set:
                rejected_set.add(cid)
        else:
            n_all += 1

    json.dump(cands, open(CANDIDATES, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    curate.save_curation(curation)
    json.dump(sorted(rejected_set), open(REJECTED, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    out, missing = curate.build_articles(curation)

    print("결과 %d건 (깨짐 %d)" % (len(recs), bad))
    print("검수완료 %d | 전체후보 %d | 관계없음 %d | 요약추가 %d" % (n_feat, n_all, n_rej, summ_added))
    print("검수완료(articles) 총 %d | 관계없음 총 %d" % (len(out), len(rejected_set)))
    if missing:
        print("[경고] candidates 없는 cid:", missing[:3])


if __name__ == "__main__":
    main()
