"use strict";

const ERA_ORDER = ["경성사범", "부속중학교", "부속고", "부설고"];
const ERA_LABEL = {
  "경성사범": "경성사범기",
  "부속중학교": "부속중학교",
  "부속고": "부속고등학교",
  "부설고": "부설고등학교",
};

// 시기(7단계) — 기사 발행 연도로 분류
const PERIODS = [
  { key: "1시기", label: "1시기 (1895–1945)", max: 1945 },
  { key: "2시기", label: "2시기 (1946–1950)", max: 1950 },
  { key: "3시기", label: "3시기 (1950년대)", max: 1959 },
  { key: "4시기", label: "4시기 (1960–1972)", max: 1972 },
  { key: "5시기", label: "5시기 (1973–1980)", max: 1980 },
  { key: "6시기", label: "6시기 (1980년대)", max: 1989 },
  { key: "7시기", label: "7시기 (1990년대–현재)", max: 9999 },
];
const PERIOD_LABEL = Object.fromEntries(PERIODS.map((p) => [p.key, p.label]));
function periodOf(date) {
  const y = parseInt((date || "").slice(0, 4), 10);
  if (!y) return "";
  for (const p of PERIODS) if (y <= p.max) return p.key;
  return "7시기";
}

let FEATURED = [];          // 검수완료(유효) 레코드 — rebuildEffective 에서 파생
let CANDIDATES = [];        // candidates.json (전체 기사 메타)
let VERIFIED_IDS = new Set();
let REJECTED_IDS = new Set(); // 유효 관련없음
let FAVORITE_IDS = new Set(); // 유효 중요(공유)
let LOCAL_FAV = new Set();    // (Firebase 미설정 시) 브라우저 중요 표시
let TAGS = {}; // 유효 태그 (content_id → [tag, ...])
const LS_FAV = "snha_fav";
function isFav(cid) {
  return FAVORITE_IDS.has(cid) || LOCAL_FAV.has(cid);
}

// ── 베이스라인(커밋된 JSON) ──────────────────────────────────────────────
let baselineVerified = new Set();   // articles.json 의 content_id
let baselineCuration = {};          // cid → {era, school_name, summary}
let baselineRejected = new Set();
let baselineFav = new Set();
let baselineTags = {};

// ── 공유 오버라이드(Firestore, 델타) ─────────────────────────────────────
let OVERRIDES = {};                 // cid → {state?, era?, school?, summary?, tags?, fav?}

// baseline + overrides → 유효 상태 재계산
function rebuildEffective() {
  VERIFIED_IDS = new Set();
  REJECTED_IDS = new Set();
  FAVORITE_IDS = new Set();
  TAGS = {};
  for (const r of CANDIDATES) {
    const cid = r.content_id;
    const ov = OVERRIDES[cid] || {};
    const base = baselineCuration[cid];
    let state = ov.state;
    if (!state)
      state = baselineVerified.has(cid)
        ? "featured"
        : baselineRejected.has(cid)
        ? "rejected"
        : "all";
    if (state === "featured") VERIFIED_IDS.add(cid);
    else if (state === "rejected") REJECTED_IDS.add(cid);
    // 검수 메타 오버레이(표시는 기존 필드 그대로 사용)
    r.era = ov.era || (base && base.era) || r._baseEra;
    r.school_name = "school" in ov ? ov.school : base ? base.school_name : "";
    r.summary = "summary" in ov ? ov.summary : base ? base.summary : "";
    const fav = "fav" in ov ? ov.fav : baselineFav.has(cid);
    if (fav) FAVORITE_IDS.add(cid);
    const t = "tags" in ov ? ov.tags : baselineTags[cid];
    if (t && t.length) TAGS[cid] = t;
  }
  FEATURED = CANDIDATES.filter((r) => VERIFIED_IDS.has(r.content_id)).sort(byDate);
}
const GISCUS = {
  repo: "Yooniversity/sndaebugo-archive",
  repoId: "R_kgDOSxpSGg",
  category: "General",
  categoryId: "DIC_kwDOSxpSGs4C-k04",
};
let ALL = [];               // 현재 탭의 활성 데이터셋
let tab = "featured";
const state = { q: "", periods: new Set(), papers: new Set(), topics: new Set(), favOnly: false };

// 기사 내용(제목·키워드)으로 '주제'를 분류하는 규칙. 한 기사가 여러 주제에 속할 수 있다.
const TOPIC_RULES = [
  { key: "입학·입시", words: ["입학", "입시", "시험", "합격", "지원", "연습과", "심상과", "보통과", "예과"] },
  { key: "모집·광고", words: ["모집", "광고", "보결", "안내"] },
  { key: "졸업", words: ["졸업"] },
  { key: "체육·운동", words: ["체육", "운동", "경기", "축구", "럭비", "농구", "정구", "야구", "빙상", "ホッケー", "선수", "강습단", "군사", "무용"] },
  { key: "행사·학예", words: ["학예", "전람", "음악", "강연", "토론", "전시회", "작품", "기념", "제막", "운동회"] },
  { key: "사건·사고", words: ["화재", "사건", "검거", "횡령", "맹휴", "동맹휴학", "충돌", "경관", "기면병", "치료", "병"] },
  { key: "전시동원", words: ["헌금", "헌납", "위문", "국방", "근로보국", "보국대", "봉독", "봉안", "성금", "시국"] },
  { key: "학교운영·인사", words: ["교장", "교유", "사령", "인사", "이전", "교사", "예산", "치과", "위생", "교명", "운영"] },
];

