# -*- coding: utf-8 -*-
"""
규칙 기반 자동 분류 → 검수완료(curation.json) 승격.

전체 후보(candidates.json) 가운데 **제목에 '경성사범'이 들어가는** 기사를
검수완료로 분류한다(era=경성사범, school_name=경성사범학교). '경성사범'은
경성사범학교를 가리키는 고유 표기라 동명 학교 오탐 위험이 거의 없다.

이미 검수완료(curation.json)이거나 '관련없음'(data/rejected.json)으로 분류한
기사는 건너뛴다. 기존 curation.json 항목은 보존하고(절대 덮어쓰지 않음) 신규만
추가한다. 요약(summary)은 비워 두며, 필요하면 웹 UI나 curation.json 에서 보강한다.

사용법:
  python tools/auto_classify.py
"""
import os
import sys
import json

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import curate  # load_curation / save_curation / build_articles  # noqa: E402

KEYWORD = "경성사범"
ERA = "경성사범"
SCHOOL = "경성사범학교"
REJECTED_FILE = os.path.join(curate.DATA, "rejected.json")


def has_kw(s):
    return KEYWORD in (s or "")


def load_rejected():
    if not os.path.exists(REJECTED_FILE):
        return set()
    with open(REJECTED_FILE, encoding="utf-8") as f:
        return set(json.load(f))


def main():
    with open(curate.CANDIDATES, encoding="utf-8") as f:
        cands = json.load(f)

    curation = curate.load_curation()
    rejected = load_rejected()
    added = []
    for r in cands:
        cid = r["content_id"]
        if cid in curation or cid in rejected:
            continue  # 이미 검수완료 / 관련없음 — 건너뜀
        # 제목(현대어 표기 또는 원문 표기)에 '경성사범'이 들어가면 분류
        if has_kw(r.get("title")) or has_kw(r.get("title_original")):
            curation[cid] = {"era": ERA, "school_name": SCHOOL, "summary": ""}
            added.append((cid, r.get("date", ""), r.get("title", "")))

    if not added:
        print("새로 분류할 기사가 없습니다(이미 모두 검수완료).")
        return

    curate.save_curation(curation)
    out, missing = curate.build_articles(curation)
    print("자동 분류로 %d건을 검수완료에 추가했습니다 (검수완료 총 %d건)." % (len(added), len(out)))
    for cid, date, title in added:
        print("  +", cid, date, title)
    if missing:
        print("[경고] candidates.json 에 없는 content_id:", missing)
    print("썸네일이 없는 신규 항목이 있으면 `python tools/collect.py thumbs` 를 실행하세요.")


if __name__ == "__main__":
    main()
