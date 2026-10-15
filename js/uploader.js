"use strict";
/* 갤러리/상세 페이지 하단 공통 '자료 추가' 업로더 — 브라우저 로컬 저장(이미지 축소 후 localStorage) */
(function () {
  function initUploader(sec) {
    if (!sec || sec._upInit) return;
    sec._upInit = true;
    var key = "sndaebugo_uploads_" + (sec.dataset.upkey || "default");
    var grid = sec.querySelector(".up-grid");
    var input = sec.querySelector("input[type=file]");
    if (!grid || !input) return;
    function load() { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; } }
    function save(a) { try { localStorage.setItem(key, JSON.stringify(a)); return true; } catch (e) { alert("저장 공간이 부족합니다. 기존 자료를 삭제한 뒤 다시 시도해 주세요."); return false; } }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
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
    function extLabel(kind) {
      return { pdf: "PDF", excel: "XLS", ppt: "PPT", word: "DOC", hwp: "HWP" }[kind] || "FILE";
    }
    function render() {
      var a = load();
      grid.innerHTML = a.map(function (u, i) {
        var del = '<button class="up-del" type="button" data-u="' + i + '" aria-label="삭제">×</button>';
        if (u.kind === "link") {
          return '<figure class="up-item up-fileitem up-linkitem">' + del +
            '<a class="up-filebox" href="' + esc(u.src) + '" target="_blank" rel="noopener noreferrer">' +
            '<span class="up-ext">LINK</span>' +
            '<span class="up-fname">' + esc(u.name) + '</span></a></figure>';
        }
        if (u.kind === "video") {
          return '<figure class="up-item up-viditem">' + del +
            '<video src="' + esc(u.src) + '" controls preload="metadata"></video>' +
            (u.name ? '<figcaption>' + esc(u.name) + '</figcaption>' : "") + '</figure>';
        }
        if (u.kind && u.kind !== "image") {
          return '<figure class="up-item up-fileitem">' + del +
            '<a class="up-filebox" href="' + u.src + '" download="' + esc(u.name) + '">' +
            '<span class="up-ext">' + extLabel(u.kind) + '</span>' +
            '<span class="up-fname">' + esc(u.name) + '</span></a></figure>';
        }
        return '<figure class="up-item">' + del +
          '<img src="' + u.src + '" alt="' + esc(u.name) + '">' + (u.name ? '<figcaption>' + esc(u.name) + '</figcaption>' : "") + '</figure>';
      }).join("");
      [].forEach.call(grid.querySelectorAll(".up-del"), function (b) {
        b.addEventListener("click", function () { var arr = load(); arr.splice(+b.dataset.u, 1); save(arr); render(); });
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
        } else {
          if (f.size > 4 * 1024 * 1024) { alert('"' + f.name + '" 파일이 너무 큽니다. 4MB 이하 파일만 저장할 수 있습니다.'); finish(); return; }
          var r = new FileReader();
          r.onload = function () { arr.unshift({ src: r.result, name: f.name.slice(0, 60), kind: fileKind(f), ts: Date.now() }); finish(); };
          r.onerror = function () { finish(); };
          r.readAsDataURL(f);
        }
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