// 기사별 출처(아카이브 제공처) — content_id/_source 로 판별
const SOURCES = {
  naver: { full: "네이버 뉴스 라이브러리", short: "네이버 뉴스 라이브러리" },
  nl: { full: "국립중앙도서관 대한민국 신문 아카이브", short: "대한민국 신문 아카이브" },
};
function sourceOf(r) {
  const isNaver = r._source === "naver" || (r.content_id || "").startsWith("NAVER-");
  return isNaver ? SOURCES.naver : SOURCES.nl;
}

// 안정적 의사난수(문자열 해시) — 조회수 없을 때 대표 선택용
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function recordTopics(r) {
  const hay = [r.title, r.title_original, (r.keywords || []).join(" ")].join(" ");
  const out = TOPIC_RULES.filter((t) => t.words.some((w) => hay.includes(w))).map((t) => t.key);
  return out.length ? out : ["기타"];
}

const TAB_HINT = {
  featured: "큐레이터가 검수한 본교(서울) 기사입니다. 시기·신문·키워드로 좁혀 보세요.",
  all: "아직 검수하지 않은 후보입니다. 동명의 다른 학교나 무관한 기사가 섞여 있을 수 있으며, 검수완료·관련없음으로 분류한 기사는 이 목록에서 빠집니다.",
  rejected: "전체 후보에서 본교와 무관하다고 판단해 제외한 기사입니다. 잘못 옮겼으면 기사에서 전체 후보로 되돌릴 수 있습니다.",
};

const $ = (sel) => document.querySelector(sel);

async function load() {
  let featuredBaseline = [];
  try {
    const [fRes, cRes] = await Promise.all([
      fetch("data/articles.json", { cache: "no-store" }),
      fetch("data/candidates.json", { cache: "no-store" }),
    ]);
    featuredBaseline = await fRes.json();
    CANDIDATES = await cRes.json();
  } catch (e) {
    $("#timeline").innerHTML =
      '<p class="empty">데이터를 불러오지 못했습니다. 로컬 서버(python -m http.server)로 열어 주세요.</p>';
    return;
  }
  // 베이스라인 검수완료 + 검수 메타
  baselineVerified = new Set(featuredBaseline.map((r) => r.content_id));
  baselineCuration = {};
  featuredBaseline.forEach((r) => {
    baselineCuration[r.content_id] = {
      era: r.era,
      school_name: r.school_name,
      summary: r.summary,
    };
  });
  try {
    baselineRejected = new Set(await (await fetch("data/rejected.json", { cache: "no-store" })).json());
  } catch (e) {
    baselineRejected = new Set();
  }
  try {
    baselineFav = new Set(await (await fetch("data/favorites.json", { cache: "no-store" })).json());
  } catch (e) {
    baselineFav = new Set();
  }
  try {
    baselineTags = await (await fetch("data/tags.json", { cache: "no-store" })).json();
  } catch (e) {
    baselineTags = {};
  }
  try {
    LOCAL_FAV = new Set(JSON.parse(localStorage.getItem(LS_FAV) || "[]"));
  } catch (e) {
    LOCAL_FAV = new Set();
  }
  // 발행연도 기준 era 보존(검수 메타가 era 를 덮어쓸 수 있으므로)
  CANDIDATES.forEach((r) => (r._baseEra = r.era));
  CANDIDATES.sort(byDate);
  rebuildEffective(); // baseline(+빈 overrides) → 유효 상태
  refreshCounts();
  setupTabs();
  selectTab("featured");
  setupModal();
  initBackend(); // Firebase 또는 serve.py 폴백
}

const byDate = (a, b) => (a.date || "").localeCompare(b.date || "");

// 현재 탭에서 보여 줄 데이터셋.
//  - 전체 후보: 검수완료·관련없음을 모두 제외(중복 방지)
//  - 관련없음: 관련없음으로 분류된 후보만
function pendingCandidates() {
  return CANDIDATES.filter(
    (r) => !VERIFIED_IDS.has(r.content_id) && !REJECTED_IDS.has(r.content_id)
  );
}

function activeData() {
  if (tab === "all") return pendingCandidates();
  if (tab === "rejected")
    return CANDIDATES.filter((r) => REJECTED_IDS.has(r.content_id));
  return FEATURED;
}

function refreshCounts() {
  $("#tab-featured-n").textContent = FEATURED.length;
  $("#tab-all-n").textContent = pendingCandidates().length;
  $("#tab-rejected-n").textContent = CANDIDATES.filter((r) =>
    REJECTED_IDS.has(r.content_id)
  ).length;
}

/* ---------- 백엔드: Firebase(공유) 또는 serve.py(로컬 폴백) ---------- */
let API_OK = false;        // serve.py 폴백 감지
let curRec = null;         // 현재 모달에 열린 기사
let FIREBASE_ON = false;
let DB = null, AUTH = null;
let CURRENT_USER = null;
let ALLOWLIST = new Set();
let CAN_EDIT = false;

function firebaseEnabled() {
  return !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.firebase);
}
function canEditNow() {
  return FIREBASE_ON ? CAN_EDIT : API_OK;
}
function editHint() {
  return FIREBASE_ON
    ? "허용된 동료만 분류할 수 있습니다. 우측 상단에서 로그인하세요."
    : "로컬 검수 서버(python tools/serve.py)에서만 분류할 수 있습니다.";
}

