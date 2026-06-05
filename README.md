# 서울사대부고 신문 아카이브

서울대학교 사범대학 부설고등학교(서울사대부고) **역사관 전시 콘텐츠**를 위한 신문 기사 아카이브.
국립중앙도서관 [대한민국 신문 아카이브](https://nl.go.kr/newspaper/)에서 학교 관련 기사를
수집·검수해, 날짜순 타임라인 웹사이트로 보여 줍니다. 각 기사는 원문으로 연결됩니다.

사이트는 세 개의 탭으로 나뉩니다.
- **검수완료**: 큐레이터가 검수한 본교(서울) 기사(`articles.json`). 시기·요약이 정리된 전시용 데이터.
  기사를 열어 **☆ 중요 기사로 찜하기**를 누르면 `⭐ 중요` 태그가 붙고(`data/favorites.json`),
  상단 **⭐ 중요 기사만** 필터로 찜한 기사만 모아 볼 수 있습니다.
- **전체 후보**: 자동 수집기가 모은 후보 중 **아직 검수하지 않은** 기사(`candidates.json`). 동명의 다른
  학교나 무관한 기사가 섞여 있을 수 있습니다. **검수완료·관련없음으로 분류한 기사는 이 탭에서 빠집니다**(탭 간 중복 없음).
- **관련없음**: 전체 후보에서 본교와 무관하다고 판단해 제외한 기사(`data/rejected.json` 의 content_id 목록).
  기사 모달에서 다시 **전체 후보로 되돌리기** 할 수 있습니다.

## 학교 명칭 변천 (검색·태깅 기준)

| 시기 | 명칭 | era 태그 |
|---|---|---|
| ~1946 | 경성사범학교 · 경성여자사범학교 (전신) | `경성사범` |
| 1946.9.1 | (국립)서울대학교 사범대학 부속중학교(6년제) | `부속중학교` |
| 1951.9.1 | 중·고 분리 → 사범대학 부속고등학교 | `부속고` |
| 2001.3.1 | 사범대학 부설고등학교 (부속→부설) | `부설고` |

## 폴더 구조

```
sndaebugo-archive/
├── index.html              # 타임라인 메인 페이지 (검수완료 / 전체 후보 탭)
├── css/style.css
├── js/app.js               # articles.json + candidates.json 로드 → 탭별 날짜순 렌더링 + 필터 + 모달
├── data/
│   ├── articles.json       # ✅ 검증 완료 기사 (검수완료 탭)
│   ├── candidates.json     # 수집기가 모은 후보 전체 (전체 후보 탭, 동명 학교 다수 포함)
│   ├── rejected.json       # '관련없음'으로 분류한 후보의 content_id 목록
│   ├── favorites.json      # '중요(찜)' 표시한 검수완료 기사의 content_id 목록
│   └── thumbnails/         # 지면 썸네일 (content_id.png)
└── tools/
    ├── collect.py          # 신문 아카이브 검색 → 후보 수집 / 썸네일 다운로드
    ├── curate.py           # curation.json + candidates.json → articles.json 재생성
    ├── auto_classify.py    # 규칙 기반 자동 분류(제목·태그 공통 '경성사범') → 검수완료 추가
    ├── curation.json       # ✅ 승격 결정의 단일 소스 (content_id → era·교명·요약)
    ├── serve.py            # 로컬 큐레이션 서버 (정적 서빙 + 승격/강등 API)
    └── search_terms.json   # 시기별 검색어 목록
```

## 데이터 파이프라인

> `nl.go.kr` 의 비공개 검색 API(`search_newspaper.do`, POST+JSON)를 이용합니다.
> 공공기관 사이트이므로 요청 사이 지연(`REQUEST_DELAY`)을 둡니다.

```bash
# 1) 후보 수집 — search_terms.json 의 검색어로 기사 후보를 모음
python tools/collect.py search          # → data/candidates.json

# 2) 검수 — 본교(서울) 기사만 골라 검증 정보 부여
python tools/curate.py                  # → data/articles.json

# 3) 썸네일 — 검증 기사의 신문 지면 이미지 다운로드
python tools/collect.py thumbs          # → data/thumbnails/*.png

# 4) 미리보기 — 검수(승격) 가능한 로컬 큐레이션 서버로 열기
python tools/serve.py 8000              # http://localhost:8000
```

> 검수 기능이 필요 없으면 `python -m http.server 8000` 으로도 열 수 있습니다(승격 버튼만 숨겨짐).

## 기사를 추가·검수하는 법

검색 결과에는 **대구사대부중·경북사대부고·이화여대 사범대 부속중** 등 동명의 다른 학교와
무관한 일반 입시 기사가 섞여 있습니다. 그래서 자동 수집분은 모두 `candidates.json` 에만
들어가고(**전체 후보** 탭), **사람이 검수한 것만** `articles.json`(**검수완료** 탭)으로 올라갑니다.

### 방법 A — 웹에서 클릭으로 승격 (권장)

1. `python tools/serve.py` 로 사이트를 엽니다(로컬 큐레이션 서버).
2. **전체 후보** 탭에서 본교 기사를 클릭해 지면 이미지를 확인합니다.
3. 모달 하단 **검수완료로 승격** 패널에서 시기·교명·요약을 입력하고 **★ 검수완료로 승격**을 누릅니다.
   - 즉시 **검수완료** 탭으로 이동하고, `tools/curation.json` 과 `data/articles.json` 에 기록됩니다(새로고침·배포 후에도 유지).
   - 잘못 올렸으면 그 기사 모달에서 **검수완료에서 내리기**로 되돌릴 수 있습니다.
   - 본교와 무관한 기사라면 같은 패널의 **✕ 관련없음으로 이동**을 눌러 **관련없음** 탭으로 보냅니다
     (`data/rejected.json` 에 기록). 관련없음 탭에서 **전체 후보로 되돌리기**도 가능합니다.
4. 새로 승격한 기사의 썸네일이 아직 없다면 `python tools/collect.py thumbs` 를 한 번 더 실행합니다.

### 방법 A′ — 규칙 기반 자동 분류

제목에 `경성사범`이 들어가는 후보는 본교 전신(경성사범학교) 기사로 보고 한 번에 검수완료로 올릴 수
있습니다. `경성사범`은 경성사범학교를 가리키는 고유 표기라 동명 학교 오탐 위험이 거의 없습니다.

```bash
python tools/auto_classify.py     # → curation.json 에 추가 + articles.json 재생성
```

이미 검수완료이거나 **관련없음**(`data/rejected.json`)으로 분류한 기사는 건너뜁니다. 기존 검수완료
항목은 보존하고 신규 매치만 추가합니다(요약은 비워 두며 나중에 보강 가능).

> 승격 결정의 단일 소스는 `tools/curation.json`(content_id → era·school_name·summary)이며,
> `python tools/curate.py` 를 다시 돌려도 이 파일을 기준으로 `articles.json` 이 재생성됩니다.

### 방법 B — 파일 직접 편집

1. `data/candidates.json` 에서 본교 기사를 찾습니다. (제목·신문명으로 서울 본교인지 확인)
2. `tools/curation.json` 에 `"CONTENT_ID": {"era": ..., "school_name": ..., "summary": ...}` 항목을 추가합니다.
3. `python tools/curate.py` → `python tools/collect.py thumbs` 를 다시 실행합니다.

검색어를 늘리려면 `tools/search_terms.json` 의 `terms`(또는 인물·사건용 `figures_events.terms`)에
항목을 추가한 뒤 `collect.py search` 부터 다시 실행하세요.

### 자동 수집이 막힐 때 (수동 입력 폴백)

`nl.go.kr` 사이트 구조가 바뀌어 `collect.py` 가 동작하지 않으면, 사이트에서 직접 기사를 찾아
URL의 `content_id=CNTS-...` 값을 확인한 뒤 `data/articles.json` 에 아래 형식으로 직접 추가할 수
있습니다(스키마 동일). 썸네일 경로는 비워 두면 카드에 이미지 없이 표시됩니다.

```json
{
  "content_id": "CNTS-00000000000",
  "date": "1958-04-30",
  "title": "표시용 제목(현대어)",
  "title_original": "원문 표제(옛 표기)",
  "newspaper": "평화신문",
  "era": "부속고",
  "school_name": "서울대학교 사범대학 부속고등학교",
  "summary": "한두 문장 요약",
  "keywords": ["맹휴", "교장"],
  "url": "https://nl.go.kr/newspaper/detail.do?content_id=CNTS-00000000000",
  "thumbnail": "",
  "verified": true
}
```

## 배포

서버가 필요 없는 정적 사이트입니다. 폴더 전체를 GitHub Pages, Netlify 등에 올리면 됩니다.

## 출처·저작권

자료 출처는 **국립중앙도서관 대한민국 신문 아카이브**입니다. 신문 지면 이미지의 저작권은
국립중앙도서관 및 원 발행처에 있으며, 본 사이트는 학교 역사관 전시·교육 목적의 인용입니다.
