(function () {
  'use strict';
  var D = window.POLICY_DATA;
  var bills = D.bills;
  var topicById = {}, stageIdx = {}, stageLabel = {};
  D.topics.forEach(function (t) { topicById[t.id] = t; });
  D.stages.forEach(function (s, i) { stageIdx[s.id] = i; stageLabel[s.id] = s.label; });

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
  function fmtDate(iso) {
    var p = iso.split('-');
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] +
      ' ' + (+p[2]) + ', ' + p[0];
  }

  var state = { q: '', year: '', topic: '', stage: '', series: null };

  // ---- At a glance
  var years = [];
  bills.forEach(function (b) { if (years.indexOf(b.year) < 0) years.push(b.year); });
  years.sort();
  var beyond = bills.filter(function (b) { return stageIdx[b.stage] >= stageIdx.hearing; }).length;
  var bipartisan = bills.filter(function (b) {
    return b.cosponsors.some(function (c) { return c.party === 'Republican'; });
  }).length;
  [[bills.length, 'bills and resolutions filed'],
   [years.length, 'legislative years, ' + years[0] + '–' + years[years.length - 1]],
   [beyond, 'received a public hearing or advanced further'],
   [bipartisan, 'drew Republican co-sponsors']
  ].forEach(function (s) {
    $('stats').appendChild(el('div', {}, [el('dd', { text: String(s[0]) }), el('dt', { text: s[1] })]));
  });

  // ---- Policy areas
  D.topics.forEach(function (t) {
    var n = bills.filter(function (b) { return b.topics[0] === t.id; }).length;
    var btn = el('button', { class: 'topic', type: 'button', 'aria-pressed': 'false', 'data-topic': t.id }, [
      el('span', { class: 'n', text: String(n) }),
      el('span', { class: 'name', text: t.label }),
      el('span', { class: 'blurb', text: t.blurb })
    ]);
    btn.addEventListener('click', function () {
      set({ topic: state.topic === t.id ? '' : t.id, series: null }, true);
    });
    $('topic-grid').appendChild(btn);
  });

  // ---- Persistent priorities
  D.series.forEach(function (s) {
    var dots = el('div', { class: 'dots', role: 'img', 'aria-label': 'Filed in ' + s.years.join(', ') });
    years.forEach(function (y) {
      dots.appendChild(el('span', { class: s.years.indexOf(y) >= 0 ? 'on' : '', text: "'" + String(y).slice(2) }));
    });
    var btn = el('button', { type: 'button' }, [
      document.createTextNode(s.title),
      el('span', { class: 'tag', text: topicById[s.topic].label + ' · filed in ' + s.years.length + ' sessions' })
    ]);
    btn.addEventListener('click', function () {
      set({ q: '', year: '', topic: '', stage: '', series: s.id }, true);
    });
    $('series').appendChild(el('div', { class: 'series-row' }, [btn, dots]));
  });

  // ---- By session
  var perYear = years.map(function (y) { return bills.filter(function (b) { return b.year === y; }).length; });
  var max = Math.max.apply(null, perYear);
  years.forEach(function (y, i) {
    var bar = el('span', { class: 'b' });
    bar.style.height = (perYear[i] / max * 100) + '%';
    var btn = el('button', {
      class: 'year', type: 'button', role: 'listitem', 'aria-pressed': 'false', 'data-year': y,
      'aria-label': y + ': ' + perYear[i] + ' filed'
    }, [el('span', { class: 'v', text: String(perYear[i]) }), bar, el('span', { class: 'y', text: String(y) })]);
    btn.addEventListener('click', function () {
      set({ year: state.year === String(y) ? '' : String(y), series: null }, true);
    });
    $('years').appendChild(btn);
  });

  // ---- Filters
  years.slice().reverse().forEach(function (y) { $('f-year').appendChild(el('option', { value: y, text: String(y) })); });
  D.topics.forEach(function (t) { $('f-topic').appendChild(el('option', { value: t.id, text: t.label })); });
  D.stages.forEach(function (s) {
    if (bills.some(function (b) { return b.stage === s.id; })) {
      $('f-stage').appendChild(el('option', { value: s.id, text: s.label }));
    }
  });
  $('q').addEventListener('input', function (e) { set({ q: e.target.value, series: null }); });
  $('f-year').addEventListener('change', function (e) { set({ year: e.target.value, series: null }); });
  $('f-topic').addEventListener('change', function (e) { set({ topic: e.target.value, series: null }); });
  $('f-stage').addEventListener('change', function (e) { set({ stage: e.target.value, series: null }); });
  $('reset').addEventListener('click', function () { set({ q: '', year: '', topic: '', stage: '', series: null }); });

  function set(patch, scroll) {
    for (var k in patch) state[k] = patch[k];
    render();
    if (scroll) $('legislation').scrollIntoView();
  }

  function matches(b) {
    if (state.series !== null && b.series !== state.series) return false;
    if (state.year && String(b.year) !== state.year) return false;
    if (state.topic && b.topics[0] !== state.topic) return false;
    if (state.stage && b.stage !== state.stage) return false;
    if (state.q) {
      var hay = (b.label + ' ' + b.label.replace(' ', '') + ' ' + b.title + ' ' + b.committees.join(' ') + ' ' +
        b.year + ' ' + topicById[b.topics[0]].label).toLowerCase();
      return state.q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
    }
    return true;
  }

  function billNode(b) {
    var pips = el('div', { class: 'pips', 'aria-hidden': 'true' });
    for (var i = 0; i < 6; i++) pips.appendChild(el('i', { class: i <= stageIdx[b.stage] ? 'on' : '' }));
    var withdrawn = /^withdrawn/i.test(b.lastAction);
    var summary = el('summary', {}, [
      el('span', { class: 'num', text: b.label }),
      el('span', { class: 'title' }, [
        document.createTextNode(b.title),
        el('span', { class: 'meta', text: topicById[b.topics[0]].label +
          (b.committees.length ? ' · ' + b.committees[b.committees.length - 1] : '') +
          (b.sessionCode !== 'R' ? ' · ' + b.session : '') })
      ]),
      el('span', { class: 'stage' }, [pips, document.createTextNode(withdrawn ? 'Withdrawn' : stageLabel[b.stage])])
    ]);
    var details = el('details', { class: 'bill' }, [summary]);
    details.addEventListener('toggle', function () {
      if (!details.open || details.querySelector('.detail')) return;
      var actions = el('ul', { class: 'actions' });
      b.actions.forEach(function (a) {
        actions.appendChild(el('li', {}, [el('time', { datetime: a.date, text: fmtDate(a.date) }), el('span', { text: a.text })]));
      });
      var side = el('div', { class: 'side' });
      if (b.cosponsors.length) {
        var cs = el('ul');
        b.cosponsors.forEach(function (c) {
          cs.appendChild(el('li', {}, [document.createTextNode(c.name + ' '),
            el('span', { class: 'party', text: '(' + c.party.charAt(0) + '–' + c.district + ')' })]));
        });
        side.appendChild(el('div', {}, [el('h3', { text: 'Co-sponsors' }), cs]));
      }
      if (b.documents.length) {
        var ds = el('ul');
        b.documents.forEach(function (d) {
          ds.appendChild(el('li', {}, [el('a', { href: d.url, rel: 'noopener', text: d.type + ' — ' + d.label })]));
        });
        side.appendChild(el('div', {}, [el('h3', { text: 'Documents' }), ds]));
      }
      details.appendChild(el('div', { class: 'detail' }, [
        el('div', {}, [
          el('h3', { text: 'Legislative history' }), actions,
          el('a', { class: 'official', href: b.url, rel: 'noopener', text: 'Official House record for ' + b.label + ' →' })
        ]),
        side
      ]));
    });
    return el('li', {}, [details]);
  }

  function render() {
    $('q').value = state.q; $('f-year').value = state.year; $('f-topic').value = state.topic; $('f-stage').value = state.stage;
    document.querySelectorAll('.topic').forEach(function (n) {
      n.setAttribute('aria-pressed', String(n.getAttribute('data-topic') === state.topic));
    });
    document.querySelectorAll('.year').forEach(function (n) {
      n.setAttribute('aria-pressed', String(n.getAttribute('data-year') === state.year));
    });
    var shown = bills.filter(matches);
    var filtered = shown.length !== bills.length;
    $('reset').hidden = !filtered;
    var label = shown.length + (shown.length === 1 ? ' measure' : ' measures');
    if (state.series !== null) {
      var s = D.series.filter(function (x) { return x.id === state.series; })[0];
      label += ' · every filing of “' + s.title + '”';
    } else if (filtered) label += ' of ' + bills.length;
    $('count').textContent = label;

    var list = $('bills');
    list.textContent = '';
    if (!shown.length) {
      list.appendChild(el('li', { class: 'empty', text: 'No legislation matches these filters.' }));
      return;
    }
    var byYear = {};
    shown.forEach(function (b) { (byYear[b.year] = byYear[b.year] || []).push(b); });
    Object.keys(byYear).sort().reverse().forEach(function (y) {
      list.appendChild(el('li', { class: 'year-head' }, [
        el('span', { text: y }), el('small', { text: byYear[y][0].assembly.split(',')[0] + ' · ' + byYear[y].length + ' filed' })
      ]));
      byYear[y].forEach(function (b) { list.appendChild(billNode(b)); });
    });
  }

  // ---- Amendments
  var A = D.amendments || [];
  var STATUS = { 'Committee Amendment': 'Committee amendment' };
  var ORDER = ['Adopted', 'Committee Amendment', 'Defeated', 'Withdrawn', 'Returned', 'Distributed'];
  var aState = { year: '', status: '' };
  function statusLabel(s) { return STATUS[s] || s; }
  ORDER.forEach(function (s) {
    var n = A.filter(function (a) { return a.status === s; }).length;
    if (!n) return;
    $('a-status').appendChild(el('option', { value: s, text: statusLabel(s) }));
    $('amend-stats').appendChild(el('span', { class: 'chip' }, [el('b', { text: String(n) }), document.createTextNode(' ' + statusLabel(s).toLowerCase())]));
  });
  years.slice().reverse().forEach(function (y) { $('a-year').appendChild(el('option', { value: y, text: String(y) })); });
  $('a-year').addEventListener('change', function (e) { aState.year = e.target.value; renderAmend(); });
  $('a-status').addEventListener('change', function (e) { aState.status = e.target.value; renderAmend(); });
  function renderAmend() {
    var shown = A.filter(function (a) {
      return (!aState.year || String(a.year) === aState.year) && (!aState.status || a.status === aState.status);
    });
    $('a-count').textContent = shown.length + (shown.length === 1 ? ' amendment' : ' amendments') +
      (shown.length !== A.length ? ' of ' + A.length : '');
    var list = $('amend-list');
    list.textContent = '';
    if (!shown.length) { list.appendChild(el('li', { class: 'empty', text: 'No amendments match these filters.' })); return; }
    var byYear = {};
    shown.forEach(function (a) { (byYear[a.year] = byYear[a.year] || []).push(a); });
    Object.keys(byYear).sort().reverse().forEach(function (y) {
      list.appendChild(el('li', { class: 'year-head' }, [el('span', { text: y }), el('small', { text: byYear[y].length + (byYear[y].length === 1 ? ' amendment' : ' amendments') })]));
      byYear[y].sort(function (a, b) { return ORDER.indexOf(a.status) - ORDER.indexOf(b.status); });
      byYear[y].forEach(function (a) {
        list.appendChild(el('li', { class: 'amend-row' }, [
          el('span', { class: 'num' }, [el('a', { href: a.billUrl, rel: 'noopener', text: a.bill })]),
          el('span', { class: 'title' }, [
            document.createTextNode(a.billTitle),
            el('span', { class: 'meta', text: 'Bill sponsor: ' + a.billSponsor + (a.sessionCode !== 'R' ? ' · ' + a.session : '') })
          ]),
          el('span', { class: 'stage' }, [
            el('span', { class: 'status s-' + a.status.toLowerCase().replace(/\W+/g, '-'), text: statusLabel(a.status) }),
            el('a', { href: a.pdf, rel: 'noopener', text: (a.designation ? a.designation + ' · ' : '') + 'Text ' + a.lr })
          ])
        ]));
      });
    });
  }
  renderAmend();

  // ---- In my own words
  var W = window.POLICY_WRITING;
  if (W) {
    var maxT = W.topics[0].count;
    W.topics.forEach(function (t) {
      var bar = el('span', { class: 'w-bar' });
      bar.style.width = Math.max(2, t.count / maxT * 100) + '%';
      $('w-topics').appendChild(el('a', { class: 'w-topic', href: 'documents.html#topic-' + t.id }, [
        el('span', { class: 'w-name' }, [document.createTextNode(t.label), el('span', { class: 'w-n', text: String(t.count) })]),
        el('span', { class: 'w-track' }, [bar]),
        t.quote ? el('span', { class: 'w-quote', text: '“' + t.quote + '”' }) : null
      ]));
    });
    W.documents.forEach(function (d) {
      var c = d.counts, parts = [];
      if (c.post) parts.push(c.post.toLocaleString() + ' posts');
      if (c.reply) parts.push(c.reply.toLocaleString() + ' replies');
      if (c.repost) parts.push(c.repost.toLocaleString() + ' reposts');
      if (c.note) parts.push(c.note + ' notes');
      var tags = el('span', { class: 'w-tags' });
      d.topics.forEach(function (id) {
        var t = W.topics.filter(function (x) { return x.id === id; })[0];
        if (t) tags.appendChild(el('span', { class: 'chip', text: t.label }));
      });
      $('w-docs').appendChild(el('article', { class: 'w-doc' }, [
        el('h4', { text: d.title }),
        el('p', { class: 'meta', text: d.from.slice(0, 4) + (d.to.slice(0, 4) !== d.from.slice(0, 4) ? '–' + d.to.slice(0, 4) : '') + ' · ' + parts.join(' · ') }),
        el('p', { text: d.summary }),
        tags,
        el('a', { class: 'official', href: 'documents.html#doc-' + d.id, text: 'Read the full document →' })
      ]));
    });
  }

  if (D.retrieved) $('retrieved').textContent = ', retrieved ' + fmtDate(D.retrieved);
  render();
})();
