# -*- coding: utf-8 -*-
"""
서울사대부고 신문 아카이브 - 하이브리드 수집기

국립중앙도서관 대한민국 신문 아카이브(nl.go.kr/newspaper)의 내부 검색 API
(search_newspaper.do, POST + JSON) 를 호출해 학교 관련 기사 후보를 모은다.

사용법:
  python collect.py search          # 검색어별 후보 수집 → data/candidates.json
  python collect.py thumbs          # data/articles.json 의 검증 기사 지면 썸네일 다운로드
  python collect.py thumbs --candidates   # candidates.json 대상으로 썸네일 다운로드

주의: nl.go.kr 는 공공기관 사이트이므로 요청 간 지연(REQUEST_DELAY)을 둔다.
검색 결과는 '후보'일 뿐이며, 동명 학교/무관 기사 제외 등 검수를 거쳐
data/articles.json 으로 승격해야 전시에 사용된다.
"""
import sys
import os
import re
import json
import time
import http.cookiejar
import urllib.request
import urllib.parse

BASE = "https://nl.go.kr/newspaper"
SEARCH_URL = BASE + "/search_newspaper.do"
COVER_URL = BASE + "/coverImage.do"
DETAIL_URL = BASE + "/detail.do?content_id="

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_DIR = os.path.join(ROOT, "data")
THUMB_DIR = os.path.join(DATA_DIR, "thumbnails")
TERMS_FILE = os.path.join(HERE, "search_terms.json")
CANDIDATES_FILE = os.path.join(DATA_DIR, "candidates.json")
ARTICLES_FILE = os.path.join(DATA_DIR, "articles.json")

PAGE_SIZE = 100
MAX_PAGES = 30          # term 당 최대 페이지 (안전장치)
REQUEST_DELAY = 1.0     # 초, 요청 간 지연
TIMEOUT = 60


def make_opener():
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [
        ("User-Agent", "Mozilla/5.0 (archive-collector; SNU-HS history museum)"),
        ("Referer", BASE + "/keyword_search.do"),
    ]
    # 세션(JSESSIONID) 확보
    op.open(BASE + "/keyword_search.do?keyword=init", timeout=TIMEOUT).read()
    return op


def first(v):
    """필드가 리스트면 첫 값, 아니면 그대로."""
    if isinstance(v, list):
        return v[0] if v else ""
    return v if v is not None else ""


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def fmt_date(yyyymmdd):
    s = (yyyymmdd or "").strip()
    if len(s) == 8 and s.isdigit():
        return "%s-%s-%s" % (s[:4], s[4:6], s[6:8])
    return s


def search_term(op, keyword):
    """한 검색어에 대해 페이지를 돌며 모든 hit 을 모은다."""
    results = []
    seen = set()
    for page in range(MAX_PAGES):
        body = {
            "search_keyword": keyword,
            "facetedType": [],
            "facetedData": [],
            "page_size": PAGE_SIZE,
            "page_no": page,
        }
        req = urllib.request.Request(
            SEARCH_URL,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json",
                     "X-Requested-With": "XMLHttpRequest"},
        )
        try:
            raw = op.open(req, timeout=TIMEOUT).read().decode("utf-8", "ignore")
            data = json.loads(raw)
        except Exception as e:
            print("    [경고] '%s' page %d 요청 실패: %s" % (keyword, page, e))
            break

        hits = data.get("hits", []) or []
        if not hits:
            break

        new = 0
        for h in hits:
            cid = first(h.get("uri"))
            if not cid or cid in seen:
                continue
            seen.add(cid)
            new += 1
            results.append(h)

        # 더 이상 새 항목이 없거나 마지막 페이지면 종료
        if new == 0 or len(hits) < PAGE_SIZE:
            break
        time.sleep(REQUEST_DELAY)
    return results


