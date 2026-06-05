"use strict";

const ERA_ORDER = ["경성사범", "부속중학교", "부속고", "부설고"];
const ERA_LABEL = {
  "경성사범": "경성사범기",
  "부속중학교": "부속중학교",
  "부속고": "부속고등학교",
  "부설고": "부설고등학교",
};

let FEATURED = [];          // articles.json (검수완료)
let CANDIDATES = [];        // candidates.json (전체 후보)
let VERIFIED_IDS = new Set();
let REJECTED_IDS = new Set(); // rejected.json (관련없음)
let FAVORITE_IDS = new Set(); // favorites.json (검수완료 중 찜=중요)
let ALL = [];               // 현재 탭의 활성 데이터셋
let tab = "featured";
const state = { q: "", eras: new Set(), papers: new Set(), topics: new Set(), favOnly: false };

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
  try {
    const [fRes, cRes] = await Promise.all([
      fetch("data/articles.json", { cache: "no-store" }),
      fetch("data/candidates.json", { cache: "no-store" }),
    ]);
    FEATURED = await fRes.json();
    CANDIDATES = await cRes.json();
  } catch (e) {
    $("#timeline").innerHTML =
      '<p class="empty">데이터를 불러오지 못했습니다. 로컬 서버(python -m http.server)로 열어 주세요.</p>';
    return;
  }
  VERIFIED_IDS = new Set(FEATURED.map((r) => r.content_id));
  try {
    const rRes = await fetch("data/rejected.json", { cache: "no-store" });
    REJECTED_IDS = new Set(await rRes.json());
  } catch (e) {
    REJECTED_IDS = new Set(); // 파일 없음(정적 배포 초기 상태) → 빈 목록
  }
  try {
    const favRes = await fetch("data/favorites.json", { cache: "no-store" });
    FAVORITE_IDS = new Set(await favRes.json());
  } catch (e) {
    FAVORITE_IDS = new Set();
  }
  CANDIDATES.sort(byDate);
  FEATURED.sort(byDate);
  refreshCounts();
  setupTabs();
  selectTab("featured");
  setupModal();
  detectCurationApi();
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

/* ---------- 검수(큐레이션) API ---------- */
let API_OK = false;
let curRec = null; // 현재 모달에 열린 기사

