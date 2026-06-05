# -*- coding: utf-8 -*-
"""
로컬 큐레이션 서버.

정적 사이트를 서빙하면서, 웹 UI에서 후보를 '검수완료'로 승격/강등할 수 있는
간단한 API를 제공한다. 승격 결정은 tools/curation.json 에 기록되고
data/articles.json 이 즉시 재생성되므로, 새로고침 후에도 유지되고
기존 수집→검수 파이프라인(curate.py)과 동일한 단일 소스를 공유한다.

  GET  /api/status                 → {"ok": true}
  POST /api/promote                → curation.json 에 추가 + articles.json 재생성
       body: {content_id, era, school_name, summary}
  POST /api/demote                 → curation.json 에서 제거 + articles.json 재생성
       body: {content_id}

사용법:
  python tools/serve.py [port]     # 기본 8000, http://localhost:8000

배포는 여전히 정적 호스팅으로 가능하다. 정적 호스팅에서는 /api/* 가 없으므로
웹 UI가 승격 버튼을 자동으로 숨긴다(검수는 로컬에서만).
"""
import os
import sys
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import curate  # noqa: E402  (curation.json 읽기/쓰기 + articles.json 재생성)

# '관련없음'으로 분류한 후보 · '찜(중요)'한 검수완료 기사의 content_id 목록.
# 정적 사이트가 직접 읽도록 data/ 에 둔다.
REJECTED_FILE = os.path.join(ROOT, "data", "rejected.json")
FAVORITES_FILE = os.path.join(ROOT, "data", "favorites.json")
TAGS_FILE = os.path.join(ROOT, "data", "tags.json")  # {content_id: [tag, ...]}


