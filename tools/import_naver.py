# -*- coding: utf-8 -*-
"""
네이버 뉴스 라이브러리 CSV → data/candidates.json 후보로 추가(append-only).

기존 수집 규칙과 동일하게, 가져온 기사는 모두 '전체 후보'(candidates.json)에만
들어간다(verified=False). 검수를 거쳐 curation.json 으로 승격해야 '검수완료'가 된다.

- 기존 candidates.json 은 절대 덮어쓰지 않고, content_id 가 새로운 항목만 덧붙인다.
- content_id 는 'NAVER-{articleId}' 로 부여(국립중앙도서관 CNTS- 와 충돌 없음).
- 썸네일은 네이버 이미지 URL 을 그대로 사용(원격), 원문 링크는 articleUrl.
- 저작권 고려: 기사 본문(content)·요약(summary)은 저장하지 않는다. 제목·날짜·신문명·
  키워드(짧은 태그)·링크·썸네일만 보관한다.

사용법:
  python tools/import_naver.py <csv_path>
"""
import sys
import os
import csv
import json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CANDIDATES = os.path.join(ROOT, "data", "candidates.json")


def era_by_date(d):
    if d >= "2001-03-01":
        return "부설고"
    if d >= "1951-09-01":
        return "부속고"
    if d >= "1946-09-01":
        return "부속중학교"
    return "경성사범"


def main():
    if len(sys.argv) < 2:
        print("사용법: python tools/import_naver.py <csv_path>")
        return
    csv_path = sys.argv[1]

    with open(csv_path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    with open(CANDIDATES, encoding="utf-8") as f:
        cands = json.load(f)
    existing = {r["content_id"] for r in cands}

    added = 0
    skipped = 0
    for r in rows:
        rid = (r.get("id") or "").strip()
        date = (r.get("date") or "").strip()
        title = (r.get("title") or "").strip()
        if not rid or not date or not title:
            skipped += 1
            continue
        cid = "NAVER-" + rid
        if cid in existing:
            skipped += 1
            continue
        kws = [k.strip() for k in (r.get("keywords") or "").split(",") if k.strip()]
        rec = {
            "content_id": cid,
            "date": date,
            "title": title,
            "title_original": title,
            "newspaper": (r.get("newspaper") or "").strip(),
            "era": era_by_date(date),
            "school_name": "",
            "summary": "",
            "keywords": kws,
            "url": (r.get("articleUrl") or "").strip(),
            "thumbnail": (r.get("imageUrl") or "").strip(),
            "verified": False,
            "_search_term": "서울사대부고(네이버 뉴스 라이브러리)",
            "_issued_date": date.replace("-", ""),
            "_news_position": (r.get("pageNo") or "").strip(),
            "_source": "naver",
        }
        cands.append(rec)
        existing.add(cid)
        added += 1

    cands.sort(key=lambda r: r.get("date") or "")
    with open(CANDIDATES, "w", encoding="utf-8") as f:
        json.dump(cands, f, ensure_ascii=False, indent=2)

    print("추가 %d건 (건너뜀 %d건) → 후보 총 %d건" % (added, skipped, len(cands)))


if __name__ == "__main__":
    main()