async function detectCurationApi() {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    const j = await res.json();
    API_OK = !!(j && j.ok);
  } catch (e) {
    API_OK = false; // 정적 배포 → 승격 버튼 숨김
  }
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
  state.eras.clear();
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

  // era chips (고정 순서) — 현재 탭 데이터에 존재하는 era 만
  const eraCount = {};
  ALL.forEach((r) => (eraCount[r.era] = (eraCount[r.era] || 0) + 1));
  const erasPresent = ERA_ORDER.filter((e) => eraCount[e]);
  $("#eraFilters").innerHTML = erasPresent
    .map(
      (e) =>
        `<button class="chip" data-era="${e}"><span class="dot" style="background:var(--era-${e})"></span>${n(ERA_LABEL[e], eraCount[e])}</button>`
    )
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
    const b = ev.target.closest("[data-era]");
    if (!b) return;
    toggle(state.eras, b.dataset.era, b);
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

  // era band → filter shortcut
  document.querySelectorAll(".era-track li").forEach((li) => {
    li.addEventListener("click", () => {
      const e = li.dataset.era;
      const chip = $(`#eraFilters [data-era="${e}"]`);
      if (chip) {
        toggle(state.eras, e, chip);
        // 패널이 접혀 있으면 펼쳐서 적용된 필터가 보이도록
        if ($("#filterPanel").hidden) $("#filterToggle").click();
        render();
        document.querySelector(".controls").scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}

function clearFilters() {
  // 패널 안 세 그룹(시기·주제·신문사) 선택만 해제. 찜 필터·검색어는 유지.
  state.eras.clear();
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
  if (state.favOnly && !FAVORITE_IDS.has(r.content_id)) return false;
  if (state.eras.size && !state.eras.has(r.era)) return false;
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

  // era band 활성 표시
  document.querySelectorAll(".era-track li").forEach((li) =>
    li.classList.toggle("active", state.eras.has(li.dataset.era))
  );

  $("#empty").hidden = list.length !== 0;
  $("#count").textContent = `${list.length}건`;
  if (list.length) {
    $("#range").textContent = `${list[0].date} ~ ${list[list.length - 1].date}`;
  } else {
    $("#range").textContent = "";
  }

  let curYear = null;
  for (const r of list) {
    const yr = (r.date || "").slice(0, 4);
    const yearLabel = yr !== curYear ? yr : null; // 해당 연도 첫 기사에만 연도 표시
    if (yearLabel) curYear = yr;
    tl.appendChild(itemEl(r, yearLabel));
  }
}

function itemEl(r, yearLabel) {
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

  const fav = FAVORITE_IDS.has(r.content_id)
    ? `<span class="badge fav">⭐ 중요</span>`
    : "";

  const yearTag = yearLabel ? `<div class="year-label">${yearLabel}년</div>` : "";

  wrap.innerHTML = `
    ${yearTag}
    <div class="card${fav ? " is-fav" : ""}">
      ${thumb}
      <div class="body">
        <div class="badges">
          ${fav}
          <span class="badge paper">${escapeHtml(r.newspaper || "")}</span>
          <span class="badge era-${r.era}">${ERA_LABEL[r.era] || r.era}</span>
          <span class="badge date">${r.date || "연도 미상"}</span>
        </div>
        <h3>${escapeHtml(r.title)}</h3>
        ${r.title_original && r.title_original !== r.title ? `<p class="orig">${escapeHtml(r.title_original)}</p>` : ""}
        ${bodyText}
      </div>
    </div>`;
  wrap.querySelector(".card").addEventListener("click", () => openModal(r));
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
  $("#c-promote").addEventListener("click", promoteCurrent);
  $("#c-demote").addEventListener("click", demoteCurrent);
  $("#c-reject").addEventListener("click", rejectCurrent);
  $("#c-restore").addEventListener("click", restoreCurrent);
  $("#c-fav").addEventListener("click", favoriteCurrent);
}
function openModal(r) {
  curRec = r;
  $("#m-title").textContent = r.title;
  $("#m-img").src = r.thumbnail || "";
  $("#m-img").style.display = r.thumbnail ? "" : "none";
  $(".m-sub").textContent =
    `${r.date} · ${r.newspaper || ""} · ${r.school_name || ERA_LABEL[r.era] || ""}`;
  $(".m-summary").textContent = r.summary || "";
  $(".m-keywords").textContent = (r.keywords || []).map((k) => "#" + k).join("  ");
  const link = $("#m-link");
  link.href = r.url;
  renderCurate(r);
  modalEl.hidden = false;
  document.body.style.overflow = "hidden";
}

function renderCurate(r) {
  const box = $("#m-curate");
  if (!API_OK) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  $("#c-msg").textContent = "";
  const verified = VERIFIED_IDS.has(r.content_id);
  const rejected = REJECTED_IDS.has(r.content_id);
  // 셋 중 한 상태만: 후보(승격/관련없음) · 검수완료(내리기·찜) · 관련없음(되돌리기)
  $("#c-promote-box").hidden = verified || rejected;
  $("#c-demote-box").hidden = !verified;
  $("#c-restore-box").hidden = !rejected;
  if (verified) {
    const faved = FAVORITE_IDS.has(r.content_id);
    const btn = $("#c-fav");
    btn.textContent = faved ? "⭐ 중요 표시 해제" : "☆ 중요 기사로 찜하기";
    btn.classList.toggle("on", faved);
  }
  if (!verified && !rejected) {
    // 후보의 자동 태그(era)·기존 값으로 입력란 프리필
    $("#c-era").value = ERA_ORDER.includes(r.era) ? r.era : "경성사범";
    $("#c-school").value = r.school_name || "";
    $("#c-summary").value = r.summary || "";
  }
}

async function promoteCurrent() {
  if (!curRec) return;
  const body = {
    content_id: curRec.content_id,
    era: $("#c-era").value,
    school_name: $("#c-school").value.trim(),
    summary: $("#c-summary").value.trim(),
  };
  setCurMsg("승격 중…");
  try {
    const res = await fetch("/api/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "실패");
    applyPromotion(j.record);
    setCurMsg("★ 검수완료로 승격되었습니다.");
  } catch (e) {
    setCurMsg("승격 실패: " + e.message);
  }
}

async function demoteCurrent() {
  if (!curRec) return;
  setCurMsg("내리는 중…");
  try {
    const res = await fetch("/api/demote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_id: curRec.content_id }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "실패");
    applyDemotion(curRec.content_id);
    setCurMsg("검수완료에서 내렸습니다.");
  } catch (e) {
    setCurMsg("실패: " + e.message);
  }
}

async function favoriteCurrent() {
  if (!curRec) return;
  const turnOn = !FAVORITE_IDS.has(curRec.content_id);
  setCurMsg(turnOn ? "찜하는 중…" : "해제하는 중…");
  try {
    const res = await fetch("/api/favorite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_id: curRec.content_id, on: turnOn }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "실패");
    if (j.favorited) FAVORITE_IDS.add(curRec.content_id);
    else FAVORITE_IDS.delete(curRec.content_id);
    render();
    renderCurate(curRec);
    setCurMsg(j.favorited ? "⭐ 중요 기사로 찜했습니다." : "중요 표시를 해제했습니다.");
  } catch (e) {
    setCurMsg("실패: " + e.message);
  }
}

async function rejectCurrent() {
  if (!curRec) return;
  setCurMsg("이동 중…");
  try {
    const res = await fetch("/api/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_id: curRec.content_id }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "실패");
    applyReject(curRec.content_id);
    setCurMsg("✕ 관련없음으로 이동했습니다.");
  } catch (e) {
    setCurMsg("실패: " + e.message);
  }
}

async function restoreCurrent() {
  if (!curRec) return;
  setCurMsg("되돌리는 중…");
  try {
    const res = await fetch("/api/unreject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_id: curRec.content_id }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "실패");
    applyRestore(curRec.content_id);
    setCurMsg("전체 후보로 되돌렸습니다.");
  } catch (e) {
    setCurMsg("실패: " + e.message);
  }
}

function applyPromotion(record) {
  VERIFIED_IDS.add(record.content_id);
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
  FAVORITE_IDS.delete(cid); // 검수완료에서 빠지면 찜도 해제(서버와 동일)
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
    FAVORITE_IDS.delete(cid);
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
  $("#c-msg").textContent = t;
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