function initBackend() {
  if (firebaseEnabled()) return initFirebase();
  detectCurationApi(); // serve.py 폴백
}

async function detectCurationApi() {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    const j = await res.json();
    API_OK = !!(j && j.ok);
  } catch (e) {
    API_OK = false; // 정적 배포 → 승격 버튼 숨김
  }
}

function initFirebase() {
  FIREBASE_ON = true;
  firebase.initializeApp(window.FIREBASE_CONFIG);
  DB = firebase.firestore();
  AUTH = firebase.auth();
  // 허용목록
  DB.collection("meta").doc("allowlist").get()
    .then((d) => {
      const emails = (d.exists && d.data().emails) || [];
      ALLOWLIST = new Set(emails.map((e) => String(e).toLowerCase()));
      updateCanEdit();
    })
    .catch(() => {});
  // 로그인 상태
  AUTH.onAuthStateChanged((u) => {
    CURRENT_USER = u;
    updateCanEdit();
  });
  // 오버라이드 실시간 구독
  DB.collection("overrides").onSnapshot(
    (snap) => {
      OVERRIDES = {};
      snap.forEach((doc) => (OVERRIDES[doc.id] = doc.data()));
      rebuildEffective();
      refreshCounts();
      render();
      if (curRec && !modalEl.hidden) refreshModalControls();
    },
    (err) => console.warn("overrides snapshot:", err && err.code)
  );
  renderAuth();
}

function updateCanEdit() {
  CAN_EDIT = !!(
    CURRENT_USER &&
    CURRENT_USER.email &&
    ALLOWLIST.has(CURRENT_USER.email.toLowerCase())
  );
  renderAuth();
  if (curRec && modalEl && !modalEl.hidden) refreshModalControls();
}

function renderAuth() {
  const btn = $("#auth-btn");
  const userEl = $("#auth-user");
  if (!btn || !userEl) return;
  if (!FIREBASE_ON) {
    btn.hidden = true;
    userEl.textContent = "";
    return;
  }
  btn.hidden = false;
  if (CURRENT_USER) {
    userEl.textContent =
      CURRENT_USER.email + (CAN_EDIT ? " · 편집 가능" : " · 열람 전용");
    btn.textContent = "로그아웃";
  } else {
    userEl.textContent = "";
    btn.textContent = "로그인";
  }
}

function refreshModalControls() {
  renderClassify(curRec);
  renderStar(curRec);
  renderTags(curRec);
  renderCurate(curRec);
}

/* ---------- 편집 쓰기(공유 오버라이드 또는 serve.py) ---------- */
async function writeOverride(cid, delta) {
  OVERRIDES[cid] = Object.assign({}, OVERRIDES[cid], delta); // 낙관적 갱신
  rebuildEffective();
  refreshCounts();
  render();
  if (curRec && !modalEl.hidden) refreshModalControls();
  try {
    await DB.collection("overrides")
      .doc(cid)
      .set(
        Object.assign({}, delta, {
          by: CURRENT_USER ? CURRENT_USER.email : "",
          at: firebase.firestore.FieldValue.serverTimestamp(),
        }),
        { merge: true }
      );
  } catch (e) {
    console.warn("override write failed:", e && e.code);
    throw e;
  }
}

async function setClassification(cid, state, extra) {
  if (FIREBASE_ON) {
    const delta = Object.assign({ state }, extra || {});
    await writeOverride(cid, delta);
    return;
  }
  // serve.py 폴백
  if (state === "featured") {
    const j = await postJSON("/api/promote", {
      content_id: cid,
      era: (extra && extra.era) || "부속고",
      school_name: (extra && extra.school) || "",
      summary: (extra && extra.summary) || "",
    });
    applyPromotion(j.record);
  } else if (state === "rejected") {
    await postJSON("/api/reject", { content_id: cid });
    applyReject(cid);
  } else {
    if (VERIFIED_IDS.has(cid)) {
      await postJSON("/api/demote", { content_id: cid });
      applyDemotion(cid);
    } else if (REJECTED_IDS.has(cid)) {
      await postJSON("/api/unreject", { content_id: cid });
      applyRestore(cid);
    }
  }
}

async function setFav(cid, on) {
  if (FIREBASE_ON) {
    await writeOverride(cid, { fav: on });
    return;
  }
  if (API_OK) {
    const j = await postJSON("/api/favorite", { content_id: cid, on });
    if (j.favorited) FAVORITE_IDS.add(cid);
    else FAVORITE_IDS.delete(cid);
  } else {
    if (LOCAL_FAV.has(cid)) LOCAL_FAV.delete(cid);
    else LOCAL_FAV.add(cid);
    try {
      localStorage.setItem(LS_FAV, JSON.stringify([...LOCAL_FAV]));
    } catch (e) {}
  }
  render();
}

async function setTagsFor(cid, tags) {
  if (FIREBASE_ON) {
    await writeOverride(cid, { tags });
    return;
  }
  const j = await postJSON("/api/tags", { content_id: cid, tags });
  if (j.tags.length) TAGS[cid] = j.tags;
  else delete TAGS[cid];
}

function setupTabs() {
  $(".tab-bar").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-tab]");
    if (!b || b.dataset.tab === tab) return;
    selectTab(b.dataset.tab);
  });
}

