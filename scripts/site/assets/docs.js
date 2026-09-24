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

  /* ---------- code tabs ---------- */
  // One choice of language for every tabbed block on the page, remembered per
  // browser. Blocks without that language keep their current tab.
  var TAB_KEY = 'opensms-code-lang';
  function selectTab(group, label, focus) {
    var tabs = group.querySelectorAll('[data-code-tab]');
    var found = false;
    for (var i = 0; i < tabs.length; i++) if (tabs[i].getAttribute('data-code-tab') === label) found = true;
    if (!found) return false;
    for (var j = 0; j < tabs.length; j++) {
      var on = tabs[j].getAttribute('data-code-tab') === label;
      tabs[j].setAttribute('aria-selected', String(on));
      tabs[j].tabIndex = on ? 0 : -1;
      var panel = doc.getElementById(tabs[j].getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
      if (on && focus) tabs[j].focus();
      if (on) {
        // On phones the tab row scrolls sideways: bring the chosen tab into view
        // (clear of the copy button on the right).
        var list = tabs[j].parentNode;
        var left = tabs[j].offsetLeft - list.offsetLeft;
        if (list.scrollWidth > list.clientWidth && (left < list.scrollLeft || left + tabs[j].offsetWidth > list.scrollLeft + list.clientWidth - 96)) list.scrollLeft = Math.max(0, left - 8);
      }
    }
    return true;
  }
  function selectEverywhere(label, anchor) {
    var top = anchor ? anchor.getBoundingClientRect().top : 0;
    var groups = doc.querySelectorAll('[data-code-group]');
    for (var i = 0; i < groups.length; i++) selectTab(groups[i], label, false);
    // Keep the block the reader clicked where it was when others above change height.
    if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - top);
    try { localStorage.setItem(TAB_KEY, label); } catch (e) { /* storage unavailable */ }
  }
  (function () {
    var saved = null;
    try { saved = localStorage.getItem(TAB_KEY); } catch (e) { /* storage unavailable */ }
    if (!saved) return;
    var groups = doc.querySelectorAll('[data-code-group]');
    for (var i = 0; i < groups.length; i++) selectTab(groups[i], saved, false);
  })();
  doc.addEventListener('keydown', function (ev) {
    var tab = ev.target.closest && ev.target.closest('[data-code-tab]');
    if (!tab || !/^(ArrowLeft|ArrowRight|Home|End)$/.test(ev.key)) return;
    var tabs = Array.prototype.slice.call(tab.parentNode.querySelectorAll('[data-code-tab]'));
    var i = tabs.indexOf(tab);
    var next = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    ev.preventDefault();
    selectTab(tab.closest('[data-code-group]'), tabs[next].getAttribute('data-code-tab'), true);
    selectEverywhere(tabs[next].getAttribute('data-code-tab'), tab.closest('[data-code-group]'));
  });

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
          e.lx = (e[3] || '').toLowerCase();
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
        if (inTitle >= 0) score += (inTitle === 0 || e.lt.charAt(inTitle - 1) === ' ' || e.lt.charAt(inTitle - 1) === '/') ? 12 : 6;
        if (inText >= 0) score += 1 + Math.min(3, e.lx.split(t).length - 1) * 0.5;
      }
      if (!e[1]) score += 4; // the page itself ranks above its sections
      var page = index.pages[e[0]];
      if (e.lt.indexOf(q.toLowerCase()) >= 0) score += 10;
      results.push({ e: e, page: page, score: score });
    });
    results.sort(function (a, b) { return b.score - a.score; });
    results = results.slice(0, 24);
    // Group by section, sections ordered by their best result.
    var order = [];
    results.forEach(function (r) { if (order.indexOf(r.page.s) < 0) order.push(r.page.s); });
    return results.slice().sort(function (a, b) { return order.indexOf(a.page.s) - order.indexOf(b.page.s); });
  }

  function render(q) {
    selected = -1;
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) { list.innerHTML = ''; if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    var results = search(q);
    if (!results.length) {
      list.innerHTML = '<li class="search-none">No results for “' + esc(q) + '”. Try an endpoint such as <code>/v1/messages</code> or a word like webhook.</li>';
      return;
    }
    var html = '';
    var lastSection = null;
    results.forEach(function (r, i) {
      if (r.page.s !== lastSection) {
        html += '<li class="sr-group" role="presentation">' + esc(r.page.s) + '</li>';
        lastSection = r.page.s;
      }
      var href = r.page.u + (r.e[2] ? '#' + r.e[2] : '');
      var title = r.e[1] ? highlight(r.e[1], terms) + ' <span class="sr-page">/ ' + esc(r.page.t) + '</span>' : highlight(r.page.t, terms);
      html += '<li class="sr-item" role="option" id="sr-' + i + '" aria-selected="false"><a href="' + href + '" tabindex="-1">'
        + '<span class="sr-title">' + title + '</span>'
        + '<span class="sr-text">' + highlight(snippet(r.e[3] || '', terms), terms) + '</span>'
        + '<span class="sr-go">' + chevron + '</span></a></li>';
    });
    list.innerHTML = html;
    move(0);
  }
  var chevron = '<svg class="i" width="16" height="16" aria-hidden="true"><use href="#i-arrow-right4"/></svg>';

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

  /* ---------- events ---------- */
  doc.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.closest('[data-action="toggle-theme"]')) { toggleTheme(); return; }
    if (t.closest('[data-search-open]')) { ev.preventDefault(); openSearch(); return; }
    if (t.closest('[data-search-close]')) { closeSearch(); return; }
    if (t.closest('[data-drawer-open]')) { setDrawer(true); return; }
    if (t.closest('[data-drawer-close]')) { setDrawer(false); return; }
    if (sidebar && doc.body.classList.contains('drawer-open') && t.closest('#sidebar a')) { setDrawer(false); }
    var codeTab = t.closest('[data-code-tab]');
    if (codeTab) { selectEverywhere(codeTab.getAttribute('data-code-tab'), codeTab.closest('[data-code-group]')); return; }
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
