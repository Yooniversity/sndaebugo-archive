# -*- coding: utf-8 -*-
"""
누락 기사 CSV → data/candidates.json 에 '없는 것만' 추가(append-only).

import_naver.py 와 달리 기존 데이터를 절대 지우지 않는다. CSV의 id 중
content_id('NAVER-'+id) 가 candidates.json 에 없는 것만 새 후보로 추가한다.
기존 candidates/curation/rejected/favorites/tags/deleted 는 건드리지 않는다.

저작권: 기사 본문(content)·요약(summary)은 저장하지 않는다(제목·키워드·메타만).
새로 추가된 기사는 미검수 '전체 후보' 상태로 들어간다.

사용법:
  python tools/add_missing.py <csv_path>
"""
import sys
import os
import csv
import json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CANDIDATES = os.path.join(ROOT, "data", "candidates.json")
NAVER = "NAVER-"


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
        print("사용법: python tools/add_missing.py <csv_path>")
        return
    csv_path = sys.argv[1]

    cands = json.load(open(CANDIDATES, encoding="utf-8"))
    existing = {r["content_id"] for r in cands}
    n0 = len(cands)

    with open(csv_path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    added = skipped_present = skipped_bad = 0
    for r in rows:
        rid = (r.get("id") or "").strip()
        date = (r.get("date") or "").strip()
        title = (r.get("title") or "").strip()
        if not rid or not date or not title:
            skipped_bad += 1
            continue
        cid = NAVER + rid
        if cid in existing:
            skipped_present += 1
            continue
        try:
            vc = int((r.get("viewCount") or "0").strip() or 0)
        except ValueError:
            vc = 0
        kws = [k.strip() for k in (r.get("keywords") or "").split(",") if k.strip()]
        cands.append({
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
            "viewCount": vc,
            "_searchTerm": (r.get("searchTerm") or "").strip(),
            "_issued_date": date.replace("-", ""),
            "_news_position": (r.get("pageNo") or "").strip(),
            "_source": "naver",
        })
        existing.add(cid)
        added += 1

    cands.sort(key=lambda r: r.get("date") or "")
    json.dump(cands, open(CANDIDATES, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    print("후보 %d → %d (신규 %d, 이미있음 %d, 결측 %d)"
          % (n0, len(cands), added, skipped_present, skipped_bad))


if __name__ == "__main__":
    main()
