"use strict";
/* 자랑스러운 부고인(갤러리) + 천하부고 동창회. app.js 와 독립. */
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
let RECIPIENTS = [], CHAIRS = [], ACTS = [], MEDIA = [], PROUD = [], OFFICERS = [], INTERVIEWS = [], PHOTOS = [], MATERIALS = [], BIOS = [], PNAMES = [], JUNIORS = [], TITLES = [];
let PORTRAIT_PEOPLE = new Set();
// 인물소개 상세 타이틀(질문) — 인물소개 폴더/시트에서 받은 대표 질문
const SC_QUESTIONS = {
  "이인호": "서양사람들이 우리보다 더 잘살게 된 원인이 무엇인가?",
};
let PHOTOSET = new Set();
function avatarHTML(name) {
  const init = esc((name || "").slice(0, 1));
  if (PHOTOSET.has(name))
    return `<img class="gphoto" src="data/people/${encodeURIComponent(name)}.jpg" alt="${esc(name)}" loading="lazy" onerror="this.remove()">${init}`;
  return init;
}
const MEDIA_TYPE = { documentary: "다큐·방송", book: "책", work: "창작물", exhibition: "전시·프로필" };
const MEDIA_ORDER = ["book", "documentary", "work", "exhibition"];
let currentMFilter = "all";

async function getj(u) {
  try { return await (await fetch(u, { cache: "no-store" })).json(); } catch (e) { return []; }
}

async function init() {
  [RECIPIENTS, CHAIRS, ACTS, MEDIA, PROUD, OFFICERS, INTERVIEWS, PHOTOS, MATERIALS, BIOS, PNAMES, JUNIORS, TITLES] = await Promise.all([
    getj("data/recipients.json"),
    getj("data/alumni_chairs.json"),
    getj("data/alumni_activities.json"),
    getj("data/media.json"),
    getj("data/proud.json"),
    getj("data/alumni_officers.json"),
    getj("data/interviews.json"),
    getj("data/people.json"),
    getj("data/materials.json"),
    getj("data/bios.json"),
    getj("data/portraits/people.json"),
    getj("data/juniors.json"),
    getj("data/titles.json"),
  ]);
  PHOTOSET = new Set(Array.isArray(PHOTOS) ? PHOTOS : []);
  PORTRAIT_PEOPLE = new Set(Array.isArray(PNAMES) ? PNAMES : []);
  renderGallery();
  renderMedia("all");
  renderChairs();
  renderActivities("");
  renderInterviews();
  renderPeople();
  renderJuniors();
  renderMaterials();
  bindNav();
  bindModal();
  bindTimelineFrame();
  bindLightbox();
  bindVidLightbox();
  bindScKeys();
}

/* ---------- 상단 뷰 전환 ---------- */
function bindNav() {
  document.querySelectorAll(".tab-bar [data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".tab-bar [data-view]").forEach((x) => {
        const on = x === b;
        x.classList.toggle("on", on);
        x.setAttribute("aria-selected", on ? "true" : "false");
      });
      $("#view-recipients").hidden = b.dataset.view !== "recipients";
      $("#view-alumni").hidden = b.dataset.view !== "alumni";
      const vm = $("#view-memory");
      if (vm) vm.hidden = b.dataset.view !== "memory";
      const mb = $("#view-mailbox");
      if (mb) mb.hidden = b.dataset.view !== "mailbox";
      window.scrollTo({ top: 0, behavior: "smooth" });
    })
  );
  document.querySelectorAll(".subnav [data-sub]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".subnav [data-sub]").forEach((x) => x.classList.toggle("on", x === b));
      ["chairs", "activity", "newsletter", "materials"].forEach((s) => {
        const el = $("#sub-" + s);
        if (el) el.hidden = s !== b.dataset.sub;
      });
    })
  );
  // 수상자 하위탭: 역대 수상자 / 관련 매체
  document.querySelectorAll(".subnav [data-rsub]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".subnav [data-rsub]").forEach((x) => x.classList.toggle("on", x === b));
      ["gallery", "media"].forEach((s) => { const el = $("#rsub-" + s); if (el) el.hidden = s !== b.dataset.rsub; });
    })
  );
  // 관련 매체 유형 필터
  document.querySelectorAll(".media-controls [data-mtype]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".media-controls [data-mtype]").forEach((x) => x.classList.toggle("on", x === b));
      currentMFilter = b.dataset.mtype;
      renderMedia(currentMFilter);
    })
  );
  // 우리의 기억 하위탭: 인물소개 / 주제별 영상 / 기억의 재구성
  document.querySelectorAll(".subnav [data-msub]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".subnav [data-msub]").forEach((x) => x.classList.toggle("on", x === b));
      ["people", "videos", "timeline"].forEach((s) => { const el = $("#msub-" + s); if (el) el.hidden = s !== b.dataset.msub; });
    })
  );
  // 동문 편지함 하위탭: 후배들에게 / 선배들에게
  document.querySelectorAll(".subnav [data-xsub]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".subnav [data-xsub]").forEach((x) => x.classList.toggle("on", x === b));
      ["juniors", "seniors"].forEach((s) => { const el = $("#xsub-" + s); if (el) el.hidden = s !== b.dataset.xsub; });
    })
  );
  const as = $("#actSearch");
  if (as) as.addEventListener("input", (e) => renderActivities(e.target.value.trim()));
}