function selectTab(name) {
  tab = name;
  ALL = activeData();
  state.q = "";
  state.periods.clear();
  state.papers.clear();
  state.topics.clear();
  state.favOnly = false;
  const qEl = $("#q");
  if (qEl) qEl.value = "";
  document.querySelectorAll(".tab").forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  // '찜만 보기' 필터는 검수완료 탭에서만 노출
  const fav = $("#favFilter");
  if (fav) {
    fav.hidden = name !== "featured";
    fav.classList.remove("on");
  }
  // 선택해제는 태그 패널 열림 상태에 맞춤
  const clear = $("#clearFilters");
  if (clear) clear.hidden = $("#filterPanel").hidden;
  $("#tabHint").textContent = TAB_HINT[name] || "";
  buildFilters();
  render();
}

let filtersBound = false;

function buildFilters() {
  // 칩 건수: 현재 탭 데이터(ALL) 기준 (다른 선택과 무관한 정적 값)
  const n = (label, count) => `${label} <span class="chip-n">${count}</span>`;

  // 시기 chips (7단계, 고정 순서) — 발행 연도로 분류
  const periodCount = {};
  ALL.forEach((r) => {
    const p = periodOf(r.date);
    if (p) periodCount[p] = (periodCount[p] || 0) + 1;
  });
  const periodsPresent = PERIODS.map((p) => p.key).filter((k) => periodCount[k]);
  $("#eraFilters").innerHTML = periodsPresent
    .map((k) => `<button class="chip" data-period="${k}">${n(PERIOD_LABEL[k], periodCount[k])}</button>`)
    .join("");

  // topic chips (주제) — 현재 탭 데이터에서 도출, 규칙 순서 유지(+기타)
  const topicCount = {};
  ALL.forEach((r) => recordTopics(r).forEach((t) => (topicCount[t] = (topicCount[t] || 0) + 1)));
  const topicOrder = [...TOPIC_RULES.map((t) => t.key), "기타"].filter((t) => topicCount[t]);
  $("#topicFilters").innerHTML = topicOrder
    .map((t) => `<button class="chip" data-topic="${t}">${n(t, topicCount[t])}</button>`)
    .join("");

  // newspaper chips
  const paperCount = {};
  ALL.forEach((r) => {
    if (r.newspaper) paperCount[r.newspaper] = (paperCount[r.newspaper] || 0) + 1;
  });
  const papers = Object.keys(paperCount).sort((a, b) => a.localeCompare(b, "ko"));
  $("#paperFilters").innerHTML = papers
    .map((p) => `<button class="chip" data-paper="${p}">${n(escapeHtml(p), paperCount[p])}</button>`)
    .join("");

  if (filtersBound) return;
  filtersBound = true;

  $("#eraFilters").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-period]");
    if (!b) return;
    toggle(state.periods, b.dataset.period, b);
    render();
  });
  $("#paperFilters").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-paper]");
    if (!b) return;
    toggle(state.papers, b.dataset.paper, b);
    render();
  });
  $("#topicFilters").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-topic]");
    if (!b) return;
    toggle(state.topics, b.dataset.topic, b);
    render();
  });
  $("#filterToggle").addEventListener("click", (ev) => {
    const panel = $("#filterPanel");
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    $("#clearFilters").hidden = !willOpen; // 선택해제는 패널이 열렸을 때만 노출
    const btn = ev.currentTarget;
    btn.setAttribute("aria-expanded", String(willOpen));
    btn.classList.toggle("on", willOpen);
    btn.innerHTML = willOpen ? "🏷 태그 필터 접기 ▴" : "🏷 태그 필터 펼치기 ▾";
  });
  $("#clearFilters").addEventListener("click", clearFilters);
  $("#q").addEventListener("input", (ev) => {
    state.q = ev.target.value.trim().toLowerCase();
    render();
  });
  $("#favFilter").addEventListener("click", (ev) => {
    state.favOnly = !state.favOnly;
    ev.currentTarget.classList.toggle("on", state.favOnly);
    render();
  });

  // 명칭변천 띠 클릭 → 해당 시기(들) 필터 토글
  document.querySelectorAll(".era-track li").forEach((li) => {
    li.addEventListener("click", () => {
      const ps = ERA_PERIODS[li.dataset.era] || [];
      const allOn = ps.length && ps.every((p) => state.periods.has(p));
      ps.forEach((p) => {
        const chip = $(`#eraFilters [data-period="${p}"]`);
        if (allOn) {
          state.periods.delete(p);
          if (chip) chip.classList.remove("on");
        } else {
          state.periods.add(p);
          if (chip) chip.classList.add("on");
        }
      });
      if ($("#filterPanel").hidden) $("#filterToggle").click();
      render();
      document.querySelector(".controls").scrollIntoView({ behavior: "smooth" });
    });
  });
}

// 명칭(era) → 시기(period) 매핑(띠 클릭용)
const ERA_PERIODS = {
  "경성사범": ["1시기"],
  "부속중학교": ["2시기"],
  "부속고": ["3시기", "4시기", "5시기", "6시기", "7시기"],
  "부설고": ["7시기"],
};

function clearFilters() {
  // 패널 안 세 그룹(시기·주제·신문사) 선택만 해제. 찜 필터·검색어는 유지.
  state.periods.clear();
  state.topics.clear();
  state.papers.clear();
  document
    .querySelectorAll("#filterPanel .chip.on")
    .forEach((c) => c.classList.remove("on"));
  render();
}

function toggle(set, val, btn) {
  if (set.has(val)) {
    set.delete(val);
    btn.classList.remove("on");
  } else {
    set.add(val);
    btn.classList.add("on");
  }
}

