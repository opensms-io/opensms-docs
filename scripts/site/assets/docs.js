// OpenSMS Docs runtime: theme switch (shared cookie with the landing), mobile
// navigation drawer, search (prebuilt index, "/" or Cmd/Ctrl+K), copy buttons and
// the "On this page" scrollspy. No framework, no network requests except the
// search index, fetched the first time search opens.
(function () {
  'use strict';
  var doc = document;
  var root = doc.documentElement;
  var BASE = '/docs/';

  /* ---------- theme ---------- */
  function toggleTheme() {
    var dark = root.getAttribute('data-theme') === 'dark';
    if (dark) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', 'dark');
    var themeColor = doc.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', dark ? '#F4F4F6' : '#0B0A14');
    try {
      doc.cookie = 'opensms-theme=' + (dark ? 'light' : 'dark') + '; path=/; max-age=31536000; SameSite=Lax';
      localStorage.setItem('opensms-theme', dark ? 'light' : 'dark');
    } catch (e) { /* storage blocked */ }
  }

  /* ---------- platform keyboard hint ---------- */
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  if (isMac) doc.querySelectorAll('.kbd-cmd').forEach(function (k) { k.textContent = '⌘K'; });

  /* ---------- drawer ---------- */
  var menuBtn = doc.querySelector('[data-drawer-open]');
  var scrim = doc.querySelector('.scrim');
  var sidebar = doc.getElementById('sidebar');
  function setDrawer(open) {
    doc.body.classList.toggle('drawer-open', open);
    if (scrim) scrim.hidden = !open;
    if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      var current = sidebar && sidebar.querySelector('[aria-current="page"]');
      var closeBtn = sidebar && sidebar.querySelector('[data-drawer-close]');
      if (closeBtn) closeBtn.focus();
      if (current) current.scrollIntoView({ block: 'center' });
    } else if (menuBtn && sidebar && sidebar.contains(doc.activeElement)) {
      menuBtn.focus();
    }
  }

  /* ---------- copy ---------- */
  function flash(btn) {
    btn.classList.add('is-copied');
    var label = btn.querySelector('.code-copy-text');
    if (label) label.textContent = 'Copied';
    setTimeout(function () {
      btn.classList.remove('is-copied');
      if (label) label.textContent = 'Copy';
    }, 1600);
  }
  function copyText(text, btn) {
    var done = function () { flash(btn); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
    } else { legacyCopy(text); done(); }
  }
  function legacyCopy(text) {
    var ta = doc.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    doc.body.appendChild(ta); ta.select();
    try { doc.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }

  /* ---------- search ---------- */
  var dialog = doc.getElementById('search');
  var input = doc.getElementById('search-input');
  var list = doc.getElementById('search-results');
  var empty = dialog && dialog.querySelector('[data-search-empty]');
  var index = null;
  var loading = null;
  var selected = -1;
  var lastFocus = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch(BASE + 'search-index.json').then(function (r) { return r.json(); }).then(function (data) {
        index = data;
        index.entries.forEach(function (e) {
          e.lt = (data.pages[e[0]].t + ' ' + (e[1] || '')).toLowerCase();
          e.lx = ((e[3] || '') + (e[4] ? ' ' + e[4] : '')).toLowerCase();
        });
        return index;
      });
    }
    return loading;
  }

  function openSearch(q) {
    if (!dialog) return;
    lastFocus = doc.activeElement;
    dialog.hidden = false;
    doc.body.style.overflow = 'hidden';
    input.value = q || input.value || '';
    input.focus();
    input.select();
    loadIndex().then(function () { render(input.value); });
  }
  function closeSearch() {
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    doc.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function highlight(text, terms) {
    var out = esc(text);
    terms.forEach(function (t) {
      if (t.length < 2) return;
      out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    });
    return out;
  }
  function snippet(text, terms) {
    if (!text) return '';
    var lower = text.toLowerCase();
    var at = -1;
    for (var i = 0; i < terms.length && at < 0; i += 1) at = lower.indexOf(terms[i]);
    var from = 0;
    var lead = '';
    if (at >= 60) {
      var space = text.lastIndexOf(' ', at - 50);
      from = space < 0 ? at - 50 : space + 1;
      lead = '…';
    }
    var to = from + 170;
    if (to >= text.length) return lead + text.slice(from);
    // Cut at the last word boundary before the limit, and say that it was cut.
    var cut = text.lastIndexOf(' ', to);
    if (cut <= from) cut = to;
    return lead + text.slice(from, cut).replace(/[\s,;:.(\-]+$/, '') + '…';
  }

  function search(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length || !index) return [];
    var results = [];
    index.entries.forEach(function (e) {
      var score = 0;
      for (var i = 0; i < terms.length; i += 1) {
        var t = terms[i];
        var inTitle = e.lt.indexOf(t);
        var inText = e.lx.indexOf(t);
        if (inTitle < 0 && inText < 0) return;
        if (inTitle >= 0) score += (inTitle === 0 || !/[a-z0-9]/.test(e.lt.charAt(inTitle - 1))) ? 12 : 6;
        if (inText >= 0) score += 1 + Math.min(3, e.lx.split(t).length - 1) * 0.5;
      }
      if (!e[1]) score += 4; // the page itself ranks above its sections
      var page = index.pages[e[0]];
      if (e.lt.indexOf(q.toLowerCase()) >= 0) score += 10;
      // These are developer docs: on an equal match the developer guides lead, then
      // the API reference (it lists, guides explain), then the web app guides.
      if (page.r) score -= 5;
      if (page.w) score -= 6;
      results.push({ e: e, page: page, score: score });
    });
    results.sort(function (a, b) { return b.score - a.score; });
    // At most five hits per page, so one long page cannot crowd out the others.
    var perPage = {};
    results = results.filter(function (r) { perPage[r.e[0]] = (perPage[r.e[0]] || 0) + 1; return perPage[r.e[0]] <= 5; }).slice(0, 24);
    // Group by section, sections ordered by their best result.
    var order = [];
    results.forEach(function (r) { if (!r.page.w && order.indexOf(r.page.s) < 0) order.push(r.page.s); });
    // The web app guides always come last.
    results.forEach(function (r) { if (order.indexOf(r.page.s) < 0) order.push(r.page.s); });
    return results.slice().sort(function (a, b) { return order.indexOf(a.page.s) - order.indexOf(b.page.s); });
  }

  var status = doc.getElementById('search-status');
  function svg(name, size, cls) {
    return '<svg class="i' + (cls ? ' ' + cls : '') + '" width="' + size + '" height="' + size + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }
  var METHOD = /^(GET|POST|PUT|PATCH|DELETE) (\/\S*)$/;
  function titleHtml(text, terms) {
    var m = text.match(METHOD);
    if (m) return '<span class="sr-op"><span class="sr-method m-' + m[1].toLowerCase() + '">' + m[1] + '</span><span class="sr-path">' + highlight(m[2], terms) + '</span></span>';
    return highlight(text, terms);
  }
  function setStatus(text) { if (status) status.textContent = text; }

  function render(q) {
    selected = -1;
    input.removeAttribute('aria-activedescendant');
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) { list.innerHTML = ''; if (empty) empty.hidden = false; setStatus(''); return; }
    if (empty) empty.hidden = true;
    var results = search(q);
    if (!results.length) {
      list.innerHTML = '<li class="search-none" role="presentation"><span class="sr-icon">' + svg('search', 20) + '</span><span class="search-none-title">No results for \u201c' + esc(q) + '\u201d</span><span>Try an endpoint such as <code>/v1/messages</code>, or a word like <em>webhook</em> or <em>sender ID</em>.</span></li>';
      setStatus('No results');
      return;
    }
    var counts = {};
    results.forEach(function (r) { counts[r.page.s] = (counts[r.page.s] || 0) + 1; });
    var html = '';
    var lastSection = null;
    results.forEach(function (r, i) {
      if (r.page.s !== lastSection) {
        html += '<li class="sr-group" role="presentation"><span>' + esc(r.page.s) + '</span><span class="sr-count">' + counts[r.page.s] + '</span></li>';
        lastSection = r.page.s;
      }
      var href = r.page.u + (r.e[2] ? '#' + r.e[2] : '');
      var sep = '<span class="sr-crumb-sep" aria-hidden="true">' + svg('arrow-right4', 11) + '</span>';
      var crumb = esc(r.page.s) + (r.e[1] ? sep + esc(r.page.t) : '');
      var text = snippet(r.e[3] || '', terms);
      html += '<li class="sr-item" role="option" id="sr-' + i + '" aria-selected="false"><a href="' + href + '" tabindex="-1">'
        + '<span class="sr-icon">' + svg(r.page.i || 'document-text', 18) + '</span>'
        + '<span class="sr-main"><span class="sr-title">' + titleHtml(r.e[1] || r.page.t, terms) + '</span>'
        + '<span class="sr-crumb">' + crumb + '</span>'
        + (text ? '<span class="sr-text">' + highlight(text, terms) + '</span>' : '') + '</span>'
        + '<span class="sr-go">' + svg('arrow-right4', 16) + '</span></a></li>';
    });
    list.innerHTML = html;
    setStatus(results.length + (results.length === 1 ? ' result' : ' results'));
    move(0);
  }

  function move(to) {
    var items = list.querySelectorAll('.sr-item');
    if (!items.length) return;
    if (selected >= 0 && items[selected]) items[selected].setAttribute('aria-selected', 'false');
    selected = (to + items.length) % items.length;
    var it = items[selected];
    it.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', it.id);
    it.scrollIntoView({ block: 'nearest' });
  }

  if (input) {
    input.addEventListener('input', function () { loadIndex().then(function () { render(input.value); }); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); move(selected + 1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); move(selected - 1); }
      else if (ev.key === 'Enter') {
        var it = list.querySelectorAll('.sr-item')[selected];
        if (it) { ev.preventDefault(); var a = it.querySelector('a'); closeSearch(); location.href = a.href; }
      }
    });
    list.addEventListener('mousemove', function (ev) {
      var it = ev.target.closest('.sr-item');
      if (!it) return;
      var items = Array.prototype.indexOf.call(list.querySelectorAll('.sr-item'), it);
      if (items !== selected) move(items);
    });
    list.addEventListener('click', function (ev) { if (ev.target.closest('a')) closeSearch(); });
  }

  /* ---------- code edge fades ---------- */
  // Scrollbars on code are hidden, so each side that has more to scroll gets a
  // soft fade (docs.css .fx-*), removed once that edge is reached. A block that
  // overflows becomes focusable, so the arrow keys can scroll it.
  function updateEdges(pre) {
    var x = pre.scrollWidth - pre.clientWidth, y = pre.scrollHeight - pre.clientHeight;
    if (!pre.clientWidth) return; // not displayed
    pre.classList.toggle('fx-l', x > 1 && pre.scrollLeft > 1);
    pre.classList.toggle('fx-r', x > 1 && pre.scrollLeft < x - 1);
    pre.classList.toggle('fx-t', y > 1 && pre.scrollTop > 1);
    pre.classList.toggle('fx-b', y > 1 && pre.scrollTop < y - 1);
    if ((x > 1 || y > 1) && !pre.hasAttribute('tabindex')) pre.setAttribute('tabindex', '0');
  }
  var pres = Array.prototype.slice.call(doc.querySelectorAll('.code pre'));
  pres.forEach(function (pre) {
    pre.addEventListener('scroll', function () { updateEdges(pre); }, { passive: true });
    updateEdges(pre);
  });
  if (pres.length && 'ResizeObserver' in window) {
    var edgeRo = new ResizeObserver(function (entries) { entries.forEach(function (en) { updateEdges(en.target); }); });
    pres.forEach(function (pre) { edgeRo.observe(pre); });
  }

  /* ---------- language tabs ---------- */
  // ARIA tabs with automatic activation: click, or arrow keys, Home and End on the
  // strip. The chosen language is remembered (localStorage) and applied to every
  // group on every page; a group without it keeps its first tab, or a close
  // relative (JavaScript for TypeScript). Switching keeps the clicked tab where it
  // was on screen, so groups above it never push the page around.
  var LANG_KEY = 'opensms-docs-lang';
  var RELATED = { typescript: ['javascript'], javascript: ['typescript'], curl: ['shell', 'http'], shell: ['curl'] };
  var groups = Array.prototype.slice.call(doc.querySelectorAll('[data-tabs]'));
  function storedLang() { try { return localStorage.getItem(LANG_KEY); } catch (e) { return null; } }
  function storeLang(key) { try { localStorage.setItem(LANG_KEY, key); } catch (e) { /* storage blocked */ } }
  function tabsOf(group) { return Array.prototype.slice.call(group.querySelectorAll('[role="tab"]')); }
  function tabFor(group, key) {
    var tabs = tabsOf(group);
    var want = [key].concat(RELATED[key] || []);
    for (var i = 0; i < want.length; i += 1) {
      for (var j = 0; j < tabs.length; j += 1) if (tabs[j].getAttribute('data-tab-key') === want[i]) return tabs[j];
    }
    return null;
  }
  function updateFades(list) {
    var max = list.scrollWidth - list.clientWidth;
    list.classList.toggle('fade-start', max > 1 && list.scrollLeft > 1);
    list.classList.toggle('fade-end', max > 1 && list.scrollLeft < max - 1);
  }
  function revealTab(tab) {
    var list = tab.parentNode;
    var l = tab.offsetLeft - list.offsetLeft, r = l + tab.offsetWidth, pad = 24;
    if (l - pad < list.scrollLeft) list.scrollLeft = Math.max(0, l - pad);
    else if (r + pad > list.scrollLeft + list.clientWidth) list.scrollLeft = r + pad - list.clientWidth;
  }
  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
  function activate(group, tab, animate) {
    var panels = group.querySelector('.code-tabs-panels');
    var from = animate && panels && !reduceMotion.matches ? panels.offsetHeight : 0;
    var shown = null;
    tabsOf(group).forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      var panel = doc.getElementById(t.getAttribute('aria-controls'));
      if (panel) { panel.classList.toggle('is-active', on); panel.setAttribute('aria-hidden', String(!on)); if (on) shown = panel; }
    });
    var file = group.querySelector('.code-tabs-file');
    if (file) file.textContent = tab.getAttribute('data-title') || '';
    revealTab(tab);
    if (shown) { var pre = shown.querySelector('pre'); if (pre) updateEdges(pre); }
    // The clicked group eases to its new height; the others change at once.
    if (from) {
      var to = panels.offsetHeight;
      if (Math.abs(to - from) > 1) {
        panels.classList.remove('is-resizing');
        panels.style.height = from + 'px';
        void panels.offsetHeight;
        panels.classList.add('is-resizing');
        panels.style.height = to + 'px';
        var done = function (ev) {
          if (ev && ev.target !== panels) return;
          panels.removeEventListener('transitionend', done);
          panels.classList.remove('is-resizing');
          panels.style.height = '';
        };
        panels.addEventListener('transitionend', done);
        setTimeout(done, 400);
      }
    }
  }
  function applyLang(key, except) {
    groups.forEach(function (group) {
      if (group === except) return;
      var tab = tabFor(group, key);
      if (tab && tab.getAttribute('aria-selected') !== 'true') activate(group, tab);
    });
  }
  function choose(tab, focus) {
    var group = tab.closest('[data-tabs]');
    var key = tab.getAttribute('data-tab-key');
    var before = tab.getBoundingClientRect().top;
    activate(group, tab, true);
    applyLang(key, group);
    storeLang(key);
    var shift = tab.getBoundingClientRect().top - before;
    if (shift) window.scrollBy(0, shift);
    if (focus) tab.focus({ preventScroll: true });
  }
  groups.forEach(function (group) {
    var list = group.querySelector('[role="tablist"]');
    tabsOf(group).forEach(function (t) {
      var panel = doc.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.setAttribute('aria-hidden', String(t.getAttribute('aria-selected') !== 'true'));
    });
    list.addEventListener('click', function (ev) {
      var tab = ev.target.closest('[role="tab"]');
      if (tab) choose(tab, false);
    });
    list.addEventListener('keydown', function (ev) {
      var tabs = tabsOf(group);
      var at = tabs.indexOf(doc.activeElement);
      if (at < 0) return;
      var to = ev.key === 'ArrowRight' ? at + 1 : ev.key === 'ArrowLeft' ? at - 1 : ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : null;
      if (to === null) return;
      ev.preventDefault();
      choose(tabs[(to + tabs.length) % tabs.length], true);
    });
    list.addEventListener('scroll', function () { updateFades(list); }, { passive: true });
    updateFades(list);
  });
  var remembered = storedLang();
  if (remembered) applyLang(remembered, null);
  // The head boot script showed the remembered tab by CSS for the first paint; the
  // tabs now carry that state themselves.
  root.removeAttribute('data-lang');
  // Another browser tab chose a language: follow it.
  window.addEventListener('storage', function (ev) { if (ev.key === LANG_KEY && ev.newValue) applyLang(ev.newValue, null); });
  if (groups.length && 'ResizeObserver' in window) {
    var ro = new ResizeObserver(function (entries) { entries.forEach(function (en) { updateFades(en.target); }); });
    groups.forEach(function (group) { ro.observe(group.querySelector('[role="tablist"]')); });
  }

  /* ---------- events ---------- */
  doc.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.closest('[data-action="toggle-theme"]')) { toggleTheme(); return; }
    if (t.closest('[data-search-open]')) { ev.preventDefault(); openSearch(); return; }
    if (t.closest('[data-search-close]')) { closeSearch(); return; }
    if (t.closest('[data-drawer-open]')) { setDrawer(true); return; }
    if (t.closest('[data-drawer-close]')) { setDrawer(false); return; }
    if (sidebar && doc.body.classList.contains('drawer-open') && t.closest('#sidebar a')) { setDrawer(false); }
    var tabsCopy = t.closest('[data-copy-tabs]');
    if (tabsCopy) {
      var active = tabsCopy.closest('[data-tabs]').querySelector('.code-panel.is-active code');
      if (active) copyText(active.innerText.replace(/\n$/, ''), tabsCopy);
      return;
    }
    var copyBtn = t.closest('[data-copy]');
    if (copyBtn) {
      var code = copyBtn.closest('.code').querySelector('code');
      copyText(code.innerText.replace(/\n$/, ''), copyBtn);
      return;
    }
    var pageBtn = t.closest('[data-copy-page]');
    if (pageBtn) {
      fetch(pageBtn.getAttribute('data-copy-page')).then(function (r) { return r.text(); }).then(function (md) { copyText(md, pageBtn); });
    }
  });

  doc.addEventListener('keydown', function (ev) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement && doc.activeElement.tagName) || (doc.activeElement && doc.activeElement.isContentEditable);
    if ((ev.key === 'k' || ev.key === 'K') && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); if (dialog && !dialog.hidden) closeSearch(); else openSearch(); return; }
    if (ev.key === '/' && !typing && dialog && dialog.hidden) { ev.preventDefault(); openSearch(); return; }
    if (ev.key === 'Escape') {
      if (dialog && !dialog.hidden) closeSearch();
      else if (doc.body.classList.contains('drawer-open')) setDrawer(false);
    }
    if (ev.key === 'Tab' && dialog && !dialog.hidden) {
      // Keep focus inside the dialog.
      var f = dialog.querySelectorAll('input, button, a[href]:not([tabindex="-1"])');
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && doc.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && doc.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });

  var mq = window.matchMedia('(min-width: 1024px)');
  var onMq = function () { if (mq.matches) setDrawer(false); };
  if (mq.addEventListener) mq.addEventListener('change', onMq);

  // ?q= opens search (the docs home's SearchAction target).
  var q = new URLSearchParams(location.search).get('q');
  if (q) openSearch(q);

  /* ---------- sidebar: keep the current page in view ---------- */
  if (sidebar && mq.matches) {
    var cur = sidebar.querySelector('[aria-current="page"]');
    if (cur) {
      var r = cur.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 40) sidebar.scrollTop += r.top - window.innerHeight / 3;
    }
  }

  /* ---------- scrollspy ---------- */
  var tocLinks = doc.querySelectorAll('.toc a[data-toc]');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[a.getAttribute('data-toc')] = a; });
    var headings = Array.prototype.map.call(tocLinks, function (a) { return doc.getElementById(a.getAttribute('data-toc')); }).filter(Boolean);
    var visible = {};
    var active = null;
    var toc = doc.querySelector('.toc');
    var setActive = function (id) {
      if (active === id) return;
      if (active && byId[active]) byId[active].classList.remove('is-active');
      active = id;
      var a = byId[id];
      if (!a) return;
      a.classList.add('is-active');
      var ar = a.getBoundingClientRect(), tr = toc.getBoundingClientRect();
      if (ar.top < tr.top + 40 || ar.bottom > tr.bottom - 40) toc.scrollTop += ar.top - tr.top - tr.height / 3;
    };
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
      for (var i = 0; i < headings.length; i += 1) {
        if (visible[headings[i].id]) { setActive(headings[i].id); return; }
      }
      // No heading on screen: keep the last one above the viewport.
      var above = null;
      for (var j = 0; j < headings.length; j += 1) { if (headings[j].getBoundingClientRect().top < 120) above = headings[j].id; }
      if (above) setActive(above);
    }, { rootMargin: '-72px 0px -60% 0px' });
    headings.forEach(function (h) { obs.observe(h); });
  }

  // Close the mobile "On this page" panel after choosing a heading.
  doc.querySelectorAll('.toc-mobile a').forEach(function (a) {
    a.addEventListener('click', function () { var d = a.closest('details'); if (d) d.open = false; });
  });
})();