/* ---------- 수상자 갤러리 ---------- */
function winNum(w) { const m = /(\d+)/.exec(w || ""); return m ? +m[1] : 999; }
function renderGallery() {
  const g = $("#galleryGrid");
  const arr = RECIPIENTS.slice().sort((a, b) => winNum(a.win) - winNum(b.win) || a.name.localeCompare(b.name, "ko"));
  g.innerHTML = arr
    .map((r, i) => {
      return (
        `<button class="gcard" data-i="${i}" data-name="${esc(r.name)}">` +
        `<span class="gavatar">${avatarHTML(r.name)}</span>` +
        `<span class="gwin">${esc(r.win)} 수상 · ${esc(r.grad)} 졸업</span>` +
        `<span class="gname">${esc(r.name)}</span>` +
        `<span class="gdate">${esc(r.date || "")}</span>` +
        `</button>`
      );
    })
    .join("");
  // 정렬 순서를 보존해 모달에서 참조
  g._arr = arr;
  g.querySelectorAll(".gcard").forEach((b) =>
    b.addEventListener("click", () => openPerson(arr[+b.dataset.i]))
  );
}

/* ---------- 관련 매체 (유형별 정렬) ---------- */
function renderMedia(filter) {
  filter = filter || "all";
  const wrap = $("#mediaList");
  if (!wrap) return;
  const groups = MEDIA_ORDER
    .filter((t) => filter === "all" || t === filter)
    .map((t) => ({
      t,
      items: MEDIA.filter((m) => m.type === t)
        .slice()
        .sort((a, b) => winNum(a.win) - winNum(b.win) || String(a.name).localeCompare(String(b.name), "ko")),
    }))
    .filter((g) => g.items.length);
  if (!groups.length) { wrap.innerHTML = `<p class="empty">해당 유형의 매체가 없습니다.</p>`; return; }
  wrap.innerHTML = groups
    .map((g) => {
      const rows = g.items
        .map((m) => {
          let dom = ""; try { dom = new URL(m.url).hostname.replace(/^(www|m)\./, ""); } catch (e) {}
          const showAuthor = m.author && m.author !== m.name;
          const meta = [`${esc(m.name)} (${esc(m.win)})`, showAuthor ? esc(m.author) : ""].filter(Boolean).join(" · ");
          const thumb = m.thumb
            ? `<img class="mr-thumb" src="${esc(m.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('noimg');this.removeAttribute('src')">`
            : `<span class="mr-thumb noimg mt-${m.type}"></span>`;
          return (
            `<li class="media-row">` +
            `<a href="${esc(m.url)}" target="_blank" rel="noopener">` +
            thumb +
            `<span class="mr-body">` +
            `<span class="mr-title">${esc(m.title)}${m.year ? ` <span class="mr-year">(${esc(m.year)})</span>` : ""}</span>` +
            `<span class="mr-meta">${meta}</span>` +
            (m.note ? `<span class="mr-note">${esc(m.note)}</span>` : "") +
            `</span>` +
            (dom ? `<span class="mr-dom">${esc(dom)} ↗</span>` : "") +
            `</a></li>`
          );
        })
        .join("");
      return (
        `<section class="media-group">` +
        `<h3 class="media-gh"><span class="media-badge mt-${g.t}">${MEDIA_TYPE[g.t]}</span><span class="media-gcount">${g.items.length}건</span></h3>` +
        `<ul class="media-list">${rows}</ul>` +
        `</section>`
      );
    })
    .join("");
}

