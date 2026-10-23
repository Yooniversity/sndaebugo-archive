"use strict";
/* 학교사: 사대부고 발전사 8개 시기 */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let PERIODS = [], cur = 0;
let PRINCIPALS = [], GRADUATES = [], CLUBS = [];
let LB = [], lbIdx = 0, lbWheelLock = false;   // 현재 시기 사진 목록 + 라이트박스 인덱스

async function init() {
  bindSchoolTabs();
  bindLightbox();
  try { PRINCIPALS = await (await fetch("data/principals.json", { cache: "no-store" })).json(); } catch (e) { PRINCIPALS = []; }
  try { GRADUATES = await (await fetch("data/graduates.json", { cache: "no-store" })).json(); } catch (e) { GRADUATES = []; }
  try { CLUBS = await (await fetch("data/clubs.json", { cache: "no-store" })).json(); } catch (e) { CLUBS = []; }
  renderPrincipals();
  renderGraduates();
  renderClubs();
  try { PERIODS = await (await fetch("data/school.json", { cache: "no-store" })).json(); }
  catch (e) { PERIODS = []; }
  if (!Array.isArray(PERIODS) || !PERIODS.length) return;
  bindOverview();
  selectPeriod(0, false);
}

/* 역대 교장 그리드 */
function renderPrincipals() {
  const g = $("#principalsGrid");
  if (!g || !PRINCIPALS.length) return;
  g.innerHTML = PRINCIPALS.map((p, i) =>
    `<button class="prin-card" type="button" data-i="${i}">` +
    `<img class="prin-photo" src="data/principals/${esc(p.photo)}" alt="${esc(p.label)}" loading="lazy">` +
    `<span class="prin-name">${esc(p.label)}</span></button>`
  ).join("");
  g.querySelectorAll(".prin-card").forEach((b) => b.addEventListener("click", () => {
    LB = PRINCIPALS.map((p) => ({ file: "data/principals/" + p.photo, caption: p.label }));
    openLB(+b.dataset.i);
  }));
}

/* 졸업생: 기수 선택 + 이름 검색 */
function renderGraduates() {
  const sel = $("#gradRound"), result = $("#gradResult"), search = $("#gradSearch"), stat = $("#gradStat");
  if (!sel || !result || !GRADUATES.length) return;
  sel.innerHTML = GRADUATES.map((r, i) => `<option value="${i}">${esc(r.round)} (${r.male.length + r.female.length}명)</option>`).join("");
  const names = (arr) => arr.map((n) => `<span class="grad-name">${esc(n)}</span>`).join("");
  function showRound(i) {
    const r = GRADUATES[i]; if (!r) return;
    stat.textContent = `${r.round} · 남 ${r.male.length}명 · 여 ${r.female.length}명`;
    result.innerHTML =
      (r.male.length ? `<div class="grad-block"><h3 class="grad-gender">남자</h3><div class="grad-names">${names(r.male)}</div></div>` : "") +
      (r.female.length ? `<div class="grad-block"><h3 class="grad-gender">여자</h3><div class="grad-names">${names(r.female)}</div></div>` : "");
  }
  function doSearch(q) {
    q = q.trim();
    if (!q) { showRound(+sel.value); return; }
    const hits = [];
    GRADUATES.forEach((r) => {
      r.male.forEach((n) => { if (n.indexOf(q) > -1) hits.push([n, r.round, "남"]); });
      r.female.forEach((n) => { if (n.indexOf(q) > -1) hits.push([n, r.round, "여"]); });
    });
    stat.textContent = `‘${q}’ 검색 결과 ${hits.length}명`;
    result.innerHTML = hits.length
      ? `<div class="grad-names grad-search">${hits.map((h) => `<span class="grad-name"><b>${esc(h[0])}</b> <span class="grad-meta">${esc(h[1])} ${h[2]}</span></span>`).join("")}</div>`
      : `<p class="empty">검색 결과가 없습니다.</p>`;
  }
  sel.addEventListener("change", () => { search.value = ""; showRound(+sel.value); });
  let t;
  search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => doSearch(search.value), 180); });
  showRound(0);
}

/* 클럽활동 */
function renderClubs() {
  const root = $("#clubList");
  if (!root || !CLUBS.length) return;
  const photos = CLUBS.filter((c) => c.img).map((c) => ({ file: "data/clubs/" + c.img, caption: c.name }));
  let pi = 0;
  root.innerHTML = CLUBS.map((c) => {
    let h = `<div class="branch-item"><h4 class="branch-name">${esc(c.name)}</h4><p class="branch-desc">${esc(c.desc)}</p>`;
    if (c.img) h += `<button class="branch-photo" type="button" data-pi="${pi++}"><img src="data/clubs/${esc(c.img)}" alt="${esc(c.name)}" loading="lazy"></button>`;
    return h + `</div>`;
  }).join("");
  root.querySelectorAll(".branch-photo").forEach((b) => b.addEventListener("click", () => { LB = photos; openLB(+b.dataset.pi); }));
}