function matches(r) {
  if (state.favOnly && !isFav(r.content_id)) return false;
  if (state.periods.size && !state.periods.has(periodOf(r.date))) return false;
  if (state.papers.size && !state.papers.has(r.newspaper)) return false;
  if (state.topics.size) {
    const ts = recordTopics(r);
    if (![...state.topics].some((t) => ts.includes(t))) return false;
  }
  if (state.q) {
    const hay = [
      r.title,
      r.title_original,
      r.newspaper,
      r.school_name,
      r.summary,
      (r.keywords || []).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

function render() {
  ALL = activeData(); // 승격/강등 후에도 최신 목록 반영
  const list = ALL.filter(matches);
  const tl = $("#timeline");
  tl.innerHTML = "";

  // 명칭변천 띠 활성 표시(매핑된 시기 중 하나라도 선택되면)
  document.querySelectorAll(".era-track li").forEach((li) =>
    li.classList.toggle(
      "active",
      (ERA_PERIODS[li.dataset.era] || []).some((p) => state.periods.has(p))
    )
  );

  $("#empty").hidden = list.length !== 0;
  $("#count").textContent = `${list.length}건`;
  if (list.length) {
    $("#range").textContent = `${list[0].date} ~ ${list[list.length - 1].date}`;
  } else {
    $("#range").textContent = "";
  }

  // 동일사건 묶음 사전계산: 현재 목록에 보이는 멤버끼리만, 대표 = 조회수 최고(동적)
  const clusters = {};
  for (const r of list) {
    if (r._cluster) (clusters[r._cluster] = clusters[r._cluster] || []).push(r);
  }
  const repId = {};
  for (const cid in clusters) {
    const mem = clusters[cid];
    if (mem.length < 2) continue;
    const maxVc = Math.max.apply(null, mem.map((m) => m.viewCount || 0));
    let best;
    if (maxVc > 0) {
      best = mem[0];
      for (const m of mem) if ((m.viewCount || 0) > (best.viewCount || 0)) best = m;
    } else {
      // 조회수 데이터 없음 → content_id 해시로 안정적 무작위 1건 선택(렌더마다 동일)
      best = mem.reduce((a, b) => (hashStr(a.content_id) <= hashStr(b.content_id) ? a : b));
    }
    repId[cid] = best.content_id;
  }

  let curYear = null;
  for (const r of list) {
    const cid = r._cluster;
    const grouped = cid && clusters[cid] && clusters[cid].length >= 2;
    if (grouped && repId[cid] !== r.content_id) continue; // 하위 멤버는 대표 밑에서 렌더
    const yr = (r.date || "").slice(0, 4);
    const yearLabel = yr !== curYear ? yr : null; // 해당 연도 첫 기사에만 연도 표시
    if (yearLabel) curYear = yr;
    const subs = grouped
      ? clusters[cid]
          .filter((m) => m.content_id !== r.content_id)
          .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
      : null;
    tl.appendChild(itemEl(r, yearLabel, subs));
  }
}

function itemEl(r, yearLabel, subs) {
  const wrap = document.createElement("div");
  wrap.className = yearLabel ? "item year-start" : "item";
  wrap.dataset.era = r.era;

  const thumb = r.thumbnail
    ? `<img class="thumb" src="${r.thumbnail}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
    : `<div class="thumb"></div>`;

  const kw = (r.keywords || [])
    .slice(0, 6)
    .map((k) => `#${escapeHtml(k)}`)
    .join(" ");

  // 후보(검수 전)는 summary 가 비어 있으므로 키워드를 본문으로 노출
  const bodyText = r.summary
    ? `<p class="sum">${escapeHtml(r.summary)}</p>`
    : kw
    ? `<p class="sum kw-only">${kw}</p>`
    : "";

  const fav = isFav(r.content_id)
    ? `<span class="badge fav">⭐ 중요</span>`
    : "";

  const yearTag = yearLabel ? `<div class="year-label">${yearLabel}년</div>` : "";

  const hasSubs = subs && subs.length;
  const subLabel = (open) =>
    `${open ? "▾" : "▸"} 비슷한 시기 같은 주제 ${subs.length}건 ${open ? "접기" : "더보기"}`;
  const subMeta = (m) =>
    m._source === "naver" && m.viewCount ? `조회 ${m.viewCount}` : (m.date || "");
  const subHtml = hasSubs
    ? `<button type="button" class="cluster-toggle" aria-expanded="false">${subLabel(false)}</button>` +
      `<div class="sub-articles" hidden>${subs
        .map(
          (m) =>
            `<button type="button" class="subitem" data-cid="${m.content_id}">` +
            `<span class="sub-paper">${escapeHtml(m.newspaper || "")}</span>` +
            `<span class="sub-title">${escapeHtml(m.title || "")}</span>` +
            `<span class="sub-vc">${escapeHtml(subMeta(m))}</span></button>`
        )
        .join("")}</div>`
    : "";

  wrap.innerHTML = `
    ${yearTag}
    <div class="card${fav ? " is-fav" : ""}">
      ${thumb}
      <div class="body">
        <div class="badges">
          ${fav}
          <span class="badge paper">${escapeHtml(r.newspaper || "")}</span>
          <span class="badge period">${periodOf(r.date) || ERA_LABEL[r.era] || r.era}</span>
          <span class="badge date">${r.date || "연도 미상"}</span>
          <span class="badge source">${escapeHtml(sourceOf(r).short)}</span>
        </div>
        <h3>${escapeHtml(r.title)}</h3>
        ${r.title_original && r.title_original !== r.title ? `<p class="orig">${escapeHtml(r.title_original)}</p>` : ""}
        ${bodyText}
      </div>
    </div>
    ${subHtml}`;
  wrap.querySelector(".card").addEventListener("click", () => openModal(r));
  if (hasSubs) {
    const toggle = wrap.querySelector(".cluster-toggle");
    const subsEl = wrap.querySelector(".sub-articles");
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = subsEl.hidden;
      subsEl.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = subLabel(open);
    });
    wrap.querySelectorAll(".subitem").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const m = subs.find((x) => x.content_id === btn.dataset.cid);
        if (m) openModal(m);
      });
    });
  }
  return wrap;
}