def hit_to_record(h, era_hint, term):
    cid = first(h.get("uri"))
    issued = first(h.get("issued_date")) or first(h.get("issued"))
    title_orig = strip_tags(first(h.get("label")))
    title_trans = strip_tags(h.get("trans_label") or "")
    kw = h.get("keyword") or []
    if not isinstance(kw, list):
        kw = [kw]
    return {
        "content_id": cid,
        "date": fmt_date(issued),
        "title": title_trans or title_orig,      # 표시용: 현대어역 우선
        "title_original": title_orig,            # 원문 표제(옛 표기)
        "newspaper": first(h.get("newspaperKorName")),
        "era": era_hint,                          # 검색어 기준 1차 태그 (검수 시 교정)
        "school_name": "",                       # 검수 시 채움
        "summary": "",                           # 검수 시 채움
        "keywords": [k for k in kw if k],
        "url": DETAIL_URL + cid,
        "thumbnail": "",                         # thumbs 단계에서 채움
        "verified": False,
        "_search_term": term,
        "_issued_date": issued,
        "_news_position": h.get("newsPosition") or first(h.get("imageNo")),
    }


def cmd_search():
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(TERMS_FILE, encoding="utf-8") as f:
        cfg = json.load(f)
    terms = list(cfg.get("terms", []))
    terms += cfg.get("figures_events", {}).get("terms", [])

    op = make_opener()
    by_id = {}
    for entry in terms:
        term = entry["term"]
        era = entry.get("era", "")
        print("[검색] '%s' (era=%s)" % (term, era))
        hits = search_term(op, term)
        print("   → %d건" % len(hits))
        for h in hits:
            rec = hit_to_record(h, era, term)
            cid = rec["content_id"]
            if not cid:
                continue
            if cid in by_id:
                # 이미 다른 검색어로 수집됨 → 검색어만 기록에 누적
                prev = by_id[cid].setdefault("_also_terms", [])
                if term not in prev:
                    prev.append(term)
            else:
                by_id[cid] = rec
        time.sleep(REQUEST_DELAY)

    records = sorted(by_id.values(), key=lambda r: r.get("date") or "")
    with open(CANDIDATES_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print("\n총 %d건(중복 제거)의 후보를 저장했습니다 → %s" % (len(records), CANDIDATES_FILE))
    print("다음 단계: 후보를 검수하여 동명 학교/무관 기사를 제외하고")
    print("           data/articles.json 으로 승격한 뒤 `python collect.py thumbs` 실행")


def download_thumb(op, rec):
    paper = rec.get("newspaper") or ""
    date = rec.get("_issued_date") or (rec.get("date", "").replace("-", ""))
    pos = rec.get("_news_position") or "01"
    cid = rec["content_id"]
    if not (paper and date):
        return False
    fname = "%s_%s_%s.png" % (paper, date, pos)
    url = COVER_URL + "?" + urllib.parse.urlencode({"paper": paper, "date": date, "file": fname})
    out = os.path.join(THUMB_DIR, cid + ".png")
    # 이미 받은 썸네일은 건너뜀(재실행 시 중복 다운로드 방지)
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        return True
    try:
        req = urllib.request.Request(url, headers={"Referer": DETAIL_URL + cid})
        data = op.open(req, timeout=TIMEOUT).read()
        if len(data) < 1000:   # 빈/오류 이미지 방지
            return False
        with open(out, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print("    [경고] 썸네일 실패 %s: %s" % (cid, e))
        return False


def cmd_thumbs(use_candidates=False):
    os.makedirs(THUMB_DIR, exist_ok=True)
    src = CANDIDATES_FILE if use_candidates else ARTICLES_FILE
    if not os.path.exists(src):
        print("대상 파일이 없습니다: %s" % src)
        return
    with open(src, encoding="utf-8") as f:
        records = json.load(f)

    op = make_opener()
    ok = 0
    for rec in records:
        if download_thumb(op, rec):
            rec["thumbnail"] = "data/thumbnails/%s.png" % rec["content_id"]
            ok += 1
            print("   ✓ %s" % rec["content_id"])
        else:
            rec["thumbnail"] = ""
        time.sleep(REQUEST_DELAY)

    with open(src, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print("\n썸네일 %d/%d건 다운로드 완료 → %s" % (ok, len(records), THUMB_DIR))


def main():
    args = sys.argv[1:]
    cmd = args[0] if args else "search"
    if cmd == "search":
        cmd_search()
    elif cmd == "thumbs":
        cmd_thumbs(use_candidates="--candidates" in args)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
