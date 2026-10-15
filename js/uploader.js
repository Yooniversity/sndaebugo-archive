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
    function render() {
      var a = load();
      grid.innerHTML = a.map(function (u, i) {
        return '<figure class="up-item"><button class="up-del" type="button" data-u="' + i + '" aria-label="삭제">×</button>' +
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
      var files = [].slice.call(input.files).filter(function (f) { return /^image\//.test(f.type); });
      if (!files.length) return;
      var done = 0, arr = load();
      files.forEach(function (f) {
        downscale(f, function (dataUrl) {
          if (dataUrl) arr.unshift({ src: dataUrl, name: f.name.replace(/\.[^.]+$/, "").slice(0, 40), ts: Date.now() });
          if (++done === files.length) { save(arr); render(); }
        });
      });
      input.value = "";
    });
    render();
  }
  window.SNDUploader = {
    init: initUploader,
    initAll: function (root) { [].forEach.call((root || document).querySelectorAll(".up-sec[data-upkey]"), initUploader); }
  };
  document.addEventListener("DOMContentLoaded", function () { window.SNDUploader.initAll(document); });
})();