/* ---------- modal ---------- */
let modalEl;
function setupModal() {
  modalEl = $("#modal");
  modalEl.addEventListener("click", (ev) => {
    if (ev.target.hasAttribute("data-close")) closeModal();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeModal();
  });
  $("#m-star").addEventListener("click", starCurrent);
  // 위임 + 각 버튼 직접 바인딩(이중 안전)
  $("#m-classify").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-cls]");
    if (b) classifyCurrent(b.dataset.cls);
  });
  document.querySelectorAll("#m-classify .cls-btn").forEach((b) =>
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      classifyCurrent(b.dataset.cls);
    })
  );
  $("#tag-input").addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" || !curRec) return;
    ev.preventDefault();
    const cur = TAGS[curRec.content_id] || [];
    const adds = ev.target.value.split(",").map((t) => t.trim()).filter(Boolean);
    ev.target.value = "";
    if (adds.length) setTags(curRec, [...cur, ...adds]);
  });
  const authBtn = $("#auth-btn");
  if (authBtn)
    authBtn.addEventListener("click", () => {
      if (!FIREBASE_ON || !AUTH) return;
      if (CURRENT_USER) AUTH.signOut();
      else openLoginDialog();
    });
  wireLoginDialog();
}

/* ---------- 로그인 다이얼로그(이메일/비밀번호 + Google) ---------- */
function openLoginDialog() {
  const m = $("#login-modal");
  if (!m) return;
  setLoginMsg("");
  m.hidden = false;
  const email = $("#login-email");
  if (email) setTimeout(() => email.focus(), 0);
}
function closeLoginDialog() {
  const m = $("#login-modal");
  if (m) m.hidden = true;
}
function setLoginMsg(text, ok) {
  const el = $("#login-msg");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("ok", !!ok);
}
function authErrorText(e) {
  const code = (e && e.code) || "";
  const map = {
    "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
    "auth/missing-password": "비밀번호를 입력하세요.",
    "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
    "auth/email-already-in-use": "이미 가입된 이메일입니다. ‘로그인’을 눌러주세요.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/wrong-password": "비밀번호가 올바르지 않습니다.",
    "auth/user-not-found": "등록되지 않은 이메일입니다. ‘계정 만들기’를 눌러주세요.",
    "auth/too-many-requests": "시도가 많아 잠시 후 다시 해주세요.",
    "auth/operation-not-allowed":
      "이메일/비밀번호 로그인이 콘솔에서 아직 켜지지 않았습니다.",
    "auth/popup-closed-by-user": "로그인 창이 닫혔습니다.",
    "auth/popup-blocked": "팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.",
  };
  return map[code] || "오류: " + (code || (e && e.message) || "알 수 없음");
}
function wireLoginDialog() {
  const m = $("#login-modal");
  if (!m) return;
  m.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-login-close]")) closeLoginDialog();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !m.hidden) closeLoginDialog();
  });
  const submit = $("#login-submit");
  const signup = $("#login-signup");
  const google = $("#login-google");
  const pwEl = $("#login-pw");
  const creds = () => ({
    email: ($("#login-email").value || "").trim(),
    pw: $("#login-pw").value || "",
  });
  const doSignIn = () => {
    if (!AUTH) return;
    const { email, pw } = creds();
    if (!email) return setLoginMsg("이메일을 입력하세요.");
    setLoginMsg("로그인 중…");
    AUTH.signInWithEmailAndPassword(email, pw)
      .then(() => closeLoginDialog())
      .catch((e) => setLoginMsg(authErrorText(e)));
  };
  const doSignUp = () => {
    if (!AUTH) return;
    const { email, pw } = creds();
    if (!email) return setLoginMsg("이메일을 입력하세요.");
    setLoginMsg("계정 생성 중…");
    AUTH.createUserWithEmailAndPassword(email, pw)
      .then(() => closeLoginDialog())
      .catch((e) => setLoginMsg(authErrorText(e)));
  };
  if (submit) submit.addEventListener("click", doSignIn);
  if (signup) signup.addEventListener("click", doSignUp);
  if (pwEl)
    pwEl.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") doSignIn();
    });
  if (google)
    google.addEventListener("click", () => {
      if (!AUTH) return;
      setLoginMsg("Google 로그인 중…");
      AUTH.signInWithPopup(new firebase.auth.GoogleAuthProvider())
        .then(() => closeLoginDialog())
        .catch((e) => setLoginMsg(authErrorText(e)));
    });
}
function openModal(r) {
  curRec = r;
  $("#m-title").textContent = r.title;
  // 21세기 말씨 2줄 요약 — 썸네일 위
  const s2 = $("#m-summary2");
  s2.textContent = r.summary2 || "";
  s2.hidden = !r.summary2;
  $("#m-img").src = r.thumbnail || "";
  $("#m-img").style.display = r.thumbnail ? "" : "none";
  $(".m-sub").textContent =
    `${r.date} · ${r.newspaper || ""} · ${r.school_name || ERA_LABEL[r.era] || ""}` +
    (r._source === "naver" && r.viewCount ? ` · 조회 ${r.viewCount}` : "");
  $(".m-summary").textContent = r.summary || "";
  $(".m-keywords").textContent = (r.keywords || []).map((k) => "#" + k).join("  ");
  const src = sourceOf(r);
  $(".m-source").textContent = `출처: ${src.full}`;
  const link = $("#m-link");
  link.href = r.url;
  link.textContent = r.url || "";
  renderStar(r);
  setClassifyMsg("");
  renderClassify(r);
  renderTags(r);
  renderCurate(r);
  loadGiscus(r.content_id);
  modalEl.hidden = false;
  document.body.style.overflow = "hidden";
  // serve.py 폴백 모드에서만: 로컬 서버 상태 재확인(늦게 떠도 반영)
  if (!FIREBASE_ON) {
    detectCurationApi().then(() => {
      if (curRec === r) refreshModalControls();
    });
  }
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || "실패");
  return j;
}