def _load_ids(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save_ids(path, ids):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(ids, f, ensure_ascii=False, indent=2)


def load_rejected():
    return _load_ids(REJECTED_FILE)


def save_rejected(ids):
    _save_ids(REJECTED_FILE, ids)


def load_favorites():
    return _load_ids(FAVORITES_FILE)


def save_favorites(ids):
    _save_ids(FAVORITES_FILE, ids)


def load_tags():
    if not os.path.exists(TAGS_FILE):
        return {}
    with open(TAGS_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_tags(d):
    with open(TAGS_FILE, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # 정적 파일·API 모두 캐시 금지 — 검수 중 데이터/스크립트 변경이 즉시 반영되게.
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # ---- 응답 헬퍼 -------------------------------------------------------
    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        raw = self.rfile.read(length).decode("utf-8", "ignore")
        return json.loads(raw)

    # ---- 라우팅 ---------------------------------------------------------
    def do_GET(self):
        if self.path.rstrip("/") == "/api/status":
            return self._json(200, {"ok": True})
        return super().do_GET()

    def do_POST(self):
        route = self.path.rstrip("/")
        try:
            if route == "/api/promote":
                return self._promote()
            if route == "/api/demote":
                return self._demote()
            if route == "/api/reject":
                return self._reject()
            if route == "/api/unreject":
                return self._unreject()
            if route == "/api/favorite":
                return self._favorite()
            if route == "/api/tags":
                return self._tags()
        except Exception as e:
            return self._json(500, {"ok": False, "error": str(e)})
        self._json(404, {"ok": False, "error": "unknown endpoint"})

    # ---- 핸들러 ---------------------------------------------------------
    def _promote(self):
        data = self._read_json()
        cid = (data.get("content_id") or "").strip()
        era = (data.get("era") or "").strip()
        school = (data.get("school_name") or "").strip()
        summary = (data.get("summary") or "").strip()
        if not cid:
            return self._json(400, {"ok": False, "error": "content_id 누락"})
        if era not in curate.VALID_ERAS:
            return self._json(400, {"ok": False,
                "error": "era 는 %s 중 하나여야 합니다" % " | ".join(curate.VALID_ERAS)})

        curation = curate.load_curation()
        curation[cid] = {"era": era, "school_name": school, "summary": summary}
        curate.save_curation(curation)
        out, missing = curate.build_articles(curation)
        if cid in missing:
            # 롤백: candidates.json 에 없는 id
            curation.pop(cid, None)
            curate.save_curation(curation)
            curate.build_articles(curation)
            return self._json(400, {"ok": False,
                "error": "candidates.json 에 없는 content_id"})
        # 검수완료된 기사는 '관련없음'에서 자동 제거(상태 상호 배타)
        rejected = load_rejected()
        if cid in rejected:
            rejected = [x for x in rejected if x != cid]
            save_rejected(rejected)
        rec = next((r for r in out if r["content_id"] == cid), None)
        self._json(200, {"ok": True, "record": rec,
                         "featured_count": len(out), "rejected_count": len(rejected)})

    def _demote(self):
        data = self._read_json()
        cid = (data.get("content_id") or "").strip()
        curation = curate.load_curation()
        if cid not in curation:
            return self._json(404, {"ok": False, "error": "검수완료가 아닙니다"})
        curation.pop(cid, None)
        curate.save_curation(curation)
        out, _ = curate.build_articles(curation)
        self._unfavorite(cid)  # 검수완료에서 빠지면 찜도 해제
        self._json(200, {"ok": True, "featured_count": len(out)})

    def _unfavorite(self, cid):
        favs = load_favorites()
        if cid in favs:
            save_favorites([x for x in favs if x != cid])

    def _favorite(self):
        data = self._read_json()
        cid = (data.get("content_id") or "").strip()
        if not cid:
            return self._json(400, {"ok": False, "error": "content_id 누락"})
        # 찜은 검수완료 기사에만 — 검수완료가 아니면 거부
        if cid not in curate.load_curation():
            return self._json(400, {"ok": False, "error": "검수완료 기사만 찜할 수 있습니다"})
        on = bool(data.get("on", True))
        favs = load_favorites()
        if on and cid not in favs:
            favs.append(cid)
        elif not on:
            favs = [x for x in favs if x != cid]
        save_favorites(favs)
        self._json(200, {"ok": True, "favorited": on, "favorite_count": len(favs)})

    def _tags(self):
        data = self._read_json()
        cid = (data.get("content_id") or "").strip()
        if not cid:
            return self._json(400, {"ok": False, "error": "content_id 누락"})
        # 태그 목록 전체 교체(정리·중복 제거)
        raw = data.get("tags") or []
        seen, tags = set(), []
        for t in raw:
            t = (str(t) or "").strip()
            if t and t not in seen:
                seen.add(t)
                tags.append(t)
        store = load_tags()
        if tags:
            store[cid] = tags
        else:
            store.pop(cid, None)
        save_tags(store)
        self._json(200, {"ok": True, "tags": tags})

    def _reject(self):
        data = self._read_json()
        cid = (data.get("content_id") or "").strip()
        if not cid:
            return self._json(400, {"ok": False, "error": "content_id 누락"})
        # 검수완료 상태였다면 먼저 내린다(상태 상호 배타)
        curation = curate.load_curation()
        featured_count = None
        if cid in curation:
            curation.pop(cid, None)
            curate.save_curation(curation)
            out, _ = curate.build_articles(curation)
            featured_count = len(out)
            self._unfavorite(cid)  # 검수완료에서 빠지면 찜도 해제
        rejected = load_rejected()
        if cid not in rejected:
            rejected.append(cid)
            save_rejected(rejected)
        payload = {"ok": True, "rejected_count": len(rejected)}
        if featured_count is not None:
            payload["featured_count"] = featured_count
        self._json(200, payload)

    def _unreject(self):
        data = self._read_json()
        cid = (data.get("content_id") or "").strip()
        rejected = load_rejected()
        if cid not in rejected:
            return self._json(404, {"ok": False, "error": "관련없음 목록에 없습니다"})
        rejected = [x for x in rejected if x != cid]
        save_rejected(rejected)
        self._json(200, {"ok": True, "rejected_count": len(rejected)})

    def log_message(self, fmt, *args):
        # /api/* 만 간단히 로깅, 정적 파일 요청은 조용히
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s - %s\n" % (self.command, self.path))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("큐레이션 서버 실행: http://localhost:%d  (Ctrl+C 종료)" % port)
    print("  · 정적 사이트 + 승격/강등 API(/api/promote, /api/demote)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n종료")


if __name__ == "__main__":
    main()
