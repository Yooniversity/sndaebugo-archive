"use strict";
/* 자랑스러운 부고인(갤러리) + 천하부고 동창회. app.js 와 독립. */
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
/* 상세페이지 맨 끝 공통 '＋ 자료 추가'(작게) — 상세별 키로 저장 */
function miniUploaderHTML(key) {
  return `<div class="up-sec up-mini" data-upkey="${esc(key)}">` +
    `<label class="up-mini-btn">＋ 자료 추가<input type="file" accept="image/*" multiple hidden></label>` +
    `<div class="up-grid"></div></div>`;
}
function initMiniUploaders(root) {
  if (window.SNDUploader && root) window.SNDUploader.initAll(root);
}
let RECIPIENTS = [], CHAIRS = [], ACTS = [], MEDIA = [], PROUD = [], OFFICERS = [], INTERVIEWS = [], PHOTOS = [], MATERIALS = [], BIOS = [], PNAMES = [], JUNIORS = [], TITLES = [];
let PORTRAIT_PEOPLE = new Set();
// 주제 관련 구간(초 단위): { "<유튜브ID>": { start, end, label } } — 자막 기반으로 추출, 없으면 전체 재생
let SEGMENTS = {};
// 인물별 영상 챕터: { "<유튜브ID>": { person, no, sections:[{title,start,end}] } }
let CHAPTERS = {};
// 기억의 재구성 사건별 자료: [{ gubun, events:[{section, items:[{no,archival,material,link,alumni,vid}]}] }]
let EVIDENCE = [];
// 기억의 재구성 타임라인: { nodes:[{side,year,label,yearLabel,people}], quotes:{event:{person:[{ts,sum,txt}]}} }
let MEMORY = { nodes: [], quotes: {} };
// 지역별 활동 지도: 지오메트리 + 핀
let MAPS = null;
let MAPPINS = []; // [{map:'korea'|'world', lng, lat, person, grad, activity, photo, vid, ts}]
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
  const seg = await getj("data/segments.json");
  SEGMENTS = (seg && !Array.isArray(seg)) ? seg : {};
  const chp = await getj("data/chapters.json");
  CHAPTERS = (chp && !Array.isArray(chp)) ? chp : {};
  const ev = await getj("data/evidence.json");
  EVIDENCE = Array.isArray(ev) ? ev : [];
  const mem = await getj("data/memory.json");
  if (mem && mem.nodes) MEMORY = mem;
  const mp = await getj("data/maps/maps.json");
  if (mp && mp.world) MAPS = mp;
  const pins = await getj("data/mappins.json");
  MAPPINS = Array.isArray(pins) ? pins : [];
  renderGallery();
  renderMedia("all");
  renderChairs();
  renderActivities("");
  renderInterviews();
  renderPeople();
  renderMemoryTimeline();
  renderMemoryMaps();
  renderMemoryEvidence();
  renderJuniors();
  renderMaterials();
  bindNav();
  bindModal();
  bindTimelineFrame();
  bindLightbox();
  bindVidLightbox();
  bindScKeys();
  renderUserLetters("juniors");
  renderUserLetters("seniors");
  bindLetters();
  renderSpace();
  window.addEventListener("resize", () => {
    clearTimeout(window._scCapT);
    window._scCapT = setTimeout(() => {
      positionScCaption(); fitMapArticleFrame();
      if (MAPS && MMAP_VIEW) ["korea", "world"].forEach((n) => { if (MMAP_VIEW[n]) mmApplyView(n); });
    }, 120);
  });
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
      const vs = $("#view-space");
      if (vs) vs.hidden = b.dataset.view !== "space";
      if (b.dataset.view === "memory") requestAnimationFrame(positionScCaption);
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
      if (b.dataset.msub === "people") requestAnimationFrame(positionScCaption);
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
  // 원본 PDF처럼 인물 단위로 묶는다(조춘상 1·5대, 박붕배 3·6대 등 재임자는 한 칸).
  const groups = [];
  const byKey = {};
  CHAIRS.forEach((c) => {
    const key = c.name + "|" + c.grad + "|" + (c.photo || "");
    if (!byKey[key]) { byKey[key] = { name: c.name, grad: c.grad, photo: c.photo, items: [] }; groups.push(byKey[key]); }
    byKey[key].items.push(c);
  });
  const tipRow = (label, val) => (val ? `<div class="tip-row"><b>${label}</b> ${esc(val)}</div>` : "");
  g.innerHTML = groups.map((p) => {
    const items = p.items.slice().sort((a, b) => a.term - b.term);
    const termLabel = items.map((c) => c.term).join(",") + "대";
    const img = p.photo
      ? `<img class="chair-photo" src="${esc(p.photo)}?v=2" alt="${esc(p.name)}" loading="lazy" onerror="this.style.visibility='hidden'">`
      : `<span class="chair-photo placeholder">${esc(p.name.slice(0, 1))}</span>`;
    let tipBody = "";
    items.forEach((c) => {
      const o = offByTerm[c.term] || {};
      tipBody +=
        `<div class="tip-sub">제${c.term}대 · ${esc(c.period)}</div>` +
        tipRow("회장", o.chairman || c.name + "(" + c.grad + ")") +
        tipRow("부회장", (o.vice || []).join(", ")) +
        tipRow("감사", (o.aud || []).join(", "));
    });
    const tip =
      `<div class="chair-tip"><div class="tip-head">제${termLabel} · ${esc(p.name)}(${esc(p.grad)})</div>` +
      tipBody +
      `</div>`;
    const periodLine = items.map((c) => c.period).join(" / ");
    return (
      `<div class="chair-card" tabindex="0">${img}` +
      `<span class="chair-term">제${termLabel} · ${esc(p.grad)} 졸업</span>` +
      `<span class="chair-name">${esc(p.name)}</span>` +
      `<span class="chair-period">${esc(periodLine)}</span>` +
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
  "석은옥": "문화&사회&스포츠",
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
  const seg = segOf(vid);
  const segAttr = seg ? ` data-start="${seg.start != null ? seg.start : ""}" data-end="${seg.end != null ? seg.end : ""}"` : "";
  const thumbInner =
    (thumb ? `<img src="${esc(thumb)}" alt="${esc(dispTitle)}" loading="lazy" onerror="this.closest('.iv-thumb').classList.add('noimg')">` : "") +
    `<span class="iv-play" aria-hidden="true">▶</span>` +
    (seg ? `<span class="iv-clip">주제 구간 ${fmtTime(seg.start)}–${fmtTime(seg.end)}</span>`
         : (first.dur ? `<span class="iv-dur">${esc(first.dur)}</span>` : ""));
  const thumbEl = vid
    ? `<div class="iv-thumb${thumb ? "" : " noimg"}" data-vid="${esc(vid)}"${segAttr} role="button" tabindex="0" aria-label="${esc(dispTitle)} 재생">${thumbInner}</div>`
    : `<a class="iv-thumb noimg" href="${esc(watch)}" target="_blank" rel="noopener">${thumbInner}</a>`;
  return (
    `<article class="iv-card">` +
    thumbEl +
    `<div class="iv-body">` +
    `<h3 class="iv-title">${esc(dispTitle)}</h3>` +
    (first.sub ? `<p class="iv-sub">${esc(first.sub)}</p>` : "") +
    (seg && seg.label ? `<p class="iv-cliplabel">${esc(seg.label)}</p>` : "") +
    (people.length > 1 ? `<p class="iv-people">${people.map((p) => `<span class="iv-chip">${esc(p)}</span>`).join("")}</p>` : "") +
    `</div>` +
    `</article>`
  );
}
function fmtTime(s) {
  if (s == null || s === "") return "";
  s = Math.max(0, Math.floor(+s));
  const m = Math.floor(s / 60), ss = s % 60;
  return m + ":" + (ss < 10 ? "0" : "") + ss;
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
    const open = () => openVidLightbox(el.dataset.vid, el.dataset.start, el.dataset.end);
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}
/* 인물별 주제: 한 영상을 자막 챕터(주제) 단위로 나눠 각 구간 재생 */
function renderPersonTopics() {
  const wrap = $("#personTopics");
  if (!wrap) return;
  const gradOf = (person) => { const r = INTERVIEWS.find((x) => x.person === person); return r ? r.grad : ""; };
  const items = Object.keys(CHAPTERS)
    .map((v) => ({ v, c: CHAPTERS[v], grad: gradOf(CHAPTERS[v].person) }))
    .sort((a, b) => (winNum(a.grad) - winNum(b.grad)) || (a.c.no > b.c.no ? 1 : -1));
  if (!items.length) { wrap.innerHTML = `<div class="materials-empty">준비 중입니다.</div>`; return; }
  wrap.innerHTML = items.map(({ v, c, grad }) => {
    const secs = c.sections.filter((s) => s.start != null);
    const rows = secs.map((s) =>
      `<button class="pt-chap" type="button" data-vid="${esc(v)}" data-start="${s.start}" data-end="${s.end != null ? s.end : ""}">` +
      `<span class="pt-time">${fmtTime(s.start)}</span><span class="pt-ctitle">${esc(s.title)}</span><span class="pt-go">▶</span></button>`
    ).join("");
    return `<div class="pt-person"><button class="pt-head" type="button" aria-expanded="false">` +
      `<span class="pt-name">${grad ? esc(grad) + " " : ""}${esc(c.person)}</span>` +
      `<span class="pt-count">주제 ${secs.length}개</span><span class="pt-caret" aria-hidden="true">▾</span></button>` +
      `<div class="pt-list" hidden>${rows}</div></div>`;
  }).join("");
  wrap.querySelectorAll(".pt-head").forEach((h) => h.addEventListener("click", () => {
    const list = h.nextElementSibling, open = !list.hidden;
    list.hidden = open; h.setAttribute("aria-expanded", String(!open)); h.classList.toggle("on", !open);
  }));
  wrap.querySelectorAll(".pt-chap").forEach((b) => b.addEventListener("click", () => openVidLightbox(b.dataset.vid, b.dataset.start, b.dataset.end)));
}
/* 기억의 재구성: 타임라인 네이티브 재구성 */
const MEM_NOMINAL = { "입학": 1947, "학교 체제": 1956, "특별활동": 1962 };
function memYear(n) { const y = parseInt(n.year, 10); return isNaN(y) ? (MEM_NOMINAL[n.label] || 1950) : y; }
function pageGutter() { // .wrap(max 1080, padding 28/20) 기준 좌우 여백
  const vw = document.documentElement.clientWidth || window.innerWidth || 1080;
  const pad = vw <= 760 ? 20 : 28;
  return Math.max(pad, Math.round((vw - 1080) / 2) + pad);
}
function renderMemoryTimeline() {
  const host = $("#memoryTimeline");
  if (!host || !MEMORY.nodes || !MEMORY.nodes.length) return;
  const nodes = MEMORY.nodes.map((n) => ({ ...n, yr: memYear(n), count: (n.people || []).length }));
  const years = [...new Set(nodes.map((n) => n.yr))].sort((a, b) => a - b);
  const xOf = {}; years.forEach((y, i) => (xOf[y] = i));
  const slot = 132, laneGap = 30, H = 480, cy = Math.round(H / 2), labelHalf = 62;
  const gutter = pageGutter();            // 페이지 좌우 여백
  const mx = gutter + labelHalf;          // 첫 라벨 왼쪽 끝이 여백에 맞도록
  const W = (gutter + labelHalf) * 2 + (years.length - 1) * slot;
  const rOf = (n) => 9 + Math.sqrt(n.count) * 4.3;
  let h = `<div class="mtl-inner" style="width:${W}px;height:${H}px">`;
  h += `<div class="mtl-axis" style="top:${cy}px"></div>`;
  years.forEach((y) => { const x = mx + xOf[y] * slot; h += `<div class="mtl-tick" style="left:${x}px;top:${cy - 4}px"></div>`; });
  nodes.forEach((n) => {
    const x = mx + xOf[n.yr] * slot, r = rOf(n), up = n.side === "h";
    const ccy = up ? cy - laneGap - r : cy + laneGap + r;
    const cTop = up ? ccy + r : cy, cBot = up ? cy : ccy - r;
    h += `<div class="mtl-conn" style="left:${x - 0.5}px;top:${Math.min(cTop, cBot)}px;height:${Math.abs(cBot - cTop)}px"></div>`;
    h += `<button class="mtl-node ${up ? "mtl-h" : "mtl-s"}" data-ev="${esc(n.label)}" title="${esc(n.label)}" style="left:${x - r}px;top:${ccy - r}px;width:${2 * r}px;height:${2 * r}px"><span>${n.count}</span></button>`;
    const yl = (n.yearLabel && n.yearLabel !== "None") ? n.yearLabel : (parseInt(n.year, 10) ? n.year : "");
    const lab = `<div class="mtl-lyear">${esc(yl)}</div><div class="mtl-lname">${esc(n.label)}</div><div class="mtl-lppl">${(n.people || []).map(esc).join(" · ")}</div>`;
    if (up) h += `<div class="mtl-label mtl-up" data-ev="${esc(n.label)}" style="left:${x - 62}px;bottom:${H - (ccy - r) + 8}px">${lab}</div>`;
    else h += `<div class="mtl-label mtl-dn" data-ev="${esc(n.label)}" style="left:${x - 62}px;top:${ccy + r + 8}px">${lab}</div>`;
  });
  h += `</div>`;
  host.innerHTML = h;
  host.querySelectorAll(".mtl-node, .mtl-label").forEach((b) => b.addEventListener("click", () => openMemoryEvent(b.dataset.ev)));
  bindMemoryScroll();
}
function bindMemoryScroll() {
  const sc = $(".memory-timeline-scroll"), fr = $(".memory-timeline-frame");
  if (!sc || !fr || sc._bound) return;
  sc._bound = true;
  sc.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { sc.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  const aL = fr.querySelector(".mtl-arrow-l"), aR = fr.querySelector(".mtl-arrow-r");
  const upd = () => {
    const max = sc.scrollWidth - sc.clientWidth;
    if (aL) aL.style.display = sc.scrollLeft > 8 ? "flex" : "none";
    if (aR) aR.style.display = sc.scrollLeft < max - 8 ? "flex" : "none";
  };
  const glide = (dx) => {
    const target = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + dx));
    const start = sc.scrollLeft, dur = 300; let t0 = null;
    const step = (ts) => { if (t0 == null) t0 = ts; const p = Math.min(1, (ts - t0) / dur); sc.scrollLeft = start + (target - start) * (0.5 - 0.5 * Math.cos(Math.PI * p)); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    setTimeout(() => { sc.scrollLeft = target; }, 340); // 보정(rAF 미동작 환경 대비)
  };
  if (aL) aL.addEventListener("click", () => glide(-460));
  if (aR) aR.addEventListener("click", () => glide(460));
  sc.addEventListener("scroll", upd);
  window.addEventListener("resize", upd);
  if (window.ResizeObserver) { try { new ResizeObserver(upd).observe(sc); } catch (e) {} }
  setTimeout(upd, 50);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const p = $("#memoryDetail"), vl = $("#vidLightbox");
    if (p && !p.hidden && (!vl || vl.hidden)) closeMemoryDetail();
  });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderMemoryTimeline, 220); });
}
function tsToSec(ts) {
  const p = String(ts || "").split(":").map((x) => parseInt(x, 10));
  if (p.some(isNaN) || !p.length) return 0;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0);
}
function personVid(name) { const r = INTERVIEWS.find((x) => x.person === name); return r ? (r.vid || ivVid(r.url)) : ""; }
// 증언 '자극성' 점수 — 극적 키워드가 많을수록 위로
const IV_DRAMA_KW = ["총살", "총격", "폭격", "참사", "시신", "학살", "처형", "테러", "고문", "납치", "전투", "포로", "폭발", "의용군", "최루탄", "몽둥이", "깡패", "하야", "희생", "세뇌", "강제", "피난", "전쟁", "혁명", "쿠데타", "데모", "시위", "투쟁", "위기", "부상", "사망", "목숨", "죽", "도망", "체포", "구속", "충격", "배신", "굶", "빚", "부도", "서러움", "비참", "피"];
function ivScore(it) {
  const s = (it.sum || "") + " " + (it.txt || "");
  let sc = 0; for (const k of IV_DRAMA_KW) if (s.indexOf(k) > -1) sc++;
  return sc * 10 + Math.min(s.length, 400) / 200;
}
function evidenceForEvent(label) {
  for (const cat of EVIDENCE) {
    const e = cat.events.find((x) => String(x.section).replace(/\s*\(.*$/, "").trim() === label || String(x.section).startsWith(label));
    if (e) return e.items;
  }
  return [];
}
function openMemoryEvent(ev) {
  const panel = $("#memoryDetail");
  if (!panel) return;
  const q = MEMORY.quotes[ev] || {};
  // 좌: 사건 영상·기록 — 페이지 내 재생 가능한 유튜브 자료를 앞에 배치
  const items = evidenceForEvent(ev).slice().sort((a, b) => ((b.vid || b.file) ? 1 : 0) - ((a.vid || a.file) ? 1 : 0));
  const evCards = items.map((it) => {
    const thumb = it.file
      ? `<span class="evc-img" style="background-image:url('${esc(it.poster || "")}')"></span>`
      : it.vid
      ? `<span class="evc-img" style="background-image:url('https://i.ytimg.com/vi/${esc(it.vid)}/hqdefault.jpg')"></span>`
      : `<span class="evc-img evc-ph"><span class="evc-src">${esc(evSource(it.material))}</span></span>`;
    const play = (it.vid || it.file || it.archival) ? `<span class="evc-play" aria-hidden="true">▶</span>` : "";
    const badge = it.archival ? `<span class="evc-badge">당시 기록영상</span>` : "";
    const inner = `<span class="evc-thumb">${thumb}${play}${badge}</span><span class="evc-cap" title="${esc(it.material)}">${esc(evTitle(it.material))}</span>`;
    if (it.file) return `<button class="evc evc-pl" type="button" data-file="${esc(it.file)}">${inner}</button>`;
    if (it.vid) return `<button class="evc evc-pl" type="button" data-vid="${esc(it.vid)}" data-start="${it.start != null ? it.start : ""}" data-end="${it.end != null ? it.end : ""}">${inner}</button>`;
    return it.link ? `<a class="evc evc-ext" href="${esc(it.link)}" target="_blank" rel="noopener">${inner}</a>` : `<span class="evc evc-nolink">${inner}</span>`;
  }).join("");
  // 우: 동문 인터뷰 영상(증언)
  const ivFlat = [];
  Object.keys(q).forEach((person) => (q[person] || []).forEach((it) => ivFlat.push({ person, it, score: ivScore(it) })));
  ivFlat.sort((a, b) => b.score - a.score);           // 자극적인 증언이 위로
  const ivCards = ivFlat.map(({ person, it }) => {
    const vid = personVid(person), st = tsToSec(it.ts);
    const thumb = vid
      ? `<span class="evc-img" style="background-image:url('https://i.ytimg.com/vi/${esc(vid)}/hqdefault.jpg')"></span>`
      : `<span class="evc-img evc-ph"><span class="evc-src">${esc(person)}</span></span>`;
    const body = `<span class="miv-body"><span class="miv-head"><b class="miv-name">${esc(person)}</b>${it.ts ? `<span class="miv-ts">${esc(it.ts)}</span>` : ""}</span>` +
      (it.sum ? `<span class="miv-sum">${esc(it.sum)}</span>` : "") +
      (it.txt ? `<span class="miv-txt">“${esc(it.txt)}”</span>` : "") + `</span>`;
    return `<button class="miv" type="button" data-vid="${esc(vid)}" data-start="${st}">` +
      `<span class="evc-thumb miv-thumb">${thumb}<span class="evc-play" aria-hidden="true">▶</span></span>${body}</button>`;
  }).join("");
  const h =
    `<div class="mm-box">` +
    `<button class="md-close" type="button" aria-label="닫기">×</button>` +
    `<h3 class="md-title">${esc(ev)}</h3>` +
    `<div class="md-cols">` +
    `<div class="md-col md-col-ev"><h4 class="md-colh">사건 영상·기록</h4>` +
    (evCards ? `<div class="md-evgrid">${evCards}</div>` : `<p class="md-empty">연결된 기록영상이 없습니다.</p>`) + `</div>` +
    `<div class="md-col md-col-iv"><h4 class="md-colh">인터뷰 속 증언</h4>` +
    (ivCards ? `<div class="md-ivlist">${ivCards}</div>` : `<p class="md-empty">연결된 인터뷰가 없습니다.</p>`) + `</div>` +
    `</div>` + miniUploaderHTML("ev_" + ev) + `</div>`;
  panel.innerHTML = h; panel.hidden = false;
  document.body.style.overflow = "hidden";
  panel.querySelector(".md-close").addEventListener("click", closeMemoryDetail);
  panel.addEventListener("click", (e) => { if (e.target === panel) closeMemoryDetail(); });
  panel.querySelectorAll(".evc-pl").forEach((b) => b.addEventListener("click", () => mdPlay(b)));
  panel.querySelectorAll(".miv[data-vid]").forEach((b) => b.addEventListener("click", () => mdPlay(b)));
  initMiniUploaders(panel);
  const box = panel.querySelector(".mm-box"); if (box) box.scrollTop = 0;
}
function mdThumbOf(card) { return card.querySelector(".miv-thumb") || card.querySelector(".evc-thumb"); }
function mdCollapse(card) {
  const thumb = mdThumbOf(card);
  if (thumb && thumb._origHTML != null) thumb.innerHTML = thumb._origHTML;
  card.classList.remove("evc-playing", "miv-playing");
}
function mdPlay(card) {
  const d = card.dataset;
  if (!d.vid && !d.file) return;
  // 같은 열 안에서는 한 번에 하나만 — 다른 재생 중 카드는 썸네일로 축소
  const col = card.closest(".md-col");
  if (col) col.querySelectorAll(".evc-playing, .miv-playing").forEach((c) => { if (c !== card) mdCollapse(c); });
  const isMiv = card.classList.contains("miv");
  const thumb = mdThumbOf(card);
  if (thumb && thumb._origHTML == null) thumb._origHTML = thumb.innerHTML;
  card.classList.add(isMiv ? "miv-playing" : "evc-playing");
  mdInlinePlay(thumb, { vid: d.vid, file: d.file, start: +d.start || 0, end: +d.end || 0 });
}
function mdInlinePlay(thumb, o) {
  if (!thumb || thumb.querySelector("iframe, video")) return;
  if (o.file) {
    thumb.innerHTML = `<video class="md-iframe" src="${esc(o.file)}" controls autoplay playsinline></video>`;
    return;
  }
  if (!o.vid) return;
  const s = o.start ? `&start=${Math.floor(o.start)}` : "";
  const e = o.end ? `&end=${Math.floor(o.end)}` : "";
  thumb.innerHTML = `<iframe class="md-iframe" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(o.vid)}?autoplay=1&rel=0&playsinline=1${s}${e}" title="영상" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
}
function closeMemoryDetail() {
  const panel = $("#memoryDetail");
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  if (!$("#vidLightbox") || $("#vidLightbox").hidden) document.body.style.overflow = "";
}
/* 기억의 재구성: 지역별 활동 지도(한국/세계) + 핀 */
function mapXY(name, lng, lat) {
  if (name === "world") { const m = MAPS.world; return [(lng + 180) / 360 * m.w, (90 - lat) / 180 * m.h]; }
  const p = MAPS.korea.proj; return [(lng - p.minLng) * p.cosMid * p.K, (p.maxLat - lat) * p.K];
}
const MMAP_VIEW = {};   // name -> {scale, cx, cy}
function mmSvg(name) {
  const m = MAPS[name];
  const regs = (m.regions || []).map((r) =>
    `<path class="mmap-region" data-region="${esc(r.name)}" d="${r.d}"/>`).join("");
  const munis = (m.munis || []).map((r) =>
    `<path class="mmap-muni" data-region="${esc(r.name)}" d="${r.d}"/>`).join("");
  const labels = (m.regions || []).map((r) =>
    `<text class="mmap-label" x="${r.cx}" y="${r.cy}">${esc(r.label)}</text>`).join("");
  // 원형 핀 — 반지름은 mmApplyView에서 표시 배율 기준으로 설정(한국·세계 화면 크기 일치)
  const pins = MAPPINS.filter((p) => p.map === name).map((p, i) => {
    const xy = mapXY(name, p.lng, p.lat);
    return `<g class="mpin" data-map="${name}" data-i="${i}" transform="translate(${xy[0].toFixed(1)},${xy[1].toFixed(1)})">` +
      `<circle class="mpf-hit" cx="0" cy="0" r="12"></circle>` +
      `<circle class="mpf-p mpin-dot" cx="0" cy="0" r="5"></circle></g>`;
  }).join("");
  return `<svg class="mmap-svg" viewBox="0 0 ${m.w} ${m.h}" preserveAspectRatio="xMidYMid meet">` +
    `<g class="mmap-regions">${regs}</g><g class="mmap-munis">${munis}</g><g class="mmap-labels">${labels}</g><g class="mmap-pins">${pins}</g></svg>`;
}
function renderMemoryMaps() {
  const host = $("#memoryMaps");
  if (!host || !MAPS) { if (host) host.innerHTML = ""; return; }
  const build = (name, title) => {
    const m = MAPS[name], cnt = MAPPINS.filter((p) => p.map === name).length;
    return `<div class="mmap"><div class="mmap-h">${esc(title)} <span class="mmap-cnt">${cnt}</span>` +
      `<span class="mmap-hint">스크롤로 확대 · 드래그로 이동</span></div>` +
      `<div class="mmap-row" data-map="${name}">` +
      `<div class="mmap-stage" data-map="${name}" style="aspect-ratio:${m.w} / ${m.h}">${mmSvg(name)}</div>` +
      `<div class="mmap-tip" hidden></div>` +
      `<aside class="mmap-side" hidden></aside></div></div>`;
  };
  host.innerHTML = build("korea", "한국") + build("world", "세계");
  ["korea", "world"].forEach((name) => {
    MMAP_VIEW[name] = { scale: 1, cx: MAPS[name].w / 2, cy: MAPS[name].h / 2 };
    const stage = host.querySelector(`.mmap-stage[data-map="${name}"]`);
    if (stage) { mmApplyView(name); mmBindZoom(stage, name); }
  });
  host.querySelectorAll(".mpin").forEach((g) => {
    g.addEventListener("click", (e) => { e.stopPropagation(); openMapPin(g); });
    g.addEventListener("pointerenter", () => { mapHoverRegion(g, true); mapPinTip(g, true); });   // 호버 시 지역 hatching + 정보 툴팁
    g.addEventListener("pointerleave", () => { mapHoverRegion(g, false); mapPinTip(g, false); });
  });
  host.querySelectorAll(".mmap-stage").forEach((st) => st.addEventListener("click", () => {
    if (st._moved) { st._moved = false; return; }   // 드래그면 무시
    closeMapSide(st.closest(".mmap-row"));
  }));
}
/* 핀 호버 시 지도 위 정보 툴팁(반투명 연회색) */
function mapPinTip(g, show) {
  const row = g.closest(".mmap-row"); if (!row) return;
  const tip = row.querySelector(".mmap-tip"); if (!tip) return;
  if (!show) { tip.hidden = true; return; }
  const name = g.dataset.map, pins = MAPPINS.filter((p) => p.map === name), p = pins[+g.dataset.i];
  if (!p) return;
  tip.innerHTML =
    `<div class="mtip-name">${esc(p.person)}${p.grad ? ` <span>(${esc(p.grad)})</span>` : ""}</div>` +
    (p.place ? `<div class="mtip-row"><b>지역명</b> ${esc(p.place)}</div>` : "") +
    (p.activity ? `<div class="mtip-row"><b>활동</b> ${esc(p.activity)}</div>` : "");
  const pr = g.getBoundingClientRect(), rr = row.getBoundingClientRect();
  const x = pr.left - rr.left + pr.width / 2, y = pr.top - rr.top;
  tip.style.left = Math.round(Math.max(90, Math.min(rr.width - 90, x))) + "px";
  tip.style.top = Math.round(y) + "px";
  tip.classList.toggle("below", y < 86);
  tip.hidden = false;
}
/* 핀 호버 시 해당 지역(시도/시군) 음영 토글 */
function mapHoverRegion(g, on) {
  const name = g.dataset.map, pins = MAPPINS.filter((p) => p.map === name), p = pins[+g.dataset.i];
  if (!p || !p.region) return;
  const svg = g.closest(".mmap-svg"); if (!svg) return;
  const rp = [...svg.querySelectorAll(".mmap-region, .mmap-muni")].find((x) => x.dataset.region === p.region);
  if (rp) rp.classList.toggle("on", on);
}
function mmApplyView(name) {
  const m = MAPS[name], v = MMAP_VIEW[name];
  const stage = $(`#memoryMaps .mmap-stage[data-map="${name}"]`); if (!stage) return;
  const svg = stage.querySelector(".mmap-svg"); if (!svg) return;
  const vw = m.w / v.scale, vh = m.h / v.scale;
  let x = v.cx - vw / 2, y = v.cy - vh / 2;
  x = Math.max(0, Math.min(m.w - vw, x)); y = Math.max(0, Math.min(m.h - vh, y));
  v.cx = x + vw / 2; v.cy = y + vh / 2;
  svg.setAttribute("viewBox", `${x.toFixed(2)} ${y.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`);
  const sw = stage.clientWidth || 800, sh = stage.clientHeight || 600;
  const scr = Math.min(sw / vw, sh / vh) || (sw / vw);   // 실제 표시 배율(px/user)
  svg.querySelector(".mmap-labels").style.fontSize = (17 / scr).toFixed(2) + "px";
  svg.querySelector(".mmap-labels").classList.toggle("show", v.scale >= 1.8);
  // 핀 반지름 — 표시 배율 기준으로 화면 크기를 일정하게(한국·세계 지도 동일 크기)
  const pr = (5.5 / scr).toFixed(2);
  svg.querySelectorAll(".mpin-dot").forEach((c) => c.setAttribute("r", pr));
}
function mmBindZoom(stage, name) {
  const m = MAPS[name];
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const v = MMAP_VIEW[name], rect = stage.getBoundingClientRect();
    const vw = m.w / v.scale, vh = m.h / v.scale, x0 = v.cx - vw / 2, y0 = v.cy - vh / 2;
    const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
    const ux = x0 + fx * vw, uy = y0 + fy * vh;
    const ns = Math.max(1, Math.min(7, v.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
    const nvw = m.w / ns, nvh = m.h / ns;
    v.cx = ux - (fx - 0.5) * nvw; v.cy = uy - (fy - 0.5) * nvh; v.scale = ns;
    mmApplyView(name);
  }, { passive: false });
  let drag = false, sx = 0, sy = 0, scx = 0, scy = 0;
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".mpin")) return;
    drag = true; stage._moved = false; sx = e.clientX; sy = e.clientY;
    const v = MMAP_VIEW[name]; scx = v.cx; scy = v.cy;
    stage.setPointerCapture(e.pointerId); stage.style.cursor = "grabbing";
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const v = MMAP_VIEW[name], rect = stage.getBoundingClientRect(), vw = m.w / v.scale, vh = m.h / v.scale;
    if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 3) stage._moved = true;
    v.cx = scx - (e.clientX - sx) / rect.width * vw;
    v.cy = scy - (e.clientY - sy) / rect.height * vh;
    mmApplyView(name);
  });
  const end = () => { drag = false; stage.style.cursor = "grab"; };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
  stage.style.cursor = "grab";
}
function closeMapSide(row) {
  if (!row) return;
  row.classList.remove("has-sel", "has-article");
  const side = row.querySelector(".mmap-side"); if (side) side.hidden = true;
  row.querySelectorAll(".mpin.on").forEach((p) => p.classList.remove("on"));
  row.querySelectorAll(".mmap-region.on, .mmap-muni.on").forEach((p) => p.classList.remove("on"));
}
function openMapPin(g) {
  const name = g.dataset.map, pins = MAPPINS.filter((p) => p.map === name), p = pins[+g.dataset.i];
  if (!p) return;
  // 지역 음영은 호버로 처리(선택 시에는 전체화면 상세만 연다)
  // 상세: 부고인의 기억과 동일한 전체화면 모달(좌 관련자료 / 우 인터뷰영상)
  // 관련 기사 원문을 페이지 내에서 스크롤로 열람(임베드). 없으면 '준비 중'.
  const articleBlock = p.article
    ? `<div class="mside-article">` +
      `<div class="mside-article-bar"><span class="mside-article-src">${esc(p.articleSrc || "관련 기사")}</span>` +
      `<a class="mside-article-ext" href="${esc(p.article)}" target="_blank" rel="noopener">원문 새 창 ↗</a></div>` +
      (p.articleTitle ? `<p class="mside-article-ttl">${esc(p.articleTitle)}</p>` : "") +
      `<div class="mside-article-scaler"><iframe class="mside-article-frame" src="${esc(p.article)}" title="관련 기사" loading="lazy" referrerpolicy="no-referrer"></iframe></div></div>`
    : "";
  const evCol = p.article
    ? (p.activity ? `<p class="mside-actline">${esc(p.activity)}</p>` : "") + articleBlock
    : `<p class="md-empty">준비 중입니다.</p>`;
  const vid = p.vid || personVid(p.person), st = p.ts ? tsToSec(p.ts) : 0;
  const ivThumb = vid
    ? `<span class="evc-img" style="background-image:url('https://i.ytimg.com/vi/${esc(vid)}/hqdefault.jpg')"></span>`
    : `<span class="evc-img evc-ph"><span class="evc-src">${esc(p.person)}</span></span>`;
  const ivCard = vid
    ? `<button class="miv" type="button" data-vid="${esc(vid)}" data-start="${st}">` +
      `<span class="evc-thumb miv-thumb">${ivThumb}<span class="evc-play" aria-hidden="true">▶</span></span>` +
      `<span class="miv-body"><span class="miv-head"><b class="miv-name">${esc(p.person)}</b>` +
      (p.ts ? `<span class="miv-ts">${esc(p.ts)}</span>` : "") + `</span>` +
      (p.activity ? `<span class="miv-sum">${esc(p.activity)}</span>` : "") + `</span></button>`
    : `<p class="md-empty">연결된 인터뷰가 없습니다.</p>`;
  const panel = $("#memoryDetail"); if (!panel) return;
  panel.innerHTML =
    `<div class="mm-box">` +
    `<button class="md-close" type="button" aria-label="닫기">×</button>` +
    `<h3 class="md-title">${p.grad ? esc(p.grad) + " " : ""}${esc(p.person)}` +
    (p.place ? ` <span class="md-title-sub">${esc(p.place)}</span>` : "") + `</h3>` +
    `<div class="md-cols">` +
    `<div class="md-col md-col-ev"><h4 class="md-colh">관련자료</h4>${evCol}</div>` +
    `<div class="md-col md-col-iv"><h4 class="md-colh">인터뷰 영상</h4><div class="md-ivlist">${ivCard}</div></div>` +
    `</div>` + miniUploaderHTML("map_" + p.person + "_" + (p.place || "")) + `</div>`;
  panel.hidden = false; document.body.style.overflow = "hidden";
  panel.querySelector(".md-close").addEventListener("click", closeMemoryDetail);
  panel.onclick = (e) => { if (e.target === panel) closeMemoryDetail(); };
  panel.querySelectorAll(".miv[data-vid]").forEach((b) => b.addEventListener("click", () => mdPlay(b)));
  initMiniUploaders(panel);
  const box = panel.querySelector(".mm-box"); if (box) box.scrollTop = 0;
  requestAnimationFrame(fitMapArticleFrame);
}
/* 관련자료 기사 iframe을 칼럼 폭에 맞게 축소(가로 스크롤 제거) */
function fitMapArticleFrame() {
  const panel = $("#memoryDetail");
  if (!panel || panel.hidden) return;
  const scaler = panel.querySelector(".mside-article-scaler"), frame = panel.querySelector(".mside-article-frame");
  if (!scaler || !frame) return;
  const w = scaler.clientWidth; if (!w) return;
  const BASE = 1024, DISP = 580;
  const k = w / BASE;
  frame.style.width = BASE + "px";
  frame.style.height = Math.round(DISP / k) + "px";
  frame.style.transform = "scale(" + k + ")";
  scaler.style.height = DISP + "px";
}
/* 기억의 재구성: 사건별 기록영상·관련자료 썸네일 갤러리 */
function evSource(mat) {
  const s = String(mat || "");
  const m = s.match(/^\s*([^「」:]+?)\s*(?:[:「]|$)/);
  return (m ? m[1] : s).trim().slice(0, 28);
}
function evTitle(mat) {
  const s = String(mat || "");
  const q = s.match(/「([^」]+)」/);
  if (q) return q[1];
  const c = s.split(":"); return (c.length > 1 ? c.slice(1).join(":") : s).trim();
}
function renderMemoryEvidence() {
  const wrap = $("#memoryEvidence");
  if (!wrap || !EVIDENCE.length) return;
  wrap.innerHTML = EVIDENCE.map((cat) => {
    const events = cat.events.map((ev) => {
      const cards = ev.items.map((it) => {
        const thumb = it.vid
          ? `<span class="evc-img" style="background-image:url('https://i.ytimg.com/vi/${esc(it.vid)}/hqdefault.jpg')"></span>`
          : `<span class="evc-img evc-ph"><span class="evc-src">${esc(evSource(it.material))}</span></span>`;
        const play = (it.vid || it.archival) ? `<span class="evc-play" aria-hidden="true">▶</span>` : "";
        const badge = it.archival ? `<span class="evc-badge">당시 기록영상</span>` : "";
        const inner =
          `<span class="evc-thumb">${thumb}${play}${badge}</span>` +
          `<span class="evc-cap" title="${esc(it.material)}">${esc(evTitle(it.material))}</span>`;
        return it.link
          ? `<a class="evc" href="${esc(it.link)}" target="_blank" rel="noopener">${inner}</a>`
          : `<span class="evc evc-nolink">${inner}</span>`;
      }).join("");
      const alumni = (ev.items.find((x) => x.alumni) || {}).alumni || "";
      return `<div class="ev-event"><div class="ev-ehead"><h4 class="ev-etitle">${esc(ev.section)}</h4>` +
        (alumni ? `<p class="ev-alumni">언급 동문 · ${esc(alumni)}</p>` : "") + `</div>` +
        `<div class="ev-grid">${cards}</div></div>`;
    }).join("");
    return `<section class="ev-cat"><h3 class="ev-cat-h">${esc(cat.gubun)}</h3>${events}</section>`;
  }).join("");
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
  const items = scRepIdxs().map((i) => {
    const d = INTERVIEWS[i];
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
/* 동문 편지함 — 편지쓰기(브라우저 로컬 저장, 100자 제한) */
function letterKey(b) { return "sndaebugo_letters_" + b; }
function loadLetters(b) { try { return JSON.parse(localStorage.getItem(letterKey(b)) || "[]"); } catch (e) { return []; } }
function saveLetters(b, a) { try { localStorage.setItem(letterKey(b), JSON.stringify(a)); } catch (e) {} }
function renderUserLetters(board) {
  const wrap = $("#userLetters" + (board === "juniors" ? "Juniors" : "Seniors"));
  if (!wrap) return;
  const arr = loadLetters(board);
  wrap.innerHTML = arr.length
    ? `<ul class="jm-list">` + arr.map((x, i) =>
        `<li class="jm-item jm-user"><button class="letter-del" type="button" data-i="${i}" aria-label="삭제">×</button>` +
        `<span class="jm-name">${esc(x.name)}</span><p class="jm-text">“${esc(x.body)}”</p></li>`
      ).join("") + `</ul>`
    : "";
  const se = $("#seniorsEmpty"); if (board === "seniors" && se) se.hidden = arr.length > 0;
  wrap.querySelectorAll(".letter-del").forEach((b) => b.addEventListener("click", () => {
    const a = loadLetters(board); a.splice(+b.dataset.i, 1); saveLetters(board, a); renderUserLetters(board);
  }));
}
let letterBoard = "juniors";
function openLetterModal(board) {
  letterBoard = board;
  $("#letterTitle").textContent = board === "juniors" ? "후배들에게 편지쓰기" : "선배님들께 편지쓰기";
  $("#letterName").value = ""; $("#letterBody").value = ""; $("#letterCount").textContent = "0";
  $("#letterModal").hidden = false; document.body.style.overflow = "hidden";
  setTimeout(() => $("#letterName").focus(), 30);
}
function closeLetterModal() {
  $("#letterModal").hidden = true;
  if (!$("#vidLightbox") || $("#vidLightbox").hidden) document.body.style.overflow = "";
}
function bindLetters() {
  document.querySelectorAll(".letter-btn").forEach((b) => b.addEventListener("click", () => openLetterModal(b.dataset.board)));
  const modal = $("#letterModal"); if (!modal) return;
  modal.querySelectorAll("[data-lclose]").forEach((el) => el.addEventListener("click", closeLetterModal));
  const body = $("#letterBody"), cnt = $("#letterCount");
  if (body && cnt) body.addEventListener("input", () => { cnt.textContent = body.value.length; });
  const sub = $("#letterSubmit");
  if (sub) sub.addEventListener("click", () => {
    const name = $("#letterName").value.trim(), txt = $("#letterBody").value.trim();
    if (!name) { alert("보내는 이를 입력해 주세요."); return; }
    if (!txt) { alert("내용을 입력해 주세요."); return; }
    const a = loadLetters(letterBoard); a.unshift({ name: name, body: txt.slice(0, 100), ts: Date.now() });
    saveLetters(letterBoard, a); renderUserLetters(letterBoard); closeLetterModal();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeLetterModal(); });
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
  if (PORTRAIT_PEOPLE.has(d.person + "|" + (d.grad || ""))) return "data/portraits/" + encodeURIComponent(d.person + "_" + (d.grad || "")) + ".jpg";
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
function renderPeople() { scIndex = 0; const c = $("#scCount"); if (c) c.textContent = scEntries().length; renderScGallery(); }
/* 인물소개 표시 단위: 같은 인물 중복은 하나로(두 번째 영상 유지), 부부는 한 페이지로 */
const SC_COUPLES = { "박병준": "홍정희", "김여순": "노순주" };
const SC_SPOUSES = new Set(Object.values(SC_COUPLES));
let SC_REPIDX = null, SC_ENTRIES = null;
function scKey(d) { return (d.grad || "") + "|" + d.person; }
function scRepIdxs() {
  if (SC_REPIDX) return SC_REPIDX;
  const rep = {};
  INTERVIEWS.forEach((d, i) => { rep[scKey(d)] = i; }); // 같은 인물은 마지막(두 번째 영상) 유지
  SC_REPIDX = Object.values(rep);
  return SC_REPIDX;
}
function scEntries() {
  if (SC_ENTRIES) return SC_ENTRIES;
  const reps = scRepIdxs(), byPerson = {};
  reps.forEach((i) => { byPerson[INTERVIEWS[i].person] = i; });
  const used = new Set(), entries = [];
  reps.forEach((i) => {
    const d = INTERVIEWS[i];
    if (used.has(i)) return;
    if (d.person in SC_COUPLES) {
      const sp = byPerson[SC_COUPLES[d.person]];
      used.add(i); if (sp != null) used.add(sp);
      entries.push({ primary: i, idxs: sp != null ? [i, sp] : [i], couple: sp != null });
    } else if (SC_SPOUSES.has(d.person)) {
      /* 배우자는 주 인물과 함께 처리 */
    } else {
      used.add(i); entries.push({ primary: i, idxs: [i], couple: false });
    }
  });
  entries.sort((a, b) => (winNum(INTERVIEWS[a.primary].grad) - winNum(INTERVIEWS[b.primary].grad)) || a.primary - b.primary);
  SC_ENTRIES = entries;
  return entries;
}
function scEntryOf(i) {
  const es = scEntries();
  return es.find((e) => e.idxs.includes(i)) || es.find((e) => e.primary === i) || null;
}
function scEntryName(e) {
  if (e.couple) return e.idxs.map((j) => `${INTERVIEWS[j].grad ? esc(INTERVIEWS[j].grad) + " " : ""}${esc(INTERVIEWS[j].person)}`).join(" · ");
  return esc(INTERVIEWS[e.primary].person);
}
function scEntryAria(e) { return e.idxs.map((j) => INTERVIEWS[j].person).join(" · "); }
function scBioOf(i) {
  const d = INTERVIEWS[i], b = BIOS[i];
  if (b && b.person === d.person && Array.isArray(b.paras) && b.paras.length) return b.paras;
  return scBioParas(d);
}
function renderScGallery() {
  const gal = $("#scGallery"), det = $("#scDetail");
  if (!gal) return;
  if (det) det.hidden = true;
  gal.hidden = false;
  const es = scEntries(), n = es.length; if (!n) return;
  let pos = es.findIndex((e) => e.primary === scIndex);
  if (pos < 0) { const e0 = scEntryOf(scIndex); pos = e0 ? es.indexOf(e0) : 0; }
  if (pos < 0) pos = 0;
  scIndex = es[pos].primary;
  const entryAt = (k) => es[(((pos + k) % n) + n) % n];
  const slot = (k, cls) => {
    const e = entryAt(k), d = INTERVIEWS[e.primary], p = scPortrait(d);
    return (
      `<button class="sc-img ${cls}" type="button" data-k="${k}" aria-label="${esc(scEntryAria(e))}">` +
      (p ? `<img src="${esc(p)}" alt="${esc(scEntryAria(e))}" loading="lazy">` : `<span class="sc-init">${esc((d.person || "").slice(0, 1))}</span>`) +
      `</button>`
    );
  };
  const curE = entryAt(0), cur = INTERVIEWS[curE.primary], roles = scRoles(cur);
  gal.innerHTML =
    `<div class="sc-strip">` +
    slot(-2, "sc-far sc-l") + slot(-1, "sc-near sc-l") + slot(0, "sc-main") + slot(1, "sc-near sc-r") + slot(2, "sc-far sc-r") +
    `</div>` +
    `<div class="sc-caption">` +
    (curE.couple
      ? `<p class="sc-grad">동문 부부</p><h3 class="sc-name">${scEntryName(curE)} 선배님</h3>`
      : (cur.grad ? `<p class="sc-grad">제${esc(cur.grad)} 졸업생</p>` : "") +
        `<h3 class="sc-name">${esc(cur.person)} 선배님</h3>` +
        (roles.length ? `<div class="sc-roles">${roles.map((r) => `<span>${esc(r)}</span>`).join("")}</div>` : "")) +
    `</div>`;
  gal.querySelectorAll(".sc-img").forEach((b) => {
    const k = +b.dataset.k;
    b.addEventListener("click", () => { if (k === 0) openScDetail(scIndex); else { scIndex = entryAt(k).primary; renderScGallery(); } });
  });
  positionScCaption();
}
/* 인물정보 캡션을 우측(근접-우) 사진의 좌측 끝 기준 좌측정렬 + 그 사진 바로 아래에 고정(사진과 겹치지 않음) */
function positionScCaption() {
  const gal = $("#scGallery"); if (!gal || gal.hidden) return;
  const capEl = gal.querySelector(".sc-caption"), nr = gal.querySelector(".sc-near.sc-r");
  if (!capEl) return;
  if (!nr || window.innerWidth <= 720) { capEl.style.left = capEl.style.top = capEl.style.right = capEl.style.bottom = ""; return; }
  const gr = gal.getBoundingClientRect(), nrr = nr.getBoundingClientRect();
  if (gr.width === 0 || nrr.width === 0) return;   // 아직 레이아웃되지 않음(숨김 상태)
  capEl.style.left = Math.round(nrr.left - gr.left) + "px";
  capEl.style.top = Math.round(nrr.bottom - gr.top + 10) + "px";
  capEl.style.right = "auto"; capEl.style.bottom = "auto";
}
function openScDetail(i) {
  const n = INTERVIEWS.length;
  i = ((i % n) + n) % n;
  const entry = scEntryOf(i) || { primary: i, idxs: [i], couple: false };
  scIndex = entry.primary;
  const d = INTERVIEWS[scIndex];
  const gal = $("#scGallery"), det = $("#scDetail");
  if (!det) return;
  const pageY = window.scrollY;
  gal.hidden = true; det.hidden = false;
  const p = scPortrait(d);
  const title = (TITLES[scIndex] || "").trim() || SC_QUESTIONS[d.person] || d.sub || "";
  const isRec = RECIPIENTS.some((r) => r.name === d.person);
  const list = scEntries().map((e) => {
    const lab = e.couple ? scEntryName(e) : `${INTERVIEWS[e.primary].grad ? esc(INTERVIEWS[e.primary].grad) + " " : ""}${esc(INTERVIEWS[e.primary].person)}`;
    return `<button class="sc-li${e.primary === scIndex ? " on" : ""}" type="button" data-i="${e.primary}">${lab}</button>`;
  }).join("");
  let nameLine, bioHTML;
  if (entry.couple) {
    nameLine = scEntryName(entry) + " 선배님";
    bioHTML = entry.idxs.map((j) => {
      const pd = INTERVIEWS[j];
      return `<p class="sc-d-sub">${pd.grad ? esc(pd.grad) + " " : ""}${esc(pd.person)} 선배님</p>` +
        scBioOf(j).map((x) => `<p>${esc(x)}</p>`).join("");
    }).join("");
  } else {
    nameLine = esc(d.person) + " 선배님";
    bioHTML = scBio(d).map((x) => `<p>${esc(x)}</p>`).join("");
  }
  det.innerHTML =
    `<button class="sc-close" type="button" aria-label="닫기">×</button>` +
    `<div class="sc-detail-inner3">` +
    `<nav class="sc-list" aria-label="인물 명단">${list}</nav>` +
    `<div class="sc-d-photo">${p ? `<img src="${esc(p)}" alt="${esc(scEntryAria(entry))}">` : ""}</div>` +
    `<div class="sc-d-info">` +
    (title ? `<h3 class="sc-d-title">${esc(title)}</h3>` : "") +
    `<p class="sc-d-name">${nameLine}</p>` +
    `<div class="sc-d-bio">${bioHTML}</div>` +
    `<div class="sc-d-links">` +
    (isRec ? `<a class="sc-d-link" href="proud_articles.html?person=${encodeURIComponent(d.person)}">관련기사 →</a>` : "") +
    `<button class="sc-d-link sc-d-interview" type="button">인터뷰 →</button>` +
    `</div>` +
    `</div></div>` +
    miniUploaderHTML("sc_" + d.person);
  initMiniUploaders(det);
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
  // 데스크탑: 본문·버튼을 프로필 사진 하단에 맞춤(본문이 짧으면 사진 높이 범위 내, 길면 아래로)
  const infoBox = det.querySelector(".sc-d-info");
  if (ph && infoBox) {
    const applyMinH = () => { infoBox.style.minHeight = window.innerWidth > 860 ? ph.offsetHeight + "px" : ""; };
    const im = ph.querySelector("img");
    if (im && !im.complete) im.addEventListener("load", applyMinH, { once: true });
    applyMinH();
  }
  window.scrollTo(0, pageY);
}
function scOrder() { return scEntries().map((e) => e.primary); }
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
function segOf(vid) { return (vid && SEGMENTS[vid]) || null; }
function openVidLightbox(vid, start, end) {
  const lb = $("#vidLightbox");
  if (!lb || !vid) return;
  let src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?autoplay=1&rel=0&playsinline=1`;
  if (start != null && start !== "") src += `&start=${Math.max(0, Math.floor(+start))}`;
  if (end != null && end !== "") src += `&end=${Math.floor(+end)}`;
  lb.querySelector(".vl-frame").innerHTML =
    `<iframe class="vl-iframe" src="${src}" ` +
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

/* 공간구상 — 실물전시 형식(벽별 그룹: 제목 + 스케치업 구성안 + 레퍼런스 그리드, 클릭=라이트박스) */
function renderSpace() {
  const root = $("#spaceGrid"); if (!root) return;
  const P = "img/space/";
  const walls = [
    { title: "벽1 · 우리의 기억", rep: [1], refs: [2, 3, 4] },
    { title: "벽2 · 동문 편지함", rep: [5, 6], refs: [7, 8, 9] },
    { title: "벽3 · 자랑스러운 부고인 · 천하부고 동창회", rep: [10, 11], refs: [12, 13, 14, 15] },
    { title: "벽4 · 도너스 월", rep: [16], refs: [] }
  ];
  const lbItems = [];
  const add = (src) => { lbItems.push(src); return lbItems.length - 1; };
  const sketchHTML = (g) => g.rep.map((p) => { const i = add(P + p + ".jpg"); return '<button class="ex-rep-img" type="button" data-i="' + i + '"><img src="' + P + p + '.jpg" alt="' + esc(g.title) + ' 구성안" loading="lazy"></button>'; }).join("");
  const refsHTML = (g) => g.refs.map((p) => { const i = add(P + p + ".jpg"); return '<button class="ex-ref-img" type="button" data-i="' + i + '"><img src="' + P + p + '.jpg" alt="레퍼런스" loading="lazy"></button>'; }).join("");
  let html = "";
  walls.forEach((g, gi) => {
    html += '<section class="ex-group">';
    html += '<h2 class="ex-gtitle"><span class="ex-gno">' + (gi + 1) + '</span>' + esc(g.title) + '</h2>';
    if (g.refs.length) {
      html += '<div class="space-cols">';
      html += '<div class="space-col"><p class="ex-reflabel" style="margin-top:0">스케치업 구성안</p><div class="sp-sketch">' + sketchHTML(g) + '</div></div>';
      html += '<div class="space-col"><p class="ex-reflabel" style="margin-top:0">레퍼런스</p><div class="ex-refs sp-refs">' + refsHTML(g) + '</div></div>';
      html += '</div>';
    } else {
      html += '<p class="ex-reflabel" style="margin-top:0">스케치업 구성안</p><div class="ex-rep">' + sketchHTML(g) + '</div>';
    }
    html += '</section>';
  });
  root.innerHTML = html;
  // 라이트박스
  const lb = $("#spaceLightbox"), lbImg = lb ? lb.querySelector(".lg-lb-img") : null;
  let cur = 0;
  const show = () => { cur = (cur % lbItems.length + lbItems.length) % lbItems.length; if (lbImg) lbImg.src = lbItems[cur]; };
  const openLB = (i) => { cur = i; show(); if (lb) { lb.hidden = false; document.body.style.overflow = "hidden"; } };
  const closeLB = () => { if (lb) lb.hidden = true; if (!$("#vidLightbox") || $("#vidLightbox").hidden) document.body.style.overflow = ""; };
  root.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) openLB(+b.dataset.i); });
  if (lb) {
    lb.querySelector(".lg-lb-close").addEventListener("click", closeLB);
    lb.querySelector(".lg-lb-prev").addEventListener("click", (e) => { e.stopPropagation(); cur--; show(); });
    lb.querySelector(".lg-lb-next").addEventListener("click", (e) => { e.stopPropagation(); cur++; show(); });
    lb.addEventListener("click", (e) => { if (e.target === lb) closeLB(); });
    document.addEventListener("keydown", (e) => { if (lb.hidden) return; if (e.key === "Escape") closeLB(); else if (e.key === "ArrowRight") { cur++; show(); } else if (e.key === "ArrowLeft") { cur--; show(); } });
  }
}

document.addEventListener("DOMContentLoaded", init);