/* ---------- 별표(중요) — 제목 앞 ---------- */
function starEditable() {
  // Firebase 설정 시: 허용 동료만. 미설정 시: 누구나(서버 또는 localStorage).
  return FIREBASE_ON ? CAN_EDIT : true;
}
function renderStar(r) {
  const fav = isFav(r.content_id);
  const star = $("#m-star");
  star.hidden = false; // 항상 표시(중요 표시는 모두에게 보임)
  star.textContent = fav ? "★" : "☆";
  star.classList.toggle("on", fav);
  star.style.cursor = starEditable() ? "pointer" : "default";
}

async function starCurrent() {
  if (!curRec) return;
  if (!starEditable()) return; // Firebase면 허용 동료만
  try {
    await setFav(curRec.content_id, !isFav(curRec.content_id));
    renderStar(curRec);
  } catch (e) {
    /* 무시 */
  }
}

/* ---------- 분류 이동 버튼(검수완료/전체후보/관련없음) ---------- */
function renderClassify(r) {
  const box = $("#m-classify");
  if (!canEditNow()) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const cid = r.content_id;
  const cur = VERIFIED_IDS.has(cid)
    ? "featured"
    : REJECTED_IDS.has(cid)
    ? "rejected"
    : "all";
  box.querySelectorAll(".cls-btn").forEach((b) =>
    b.classList.toggle("on", b.dataset.cls === cur)
  );
}

function setClassifyMsg(t) {
  const el = $("#m-classify-msg");
  if (el) el.textContent = t;
}

async function classifyCurrent(target) {
  if (!curRec) return;
  if (!FIREBASE_ON && !API_OK) {
    setClassifyMsg("서버 확인 중…");
    await detectCurationApi(); // serve.py 폴백: 클릭 시점 재확인
  }
  if (!canEditNow()) {
    setClassifyMsg(editHint());
    return;
  }
  const cid = curRec.content_id;
  const isV = VERIFIED_IDS.has(cid);
  const isR = REJECTED_IDS.has(cid);
  if (target === "featured" && isV) return setClassifyMsg("이미 검수완료입니다.");
  if (target === "rejected" && isR) return setClassifyMsg("이미 관련없음입니다.");
  if (target === "all" && !isV && !isR) return setClassifyMsg("이미 전체 후보입니다.");
  setClassifyMsg("이동 중…");
  try {
    const extra =
      target === "featured"
        ? { era: ERA_ORDER.includes(curRec.era) ? curRec.era : "부속고", school: curRec.school_name || "", summary: curRec.summary || "" }
        : null;
    await setClassification(cid, target, extra);
    setClassifyMsg(
      target === "featured"
        ? "✓ 검수완료로 이동했습니다."
        : target === "rejected"
        ? "✓ 관련없음으로 이동했습니다."
        : "✓ 전체 후보로 이동했습니다."
    );
    if (curRec) {
      renderClassify(curRec);
      renderStar(curRec);
    }
  } catch (e) {
    setClassifyMsg("분류 실패: " + (e.message || e.code || ""));
  }
}

/* ---------- 태그 ---------- */
function renderTags(r) {
  const tags = TAGS[r.content_id] || [];
  const editable = canEditNow();
  const chips = $("#m-tags");
  chips.innerHTML = tags
    .map(
      (t) =>
        `<span class="tag-chip">${escapeHtml(t)}` +
        (editable ? `<button type="button" class="tag-x" data-tag="${escapeHtml(t)}" aria-label="삭제">×</button>` : "") +
        `</span>`
    )
    .join("");
  $("#m-tagrow").hidden = !(tags.length || editable);
  $("#tag-input").hidden = !editable;
  chips.querySelectorAll(".tag-x").forEach((b) =>
    b.addEventListener("click", () => setTags(r, tags.filter((t) => t !== b.dataset.tag)))
  );
}

async function setTags(r, tags) {
  if (!canEditNow()) return;
  try {
    await setTagsFor(r.content_id, tags);
    renderTags(r);
  } catch (e) {
    /* 무시 */
  }
}

