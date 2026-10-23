"use strict";
/* 갤러리/상세 페이지 하단 공통 '자료 추가' 업로더
   - 이미지/동영상/PDF/엑셀/PPT/워드/한글 파일 + 링크(URL) 등록
   - 브라우저 localStorage 로컬 저장(이미지 축소, 영상·PDF 썸네일 생성)
   - 썸네일 클릭 시 전체화면 뷰어(이미지·영상·PDF 미리보기, 그 외 다운로드) */
(function () {
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function once(fn) { var done = false; return function () { if (done) return; done = true; fn.apply(null, arguments); }; }
  function extLabel(kind) { return { pdf: "PDF", excel: "XLS", ppt: "PPT", word: "DOC", hwp: "HWP", file: "FILE" }[kind] || "FILE"; }
  function fileKind(f) {
    var n = (f.name || "").toLowerCase(), t = f.type || "";
    if (/^video\//.test(t) || /\.(mp4|mov|webm|avi|mkv|m4v)$/.test(n)) return "video";
    if (t === "application/pdf" || /\.pdf$/.test(n)) return "pdf";
    if (/sheet|excel|csv/.test(t) || /\.(xls|xlsx|csv)$/.test(n)) return "excel";
    if (/presentation|powerpoint/.test(t) || /\.(ppt|pptx)$/.test(n)) return "ppt";
    if (/word|document/.test(t) || /\.(doc|docx)$/.test(n)) return "word";
    if (/\.(hwp|hwpx)$/.test(n) || /hwp|hangul/.test(t)) return "hwp";
    return "file";
  }
  function dataUrlToBlobUrl(dataUrl) {
    try {
      var parts = dataUrl.split(","), m = /:(.*?);/.exec(parts[0]), mime = m ? m[1] : "application/octet-stream";
      var bin = atob(parts[1]), len = bin.length, arr = new Uint8Array(len);
      for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([arr], { type: mime }));
    } catch (e) { return dataUrl; }
  }
  // 동영상 포스터 썸네일(한 프레임 캡처)
  function videoPoster(dataUrl, cb) {
    cb = once(cb);
    setTimeout(function () { cb(null); }, 9000);
    var v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.playsInline = true;
    v.onloadeddata = function () { try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch (e) { cb(null); } };
    v.onseeked = function () {
      try {
        var w = v.videoWidth, h = v.videoHeight, mx = 480, s = Math.min(1, mx / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        cb(c.toDataURL("image/jpeg", 0.72));
      } catch (e) { cb(null); }
    };
    v.onerror = function () { cb(null); };
    v.src = dataUrl;
  }
  // PDF 첫 페이지 썸네일(pdf.js, 실패 시 null)
  var pdfLibP = null;
  function loadPdfJs(cb) {
    if (window.pdfjsLib) { cb(window.pdfjsLib); return; }
    if (pdfLibP) { pdfLibP.push(cb); return; }
    pdfLibP = [cb];
    var done = once(function (lib) { var q = pdfLibP; pdfLibP = []; q.forEach(function (f) { f(lib); }); });
    var s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = function () { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; } catch (e) {} done(window.pdfjsLib || null); };
    s.onerror = function () { done(null); };
    document.head.appendChild(s);
  }
  function pdfThumb(dataUrl, cb) {
    cb = once(cb);
    setTimeout(function () { cb(null); }, 12000);
    loadPdfJs(function (lib) {
      if (!lib) { cb(null); return; }
      try {
        var raw = atob(dataUrl.split(",")[1]), arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        lib.getDocument({ data: arr }).promise.then(function (pdf) { return pdf.getPage(1); }).then(function (page) {
          var vp = page.getViewport({ scale: 1 }), mx = 480, scale = Math.min(2, mx / Math.max(vp.width, vp.height));
          var v2 = page.getViewport({ scale: scale });
          var c = document.createElement("canvas"); c.width = v2.width; c.height = v2.height;
          return page.render({ canvasContext: c.getContext("2d"), viewport: v2 }).promise.then(function () { cb(c.toDataURL("image/jpeg", 0.75)); });
        }).catch(function () { cb(null); });
      } catch (e) { cb(null); }
    });
  }

  // ===== 전체화면 뷰어(페이지 공용) =====
  var viewer = null;
  function ensureViewer() {
    if (viewer) return viewer;
    viewer = document.createElement("div");
    viewer.className = "up-lb"; viewer.hidden = true;
    viewer.innerHTML = '<button class="up-lb-close" type="button" aria-label="닫기">×</button><div class="up-lb-body"></div>';
    document.body.appendChild(viewer);
    viewer._body = viewer.querySelector(".up-lb-body");
    viewer._revoke = function () { if (viewer._blob) { try { URL.revokeObjectURL(viewer._blob); } catch (e) {} viewer._blob = null; } };
    function close() { viewer.hidden = true; viewer._body.innerHTML = ""; viewer._revoke(); document.body.style.overflow = ""; }
    viewer.querySelector(".up-lb-close").addEventListener("click", close);
    viewer.addEventListener("click", function (e) { if (e.target === viewer) close(); });
    document.addEventListener("keydown", function (e) { if (!viewer.hidden && e.key === "Escape") close(); });
    return viewer;
  }
  function openViewer(item) {
    if (!item) return;
    if (item.kind === "link") { window.open(item.src, "_blank", "noopener"); return; }
    var v = ensureViewer(), body = v._body;
    v._revoke();
    if (item.kind === "video") {
      body.innerHTML = '<video class="up-lb-media" src="' + item.src + '" controls autoplay playsinline></video>';
    } else if (item.kind === "pdf") {
      var url = dataUrlToBlobUrl(item.src); v._blob = url;
      body.innerHTML = '<iframe class="up-lb-pdf" src="' + url + '" title="' + esc(item.name) + '"></iframe>';
    } else if (!item.kind || item.kind === "image") {
      body.innerHTML = '<img class="up-lb-media" src="' + item.src + '" alt="' + esc(item.name) + '">';
    } else {
      body.innerHTML = '<div class="up-lb-file"><span class="up-ext up-ext-lg">' + extLabel(item.kind) + '</span>' +
        '<span class="up-lb-fname">' + esc(item.name) + '</span>' +
        '<a class="up-btn" href="' + item.src + '" download="' + esc(item.name) + '">다운로드</a></div>';
    }
    v.hidden = false; document.body.style.overflow = "hidden";
  }

  function initUploader(sec) {
    if (!sec || sec._upInit) return;
    sec._upInit = true;
    var key = "sndaebugo_uploads_" + (sec.dataset.upkey || "default");
    var grid = sec.querySelector(".up-grid");
    var input = sec.querySelector("input[type=file]");
    if (!grid || !input) return;
    function load() { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; } }
    function save(a) { try { localStorage.setItem(key, JSON.stringify(a)); return true; } catch (e) { alert("저장 공간이 부족합니다. 기존 자료를 삭제한 뒤 다시 시도해 주세요."); return false; } }
    function render() {
      var a = load();
      grid.innerHTML = a.map(function (u, i) {
        var del = '<button class="up-del" type="button" data-u="' + i + '" aria-label="삭제">×</button>';
        var cap = u.name ? '<figcaption>' + esc(u.name) + '</figcaption>' : "";
        if (u.kind === "link") {
          return '<figure class="up-item up-tile up-badgetile up-linktile">' + del +
            '<a class="up-tilebtn" href="' + esc(u.src) + '" target="_blank" rel="noopener noreferrer"><span class="up-ext">LINK</span></a>' + cap + '</figure>';
        }
        var thumb = (!u.kind || u.kind === "image") ? u.src : u.thumb;
        var inner, extra = "";
        if (thumb) {
          inner = '<img src="' + thumb + '" alt="' + esc(u.name) + '">' + (u.kind === "video" ? '<span class="up-play" aria-hidden="true">▶</span>' : "");
        } else {
          inner = '<span class="up-ext">' + extLabel(u.kind) + '</span>'; extra = " up-badgetile";
        }
        return '<figure class="up-item up-tile' + extra + '">' + del +
          '<button class="up-tilebtn" type="button" data-open="' + i + '">' + inner + '</button>' + cap + '</figure>';
      }).join("");
      [].forEach.call(grid.querySelectorAll(".up-del"), function (b) {
        b.addEventListener("click", function (e) { e.stopPropagation(); var arr = load(); arr.splice(+b.dataset.u, 1); save(arr); render(); });
      });
      [].forEach.call(grid.querySelectorAll("[data-open]"), function (b) {
        b.addEventListener("click", function () { var arr = load(); openViewer(arr[+b.dataset.open]); });
      });
    }
    function downscale(file, cb) {
      var r = new FileReader();
      r.onload = function () {
        var im = new Image();
        im.onload = function () {
          var mx = 1200, w = im.width, h = im.height;
          if (Math.max(w, h) > mx) { var s = mx / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
          var c = document.createElement("canvas"); c.width = w; c.height = h;
          c.getContext("2d").drawImage(im, 0, 0, w, h);
          try { cb(c.toDataURL("image/jpeg", 0.82)); } catch (e) { cb(null); }
        };
        im.onerror = function () { cb(null); };
        im.src = r.result;
      };
      r.readAsDataURL(file);
    }
    input.addEventListener("change", function () {
      var files = [].slice.call(input.files);
      if (!files.length) return;
      var done = 0, arr = load();
      function finish() { if (++done === files.length) { save(arr); render(); } }
      files.forEach(function (f) {
        if (/^image\//.test(f.type)) {
          downscale(f, function (dataUrl) {
            if (dataUrl) arr.unshift({ src: dataUrl, name: f.name.replace(/\.[^.]+$/, "").slice(0, 40), kind: "image", ts: Date.now() });
            finish();
          });
          return;
        }
        if (f.size > 4 * 1024 * 1024) { alert('"' + f.name + '" 파일이 너무 큽니다. 4MB 이하 파일만 저장할 수 있습니다.'); finish(); return; }
        var r = new FileReader();
        r.onload = function () {
          var kind = fileKind(f), item = { src: r.result, name: f.name.slice(0, 60), kind: kind, ts: Date.now() };
          if (kind === "video") { videoPoster(r.result, function (t) { if (t) item.thumb = t; arr.unshift(item); finish(); }); }
          else if (kind === "pdf") { pdfThumb(r.result, function (t) { if (t) item.thumb = t; arr.unshift(item); finish(); }); }
          else { arr.unshift(item); finish(); }
        };
        r.onerror = function () { finish(); };
        r.readAsDataURL(f);
      });
      input.value = "";
    });
    // '＋ 링크' 버튼 동적 추가 (URL 자료 등록)
    var fileLabel = input.closest("label");
    if (fileLabel && !sec.querySelector(".up-linkbtn")) {
      var isMini = fileLabel.classList.contains("up-mini-btn");
      var lb = document.createElement("button");
      lb.type = "button";
      lb.className = (isMini ? "up-mini-btn" : "up-btn") + " up-linkbtn";
      lb.textContent = "＋ 링크";
      lb.addEventListener("click", function () {
        var url = (prompt("링크 주소(URL)를 입력하세요:") || "").trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url) && url.indexOf(".") > -1) url = "https://" + url;
        if (!/^https?:\/\//i.test(url)) { alert("올바른 URL을 입력해 주세요 (http/https)."); return; }
        var title = (prompt("링크 이름(선택):", "") || "").trim() || url;
        var arr = load();
        arr.unshift({ kind: "link", src: url, name: title.slice(0, 80), ts: Date.now() });
        if (save(arr)) render();
      });
      fileLabel.insertAdjacentElement("afterend", lb);
    }
    render();
  }
  window.SNDUploader = {
    init: initUploader,
    initAll: function (root) { [].forEach.call((root || document).querySelectorAll(".up-sec[data-upkey]"), initUploader); }
  };
  document.addEventListener("DOMContentLoaded", function () { window.SNDUploader.initAll(document); });
})();
