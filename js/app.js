(function () {
  "use strict";

  var GAMES = window.GAMES || [];
  var TAGS = { pop: "Popular", two: "2 player", stream: "Streaming", bad: "Bad" };
  var RECENT_KEY = "ppsholy:recent";
  var THEME_KEY = "ppsholy:theme";
  var RECENT_MAX = 7;

  var $ = function (id) { return document.getElementById(id); };
  var grid = $("grid"), search = $("search"), status = $("status"), empty = $("empty");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  // ---- cards -------------------------------------------------------------

  function card(game) {
    var a = document.createElement("a");
    a.className = "game";
    a.href = game.u;
    a.target = "_blank";
    a.rel = "noopener";

    var thumb = document.createElement("div");
    thumb.className = "thumb";
    var img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "";
    img.width = 250;
    img.height = 250;
    img.onerror = function () {
      // No thumbnail: P mark on ink with one slat block.
      img.onerror = null;
      thumb.classList.add("blank");
      img.src = "assets/brand/mark.svg";
    };
    img.src = game.i;
    thumb.appendChild(img);

    var tag = (game.g || [])[0];
    if (tag) {
      var t = document.createElement("span");
      t.className = "tag " + tag;
      var inner = document.createElement("span");
      inner.textContent = TAGS[tag];
      t.appendChild(inner);
      thumb.appendChild(t);
    }

    var name = document.createElement("span");
    name.className = "name";
    name.textContent = game.t;

    a.appendChild(thumb);
    a.appendChild(name);
    a.addEventListener("click", function () { remember(game); });
    return a;
  }

  GAMES.forEach(function (g) {
    g.el = card(g);
    g.hay = (g.t + " " + (g.k || "")).toLowerCase();
    grid.appendChild(g.el);
  });
  $("total").textContent = GAMES.length;
  search.placeholder = "Search " + GAMES.length + " games";

  // ---- search and filters ------------------------------------------------

  var state = { q: "", tag: "all" };
  var shown = GAMES;

  function apply() {
    var q = state.q.trim().toLowerCase();
    shown = GAMES.filter(function (g) {
      var ok = (state.tag === "all" || (g.g || []).indexOf(state.tag) !== -1) &&
               (!q || g.hay.indexOf(q) !== -1);
      g.el.hidden = !ok;
      return ok;
    });

    chips.forEach(function (c) {
      c.setAttribute("aria-pressed", String(c.dataset.tag === state.tag));
    });
    empty.hidden = shown.length > 0;
    grid.hidden = shown.length === 0;
    status.textContent = (q || state.tag !== "all")
      ? shown.length + " of " + GAMES.length + " games"
      : "";

    // Keep the view shareable and reload-proof.
    var p = new URLSearchParams();
    if (q) p.set("q", state.q.trim());
    if (state.tag !== "all") p.set("tag", state.tag);
    var qs = p.toString();
    try { history.replaceState(null, "", qs ? "?" + qs : location.pathname); } catch (e) {}
  }

  search.addEventListener("input", function () { state.q = search.value; apply(); });
  chips.forEach(function (c) {
    c.addEventListener("click", function () { state.tag = c.dataset.tag; apply(); });
  });
  $("clear").addEventListener("click", function () {
    state.q = ""; state.tag = "all"; search.value = ""; apply(); search.focus();
  });

  document.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); search.focus(); search.select();
    } else if (e.key === "Escape" && document.activeElement === search) {
      state.q = ""; search.value = ""; apply(); search.blur();
    } else if (e.key === "Enter" && document.activeElement === search && shown.length) {
      shown[0].el.click();
    }
  });

  $("random").addEventListener("click", function () {
    var pool = shown.filter(function (g) { return (g.g || []).indexOf("stream") === -1; });
    if (!pool.length) pool = GAMES;
    pool[Math.floor(Math.random() * pool.length)].el.click();
  });

  // ---- recently played ---------------------------------------------------

  function recentList() {
    try { return JSON.parse(store.get(RECENT_KEY)) || []; } catch (e) { return []; }
  }

  function remember(game) {
    var list = recentList().filter(function (u) { return u !== game.u; });
    list.unshift(game.u);
    store.set(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
    renderRecent();
  }

  function renderRecent() {
    var box = $("recent-grid");
    var games = recentList()
      .map(function (u) { return GAMES.filter(function (g) { return g.u === u; })[0]; })
      .filter(Boolean);
    box.textContent = "";
    games.forEach(function (g) { box.appendChild(card(g)); });
    $("recent").hidden = games.length === 0;
  }

  // ---- theme -------------------------------------------------------------

  var themeBtn = $("theme");
  function isDark() {
    var t = document.documentElement.dataset.theme;
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function labelTheme() { themeBtn.textContent = isDark() ? "Light" : "Dark"; }
  themeBtn.addEventListener("click", function () {
    var next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set(THEME_KEY, next);
    labelTheme();
  });

  // ---- start -------------------------------------------------------------

  var params = new URLSearchParams(location.search);
  state.q = params.get("q") || "";
  state.tag = TAGS[params.get("tag")] ? params.get("tag") : "all";
  search.value = state.q;
  labelTheme();
  renderRecent();
  apply();
})();
