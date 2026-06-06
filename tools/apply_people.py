# -*- coding: utf-8 -*-
"""
인물(사대부고 출신) 식별 결과(tools/_ppl_out/b*.json)를 data/tags.json 에 반영.

각 배치 파일: [{"id": "...", "is_alumnus": bool, "name": "..."}, ...]

- is_alumnus=true 인 기사에 태그 "인물" (+ 이름이 있으면 이름)을 '추가'한다(append-only).
- 기존 태그는 절대 덮어쓰지 않고 병합한다(중복 제거, 순서 보존).
- 프런트엔드는 태그 "인물" 이 달린 기사를 '주제 > 인물' 필터로 모은다.

사용법:
  python tools/apply_people.py
  python tools/apply_people.py --no-name   # 사람 이름 태그는 빼고 '인물'만
"""
import os
import sys
import json
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TAGS_FILE = os.path.join(ROOT, "data", "tags.json")
OUTDIR = os.path.join(HERE, "_ppl_out")
MARK = "인물"


def main():
    add_name = "--no-name" not in sys.argv

    if os.path.exists(TAGS_FILE):
        tags = json.load(open(TAGS_FILE, encoding="utf-8"))
    else:
        tags = {}

    hits = {}
    bad = 0
    for fp in sorted(glob.glob(os.path.join(OUTDIR, "b*.json"))):
        try:
            for o in json.load(open(fp, encoding="utf-8")):
                if not o.get("is_alumnus"):
                    continue
                cid = str(o.get("id") or "").strip()
                if cid:
                    hits[cid] = (o.get("name") or "").strip()
        except Exception as e:
            bad += 1
            print("  [경고] 배치 파싱 실패:", os.path.basename(fp), e)

    added_mark = added_name = 0
    for cid, name in hits.items():
        cur = list(tags.get(cid) or [])
        if MARK not in cur:
            cur.append(MARK)
            added_mark += 1
        if add_name and name and name not in cur:
            cur.append(name)
            added_name += 1
        tags[cid] = cur

    json.dump(tags, open(TAGS_FILE, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    print("인물 판정 %d건 (깨짐 %d)" % (len(hits), bad))
    print("'인물' 태그 추가 %d | 이름 태그 추가 %d | tags.json 총 %d개 기사"
          % (added_mark, added_name, len(tags)))


if __name__ == "__main__":
    main()
