# -*- coding: utf-8 -*-
"""
동일사건 묶음: 같은 날짜 ±2일 안에서 서로 다른 신문사가 비슷한 제목으로 보도한
네이버 기사들을 한 묶음(_cluster)으로 묶는다. 대표 기사(조회수 최고)는 렌더 시 동적 선정.

대상: '관련없음'(rejected)·검수완료(curation) 아닌 NAVER- 후보(=관련 기사).
유사도: 제목에서 괄호 한글 독음 제거 후 글자 2-gram 집합의 Jaccard ≥ 0.45.

사용법:
  python tools/cluster_articles.py
"""
import os
import re
import json
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
CANDIDATES = os.path.join(DATA, "candidates.json")
REJECTED = os.path.join(DATA, "rejected.json")
CURATION = os.path.join(HERE, "curation.json")

WINDOW_DAYS = 2
JACCARD = 0.45


def norm(t):
    t = re.sub(r"\([^)]*\)", "", t or "")          # (한글 독음) 제거
    t = re.sub(r"[^가-힣A-Za-z0-9一-龥]", "", t)     # 기호·공백 제거
    return t


def grams(t):
    s = norm(t)
    return set(s[i:i + 2] for i in range(len(s) - 1))


def to_date(d):
    try:
        y, m, dd = d.split("-")
        return date(int(y), int(m), int(dd))
    except Exception:
        return None


def main():
    cands = json.load(open(CANDIDATES, encoding="utf-8"))
    rejected = set(json.load(open(REJECTED, encoding="utf-8"))) if os.path.exists(REJECTED) else set()
    curation = set(json.load(open(CURATION, encoding="utf-8"))) if os.path.exists(CURATION) else set()

    # 기존 _cluster 초기화(재실행 대비)
    for r in cands:
        r.pop("_cluster", None)

    items = [r for r in cands
             if r["content_id"].startswith("NAVER-")
             and r["content_id"] not in rejected
             and r["content_id"] not in curation]
    for r in items:
        r["_d"] = to_date(r.get("date", ""))
        r["_g"] = grams(r.get("title", ""))
    items = [r for r in items if r["_d"] and r["_g"]]
    items.sort(key=lambda r: r["_d"])

    # union-find
    parent = {r["content_id"]: r["content_id"] for r in items}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    n = len(items)
    for i in range(n):
        ri = items[i]
        for j in range(i + 1, n):
            rj = items[j]
            if (rj["_d"] - ri["_d"]).days > WINDOW_DAYS:
                break  # 정렬돼 있으므로 윈도우 벗어나면 중단
            if ri["newspaper"] == rj["newspaper"]:
                continue
            inter = len(ri["_g"] & rj["_g"])
            if not inter:
                continue
            uni = len(ri["_g"] | rj["_g"])
            if uni and inter / uni >= JACCARD:
                union(ri["content_id"], rj["content_id"])

    # 그룹 집계 → 크기 2 이상만 _cluster 부여
    groups = {}
    for r in items:
        groups.setdefault(find(r["content_id"]), []).append(r["content_id"])
    cluster_no = 0
    members = 0
    sizes = []
    for root, ids in groups.items():
        if len(ids) >= 2:
            cluster_no += 1
            cid = "C%04d" % cluster_no
            sizes.append(len(ids))
            for r in items:
                if r["content_id"] in ids:
                    r["_cluster"] = cid
                    members += 1

    # 임시 키 제거(필터로 빠진 레코드까지 전부)
    for r in cands:
        r.pop("_d", None)
        r.pop("_g", None)

    json.dump(cands, open(CANDIDATES, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("관련 네이버 기사 %d건 | 묶음 %d개 | 묶인 기사 %d건" % (len(items), cluster_no, members))
    if sizes:
        from collections import Counter
        print("묶음 크기 분포:", dict(sorted(Counter(sizes).items())))


if __name__ == "__main__":
    main()