/* 학교사 상위 탭 + 역대 구성원 하위 탭 */
function bindSchoolTabs() {
  document.querySelectorAll("#schoolSubnav [data-ssub]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#schoolSubnav [data-ssub]").forEach((x) => x.classList.toggle("on", x === b));
      ["periods", "members", "activities"].forEach((s) => { const el = $("#ssub-" + s); if (el) el.hidden = s !== b.dataset.ssub; });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
  document.querySelectorAll("#memberSubnav [data-msub2]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#memberSubnav [data-msub2]").forEach((x) => x.classList.toggle("on", x === b));
      ["principals", "graduates"].forEach((s) => { const el = $("#msub2-" + s); if (el) el.hidden = s !== b.dataset.msub2; });
    }));
}

/* 전체개요 표에서 시기 선택 */
function bindOverview() {
  document.querySelectorAll(".sch-ov-table [data-i]").forEach((el) =>
    el.addEventListener("click", () => selectPeriod(+el.dataset.i, true)));
}
function selectPeriod(i, scroll) {
  cur = i;
  document.querySelectorAll(".sch-ov-table [data-i]").forEach((el) =>
    el.classList.toggle("sel", +el.dataset.i === i));
  renderPeriod(i);
  if (scroll) { const c = $("#schoolContent"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); }
}

function renderPeriod(i) {
  const p = PERIODS[i]; if (!p) return;
  // 라이트박스 사진 목록: 대표(뿌리) + 갤러리
  LB = (p.feature ? [p.feature] : []).concat(p.photos || []);
  const feat = p.feature
    ? `<figure class="sch-feature"><button class="sch-img" type="button" data-i="0">` +
      `<img src="${esc(p.feature.file)}" alt="${esc(p.feature.caption)}" loading="lazy"></button>` +
      `<figcaption>${esc(p.feature.caption)}</figcaption></figure>`
    : "";
  const base = p.feature ? 1 : 0;
  const photos = (p.photos || []).map((ph, j) =>
    `<figure class="sch-fig"><button class="sch-img" type="button" data-i="${base + j}">` +
    `<img src="${esc(ph.file)}" alt="${esc(ph.caption)}" loading="lazy"></button>` +
    `<figcaption>${esc(ph.caption)}</figcaption></figure>`
  ).join("");
  $("#schoolContent").innerHTML =
    `<article class="sch-period${p.feature ? " has-feature" : ""}">` +
    `<p class="sch-no">${i + 1}시기 · ${esc(p.years)}</p>` +
    `<div class="sch-head">` +
    `<div class="sch-headtext">` +
    `<h2 class="sch-title">${esc(p.title)}</h2>` +
    (p.subtitle ? `<p class="sch-sub">${esc(p.subtitle)}</p>` : "") +
    `</div>` +
    feat +
    `</div>` +
    `<div class="sch-body">${(p.paras || []).map((x) => `<p>${esc(x)}</p>`).join("")}</div>` +
    (photos ? `<div class="sch-photos">${photos}</div>` : "") +
    `</article>`;
  $("#schoolContent").querySelectorAll(".sch-img").forEach((b) =>
    b.addEventListener("click", () => openLB(+b.dataset.i)));
}

/* 좌우로 넘기는 라이트박스 (동창회 자료와 동일 형식) */
function showLB(i) {
  if (!LB.length) return;
  const n = LB.length;
  lbIdx = (i + n) % n;
  const cur = LB[lbIdx];
  const main = $("#schoolLightbox .ml-main");
  main.src = cur.file; main.alt = cur.caption || "";
  const pv = $("#schoolLightbox .ml-prev"), nx = $("#schoolLightbox .ml-next");
  if (n > 1) {
    pv.src = LB[(lbIdx - 1 + n) % n].file; pv.style.visibility = "";
    nx.src = LB[(lbIdx + 1) % n].file; nx.style.visibility = "";
  } else { pv.style.visibility = "hidden"; nx.style.visibility = "hidden"; }
  $("#schoolLightbox .ml-caption").textContent = cur.caption || "";
  $("#schoolLightbox .ml-count").textContent = (lbIdx + 1) + " / " + n;
}
function openLB(i) { showLB(i); $("#schoolLightbox").hidden = false; document.body.style.overflow = "hidden"; }
function closeLB() { $("#schoolLightbox").hidden = true; document.body.style.overflow = ""; }
function bindLightbox() {
  const lb = $("#schoolLightbox");
  if (!lb) return;
  lb.querySelector(".ml-close").addEventListener("click", (e) => { e.stopPropagation(); closeLB(); });
  lb.addEventListener("click", (e) => {
    if (e.target.closest(".ml-close")) return;
    if (e.clientX < window.innerWidth / 2) showLB(lbIdx - 1); else showLB(lbIdx + 1);
  });
  lb.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (lbWheelLock) return;
    lbWheelLock = true; setTimeout(() => (lbWheelLock = false), 320);
    showLB(lbIdx + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLB();
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") showLB(lbIdx + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") showLB(lbIdx - 1);
  });
}
document.addEventListener("DOMContentLoaded", init);
