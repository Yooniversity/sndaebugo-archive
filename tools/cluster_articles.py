# -*- coding: utf-8 -*-
"""
동일사건/동일주제 묶음: 비슷한 시기(±3일)에 비슷한 제목의 기사들을 한 묶음(_cluster)으로.

- 대상: '관련없음'(rejected)이 아닌 모든 기사(국립중앙도서관 CNTS + 네이버 NAVER, 검수완료 포함).
  같은 신문사여도 묶는다(예: 매일신보가 며칠에 걸쳐 같은 주제를 연재한 경우).
- 유사도: 제목에서 괄호 한글 독음 제거 후 글자 2-gram 집합의 Jaccard ≥ 0.40.
- 시드(가장 이른 기사) 기준 ±3일 윈도우로만 묶어, 사령·인사 같은 빈출 제목이 전 기간으로
  연쇄되는 것을 막는다(묶음의 날짜 폭은 시드+3일 이내).
- 대표 기사는 렌더 시 동적 선정(조회수 최고, 조회수 없으면 안정적 무작위).

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

WINDOW_DAYS = 3
JACCARD = 0.40


def norm(t):
    t = re.sub(r"\([^)]*\)", "", t or "")          # (한글 독음) 제거
    t = re.sub(r"[^가-힣A-Za-z0-9一-龥]", "", t)     # 기호·공백 제거
    return t


def grams(t):
    s = norm(t)
    return set(s[i:i + 2] for i in range(len(s) - 1)) or {s}


def sim(a, b):
    inter = len(a & b)
    if not inter:
        return 0.0
    return inter / len(a | b)


def to_date(d):
    try:
        y, m, dd = d.split("-")
        return date(int(y), int(m), int(dd))
    except Exception:
        return None


def main():
    cands = json.load(open(CANDIDATES, encoding="utf-8"))
    rejected = set(json.load(open(REJECTED, encoding="utf-8"))) if os.path.exists(REJECTED) else set()

    for r in cands:
        r.pop("_cluster", None)

    items = [r for r in cands if r["content_id"] not in rejected]
    for r in items:
        r["_d"] = to_date(r.get("date", ""))
        r["_g"] = grams(r.get("title", ""))
    items = [r for r in items if r["_d"]]
    items.sort(key=lambda r: r["_d"])

    clustered = set()
    cluster_no = 0
    members = 0
    sizes = []
    n = len(items)
    for i in range(n):
        seed = items[i]
        if seed["content_id"] in clustered:
            continue
        group = [seed]
        for j in range(i + 1, n):
            rj = items[j]
            if rj["content_id"] in clustered:
                continue
            if (rj["_d"] - seed["_d"]).days > WINDOW_DAYS:
                break  # 정렬돼 있으므로 윈도우 벗어나면 종료
            # 시드 또는 이미 묶인 멤버 중 하나와 유사하면 합류(시드 윈도우 내로 한정)
            if any(sim(m["_g"], rj["_g"]) >= JACCARD for m in group):
                group.append(rj)
        if len(group) >= 2:
            cluster_no += 1
            cid = "C%04d" % cluster_no
            sizes.append(len(group))
            for r in group:
                r["_cluster"] = cid
                clustered.add(r["content_id"])
                members += 1
        else:
            clustered.add(seed["content_id"])

    for r in cands:
        r.pop("_d", None)
        r.pop("_g", None)

    json.dump(cands, open(CANDIDATES, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("대상 %d건 | 묶음 %d개 | 묶인 기사 %d건" % (len(items), cluster_no, members))
    if sizes:
        from collections import Counter
        print("묶음 크기 분포:", dict(sorted(Counter(sizes).items())))


if __name__ == "__main__":
    main()
