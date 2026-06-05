# -*- coding: utf-8 -*-
"""
네이버 뉴스 라이브러리 CSV → data/candidates.json 교체 적재.

이 스크립트는 기존 네이버 기사(content_id 가 'NAVER-' 로 시작)를 candidates.json·
curation.json·rejected.json·favorites.json 에서 **모두 제거**한 뒤, 새 CSV 를 후보로
새로 적재한다. 국립중앙도서관(CNTS-) 데이터는 건드리지 않는다.

저작권: 기사 본문(content)·요약(summary)은 사이트 데이터에 저장하지 않는다. 관련성
분류(LLM)용으로만 tools/_naver_class_input.jsonl 에 제목·요약을 임시로 내보낸다.

사용법:
  python tools/import_naver.py <csv_path>
"""
import sys
import os
import csv
import json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
CANDIDATES = os.path.join(DATA, "candidates.json")
REJECTED = os.path.join(DATA, "rejected.json")
FAVORITES = os.path.join(DATA, "favorites.json")
CURATION = os.path.join(HERE, "curation.json")
CLASS_INPUT = os.path.join(HERE, "_naver_class_input.jsonl")

NAVER = "NAVER-"


def era_by_date(d):
    if d >= "2001-03-01":
        return "부설고"
    if d >= "1951-09-01":
        return "부속고"
    if d >= "1946-09-01":
        return "부속중학교"
    return "경성사범"


def load(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def dump(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def purge_naver():
    """모든 데이터 파일에서 NAVER- 항목 제거."""
    cands = load(CANDIDATES, [])
    n0 = len(cands)
    cands = [r for r in cands if not (r.get("content_id", "") or "").startswith(NAVER)]
    dump(CANDIDATES, cands)

    curation = load(CURATION, {})
    cur_removed = [k for k in curation if k.startswith(NAVER)]
    for k in cur_removed:
        curation.pop(k, None)
    dump(CURATION, curation)

    rejected = [x for x in load(REJECTED, []) if not str(x).startswith(NAVER)]
    dump(REJECTED, rejected)

    favorites = [x for x in load(FAVORITES, []) if not str(x).startswith(NAVER)]
    dump(FAVORITES, favorites)

    print("기존 NAVER- 제거: candidates %d→%d, curation %d건, rejected/favorites 정리" %
          (n0, len(cands), len(cur_removed)))
    return cands


def main():
    if len(sys.argv) < 2:
        print("사용법: python tools/import_naver.py <csv_path>")
        return
    csv_path = sys.argv[1]

    cands = purge_naver()
    existing = {r["content_id"] for r in cands}

    with open(csv_path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    added = 0
    skipped = 0
    class_lines = []
    for r in rows:
        rid = (r.get("id") or "").strip()
        date = (r.get("date") or "").strip()
        title = (r.get("title") or "").strip()
        if not rid or not date or not title:
            skipped += 1
            continue
        cid = NAVER + rid
        if cid in existing:
            skipped += 1
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
        # 분류용(제목+요약) — 개행 제거
        summary = " ".join((r.get("summary") or "").split())
        class_lines.append(json.dumps(
            {"id": cid, "title": " ".join(title.split()), "summary": summary},
            ensure_ascii=False))

    cands.sort(key=lambda r: r.get("date") or "")
    dump(CANDIDATES, cands)

    with open(CLASS_INPUT, "w", encoding="utf-8") as f:
        f.write("\n".join(class_lines) + ("\n" if class_lines else ""))

    print("새 네이버 적재: %d건 (건너뜀 %d) → 후보 총 %d건" % (added, skipped, len(cands)))
    print("분류 입력: %s (%d줄)" % (CLASS_INPUT, len(class_lines)))


if __name__ == "__main__":
    main()