/* ---------- 수상자 상세 모달 ---------- */
function bindModal() {
  const m = $("#personModal");
  m.addEventListener("click", (e) => { if (e.target.hasAttribute("data-pclose")) m.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") m.hidden = true; });
}
function openPerson(r) {
  $("#pmAvatar").innerHTML = avatarHTML(r.name);
  $("#pmWin").textContent = "자랑스러운 부고인 " + r.win + " 수상";
  $("#pmName").textContent = r.name;
  $("#pmGrad").textContent = r.grad + " 졸업";
  // 약력: '/' 를 줄바꿈으로
  const prof = $("#pmProfile");
  prof.innerHTML = (r.profile || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<span class="prof-li">${esc(s)}</span>`)
    .join("");
  const nArt = PROUD.filter((p) => p._name === r.name).length;
  const a = $("#pmArticles");
  a.href = "proud_articles.html?person=" + encodeURIComponent(r.name);
  a.textContent = nArt ? `신문 기사 ${nArt}건 보기 →` : "신문 기사 보기 →";
  a.style.display = nArt ? "" : "none";
  const media = MEDIA.filter((x) => x.name === r.name);
  const mv = $("#pmMedia");
  mv.innerHTML = media.length
    ? `<h3 class="pm-mtitle">창작 · 미디어</h3>` +
      media
        .map((x) => {
          let dom = ""; try { dom = new URL(x.url).hostname.replace(/^(www|m)\./, ""); } catch (e) {}
          return (
            `<a class="pm-mitem" href="${esc(x.url)}" target="_blank" rel="noopener">` +
            `<span class="media-badge mt-${x.type}">${MEDIA_TYPE[x.type] || x.type}</span>` +
            `<span class="pm-mt">${esc(x.title)}${x.year ? ` (${esc(x.year)})` : ""}</span>` +
            `<span class="pm-mn">${esc(x.note || "")}</span>` +
            `<span class="media-dom">${esc(dom)} ↗</span></a>`
          );
        })
        .join("")
    : "";
  $("#personModal").hidden = false;
}

/* ---------- 역대 동창회장 ---------- */
function renderChairs() {
  const g = $("#chairsGrid");
  const offByTerm = {};
  OFFICERS.forEach((o) => (offByTerm[o.term] = o));
  g.innerHTML = CHAIRS.map((c) => {
    const img = c.photo
      ? `<img class="chair-photo" src="${esc(c.photo)}" alt="${esc(c.name)}" loading="lazy" onerror="this.style.visibility='hidden'">`
      : `<span class="chair-photo placeholder">${esc(c.name.slice(0, 1))}</span>`;
    const o = offByTerm[c.term] || {};
    const tipRow = (label, val) => (val ? `<div class="tip-row"><b>${label}</b> ${esc(val)}</div>` : "");
    const tip =
      `<div class="chair-tip"><div class="tip-head">제${c.term}대 · ${esc(c.period)}</div>` +
      tipRow("회장", o.chairman || c.name + "(" + c.grad + ")") +
      tipRow("부회장", (o.vice || []).join(", ")) +
      tipRow("감사", (o.aud || []).join(", ")) +
      `</div>`;
    return (
      `<div class="chair-card" tabindex="0">${img}` +
      `<span class="chair-term">제${c.term}대 · ${esc(c.grad)} 졸업</span>` +
      `<span class="chair-name">${esc(c.name)}</span>` +
      `<span class="chair-period">${esc(c.period)}</span>` +
      tip +
      `</div>`
    );
  }).join("");
  // 모바일: 탭하면 툴팁 토글
  g.querySelectorAll(".chair-card").forEach((card) =>
    card.addEventListener("click", () => {
      g.querySelectorAll(".chair-card.tip-open").forEach((x) => { if (x !== card) x.classList.remove("tip-open"); });
      card.classList.toggle("tip-open");
    })
  );
}
function renderRoster() {
  const g = $("#rosterList");
  const src = OFFICERS.length ? OFFICERS : CHAIRS.map((c) => ({ term: c.term, period: c.period, chairman: c.name + "(" + c.grad + ")", vice: [], aud: [] }));
  // 제1대부터 순서대로
  const arr = src.slice().sort((a, b) => a.term - b.term);
  g.innerHTML = arr
    .map((o) => {
      const row = (label, val) =>
        val ? `<div class="oc-row"><span class="oc-label">${label}</span><span class="oc-names">${esc(val)}</span></div>` : "";
      return (
        `<div class="officer-card">` +
        `<div class="oc-head"><span class="oc-term">제${o.term}대</span><span class="oc-period">${esc(o.period)}</span></div>` +
        `<div class="oc-row"><span class="oc-label">회장</span><span class="oc-chair">${esc(o.chairman)}</span></div>` +
        row("부회장", (o.vice || []).join(", ")) +
        row("감사", (o.aud || []).join(", ")) +
        `</div>`
      );
    })
    .join("");
}

/* ---------- 동문 인터뷰 영상 (주제별 분류 · 썸네일 + 요약) ---------- */
function ivVid(u) { const m = /[?&]v=([^&]+)/.exec(u || ""); return m ? m[1] : ""; }
const IV_THEMES = [
  { key: "여성&페미니즘",     no: "01", title: "견디고 일으키는 목소리, 여성의 연대", tags: "여성 · 페미니즘" },
  { key: "기업경영&경제개발", no: "02", title: "불확실 속의 도전, 길을 만든 사람들", tags: "기업경영 · 경제발전" },
  { key: "과학&학교&교육",    no: "03", title: "미래를 심는 배움과 발견의 여정",     tags: "과학 · 학교 · 교육" },
  { key: "행정&정치",         no: "04", title: "원칙과 변화를 견인하다, 신념의 리더십", tags: "행정 · 정치" },
  { key: "문화&사회&스포츠",  no: "05", title: "경계를 넘어선 사회적 감각",           tags: "문화 · 사회 · 스포츠" },
  { key: "보국",             no: "06", title: "동료의 기억과 희생을 이어",           tags: "국가안보 · 전쟁의 기억" },
];
// 표시용 주제 재배치(원본 데이터는 유지) — 03 과중 완화
const IV_THEME_OVERRIDE = {
  "이인호": "여성&페미니즘",
  "석은옥": "여성&페미니즘",
  "신승일": "기업경영&경제개발",
  "김태련": "문화&사회&스포츠",
};
function ivThemeKey(t1) {
  const t = t1 || "";
  if (t.indexOf("여성") > -1) return "여성&페미니즘";
  if (t.indexOf("기업") > -1 || t.indexOf("경제") > -1) return "기업경영&경제개발";
  if (t.indexOf("행정") > -1 || t.indexOf("정치") > -1) return "행정&정치";
  if (t.indexOf("문화") > -1 || t.indexOf("사회") > -1 || t.indexOf("스포츠") > -1) return "문화&사회&스포츠";
  if (t.indexOf("보국") > -1) return "보국";
  return "과학&학교&교육"; // 과학/학교/교육/의료/보건/기타
}
function ivCard(g) {
  const first = g.rows[0];
  const vid = first.vid || ivVid(first.url);
  const num = (g.title.match(/^\d+/) || [""])[0];
  const dispTitle = g.title.replace(/^\d+\s*/, "");
  const watch = first.url || (vid ? "https://www.youtube.com/watch?v=" + vid : "#");
  const thumb = vid ? "https://i.ytimg.com/vi/" + vid + "/hqdefault.jpg" : "";
  const people = [...new Set(g.rows.map((r) => r.person).filter(Boolean))];
  const thumbInner =
    (thumb ? `<img src="${esc(thumb)}" alt="${esc(dispTitle)}" loading="lazy" onerror="this.closest('.iv-thumb').classList.add('noimg')">` : "") +
    `<span class="iv-play" aria-hidden="true">▶</span>` +
    (first.dur ? `<span class="iv-dur">${esc(first.dur)}</span>` : "");
  const thumbEl = vid
    ? `<div class="iv-thumb${thumb ? "" : " noimg"}" data-vid="${esc(vid)}" role="button" tabindex="0" aria-label="${esc(dispTitle)} 재생">${thumbInner}</div>`
    : `<a class="iv-thumb noimg" href="${esc(watch)}" target="_blank" rel="noopener">${thumbInner}</a>`;
  return (
    `<article class="iv-card">` +
    thumbEl +
    `<div class="iv-body">` +
    `<h3 class="iv-title">${esc(dispTitle)}</h3>` +
    (first.sub ? `<p class="iv-sub">${esc(first.sub)}</p>` : "") +
    (people.length > 1 ? `<p class="iv-people">${people.map((p) => `<span class="iv-chip">${esc(p)}</span>`).join("")}</p>` : "") +
    `</div>` +
    `</article>`
  );
}
let IV_BUCKETS = null, ivPlaying = null;
function ivBuckets() {
  if (IV_BUCKETS) return IV_BUCKETS;
  const groups = [], map = {};
  INTERVIEWS.forEach((d) => {
    if (!map[d.title]) { map[d.title] = { title: d.title, rows: [] }; groups.push(map[d.title]); }
    map[d.title].rows.push(d);
  });
  const b = {};
  IV_THEMES.forEach((t) => (b[t.key] = []));
  groups.forEach((g) => {
    const ov = IV_THEME_OVERRIDE[g.rows[0].person] || IV_THEME_OVERRIDE[g.title];
    b[(ov && b[ov]) ? ov : ivThemeKey(g.rows[0].t1)].push(g);
  });
  IV_BUCKETS = b;
  return b;
}
function ivPlay(el) {
  if (!el || el.classList.contains("playing")) return;
  if (ivPlaying && ivPlaying !== el) { ivPlaying.innerHTML = ivPlaying._html; ivPlaying.classList.remove("playing"); }
  el._html = el.innerHTML;
  el.innerHTML =
    `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(el.dataset.vid)}?autoplay=1&rel=0&playsinline=1" ` +
    `title="동문 인터뷰 영상" frameborder="0" loading="lazy" ` +
    `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  el.classList.add("playing");
  ivPlaying = el;
}
function bindInlinePlay(wrap) {
  wrap.querySelectorAll(".iv-thumb[data-vid]").forEach((el) => {
    el.addEventListener("click", () => ivPlay(el));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ivPlay(el); } });
  });
}
/* 주제별 영상: 1단계 주제 그리드(3×2) → 클릭 시 해당 주제 영상 목록 */
function renderInterviews() { renderThemeGrid(); }
function renderThemeGrid() {
  const wrap = $("#interviewVids");
  if (!wrap) return;
  ivPlaying = null;
  const b = ivBuckets();
  wrap.innerHTML =
    `<div class="theme-grid">` +
    IV_THEMES.map((t) =>
      `<button class="theme-card" type="button" data-theme="${esc(t.key)}">` +
      `<span class="theme-no">${t.no}</span>` +
      `<span class="theme-title">${esc(t.title)}</span>` +
      `<span class="theme-tags">${esc(t.tags)}</span>` +
      `<span class="theme-people">` +
      [...new Set(b[t.key].map((g) => g.rows[0].person))].map((p) => `<span class="theme-ppl">${esc(p)}</span>`).join("") +
      `</span>` +
      `</button>`
    ).join("") +
    `</div>`;
  wrap.querySelectorAll(".theme-card").forEach((btn) => btn.addEventListener("click", () => renderThemeDetail(btn.dataset.theme)));
}
function renderJuniors() {
  const wrap = $("#juniorsList");
  if (!wrap) return;
  const items = INTERVIEWS.map((d, i) => {
    let msg = (JUNIORS[i] && JUNIORS[i].msg) ? JUNIORS[i].msg : "";
    if (!msg) { const b = BIOS[i]; msg = (b && Array.isArray(b.paras) && b.paras.length) ? b.paras[b.paras.length - 1] : ""; }
    if (!msg) { const ps = scBioParas(d); msg = ps[ps.length - 1] || ""; }
    return { person: d.person, grad: d.grad, msg };
  }).filter((x) => x.msg).sort((a, b) => winNum(a.grad) - winNum(b.grad));
  wrap.innerHTML =
    `<ul class="jm-list">` +
    items.map((x) =>
      `<li class="jm-item"><span class="jm-name">${x.grad ? esc(x.grad) + " " : ""}${esc(x.person)} 선배님</span>` +
      `<p class="jm-text">“${esc(x.msg)}”</p></li>`
    ).join("") +
    `</ul>`;
}
function renderThemeDetail(key) {
  const wrap = $("#interviewVids");
  if (!wrap) return;
  const t = IV_THEMES.find((x) => x.key === key);
  const list = ivBuckets()[key] || [];
  if (!t) { renderThemeGrid(); return; }
  ivPlaying = null;
  wrap.innerHTML =
    `<button class="theme-back" type="button">← 주제 전체보기</button>` +
    `<div class="iv-theme-head">` +
    `<span class="iv-theme-no">${t.no}</span>` +
    `<div><h3 class="iv-theme-title">${esc(t.title)}</h3><span class="iv-theme-tags">${esc(t.tags)}</span></div>` +
    `<span class="iv-theme-cnt">${list.length}편</span>` +
    `</div>` +
    `<div class="iv-theme-grid">${list.map(ivCard).join("")}</div>`;
  wrap.querySelector(".theme-back").addEventListener("click", renderThemeGrid);
  bindInlinePlay(wrap);
}

/* ---------- 타임라인: 내용 높이에 맞춰 자연스럽게 ---------- */
function bindTimelineFrame() {
  const f = $("#timelineFrame");
  if (!f) return;
  const fit = () => {
    try {
      const d = f.contentDocument || (f.contentWindow && f.contentWindow.document);
      if (!d || !d.body) return;
      const h = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight);
      if (h > 200) f.style.height = h + "px";
    } catch (e) { /* 교차출처 등은 무시(고정 높이 유지) */ }
  };
  f.addEventListener("load", () => { fit(); setTimeout(fit, 400); setTimeout(fit, 1500); });
  window.addEventListener("resize", fit);
}

/* ---------- 인물소개 (갤러리 → 클릭 시 인물 소개) ---------- */
let SC_FIRSTVID = null, scIndex = 0;
function scFirstVid(d) {
  if (!SC_FIRSTVID) {
    SC_FIRSTVID = {};
    INTERVIEWS.forEach((x) => { if (!(x.title in SC_FIRSTVID)) SC_FIRSTVID[x.title] = x.vid || ivVid(x.url); });
  }
  return SC_FIRSTVID[d.title] || d.vid || ivVid(d.url);
}
function scPortrait(d) {
  if (PORTRAIT_PEOPLE.has(d.person + "|" + (d.grad || ""))) return "data/portraits/" + encodeURIComponent(d.person) + ".jpg";
  const v = scFirstVid(d); return v ? "data/portraits/" + v + ".jpg" : "";
}
function scRoles(d) {
  const rec = RECIPIENTS.find((r) => r.name === d.person);
  if (rec && rec.profile) return rec.profile.split("/").map((s) => s.trim()).filter(Boolean).slice(-3);
  return d.sub ? [d.sub] : [];
}
function scBioParas(d) {
  let s = (d.summary || "").trim().replace(/^이 영상은\s*/, "");
  const parts = s.split(/,\s*(?=그리고\s)|,\s*(?=이후\s)/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [s];
}
function scBio(d) {
  const b = BIOS[scIndex];
  if (b && b.person === d.person && Array.isArray(b.paras) && b.paras.length) return b.paras;
  return scBioParas(d);
}
function renderPeople() { scIndex = 0; renderScGallery(); }
function renderScGallery() {
  const gal = $("#scGallery"), det = $("#scDetail");
  if (!gal) return;
  if (det) det.hidden = true;
  gal.hidden = false;
  const n = INTERVIEWS.length; if (!n) return;
  scIndex = ((scIndex % n) + n) % n;
  const at = (k) => INTERVIEWS[(((scIndex + k) % n) + n) % n];
  const slot = (k, cls) => {
    const d = at(k), p = scPortrait(d);
    return (
      `<button class="sc-img ${cls}" type="button" data-k="${k}" aria-label="${esc(d.person)}">` +
      (p ? `<img src="${esc(p)}" alt="${esc(d.person)}" loading="lazy">` : `<span class="sc-init">${esc((d.person || "").slice(0, 1))}</span>`) +
      `</button>`
    );
  };
  const cur = at(0), roles = scRoles(cur);
  gal.innerHTML =
    `<div class="sc-strip">` +
    slot(-2, "sc-far sc-l") + slot(-1, "sc-near sc-l") + slot(0, "sc-main") + slot(1, "sc-near sc-r") + slot(2, "sc-far sc-r") +
    `</div>` +
    `<div class="sc-caption">` +
    (cur.grad ? `<p class="sc-grad">제${esc(cur.grad)} 졸업생</p>` : "") +
    `<h3 class="sc-name">${esc(cur.person)} 선배님</h3>` +
    (roles.length ? `<div class="sc-roles">${roles.map((r) => `<span>${esc(r)}</span>`).join("")}</div>` : "") +
    `</div>`;
  gal.querySelectorAll(".sc-img").forEach((b) => {
    const k = +b.dataset.k;
    b.addEventListener("click", () => { if (k === 0) openScDetail(scIndex); else { scIndex += k; renderScGallery(); } });
  });
}
function openScDetail(i) {
  const n = INTERVIEWS.length;
  scIndex = ((i % n) + n) % n;
  const d = INTERVIEWS[scIndex];
  const gal = $("#scGallery"), det = $("#scDetail");
  if (!det) return;
  const pageY = window.scrollY;
  gal.hidden = true; det.hidden = false;
  const p = scPortrait(d);
  const title = (TITLES[scIndex] || "").trim() || SC_QUESTIONS[d.person] || d.sub || "";
  const isRec = RECIPIENTS.some((r) => r.name === d.person);
  const list = INTERVIEWS
    .map((x, j) => ({ j, x }))
    .sort((a, b) => (winNum(a.x.grad) - winNum(b.x.grad)) || a.j - b.j)
    .map(({ j, x }) => `<button class="sc-li${j === scIndex ? " on" : ""}" type="button" data-i="${j}">${x.grad ? esc(x.grad) + " " : ""}${esc(x.person)}</button>`)
    .join("");
  det.innerHTML =
    `<button class="sc-close" type="button" aria-label="닫기">×</button>` +
    `<div class="sc-detail-inner3">` +
    `<nav class="sc-list" aria-label="인물 명단">${list}</nav>` +
    `<div class="sc-d-photo">${p ? `<img src="${esc(p)}" alt="${esc(d.person)}">` : ""}</div>` +
    `<div class="sc-d-info">` +
    (title ? `<h3 class="sc-d-title">${esc(title)}</h3>` : "") +
    `<p class="sc-d-name">${esc(d.person)} 선배님</p>` +
    `<div class="sc-d-bio">${scBio(d).map((x) => `<p>${esc(x)}</p>`).join("")}</div>` +
    `<div class="sc-d-links">` +
    (isRec ? `<a class="sc-d-link" href="proud_articles.html?person=${encodeURIComponent(d.person)}">관련기사 →</a>` : "") +
    `<button class="sc-d-link sc-d-interview" type="button">인터뷰 →</button>` +
    `</div>` +
    `</div></div>`;
  det.querySelector(".sc-close").addEventListener("click", renderScGallery);
  det.querySelectorAll(".sc-li").forEach((b) => b.addEventListener("click", () => openScDetail(+b.dataset.i)));
  const iv = det.querySelector(".sc-d-interview"); if (iv) iv.addEventListener("click", () => openVidLightbox(scFirstVid(d)));
  const listEl = det.querySelector(".sc-list"), cur = det.querySelector(".sc-li.on");
  if (listEl && cur && listEl.scrollHeight > listEl.clientHeight) {
    const lr = listEl.getBoundingClientRect(), cr = cur.getBoundingClientRect();
    listEl.scrollTop += (cr.top - lr.top) - listEl.clientHeight / 2 + cr.height / 2;
  }
  const ph = det.querySelector(".sc-d-photo");
  if (ph) ph.addEventListener("click", (e) => {
    const r = ph.getBoundingClientRect();
    scStep(e.clientX < r.left + r.width / 2 ? -1 : 1);
  });
  window.scrollTo(0, pageY);
}
function scOrder() {
  return INTERVIEWS.map((d, i) => i).sort((a, b) => winNum(INTERVIEWS[a].grad) - winNum(INTERVIEWS[b].grad) || a - b);
}
function scStep(dir) {
  const ord = scOrder();
  const pos = ord.indexOf(scIndex);
  openScDetail(ord[(pos + dir + ord.length) % ord.length]);
}
function bindScKeys() {
  document.addEventListener("keydown", (e) => {
    const det = $("#scDetail");
    if (!det || det.hidden) return;
    const vm = $("#view-memory"); if (vm && vm.hidden) return;
    const mp = $("#msub-people"); if (mp && mp.hidden) return;
    if ($("#vidLightbox") && !$("#vidLightbox").hidden) return;
    if ($("#matLightbox") && !$("#matLightbox").hidden) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); scStep(-1); }
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); scStep(1); }
    else if (e.key === "Escape") { renderScGallery(); }
  });
}
function gotoVideo(vid) {
  const vb = document.querySelector('.subnav [data-msub="videos"]');
  if (vb) vb.click();
  // 해당 영상이 속한 주제 상세로 진입
  const b = ivBuckets();
  let key = null;
  for (const t of IV_THEMES) {
    if ((b[t.key] || []).some((g) => (g.rows[0].vid || ivVid(g.rows[0].url)) === vid)) { key = t.key; break; }
  }
  if (key) renderThemeDetail(key);
  const el = document.querySelector('.iv-thumb[data-vid="' + vid + '"]');
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => { if (el.click) el.click(); }, 450);
  }
}

/* ---------- 인터뷰 영상 전체화면 라이트박스 ---------- */
function openVidLightbox(vid) {
  const lb = $("#vidLightbox");
  if (!lb || !vid) return;
  lb.querySelector(".vl-frame").innerHTML =
    `<iframe class="vl-iframe" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?autoplay=1&rel=0&playsinline=1" ` +
    `title="동문 인터뷰 영상" frameborder="0" ` +
    `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  lb.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeVidLightbox() {
  const lb = $("#vidLightbox");
  if (!lb) return;
  lb.hidden = true;
  lb.querySelector(".vl-frame").innerHTML = "";
  document.body.style.overflow = "";
}
function bindVidLightbox() {
  const lb = $("#vidLightbox");
  if (!lb) return;
  lb.querySelector(".ml-close").addEventListener("click", (e) => { e.stopPropagation(); closeVidLightbox(); });
  lb.addEventListener("click", (e) => { if (!e.target.closest(".vl-frame") && !e.target.closest(".ml-close")) closeVidLightbox(); });
  document.addEventListener("keydown", (e) => { if (!lb.hidden && e.key === "Escape") closeVidLightbox(); });
}

/* ---------- 자료 갤러리 + 전체화면 라이트박스 ---------- */
function renderMaterials() {
  const g = $("#materialsGrid");
  if (!g) return;
  g.innerHTML = MATERIALS
    .map((m, i) =>
      `<button class="mat-card" data-i="${i}" type="button">` +
      `<img src="data/materials/${encodeURIComponent(m.file)}" alt="${esc(m.caption)}" loading="lazy">` +
      `<span class="mat-cap">${esc(m.caption)}</span>` +
      `</button>`
    )
    .join("");
  g.querySelectorAll(".mat-card").forEach((b) => b.addEventListener("click", () => openLightbox(+b.dataset.i)));
}
let lbIndex = 0, lbWheelLock = false;
function matSrc(m) { return "data/materials/" + encodeURIComponent(m.file); }
function showLightbox(i) {
  if (!MATERIALS.length) return;
  const n = MATERIALS.length;
  lbIndex = (i + n) % n;
  const cur = MATERIALS[lbIndex];
  const main = $("#matLightbox .ml-main");
  main.src = matSrc(cur); main.alt = cur.caption;
  const pv = $("#matLightbox .ml-prev"), nx = $("#matLightbox .ml-next");
  if (n > 1) {
    pv.src = matSrc(MATERIALS[(lbIndex - 1 + n) % n]); pv.style.visibility = "";
    nx.src = matSrc(MATERIALS[(lbIndex + 1) % n]); nx.style.visibility = "";
  } else { pv.style.visibility = "hidden"; nx.style.visibility = "hidden"; }
  $("#matLightbox .ml-caption").textContent = cur.caption;
  $("#matLightbox .ml-count").textContent = (lbIndex + 1) + " / " + n;
}
function openLightbox(i) { showLightbox(i); $("#matLightbox").hidden = false; document.body.style.overflow = "hidden"; }
function closeLightbox() { $("#matLightbox").hidden = true; document.body.style.overflow = ""; }
function bindLightbox() {
  const lb = $("#matLightbox");
  if (!lb) return;
  lb.querySelector(".ml-close").addEventListener("click", (e) => { e.stopPropagation(); closeLightbox(); });
  // 좌우 클릭(앞뒤 사진 포함)으로 이동 — 좌반 이전, 우반 다음
  lb.addEventListener("click", (e) => {
    if (e.target.closest(".ml-close")) return;
    if (e.clientX < window.innerWidth / 2) showLightbox(lbIndex - 1);
    else showLightbox(lbIndex + 1);
  });
  // 스크롤로 이동
  lb.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (lbWheelLock) return;
    lbWheelLock = true; setTimeout(() => (lbWheelLock = false), 320);
    showLightbox(lbIndex + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  // 키보드
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") showLightbox(lbIndex + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") showLightbox(lbIndex - 1);
  });
}

/* ---------- 동창회 활동 연표 ---------- */
function renderActivities(q) {
  const list = $("#activityList");
  q = (q || "").toLowerCase();
  let arr = ACTS.slice();
  if (q) arr = arr.filter((a) => a.text.toLowerCase().includes(q));
  // 연도별 그룹
  const byYear = {};
  arr.forEach((a) => { const y = (a.date || "").slice(0, 4); (byYear[y] = byYear[y] || []).push(a); });
  const years = Object.keys(byYear).sort();
  list.innerHTML =
    arr.length === 0
      ? `<p class="empty">검색 결과가 없습니다.</p>`
      : years
          .map(
            (y) =>
              `<div class="act-year"><h3 class="act-y">${esc(y)}</h3>` +
              byYear[y]
                .map((a) => {
                  const md = (a.date || "").slice(5).replace("-", ".");
                  return `<div class="act-row"><span class="act-date">${esc(md)}</span><span class="act-text">${esc(a.text)}</span></div>`;
                })
                .join("") +
              `</div>`
          )
          .join("");
}

document.addEventListener("DOMContentLoaded", init);
