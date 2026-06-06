# -*- coding: utf-8 -*-
"""
CSV 기사들을 (1) 없으면 후보로 추가, (2) 모두 검수완료(curation)로 승격,
(3) '인물' + 주제(파일명) 태그를 단다. 모두 append-only(기존 데이터 보존).

- 후보 추가: content_id('NAVER-'+id) 가 candidates.json 에 없을 때만(본문 미저장).
- 검수완료: tools/curation.json 에 추가(이미 있으면 기존 era/요약 보존). 관련없음(rejected)
  목록에 있었으면 제거(검수완료와 상호 배타). articles.json 재생성.
- 태그: data/tags.json 에 '인물' + 주제(파일명 stem) 추가(중복 제거, 기존 보존).

저작권: 기사 본문(content/summary)은 저장하지 않는다.

사용법:
  python tools/add_curated.py <csv1> <csv2> ...
  # 각 파일의 이름(확장자 제외)이 주제 태그로 쓰인다(예: 이건희.csv → '이건희').
"""
import sys
import os
import csv
import json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import curate  # build_articles, load/save_curation

DATA = os.path.join(ROOT, "data")
CANDIDATES = os.path.join(DATA, "candidates.json")
REJECTED = os.path.join(DATA, "rejected.json")
TAGS = os.path.join(DATA, "tags.json")
NAVER = "NAVER-"
MARK = "인물"


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


def main():
    paths = sys.argv[1:]
    if not paths:
        print("사용법: python tools/add_curated.py <csv1> <csv2> ...")
        return

    cands = json.load(open(CANDIDATES, encoding="utf-8"))
    by = {r["content_id"]: r for r in cands}
    curation = curate.load_curation()
    rejected = load(REJECTED, [])
    rejected_set = set(rejected)
    tags = load(TAGS, {})

    added_cand = 0
    curated = 0
    unrejected = 0
    tagged = 0
    total_rows = 0
    seen = set()

    for path in paths:
        subject = os.path.splitext(os.path.basename(path))[0]
        with open(path, encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        for r in rows:
            rid = (r.get("id") or "").strip()
            date = (r.get("date") or "").strip()
            title = (r.get("title") or "").strip()
            if not rid or not date or not title:
                continue
            cid = NAVER + rid
            total_rows += 1
            if cid in seen:
                continue
            seen.add(cid)

            # 1) 후보 추가(없을 때만)
            if cid not in by:
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
                    "viewCount": int((r.get("viewCount") or "0").strip() or 0)
                    if (r.get("viewCount") or "0").strip().isdigit() else 0,
                    "_searchTerm": "",
                    "_issued_date": date.replace("-", ""),
                    "_news_position": (r.get("pageNo") or "").strip(),
                    "_source": "naver",
                }
                cands.append(rec)
                by[cid] = rec
                added_cand += 1

            # 2) 검수완료 승격(이미 있으면 기존 보존)
            if cid not in curation:
                curation[cid] = {
                    "era": era_by_date(date),
                    "school_name": "",
                    "summary": "",
                }
                curated += 1
            if cid in rejected_set:
                rejected_set.discard(cid)
                unrejected += 1

            # 3) 태그: 인물 + 주제
            cur = list(tags.get(cid) or [])
            changed = False
            for t in (MARK, subject):
                if t and t not in cur:
                    cur.append(t)
                    changed = True
            if changed:
                tags[cid] = cur
                tagged += 1

    cands.sort(key=lambda r: r.get("date") or "")
    dump(CANDIDATES, cands)
    curate.save_curation(curation)
    dump(REJECTED, sorted(rejected_set))
    dump(TAGS, tags)
    out, missing = curate.build_articles(curation)

    print("입력 행 %d (고유 %d)" % (total_rows, len(seen)))
    print("후보 추가 %d | 검수완료 승격 %d | 관련없음 해제 %d | 태그 변경 %d"
          % (added_cand, curated, unrejected, tagged))
    print("검수완료(articles.json) 총 %d건" % len(out))
    if missing:
        print("[경고] candidates 에 없는 cid:", missing[:5], "..." if len(missing) > 5 else "")


if __name__ == "__main__":
    main()
