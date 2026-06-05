# -*- coding: utf-8 -*-
"""
타 지역(서울 외) 사대부고/사대부중 기사를 '관련없음'(data/rejected.json)으로 분류.

대한민국 신문 아카이브·네이버 뉴스 라이브러리 검색 결과에는 대구사범대학부속중,
경북·전남·공주·인하·이화·수도 사대부고 등 동명의 다른 학교 기사가 섞여 있다.
본교(서울사대부고)와 무관하므로 후보에서 제외한다.

판별(제목만 사용 — 키워드의 검색어 '서울사대부고' 노이즈 회피):
  - 제목에 (서울 외) 지역 토큰이 사대부/師大附/사범대 부속·부설 표지와 함께 있고,
  - 제목에 '서울'이 없으면  → 타 지역 학교로 보고 관련없음 처리.
(서울 팀이 함께 언급된 경기 기사 등은 '서울'이 있으므로 제외되지 않는다.)

이미 검수완료(curation.json)인 기사는 건드리지 않는다. rejected.json 은 덮어쓰지 않고
새 항목만 덧붙인다(append-only). 잘못 분류되면 웹 UI에서 '전체 후보로 되돌리기' 가능.

사용법:
  python tools/reject_other_region.py          # 적용
  python tools/reject_other_region.py --dry     # 미리보기(쓰지 않음)
"""
import os
import re
import sys
import json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
CANDIDATES = os.path.join(DATA, "candidates.json")
REJECTED = os.path.join(DATA, "rejected.json")
CURATION = os.path.join(HERE, "curation.json")

REGIONS = [
    "대구", "경북", "경상북도", "경상남도", "경남", "부산", "광주", "전남", "전라남도",
    "전북", "전라북도", "공주", "충남", "충청남도", "청주", "충북", "충청북도", "대전",
    "강원", "춘천", "원주", "제주", "인천", "인하", "목포", "군산", "진주", "안동",
    "마산", "울산", "순천", "여수", "수도", "이화", "한국교원", "교원대",
]
REGION_RE = re.compile("|".join(REGIONS))
MARKER_RE = re.compile(r"사대부|師大附|사범대학?\s*부[속설]")


def title_hay(r):
    return (r.get("title", "") or "") + " " + (r.get("title_original", "") or "")


def is_other_region(r):
    t = title_hay(r)
    if "서울" in t:
        return False
    return bool(MARKER_RE.search(t) and REGION_RE.search(t))


def main():
    dry = "--dry" in sys.argv
    cands = json.load(open(CANDIDATES, encoding="utf-8"))
    curation = set(json.load(open(CURATION, encoding="utf-8"))) if os.path.exists(CURATION) else set()
    rejected = json.load(open(REJECTED, encoding="utf-8")) if os.path.exists(REJECTED) else []
    rejected_set = set(rejected)

    hits = []
    for r in cands:
        cid = r["content_id"]
        if cid in curation or cid in rejected_set:
            continue
        if is_other_region(r):
            hits.append(r)

    print("관련없음으로 분류할 타 지역 학교 기사: %d건" % len(hits))
    for r in hits:
        print("  + %s  %s" % (r.get("date", ""), (r.get("title", "") or "")[:50]))

    if dry:
        print("\n[--dry] 변경하지 않았습니다.")
        return

    for r in hits:
        rejected.append(r["content_id"])
    with open(REJECTED, "w", encoding="utf-8") as f:
        json.dump(rejected, f, ensure_ascii=False, indent=2)
    print("\nrejected.json 갱신: 관련없음 총 %d건" % len(rejected))


if __name__ == "__main__":
    main()