/* ---------- 댓글(Giscus) ---------- */
function loadGiscus(cid) {
  const c = $("#m-comments");
  if (!c) return;
  c.innerHTML = "";
  const s = document.createElement("script");
  s.src = "https://giscus.app/client.js";
  s.async = true;
  s.crossOrigin = "anonymous";
  const attrs = {
    "data-repo": GISCUS.repo,
    "data-repo-id": GISCUS.repoId,
    "data-category": GISCUS.category,
    "data-category-id": GISCUS.categoryId,
    "data-mapping": "specific",
    "data-term": cid,
    "data-strict": "1",
    "data-reactions-enabled": "1",
    "data-emit-metadata": "0",
    "data-input-position": "bottom",
    "data-theme": "light",
    "data-lang": "ko",
    "data-loading": "lazy",
  };
  for (const k in attrs) s.setAttribute(k, attrs[k]);
  c.appendChild(s);
}

function renderCurate(r) {
  // 검수 패널은 제거됨(분류 버튼 + 별표로 대체). 호환용 빈 함수.
  const box = $("#m-curate");
  if (box) box.hidden = true;
}

async function promoteCurrent() {
  if (!curRec || !canEditNow()) return;
  setCurMsg("승격 중…");
  try {
    await setClassification(curRec.content_id, "featured", {
      era: $("#c-era").value,
      school: $("#c-school").value.trim(),
      summary: $("#c-summary").value.trim(),
    });
    setCurMsg("★ 검수완료로 승격되었습니다.");
  } catch (e) {
    setCurMsg("승격 실패: " + (e.message || ""));
  }
}

async function demoteCurrent() {
  if (!curRec || !canEditNow()) return;
  setCurMsg("내리는 중…");
  try {
    await setClassification(curRec.content_id, "all");
    setCurMsg("검수완료에서 내렸습니다.");
  } catch (e) {
    setCurMsg("실패: " + (e.message || ""));
  }
}

async function favoriteCurrent() {
  if (!curRec || !canEditNow()) return;
  const turnOn = !isFav(curRec.content_id);
  setCurMsg(turnOn ? "찜하는 중…" : "해제하는 중…");
  try {
    await setFav(curRec.content_id, turnOn);
    if (curRec) renderCurate(curRec);
    setCurMsg(turnOn ? "⭐ 중요 기사로 찜했습니다." : "중요 표시를 해제했습니다.");
  } catch (e) {
    setCurMsg("실패: " + (e.message || ""));
  }
}

async function rejectCurrent() {
  if (!curRec || !canEditNow()) return;
  setCurMsg("이동 중…");
  try {
    await setClassification(curRec.content_id, "rejected");
    setCurMsg("✕ 관련없음으로 이동했습니다.");
  } catch (e) {
    setCurMsg("실패: " + (e.message || ""));
  }
}

async function restoreCurrent() {
  if (!curRec || !canEditNow()) return;
  setCurMsg("되돌리는 중…");
  try {
    await setClassification(curRec.content_id, "all");
    setCurMsg("전체 후보로 되돌렸습니다.");
  } catch (e) {
    setCurMsg("실패: " + (e.message || ""));
  }
}

function applyPromotion(record) {
  VERIFIED_IDS.add(record.content_id);
  REJECTED_IDS.delete(record.content_id); // 관련없음이었다면 해제(서버와 동일)
  // FEATURED 배열을 제자리(in-place)에서 갱신해 활성 탭(ALL) 참조와 동기화
  const i = FEATURED.findIndex((r) => r.content_id === record.content_id);
  if (i >= 0) FEATURED.splice(i, 1);
  FEATURED.push(record);
  FEATURED.sort(byDate);
  // 후보 목록의 해당 레코드도 검수 정보로 동기화(별표·요약 표시)
  const c = CANDIDATES.find((r) => r.content_id === record.content_id);
  if (c) Object.assign(c, record);
  curRec = c || record;
  refreshCounts();
  render();
  renderCurate(curRec);
}

function applyDemotion(cid) {
  VERIFIED_IDS.delete(cid);
  const i = FEATURED.findIndex((r) => r.content_id === cid);
  if (i >= 0) FEATURED.splice(i, 1);
  // 후보 레코드는 그대로 두되 검수 표시만 제거
  const c = CANDIDATES.find((r) => r.content_id === cid);
  if (c) {
    c.summary = "";
    c.school_name = "";
  }
  curRec = c || curRec;
  refreshCounts();
  render();
  renderCurate(curRec);
}

function applyReject(cid) {
  REJECTED_IDS.add(cid);
  // 검수완료였다면 함께 해제(서버에서 articles.json 재생성됨)
  if (VERIFIED_IDS.has(cid)) {
    VERIFIED_IDS.delete(cid);
    const i = FEATURED.findIndex((r) => r.content_id === cid);
    if (i >= 0) FEATURED.splice(i, 1);
  }
  curRec = CANDIDATES.find((r) => r.content_id === cid) || curRec;
  refreshCounts();
  render();
  renderCurate(curRec);
}

function applyRestore(cid) {
  REJECTED_IDS.delete(cid);
  curRec = CANDIDATES.find((r) => r.content_id === cid) || curRec;
  refreshCounts();
  render();
  renderCurate(curRec);
}

function setCurMsg(t) {
  const el = $("#c-msg");
  if (el) el.textContent = t;
}
function closeModal() {
  if (!modalEl) return;
  modalEl.hidden = true;
  document.body.style.overflow = "";
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

load();
