(function () {
  'use strict';
  var D = window.POLICY_DOCS;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) { var p = iso.split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; }
  var KIND = { post: 'Post', reply: 'Reply', repost: 'Repost', note: 'Note' };

  var topicById = {}, docById = {}, all = [], years = {};
  D.topics.forEach(function (t) { topicById[t.id] = t; $('d-topic').appendChild(el('option', { value: t.id, text: t.label })); });
  D.documents.forEach(function (d) {
    docById[d.id] = d;
    $('d-doc').appendChild(el('option', { value: d.id, text: d.title }));
    d.items.forEach(function (i) { i.doc = d.id; i.lc = ((i.title || '') + ' ' + i.t).toLowerCase(); all.push(i); years[i.d.slice(0, 4)] = 1; });
  });
  all.sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
  Object.keys(years).sort().reverse().forEach(function (y) { $('d-year').appendChild(el('option', { value: y, text: y })); });

  var PAGE = 100;
  var state = { q: '', doc: '', topic: '', kind: 'own', year: '', limit: PAGE };

  function fromHash() {
    var h = location.hash.replace('#', '');
    if (h.indexOf('doc-') === 0 && docById[h.slice(4)]) { state.doc = h.slice(4); state.topic = ''; }
    else if (h.indexOf('topic-') === 0 && topicById[h.slice(6)]) { state.topic = h.slice(6); state.doc = ''; }
  }

  // Text with URLs turned into links; t.co short links point at the expanded address when the archive has one.
  function richText(i) {
    var p = el('p', { class: 'text' });
    var parts = i.t.split(/(https?:\/\/[^\s]+)/);
    var short = parts.filter(function (x) { return /^https?:\/\/t\.co\//.test(x); });
    var map = {};
    if (short.length === i.u.length) short.forEach(function (s, n) { map[s] = i.u[n]; });
    parts.forEach(function (x) {
      if (/^https?:\/\//.test(x)) {
        var clean = x.replace(/[.,)…]+$/, '');
        p.appendChild(el('a', { href: map[x] || clean, rel: 'noopener nofollow', text: clean }));
        if (clean !== x) p.appendChild(document.createTextNode(x.slice(clean.length)));
      } else if (x) p.appendChild(document.createTextNode(x));
    });
    return p;
  }

  function node(i) {
    var tags = el('span', { class: 'w-tags' });
    i.p.forEach(function (id) { if (topicById[id]) tags.appendChild(el('span', { class: 'chip', text: topicById[id].label })); });
    var body;
    if (i.k === 'note') {
      var nb = el('div', { class: 'note-body', tabindex: '0' });
      nb.innerHTML = i.h; // reduced to plain tags with escaped text when the data was built
      body = el('div', { class: 'body' }, [el('h3', { text: i.title }), nb, i.p.length ? tags : null]);
    } else {
      body = el('div', { class: 'body' }, [richText(i), i.p.length ? tags : null]);
    }
    return el('li', { class: 'item ' + i.k }, [
      el('div', { class: 'when' }, [el('b', { text: fmtDate(i.d) }),
        document.createTextNode(KIND[i.k] + ' · ' + docById[i.doc].title.replace(' on Twitter', ''))]),
      body
    ]);
  }

  function render() {
    $('d-q').value = state.q; $('d-doc').value = state.doc; $('d-topic').value = state.topic;
    $('d-kind').value = state.kind; $('d-year').value = state.year;
    var words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    var shown = all.filter(function (i) {
      if (state.doc && i.doc !== state.doc) return false;
      if (state.topic && i.p.indexOf(state.topic) < 0) return false;
      if (state.kind === 'own' ? i.k === 'repost' : state.kind && i.k !== state.kind) return false;
      if (state.year && i.d.slice(0, 4) !== state.year) return false;
      return words.every(function (w) { return i.lc.indexOf(w) >= 0; });
    });
    var d = docById[state.doc], t = topicById[state.topic];
    $('r-title').textContent = d ? d.title : t ? t.label : 'Writing & notes';
    $('r-summary').textContent = d ? d.summary : t ? 'Everything I wrote that touches on this topic, newest first.' :
      'My Twitter archives and 2023 session notes, in full.';
    $('d-reset').hidden = !(state.q || state.doc || state.topic || state.year || state.kind !== 'own');
    $('d-count').textContent = shown.length.toLocaleString() + (shown.length === 1 ? ' item' : ' items') +
      (state.kind === 'own' ? ' · reposts of other people hidden' : '');
    var list = $('items');
    list.textContent = '';
    if (!shown.length) list.appendChild(el('li', { class: 'empty', text: 'Nothing matches these filters.' }));
    shown.slice(0, state.limit).forEach(function (i) { list.appendChild(node(i)); });
    $('more').hidden = shown.length <= state.limit;
    $('more').textContent = 'Show ' + Math.min(PAGE, shown.length - state.limit) + ' more';
  }
  function set(patch) { for (var k in patch) state[k] = patch[k]; if (!('limit' in patch)) state.limit = PAGE; render(); }

  $('d-q').addEventListener('input', function (e) { set({ q: e.target.value }); });
  $('d-doc').addEventListener('change', function (e) { set({ doc: e.target.value }); });
  $('d-topic').addEventListener('change', function (e) { set({ topic: e.target.value }); });
  $('d-kind').addEventListener('change', function (e) { set({ kind: e.target.value }); });
  $('d-year').addEventListener('change', function (e) { set({ year: e.target.value }); });
  $('d-reset').addEventListener('click', function () { set({ q: '', doc: '', topic: '', kind: 'own', year: '' }); });
  $('more').addEventListener('click', function () { set({ limit: state.limit + PAGE }); });
  window.addEventListener('hashchange', function () { fromHash(); set({}); });

  fromHash();
  render();
})();
