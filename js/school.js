"use strict";
/* 학교사: 사대부고 발전사 8개 시기 */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let PERIODS = [], cur = 0;
let LB = [], lbIdx = 0, lbWheelLock = false;   // 현재 시기 사진 목록 + 라이트박스 인덱스

async function init() {
  try { PERIODS = await (await fetch("data/school.json", { cache: "no-store" })).json(); }
  catch (e) { PERIODS = []; }
  if (!Array.isArray(PERIODS) || !PERIODS.length) return;
  bindOverview();
  selectPeriod(0, false);
  bindLightbox();
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
