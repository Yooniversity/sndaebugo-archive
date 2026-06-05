# -*- coding: utf-8 -*-
"""
후보(candidates.json) → 검증 기사(articles.json) 검수 스크립트.

대한민국 신문 아카이브 검색 결과에는 동명의 다른 학교
(대구사대부중, 경북사대부고, 이화여대 사범대 부속중 등)와
무관한 일반 입시 기사가 다수 섞여 있다. 본교(서울) 기사만 골라
content_id 기준으로 검증 정보(era / school_name / summary)를 부여한다.

검증 정보는 tools/curation.json 에 저장된다(서버가 프로그램적으로 갱신 가능).
형식: { "CNTS-...": {"era": ..., "school_name": ..., "summary": ...}, ... }
era: 경성사범 | 부속중학교 | 부속고 | 부설고

curation.json 에 없는 후보는 verified=False 로 candidates.json 에 그대로 남으며,
큐레이터가 항목을 추가(웹 UI의 '검수완료 승격' 버튼 또는 직접 편집)하면
articles.json 으로 승격된다.

사용법:
  python curate.py        # candidates.json + curation.json → articles.json 생성
"""
import os
import json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
CANDIDATES = os.path.join(DATA, "candidates.json")
ARTICLES = os.path.join(DATA, "articles.json")
CURATION_FILE = os.path.join(HERE, "curation.json")

VALID_ERAS = ("경성사범", "부속중학교", "부속고", "부설고")


def load_curation():
    """content_id → {era, school_name, summary} 딕셔너리."""
    if not os.path.exists(CURATION_FILE):
        return {}
    with open(CURATION_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_curation(curation):
    with open(CURATION_FILE, "w", encoding="utf-8") as f:
        json.dump(curation, f, ensure_ascii=False, indent=2)


def build_articles(curation=None):
    """curation.json + candidates.json 으로 articles.json 을 재생성하고 결과 리스트를 반환."""
    if curation is None:
        curation = load_curation()

    with open(CANDIDATES, encoding="utf-8") as f:
        cands = json.load(f)
    by_id = {r["content_id"]: r for r in cands}

    # 재실행 시 썸네일 보존을 위해 기존 articles.json 의 경로를 미리 읽어 둔다.
    prev_thumb = {}
    if os.path.exists(ARTICLES):
        try:
            for r in json.load(open(ARTICLES, encoding="utf-8")):
                if r.get("thumbnail"):
                    prev_thumb[r["content_id"]] = r["thumbnail"]
        except Exception:
            pass

    out = []
    missing = []
    for cid, info in curation.items():
        r = by_id.get(cid)
        if not r:
            missing.append(cid)
            continue
        r = dict(r)
        r["era"] = info.get("era", "")
        r["school_name"] = info.get("school_name", "")
        r["summary"] = info.get("summary", "")
        r["verified"] = True
        if not r.get("thumbnail") and prev_thumb.get(cid):
            r["thumbnail"] = prev_thumb[cid]
        out.append(r)

    out.sort(key=lambda r: r.get("date") or "")

    with open(ARTICLES, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    return out, missing


def main():
    out, missing = build_articles()
    print("검증 기사 %d건 → %s" % (len(out), ARTICLES))
    if missing:
        print("[경고] candidates.json 에 없는 content_id:", missing)
    print("다음: `python tools/collect.py thumbs` 로 지면 썸네일 다운로드")


if __name__ == "__main__":
    main()
