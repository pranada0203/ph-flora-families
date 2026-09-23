/* Philippine vascular plant families — app shell.
   All content comes from data/families.json, which tools/build-app-data.js
   generates from the canonical project data. Nothing is hard-coded here. */

(function () {
  'use strict';

  var DATA = null;
  var BY_NAME = {};
  var state = { status: null, group: null, sort: 'az', q: '', family: null, tab: 'description', route: 0, browse: false };

  var STATUS_ORDER = ['complete', 'flagged', 'gap', 'examined', 'not-started'];
  var STATUS_LABEL = {
    'complete':    'Described',
    'flagged':     'Flagged',
    'gap':         'Gap explained',
    'examined':    'Nothing usable',
    'not-started': 'Not started'
  };

  // ------------------------------------------------------------ utilities

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Italicise Latin binomials and the genus names that appear in running text.
     Only applied to text we generated ourselves, never to a raw citation. */
  function italiciseGenera(text, genera) {
    var html = esc(text);
    if (!genera || !genera.length) return html;
    var names = genera.map(function (g) { return g.name; })
      .filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    names.forEach(function (n) {
      var re = new RegExp('(^|[\\s(\\[,;])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
      html = html.replace(re, '$1<em>' + n + '</em>');
    });
    return html;
  }

  function num(n) { return n == null ? '—' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function plural(n, one, many) {
    if (n === 1) return one;
    if (many) return many;
    return /s$/.test(one) ? one : one + 's';
  }

  function sentence(list) {
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }

  // --------------------------------------------------------------- filter

  function matches(f) {
    if (state.status && f.status !== state.status) return false;
    if (state.group && f.major_group !== state.group) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      if (f.family.toLowerCase().indexOf(q) !== -1) return true;
      if (f.alternate_name && f.alternate_name.toLowerCase().indexOf(q) !== -1) return true;
      if (f.order && f.order.toLowerCase().indexOf(q) !== -1) return true;
      var g = f.genera.some(function (x) { return x.name.toLowerCase().indexOf(q) === 0; });
      if (g) return true;
      var c = f.routes.some(function (r) { return (r.couplet + r.letter).toLowerCase() === q; });
      if (c) return true;
      return false;
    }
    return true;
  }

  function sorted(list) {
    var l = list.slice();
    if (state.sort === 'species')  l.sort(function (a, b) { return b.species - a.species || a.family.localeCompare(b.family); });
    else if (state.sort === 'endemic') l.sort(function (a, b) { return b.endemic - a.endemic || a.family.localeCompare(b.family); });
    else if (state.sort === 'pct')  l.sort(function (a, b) { return (b.endemic_percent || 0) - (a.endemic_percent || 0) || a.family.localeCompare(b.family); });
    else l.sort(function (a, b) { return a.family.localeCompare(b.family); });
    return l;
  }

  // --------------------------------------------------------------- facets

  function chip(label, count, active, onClick, dotClass) {
    var b = el('button', 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (dotClass) b.appendChild(el('span', 'dot ' + dotClass));
    b.appendChild(el('span', null, label));
    if (count != null) b.appendChild(el('span', 'n', String(count)));
    b.addEventListener('click', onClick);
    return b;
  }

  function renderFacets() {
    var fs = document.getElementById('facet-status');
    fs.textContent = '';
    fs.appendChild(chip('All', DATA.families.length, state.status === null, function () {
      state.status = null; render();
    }));
    STATUS_ORDER.forEach(function (code) {
      var n = DATA.totals.by_status[code] || 0;
      if (!n) return;
      fs.appendChild(chip(STATUS_LABEL[code], n, state.status === code, function () {
        state.status = state.status === code ? null : code; render();
      }, code));
    });

    var fg = document.getElementById('facet-group');
    fg.textContent = '';
    var groups = {};
    DATA.families.forEach(function (f) { groups[f.major_group] = (groups[f.major_group] || 0) + 1; });
    fg.appendChild(chip('All', DATA.families.length, state.group === null, function () {
      state.group = null; render();
    }));
    Object.keys(groups).sort().forEach(function (g) {
      fg.appendChild(chip(g, groups[g], state.group === g, function () {
        state.group = state.group === g ? null : g; render();
      }));
    });

    var fso = document.getElementById('facet-sort');
    fso.textContent = '';
    [['az', 'A–Z'], ['species', 'Species'], ['endemic', 'Endemics'], ['pct', '% endemic']].forEach(function (p) {
      fso.appendChild(chip(p[1], null, state.sort === p[0], function () {
        state.sort = p[0]; render();
      }));
    });

    // How many filters are on, shown on the phone's filter button and as a
    // "Clear filters" link, so a narrowed list never looks like the whole flora.
    var active = (state.status ? 1 : 0) + (state.group ? 1 : 0) + (state.sort !== 'az' ? 1 : 0) + (state.q ? 1 : 0);
    var badge = document.getElementById('filter-badge');
    badge.hidden = !active;
    badge.textContent = String(active);
    document.getElementById('clear-filters').hidden = !active;
    var shown = DATA.families.filter(matches).length;
    document.getElementById('facets-done').textContent = 'Show ' + shown + ' ' + plural(shown, 'family', 'families');
  }

  // ----------------------------------------------------------- family list

  function renderList(hits) {
    var ul = document.getElementById('famlist');
    ul.textContent = '';

    document.getElementById('rail-count').textContent =
      hits.length + ' of ' + DATA.families.length + ' families';

    if (!hits.length) {
      var li = el('li');
      var box = el('div', 'empty');
      var narrowed = state.status || state.group;
      // Say plainly when the filters, not the search, are what hide a match.
      var everywhere = narrowed && state.q ? DATA.families.filter(function (f) {
        var s = state.status, g = state.group; state.status = null; state.group = null;
        var ok = matches(f); state.status = s; state.group = g; return ok;
      }).length : 0;
      box.appendChild(el('p', null, everywhere
        ? 'Nothing here, but ' + everywhere + ' ' + plural(everywhere, 'family', 'families') +
          ' outside the current filter ' + (everywhere === 1 ? 'matches' : 'match') + '.'
        : narrowed
          ? 'No family matches with the current filters.'
          : 'No family matches that. Try a genus name, a family name, or a couplet like 65a.'));
      if (narrowed) {
        var b = el('button', 'linkbtn', everywhere ? 'Search all families' : 'Clear filters');
        b.type = 'button';
        b.addEventListener('click', function () { state.status = null; state.group = null; render(); });
        box.appendChild(b);
      }
      li.appendChild(box);
      ul.appendChild(li);
      return;
    }

    hits.forEach(function (f) {
      var li = el('li');
      var a = el('a');
      a.href = '#' + encodeURIComponent(f.family);
      if (state.family === f.family) a.setAttribute('aria-current', 'true');
      a.appendChild(el('span', 'dot ' + f.status));
      a.appendChild(el('span', 'nm', f.family));
      a.appendChild(el('span', 'sp', num(f.species)));
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  // -------------------------------------------------------------- landing

  /* Where the descriptions stand, twice over: counted by family, and weighted by
     endemic species. The second bar is the one that matters for a Philippine
     flora — a handful of large, endemic-rich families sit under a caveat.
     Each segment filters the family list to that status. */
  function coverage() {
    var box = el('section', 'coverage');
    box.setAttribute('aria-label', 'Description coverage');
    box.appendChild(el('h2', null, 'How far the descriptions have got'));

    function bar(label, weigh, unit) {
      var total = DATA.families.reduce(function (n, f) { return n + weigh(f); }, 0);
      var row = el('div', 'cov-row');
      var head = el('div', 'cov-head');
      head.appendChild(el('span', null, label));
      head.appendChild(el('span', 'n', num(total) + ' ' + unit));
      row.appendChild(head);
      var track = el('div', 'cov-bar');
      STATUS_ORDER.forEach(function (code) {
        var n = DATA.families.reduce(function (s, f) { return s + (f.status === code ? weigh(f) : 0); }, 0);
        if (!n) return;
        var pct = 100 * n / total;
        var seg = el('button', 'cov-seg ' + code);
        seg.type = 'button';
        seg.style.flexGrow = String(n);
        seg.title = STATUS_LABEL[code] + ': ' + num(n) + ' ' + unit + ' (' + pct.toFixed(1) + '%)';
        seg.setAttribute('aria-label', seg.title + '. Show these families.');
        if (pct >= 7) seg.appendChild(el('span', null, Math.round(pct) + '%'));
        seg.addEventListener('click', function () { state.status = code; render(); showList(); });
        track.appendChild(seg);
      });
      row.appendChild(track);
      return row;
    }
    box.appendChild(bar('Families', function () { return 1; }, 'families'));
    box.appendChild(bar('Weighted by endemic species', function (f) { return f.endemic || 0; }, 'endemic species'));

    var legend = el('div', 'cov-legend');
    STATUS_ORDER.forEach(function (code) {
      if (!DATA.totals.by_status[code]) return;
      var item = el('span');
      item.appendChild(el('span', 'dot ' + code));
      item.appendChild(document.createTextNode(STATUS_LABEL[code]));
      legend.appendChild(item);
    });
    box.appendChild(legend);
    return box;
  }

  function renderLanding() {
    var t = DATA.totals;
    var stage = document.getElementById('stage');
    stage.textContent = '';

    var wrap = el('div', 'landing');
    wrap.appendChild(el('div', 'eyebrow', 'Working draft — not for citation'));
    wrap.appendChild(el('h1', null, 'The families of Philippine vascular plants'));
    wrap.appendChild(el('p', 'sub',
      'A successor to Copeland’s 1908 key. Every family carries its Philippine figures, ' +
      'the route the key takes to reach it, and — where a checkable source exists — a formal ' +
      'description with its caveats stated on the page.'));
    var cta = el('a', 'browse-cta');
    cta.href = '#families';
    cta.appendChild(el('span', null, 'Browse all ' + t.families + ' families'));
    cta.appendChild(el('span', 'arr', '→'));
    wrap.appendChild(cta);

    var cards = el('div', 'cards');
    function card(cls, k, v, small, d) {
      var c = el('div', 'card' + (cls ? ' ' + cls : ''));
      c.appendChild(el('div', 'k', k));
      var vv = el('div', 'v');
      vv.appendChild(document.createTextNode(v));
      if (small) vv.appendChild(el('small', null, small));
      c.appendChild(vv);
      c.appendChild(el('div', 'd', d));
      return c;
    }
    var review = (t.key_review || [])[t.key_review ? t.key_review.length - 1 : 0];
    cards.appendChild(card('', 'FAMILIES', num(t.families), null,
      num(t.species) + ' accepted species, ' + num(t.endemic) + ' endemic (' + t.endemic_percent + '%)'));
    if (review) {
      cards.appendChild(card('review', 'KEY COUPLETS FROM CO-AUTHOR REVIEW', num(review.couplets), ' / ' + num(t.key_couplets),
        review.reviewer.replace(/\s*\(.*\)$/, '') + ', applied ' + review.date_display));
    }
    cards.appendChild(card('good', 'DESCRIBED, NO CAVEAT', num(t.by_status.complete || 0), ' / ' + t.families,
      'Compiled from a Philippine or Malesian treatment with nothing flagged'));
    cards.appendChild(card('bad', 'FAMILY PAGES VERIFIED', num(t.verified), ' / ' + t.families,
      t.verified ? 'Checked by a co-author page by page' : 'No family page has been checked by a co-author yet'));
    wrap.appendChild(cards);

    wrap.appendChild(coverage());

    wrap.appendChild(el('h2', null, 'Read this first'));
    var p = el('p', 'note');
    p.innerHTML =
      '<strong>' + t.flagged_endemic_percent + '% of Philippine endemics</strong> sit in families whose description ' +
      'is flagged, missing, or drawn from a flora of another region. That is not a gap in the data — it is the ' +
      'state of the literature: Flora Malesiana never treated most of them. Every affected family says so at the ' +
      'top of its own page, in red or amber, before you read a word of the description. ' +
      (t.verified
        ? 'Only pages marked as verified have been checked by a co-author.'
        : 'No family page has been verified by a co-author, so nothing here should be cited yet.');
    wrap.appendChild(p);
    if (review) {
      var pr = el('p', 'note');
      pr.innerHTML = '<strong>The key itself, ' + esc(review.date_display) + ':</strong> ' + esc(review.summary) +
        ' Couplets that came from this review are marked on every Key path tab.';
      wrap.appendChild(pr);
    }

    wrap.appendChild(el('h2', null, 'Where the endemism is'));
    var top = DATA.families.slice().sort(function (a, b) { return b.endemic - a.endemic; }).slice(0, 12);
    var ul = el('ul', 'hitlist');
    top.forEach(function (f) {
      var li = el('li');
      var a = el('a');
      a.href = '#' + encodeURIComponent(f.family);
      a.appendChild(el('span', 'dot ' + f.status));
      a.appendChild(el('span', null, f.family));
      a.appendChild(el('span', 'n', num(f.endemic)));
      li.appendChild(a);
      ul.appendChild(li);
    });
    wrap.appendChild(ul);

    wrap.appendChild(el('h2', null, 'Reached by more than one route'));
    var p2 = el('p', 'note');
    p2.textContent = t.multi_route + ' families can be arrived at from more than one place in the key. ' +
      'Each of their Key path tabs shows every route, so a couplet that sends the same family two ways ' +
      'is visible rather than buried.';
    wrap.appendChild(p2);
    var multi = DATA.families.filter(function (f) { return f.routes.length > 2; })
      .sort(function (a, b) { return b.routes.length - a.routes.length; }).slice(0, 12);
    var ul2 = el('ul', 'hitlist');
    multi.forEach(function (f) {
      var li = el('li');
      var a = el('a');
      a.href = '#' + encodeURIComponent(f.family);
      a.appendChild(el('span', null, f.family));
      a.appendChild(el('span', 'n', f.routes.length + ' routes'));
      li.appendChild(a);
      ul2.appendChild(li);
    });
    wrap.appendChild(ul2);

    wrap.appendChild(el('h2', null, 'Sources'));
    var p3 = el('p', 'note');
    p3.textContent = DATA.cdfp_citation + ' Descriptions are condensed in our own words from the treatment named ' +
      'on each family page and are never reproduced verbatim. Key paths are computed from the key itself. ' +
      'Data generated ' + DATA.generated + '.';
    wrap.appendChild(p3);

    stage.appendChild(wrap);
  }

  // --------------------------------------------------------- family sheet

  function bannerFor(f) {
    var b, tag, html;
    if (f.status === 'flagged') {
      b = el('div', 'banner flagged'); tag = 'INCOMPLETE';
      html = esc(f.caveat);
    } else if (f.status === 'gap') {
      b = el('div', 'banner gap'); tag = 'NO DESCRIPTION';
      html = '<strong>No family description has been compiled.</strong> ' + esc(f.gap_reason);
    } else if (f.status === 'examined') {
      b = el('div', 'banner examined'); tag = 'EXAMINED';
      html = '<strong>Sources examined, nothing usable found.</strong> ' +
        esc(f.gap_reason || 'The available treatments carry no family description that can be compiled here.');
    } else if (f.status === 'not-started') {
      b = el('div', 'banner notstarted'); tag = 'NOT STARTED';
      html = '<strong>This family has not been worked on yet.</strong> Its Philippine figures and its key path ' +
        'below are computed and reliable; there is simply no description here yet.';
    } else {
      b = el('div', 'banner none'); tag = 'DESCRIBED';
      html = '<strong>Compiled from a named treatment with no caveat outstanding.</strong> ' +
        'Still unverified by a co-author — like every page in this draft.';
    }
    b.appendChild(el('span', 'tag', tag));
    var d = el('div');
    d.innerHTML = html + (f.verified_by
      ? ' Verified by ' + esc(f.verified_by) + '.'
      : ' <strong>No co-author has checked this page.</strong>');
    b.appendChild(d);
    return b;
  }

  function tabPanel(f) {
    var p = el('div', 'panel');
    if (state.tab === 'description')  panelDescription(p, f);
    else if (state.tab === 'key')     panelKey(p, f);
    else if (state.tab === 'genera')  panelGenera(p, f);
    else if (state.tab === 'dist')    panelDistribution(p, f);
    else if (state.tab === 'cons')    panelConservation(p, f);
    else if (state.tab === 'sources') panelSources(p, f);
    return p;
  }

  function panelDescription(p, f) {
    if (!f.description) {
      p.appendChild(el('p', 'missing',
        f.status === 'not-started'
          ? 'No description has been compiled for this family yet.'
          : 'No description could be compiled for this family. The reason is stated at the top of this page.'));
      if (f.available_treatments && f.available_treatments.length) {
        p.appendChild(el('div', 'ladder-head', 'Treatments that were examined'));
        var ul = el('ul', 'reflist');
        f.available_treatments.forEach(function (t) {
          var li = el('li'); li.textContent = t; ul.appendChild(li);
        });
        p.appendChild(ul);
      }
      p.appendChild(keyContrastNote(f, true));
      return;
    }

    // Split into paragraphs at the natural breaks the source text carries.
    var paras = f.description.split(/\n+/).filter(Boolean);
    paras.forEach(function (t, i) {
      var el_ = el('p', 'lede' + (i === 0 ? ' drop' : ''));
      el_.innerHTML = italiciseGenera(t, f.genera);
      p.appendChild(el_);
    });

    if (f.philippine_note) {
      var a = el('div', 'aside ph');
      a.appendChild(el('div', 'h', 'In the Philippines'));
      var pp = el('p');
      pp.innerHTML = italiciseGenera(f.philippine_note, f.genera);
      a.appendChild(pp);
      p.appendChild(a);
    }

    if (f.scope_note) {
      var s = el('div', 'aside');
      s.appendChild(el('div', 'h', 'What this source does and does not cover'));
      s.appendChild(el('p', null, f.scope_note));
      p.appendChild(s);
    }

    var src = el('div', 'srcline');
    var bits = [];
    if (f.description_ref && f.description_ref.citation) {
      bits.push('Compiled and condensed from ' + esc(f.description_ref.citation) +
        (f.description_ref.url ? ' <a href="' + esc(f.description_ref.url) + '" target="_blank" rel="noopener">source</a>' : ''));
    } else if (f.description_source) {
      bits.push('Compiled and condensed from ' + esc(f.description_source));
    }
    bits.push('Never reproduced verbatim.');
    if (f.description_written) bits.push('Written ' + esc(f.description_written) + '.');
    src.innerHTML = bits.join(' ');
    p.appendChild(src);
  }

  function keyContrastNote(f, terse) {
    var c = el('div', 'crosscheck');
    c.appendChild(el('div', 'h', 'The key describes this family too — differently'));
    var pp = el('p');
    var r = f.routes[0];
    pp.innerHTML = terse
      ? 'The Key path tab gives the couplet ladder that reaches ' + esc(f.family) + '. That is not a description: ' +
        'it is the handful of characters that separate this family from the ones it is keyed against. ' +
        'Those characters are reliable even where no description exists.'
      : 'The Key path tab shows how this key characterises ' + esc(f.family) +
        (r ? ', ending at couplet <strong>' + esc(r.couplet + r.letter) + '</strong>: “' + esc(r.lead) + '”' : '') +
        '. Those are diagnostic characters, chosen to separate this family from its neighbours in the key — ' +
        'not a description of the family. Where the two disagree, one of them is wrong, and that is worth knowing.';
    c.appendChild(pp);
    return c;
  }

  function panelKey(p, f) {
    if (!f.routes.length) {
      p.appendChild(el('p', 'missing', 'This family has no endpoint in the key. That is a defect — please flag it.'));
      return;
    }

    var intro = el('p', 'keyintro');
    intro.innerHTML =
      'This is how the key itself characterises ' + esc(f.family) + ': the chain of decisions that ends at it. ' +
      'A key path is <strong>not a description</strong> — each lead states only what is needed to separate this ' +
      'family from the ones it is being keyed against at that point, so characters the family shares with its ' +
      'neighbours are left unsaid. For the full account, see the Description tab.';
    p.appendChild(intro);

    var numnote = el('details', 'more');
    numnote.appendChild(el('summary', null, 'About the couplet numbers'));
    numnote.appendChild(el('p', null,
      'Couplets are numbered as they run through the whole key, which is the numbering the manuscript uses. ' +
      'Where a couplet was inherited from Copeland, his own 1908 number is given alongside it — he ' +
      'restarted at 1 in each section and reused the same number for sibling couplets, so his numbers alone ' +
      'do not identify a couplet.'));
    p.appendChild(numnote);

    if (f.routes.length > 1) {
      var mr = el('p', 'keyintro');
      mr.textContent = 'This family is reachable by ' + f.routes.length + ' different routes through the key. ' +
        'All of them are shown; a reader arriving by any of them should land in the same place.';
      p.appendChild(mr);
      var pick = el('div', 'routepick');
      pick.setAttribute('role', 'group');
      pick.setAttribute('aria-label', 'Routes to ' + f.family);
      f.routes.forEach(function (r, i) {
        var b = el('button');
        b.type = 'button';
        b.appendChild(el('span', 'rn', 'Route ' + (i + 1)));
        b.appendChild(el('span', 'rc', r.couplet + r.letter));
        if (r.qualifier) b.appendChild(el('span', 'rq', r.qualifier));
        b.setAttribute('aria-pressed', state.route === i ? 'true' : 'false');
        b.addEventListener('click', function () { state.route = i; renderStage(true); });
        pick.appendChild(b);
      });
      p.appendChild(pick);
    }

    var route = f.routes[Math.min(state.route, f.routes.length - 1)];

    var v = el('div', 'verdict');
    v.appendChild(el('div', 'h', 'The lead that resolves to this family'));
    v.appendChild(el('div', 'lead', '“' + route.lead + '”'));
    if (route.qualifier) {
      var q = el('div', 'qual');
      q.innerHTML = 'On this route the key names <strong>' + esc(f.family) + '</strong> <em>(' +
        esc(route.qualifier) + ')</em> — the genera the reviewer gave for this endpoint.';
      v.appendChild(q);
    }
    var meta = [];
    meta.push('Couplet <strong>' + esc(route.couplet + route.letter) + '</strong>');
    if (route.section) meta.push('section ' + esc(route.section));
    meta.push(route.steps.length + ' ' + plural(route.steps.length, 'step') + ' from the start of the key');
    meta.push(route.inherited_steps + ' of them inherited from Copeland (1908)');
    if (route.coauthor_steps) meta.push(route.coauthor_steps + ' from co-author review');
    var mline = el('div', 'meta');
    mline.innerHTML = meta.join(' &middot; ') + '.';
    if (route.copeland) {
      var rel = route.copeland;
      var extra = el('div', 'meta');
      extra.innerHTML = 'Copeland reached this family at his <strong>(' + esc(rel.copeland_number) + ') ' +
        esc(rel.copeland_name) + '</strong> — relationship <strong>' + esc(rel.relationship) + '</strong>' +
        (rel.confidence ? ', confidence ' + esc(rel.confidence) : '') + '.' +
        (rel.evidence ? ' ' + esc(rel.evidence) + '.' : '');
      v.appendChild(mline);
      v.appendChild(extra);
    } else {
      v.appendChild(mline);
    }
    p.appendChild(v);

    var lh = el('div', 'ladder-top');
    lh.appendChild(el('div', 'ladder-head', 'The route from couplet 1'));
    var legend = el('div', 'prov-legend');
    var tally = { copeland: 0, rebuilt: 0, coauthor: 0 };
    route.steps.forEach(function (s) { tally[s.origin || (s.inherited ? 'copeland' : 'rebuilt')]++; });
    [['copeland', 'Copeland 1908'], ['rebuilt', 'Rebuilt for this key'], ['coauthor', 'Co-author review']]
      .forEach(function (o) {
        if (!tally[o[0]]) return;
        var item = el('span', 'prov ' + o[0]);
        item.appendChild(el('span', 'sw'));
        item.appendChild(document.createTextNode(o[1] + ' '));
        item.appendChild(el('span', 'n', String(tally[o[0]])));
        legend.appendChild(item);
      });
    lh.appendChild(legend);
    p.appendChild(lh);

    var ol = el('ol', 'ladder');
    var lastSection = null;
    route.steps.forEach(function (s) {
      var origin = s.origin || (s.inherited ? 'copeland' : 'rebuilt');
      if (s.section && s.section !== lastSection) {
        ol.appendChild(el('li', 'rung-section', s.section));
        lastSection = s.section;
      }
      var li = el('li', 'rung ' + origin + (s.terminal ? ' terminal' : ''));
      li.appendChild(el('div', 'num', (s.couplet ? s.couplet : s.node) + s.letter));
      var body = el('div', 'body');
      if (s.character) body.appendChild(el('div', 'char', s.character));
      body.appendChild(el('div', 'txt', s.lead));
      var marks = el('div', 'marks');
      if (origin === 'copeland') {
        marks.appendChild(el('span', 'mark cope', s.lead_in
          ? 'Copeland 1908 · opening lead-in'
          : 'Copeland 1908' + (s.section_couplet ? ' · his ' + s.section_couplet + s.letter : '')));
      } else if (origin === 'coauthor') {
        var m = el('span', 'mark coauthor', 'Co-author review · ' + s.reviewer);
        m.title = 'Review comment ' + s.review_comments + ' (data/almoro-review-2026-09.json)';
        marks.appendChild(m);
        marks.appendChild(el('span', 'mark', 'comment ' + s.review_comments));
      } else {
        marks.appendChild(el('span', 'mark new', 'rebuilt for this key'));
      }
      if (s.amended) {
        var am = el('span', 'mark coauthor', 'amended in co-author review');
        am.title = s.amended;
        marks.appendChild(am);
      }
      if (s.source) marks.appendChild(el('span', 'mark', s.source));
      if (s.confidence) marks.appendChild(el('span', 'mark', 'confidence ' + s.confidence));
      if (s.review) marks.appendChild(el('span', 'mark review', s.review));
      if (s.limitation) marks.appendChild(el('span', 'mark review', s.limitation));
      if (s.terminal) {
        marks.appendChild(el('span', 'mark end',
          'resolves to ' + f.family + (route.qualifier ? ' (' + route.qualifier + ')' : '')));
      }
      body.appendChild(marks);
      li.appendChild(body);
      ol.appendChild(li);
    });
    p.appendChild(ol);

    if (f.description) p.appendChild(keyContrastNote(f, false));
  }

  function panelGenera(p, f) {
    if (!f.genera.length) {
      p.appendChild(el('p', 'missing', 'CDFP accepts no Philippine species in this family.'));
      var note = el('p', 'keyintro');
      note.textContent = 'The key nevertheless reaches this family, which is a scope question worth raising: ' +
        'a family with no accepted wild Philippine species may not belong in a Philippine key.';
      p.appendChild(note);
      return;
    }
    var lead = el('p', 'keyintro');
    lead.innerHTML = 'CDFP accepts <strong>' + num(f.species) + '</strong> Philippine ' +
      plural(f.species, 'species') + ' in <strong>' + f.genus_count + '</strong> ' +
      plural(f.genus_count, 'genus', 'genera') + '. Bars are scaled to the largest genus.';
    p.appendChild(lead);

    var max = f.genera[0].species || 1;
    var bars = el('div', 'bars');
    f.genera.forEach(function (g) {
      var row = el('div', 'bar-row');
      var lab = el('div', 'lab');
      lab.innerHTML = '<em>' + esc(g.name) + '</em>';
      row.appendChild(lab);
      var track = el('div', 'track');
      var fill = el('div', 'fill');
      fill.style.width = Math.max(2, Math.round(100 * g.species / max)) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('div', 'n', num(g.species)));
      bars.appendChild(row);
    });
    p.appendChild(bars);
  }

  /* ------------------------------------------------------ distribution map
     Coastlines are Natural Earth 1:10m (tools/build-ph-map.js). Each CDFP island
     token is tied to the Natural Earth polygons it names; a polygon is shaded by
     the largest species count among the recorded tokens that cover it (Itbayat
     lies inside both ITBAYAT and BATANES, for instance). */

  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function titleCase(tok) {
    return tok.toLowerCase().replace(/(^|[\s(’'-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); })
      .replace(/\bIsls\b/, 'Islands').replace(/^Ncr$/, 'NCR (Metro Manila)');
  }
  /* Sequential green, light to deep, on the square root of the share of the
     family's top island, so one dominant island does not wash out the rest. */
  var RAMP = [[214, 231, 214], [140, 188, 150], [63, 128, 92], [22, 74, 52]];
  function rampColour(t) {
    t = Math.max(0, Math.min(1, t));
    var seg = Math.min(RAMP.length - 2, Math.floor(t * (RAMP.length - 1)));
    var u = t * (RAMP.length - 1) - seg;
    var a = RAMP[seg], b = RAMP[seg + 1];
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * u); }).join(',') + ')';
  }

  function panelDistribution(p, f) {
    if (!f.islands.length) {
      p.appendChild(el('p', 'missing', 'CDFP records no island-level distribution for this family.'));
      return;
    }
    var M = DATA.map;
    var counts = {};
    f.islands.forEach(function (i) { counts[i.name] = i.count; });
    var max = f.islands[0].count || 1;
    var shade = function (n) { return rampColour(Math.sqrt(n / max)); };

    // which recorded tokens cover each polygon
    var cover = {};
    Object.keys(M.islands).forEach(function (tok) {
      if (!counts[tok]) return;
      M.islands[tok].forEach(function (pi) { (cover[pi] = cover[pi] || []).push(tok); });
    });

    var wrap = el('div', 'distwrap');
    var fig = el('figure', 'mapfig');
    var vb = M.viewBox.split(' ').map(Number), W = vb[2], H = vb[3];
    var svg = svgEl('svg', { viewBox: M.viewBox, class: 'phmap', role: 'img',
      'aria-label': f.family + ': map of the Philippines shading the islands CDFP records it from' });

    var defs = svgEl('defs');
    var sea = svgEl('radialGradient', { id: 'sea-grad', cx: '58%', cy: '42%', r: '80%' });
    sea.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#F3F6F2' }));
    sea.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#DDE7E2' }));
    defs.appendChild(sea);
    var sh = svgEl('filter', { id: 'land-shadow', x: '-10%', y: '-10%', width: '120%', height: '120%' });
    sh.appendChild(svgEl('feDropShadow', { dx: '0', dy: '1', stdDeviation: '1.3', 'flood-color': '#294338', 'flood-opacity': '0.28' }));
    defs.appendChild(sh);
    svg.appendChild(defs);
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#sea-grad)' }));

    // graticule, every 2 degrees
    var g = svgEl('g', { class: 'grat' });
    M.graticule.lon.forEach(function (l) {
      g.appendChild(svgEl('line', { x1: l[1], y1: 0, x2: l[1], y2: H }));
      g.appendChild(svgEl('text', { x: l[1] + 3, y: H - 6 }, l[0] + '°E'));
    });
    M.graticule.lat.forEach(function (l) {
      g.appendChild(svgEl('line', { x1: 0, y1: l[1], x2: W, y2: l[1] }));
      g.appendChild(svgEl('text', { x: 5, y: l[1] - 3 }, l[0] + '°N'));
    });
    svg.appendChild(g);

    // sea names (Natural Earth marine polygons)
    var sg = svgEl('g', { class: 'seas' });
    (M.seas || []).forEach(function (s) {
      var big = s[3] <= 1;
      var words = s[0].split(' ');
      var first = words.length > 1 ? words.slice(0, -1).join(' ') : s[0];
      var half = first.length * (big ? 4.6 : 3.9) + 6;             // rough half-width of the longer line
      var x = Math.max(half + 30, Math.min(W - half - 6, s[1]));   // clear of the latitude labels
      var t = svgEl('text', { x: x, y: s[2], class: big ? 'sea big' : 'sea', 'text-anchor': 'middle' });
      if (words.length > 1) {
        t.appendChild(svgEl('tspan', { x: x, dy: '-0.3em' }, first));
        t.appendChild(svgEl('tspan', { x: x, dy: '1.2em' }, words[words.length - 1]));
      } else t.textContent = s[0];
      sg.appendChild(t);
    });
    svg.appendChild(sg);

    // land: one silhouette, then the recorded polygons on top
    var land = svgEl('g', { class: 'land', filter: 'url(#land-shadow)' });
    land.appendChild(svgEl('path', { d: M.polys.join(''), class: 'base' }));
    svg.appendChild(land);

    var hits = svgEl('g', { class: 'hits' });
    var hitPaths = {};
    Object.keys(cover).forEach(function (pi) {
      var toks = cover[pi].sort(function (a, b) { return counts[b] - counts[a]; });
      var colour = shade(counts[toks[0]]);
      var path = svgEl('path', { d: M.polys[pi], class: 'hit', fill: colour, stroke: colour, 'data-toks': toks.join('|') });
      hits.appendChild(path);
      toks.forEach(function (t) { (hitPaths[t] = hitPaths[t] || []).push(path); });
    });
    svg.appendChild(hits);
    // Focus: a translucent veil over the whole map, with the chosen island's
    // polygons copied above it (dimming each polygon separately would show the
    // province borders where neighbouring fills overlap).
    var veil = svgEl('rect', { x: 0, y: 0, width: W, height: H, class: 'veil' });
    svg.appendChild(veil);
    var litLayer = svgEl('g', { class: 'litlayer' });
    svg.appendChild(litLayer);
    // the coastline on top: only edges that face the sea, so no province borders show
    svg.appendChild(svgEl('path', { d: M.coast, class: 'coast' }));

    // island names: the recorded islands big enough to carry a label, most species first
    var lg = svgEl('g', { class: 'labels' });
    var boxes = [];
    Object.keys(counts).filter(function (t) { return M.labels[t] && M.labels[t][2] >= 16; })
      .sort(function (a, b) { return counts[b] - counts[a] || M.labels[b][2] - M.labels[a][2]; })
      .slice(0, 9)
      .forEach(function (tok) {
        var L = M.labels[tok], name = titleCase(tok).replace(' (Metro Manila)', '');
        var w = name.length * 5.4 + 4, h = 12, bx = [L[0] - w / 2, L[1] - h / 2, L[0] + w / 2, L[1] + h / 2];
        if (boxes.some(function (b) { return !(bx[2] < b[0] || bx[0] > b[2] || bx[3] < b[1] || bx[1] > b[3]); })) return;
        boxes.push(bx);
        var size = Math.max(10, Math.min(13.5, 8.5 + L[2] / 45));
        lg.appendChild(svgEl('text', { x: L[0], y: L[1] + 4, 'text-anchor': 'middle', class: 'isle-name', 'font-size': size.toFixed(1) }, name));
      });
    svg.appendChild(lg);

    // scale bar (0-100-200 km) and north arrow
    var kmpx = M.km_per_px, len = 200 / kmpx, sx = W - len - 18, sy = H - 26;
    var sc = svgEl('g', { class: 'scale' });
    sc.appendChild(svgEl('rect', { x: sx, y: sy, width: len / 2, height: 4, class: 'dark' }));
    sc.appendChild(svgEl('rect', { x: sx + len / 2, y: sy, width: len / 2, height: 4, class: 'light' }));
    [[0, '0'], [len, '200 km']].forEach(function (s, i) {
      sc.appendChild(svgEl('text', { x: sx + s[0], y: sy - 4, 'text-anchor': i ? 'end' : 'start' }, s[1]));
    });
    svg.appendChild(sc);
    var na = svgEl('g', { class: 'north', transform: 'translate(' + (sx - 20) + ',' + (sy - 2) + ')' });
    na.appendChild(svgEl('path', { d: 'M0 -13 L6 5 L0 1 L-6 5 Z' }));
    na.appendChild(svgEl('text', { x: 0, y: 17, 'text-anchor': 'middle' }, 'N'));
    svg.appendChild(na);
    // a thin inner frame, as on a printed atlas plate
    svg.appendChild(svgEl('rect', { x: 5.5, y: 5.5, width: W - 11, height: H - 11, class: 'neatline' }));

    fig.appendChild(svg);

    // hover card
    var tip = el('div', 'maptip');
    tip.hidden = true;
    fig.appendChild(tip);

    // legend
    var leg = el('figcaption', 'maplegend');
    var bar = el('div', 'ramp');
    bar.style.background = 'linear-gradient(90deg,' + [0, 0.25, 0.5, 0.75, 1].map(rampColour).join(',') + ')';
    var lrow = el('div', 'lrow');
    var none = el('span', 'none');
    none.appendChild(el('span', 'sw'));
    none.appendChild(document.createTextNode('not recorded'));
    lrow.appendChild(none);
    var rr = el('span', 'rr');
    rr.appendChild(el('span', 'lo', '1'));
    rr.appendChild(bar);
    rr.appendChild(el('span', 'hi', num(max) + ' ' + plural(max, 'species')));
    lrow.appendChild(rr);
    leg.appendChild(lrow);
    var placed = f.islands.filter(function (i) { return i.mapped; }).length;
    leg.appendChild(el('p', 'mapnote',
      'Shading follows the number of this family’s species CDFP records from each island. ' + placed + ' of ' +
      f.islands.length + ' recorded ' + plural(f.islands.length, 'island') + ' can be drawn at this scale; ' +
      'every one is listed by name. Coastlines: Natural Earth 1:10m, public domain.'));
    fig.appendChild(leg);
    wrap.appendChild(fig);

    // list
    var list = el('div', 'distlist');
    var lead = el('p', 'keyintro');
    var top = f.islands.slice(0, 5).map(function (i) { return titleCase(i.name) + ' (' + i.count + ')'; });
    lead.innerHTML = 'Recorded from <strong>' + f.island_count + '</strong> named ' +
      plural(f.island_count, 'island') + ' or island ' + plural(f.island_count, 'group') +
      (top.length ? '; most species are reported from ' + esc(sentence(top)) : '') + '.' +
      (f.elevation && f.elevation.species_with_data
        ? ' Elevations span <strong>' + f.elevation.min + '–' + f.elevation.max + ' m</strong>, from the ' +
          f.elevation.species_with_data + ' species for which CDFP states one.'
        : '');
    list.appendChild(lead);

    var set = el('div', 'chipset');
    var chips = {};
    f.islands.forEach(function (i) {
      var c = el(i.mapped ? 'button' : 'span', 'ichip' + (i.mapped ? ' mapped' : ''));
      if (i.mapped) {
        c.type = 'button';
        var sw = el('span', 'sw');
        sw.style.background = shade(i.count);
        c.appendChild(sw);
        c.setAttribute('aria-label', titleCase(i.name) + ', ' + i.count + ' ' + plural(i.count, 'species') + '. Show on map');
      } else {
        c.title = 'Too small to draw at this map scale';
      }
      c.appendChild(document.createTextNode(titleCase(i.name)));
      c.appendChild(el('span', 'n', String(i.count)));
      set.appendChild(c);
      chips[i.name] = c;
    });
    list.appendChild(set);
    var key = el('p', 'chipkey');
    key.innerHTML = '<span class="sw"></span>on the map &nbsp;·&nbsp; <span class="dash">plain</span> too small to draw at this scale';
    list.appendChild(key);

    var cap = el('div', 'srcline');
    cap.textContent = 'Island tokens are those CDFP prints in capitals in each species’ Distribution line. ' +
      'A species recorded from several islands is counted under each.';
    list.appendChild(cap);
    wrap.appendChild(list);
    p.appendChild(wrap);

    // ---- linking map and list
    function light(toks, on) {
      svg.classList.toggle('focus', on);
      litLayer.textContent = '';
      toks.forEach(function (t) {
        if (on) (hitPaths[t] || []).forEach(function (pth) { litLayer.appendChild(pth.cloneNode(false)); });
        if (chips[t]) chips[t].classList.toggle('lit', on);
      });
    }
    function showTip(toks, evt) {
      tip.textContent = '';
      toks.forEach(function (t) {
        var row = el('div', 'row');
        row.appendChild(el('span', 'nm', titleCase(t)));
        row.appendChild(el('span', 'ct', counts[t] + ' ' + plural(counts[t], 'species')));
        tip.appendChild(row);
      });
      tip.hidden = false;
      var r = fig.getBoundingClientRect();
      var x = evt.clientX - r.left, y = evt.clientY - r.top;
      tip.style.left = Math.min(x + 14, r.width - tip.offsetWidth - 6) + 'px';
      tip.style.top = Math.max(6, y - tip.offsetHeight - 10) + 'px';
    }
    var current = null;
    function clear() { if (current) light(current, false); current = null; tip.hidden = true; }
    svg.addEventListener('pointermove', function (e) {
      var t = e.target.closest && e.target.closest('.hits .hit');
      if (!t) { clear(); return; }
      var toks = t.getAttribute('data-toks').split('|');
      if (current && current.join() !== toks.join()) light(current, false);
      current = toks; light(toks, true); showTip(toks, e);
    });
    svg.addEventListener('pointerleave', clear);
    Object.keys(chips).forEach(function (tok) {
      if (!hitPaths[tok]) return;
      var c = chips[tok];
      var on = function () { clear(); current = [tok]; light([tok], true); };
      c.addEventListener('mouseenter', on);
      c.addEventListener('focus', on);
      c.addEventListener('mouseleave', clear);
      c.addEventListener('blur', clear);
      c.addEventListener('click', function () {
        on();
        if (window.matchMedia('(max-width: 900px)').matches) fig.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    });
  }

  /* CDFP prints categories in whatever order it happens to hold them; list
     them from most to least threatened so the worst case reads first. */
  var CAT_ORDER = ['Extinct', 'Extinct in the Wild', 'Critically Endangered', 'Endangered',
                   'Vulnerable', 'Near Threatened', 'Conservation Dependent', 'Least Concern',
                   'Data Deficient', 'Not Evaluated'];
  function bySeverity(counts) {
    return Object.keys(counts).sort(function (a, b) {
      var ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      if (ia === -1) ia = CAT_ORDER.length;
      if (ib === -1) ib = CAT_ORDER.length;
      return ia - ib || a.localeCompare(b);
    }).map(function (k) { return counts[k] + ' ' + k; });
  }

  function panelConservation(p, f) {
    var iucn = f.iucn || {};
    var dao = f.dao || {};
    var anyIucn = Object.keys(iucn).length;
    var anyDao = f.dao_listed > 0;

    if (!anyIucn && !anyDao) {
      p.appendChild(el('p', 'missing', 'CDFP cites no conservation assessment for any species in this family.'));
      return;
    }

    var t = el('table', 'kv');
    function row(k, v) {
      var tr = el('tr');
      tr.appendChild(el('th', null, k));
      var td = el('td'); td.innerHTML = v; tr.appendChild(td);
      t.appendChild(tr);
    }
    if (anyDao) {
      var daoBits = bySeverity(dao);
      row('Philippine DENR list',
        '<strong>' + f.dao_listed + ' of ' + num(f.species) + '</strong> accepted species listed' +
        (daoBits.length ? ' — ' + esc(sentence(daoBits)) : '') + '.');
    }
    if (anyIucn) {
      var iucnBits = bySeverity(iucn);
      row('IUCN assessments cited by CDFP', esc(sentence(iucnBits)) + '.');
    }
    row('Endemism', '<strong>' + num(f.endemic) + ' of ' + num(f.species) + '</strong> species (' +
      (f.endemic_percent == null ? '—' : f.endemic_percent + '%') + ') are endemic to the Philippines. ' +
      'An endemic species that is threatened cannot be conserved anywhere else.');
    p.appendChild(t);

    if (f.threatened_taxa && f.threatened_taxa.length) {
      p.appendChild(el('div', 'ladder-head', 'Listed taxa (' + f.threatened_taxa.length + ')'));
      var d = el('div', 'taxalist');
      d.innerHTML = f.threatened_taxa.map(function (n) { return '<em>' + esc(n) + '</em>'; }).join(' &middot; ');
      p.appendChild(d);
    }

    var src = el('div', 'srcline');
    src.textContent = 'Conservation figures are as CDFP states them, normalised only to strip the assessor ' +
      'parenthetical. They are not our own assessments.';
    p.appendChild(src);
  }

  function panelSources(p, f) {
    var lead = el('p', 'keyintro');
    lead.innerHTML = 'Every statement this app makes about ' + esc(f.family) + ' carries a source tier. ' +
      '<strong>cdfp-computed</strong> means we counted it ourselves from CDFP’s species records; ' +
      '<strong>cdfp-stated</strong> means CDFP says so; <strong>key-derived</strong> means it comes from this ' +
      'key; <strong>literature-specific</strong> means a named treatment; <strong>project-derived</strong> ' +
      'means our own comparison work.';
    p.appendChild(lead);

    if (f.statements) {
      Object.keys(f.statements).forEach(function (section) {
        var arr = f.statements[section];
        if (!arr || !arr.length) return;
        p.appendChild(el('div', 'ladder-head', section.replace(/_/g, ' ')));
        arr.forEach(function (s) {
          var d = el('div', 'stmt');
          var html = '<span class="tier">' + esc(s.source_tier || 'unsourced') + '</span>' + esc(s.text);
          if (s.note) html += '<span class="note">' + esc(s.note) + '</span>';
          d.innerHTML = html;
          p.appendChild(d);
        });
      });
    }

    p.appendChild(el('div', 'ladder-head', 'References'));
    var ul = el('ul', 'reflist');
    function refItem(r) {
      var li = el('li');
      var html = '<span class="rid">' + esc(r.id || '') + (r.type ? ' · ' + esc(r.type) : '') + '</span>' + esc(r.citation);
      if (r.url) html += ' <a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.url) + '</a>';
      li.innerHTML = html;
      return li;
    }
    if (f.description_ref) ul.appendChild(refItem(f.description_ref));
    (f.other_refs || []).forEach(function (r) { ul.appendChild(refItem(r)); });
    (DATA.core_references || []).forEach(function (r) { ul.appendChild(refItem(r)); });
    p.appendChild(ul);

    if (f.cdfp_url) {
      var s = el('div', 'srcline');
      s.innerHTML = 'CDFP family page: <a href="' + esc(f.cdfp_url) + '" target="_blank" rel="noopener">' +
        esc(f.cdfp_url) + '</a>, accessed ' + esc(f.cdfp_accessed || 'n.d.') + '.';
      p.appendChild(s);
    }
  }

  /* Previous / next within whatever the rail currently shows, so a reviewer can
     walk a filtered list (say, every flagged family) without going back to it. */
  function sheetNav(f) {
    var list = sorted(DATA.families.filter(matches));
    var i = list.findIndex(function (x) { return x.family === f.family; });
    var nav = el('nav', 'sheetnav');
    nav.setAttribute('aria-label', 'Family navigation');
    var back = el('a', 'back', '← All families');
    back.href = '#families';
    nav.appendChild(back);
    var pos = el('span', 'pos', i === -1 ? 'not in the current filter' : (i + 1) + ' of ' + list.length);
    nav.appendChild(pos);
    function step(delta, label) {
      var target = i === -1 ? null : list[i + delta];
      var a = el('a', 'step', label);
      if (target) {
        a.href = '#' + encodeURIComponent(target.family) + (state.tab === 'description' ? '' : '/' + state.tab);
        a.title = target.family;
      } else {
        a.setAttribute('aria-disabled', 'true');
      }
      return a;
    }
    nav.appendChild(step(-1, '‹ Prev'));
    nav.appendChild(step(1, 'Next ›'));
    return nav;
  }

  function renderSheet(f) {
    var stage = document.getElementById('stage');
    stage.textContent = '';
    document.title = f.family + ' — PH·FLORA';

    stage.appendChild(sheetNav(f));

    var sheet = el('article', 'sheet');
    sheet.appendChild(bannerFor(f));

    var head = el('div', 'sheet-head');
    var eyebrow = [f.order, f.clade, f.major_group].filter(Boolean).join(' · ');
    var toprow = el('div', 'head-top');
    toprow.appendChild(el('div', 'eyebrow', eyebrow));
    if (f.routes.length) {
      var keyed = el('a', 'keyed');
      keyed.href = '#' + encodeURIComponent(f.family) + '/key';
      keyed.appendChild(el('span', 'k', f.routes.length > 1 ? f.routes.length + ' key routes' : 'Keyed at'));
      keyed.appendChild(el('span', 'v', f.routes.map(function (r) { return r.couplet + r.letter; }).join(' · ')));
      toprow.appendChild(keyed);
    }
    head.appendChild(toprow);
    head.appendChild(el('h1', null, f.family));
    if (f.alternate_name) head.appendChild(el('div', 'subtitle', 'also written ' + f.alternate_name));

    var figs = el('div', 'figures');
    function fig(cls, v, small, k) {
      var d = el('div', 'fig' + (cls ? ' ' + cls : ''));
      var vv = el('div', 'v');
      vv.appendChild(document.createTextNode(v));
      if (small) vv.appendChild(el('small', null, small));
      d.appendChild(vv);
      d.appendChild(el('div', 'k', k));
      return d;
    }
    figs.appendChild(fig('', num(f.species), null, 'species'));
    figs.appendChild(fig(f.endemic ? 'endemic' : '', num(f.endemic), null, 'endemic'));
    figs.appendChild(f.endemic_percent == null
      ? fig('', '—', null, 'endemism')
      : fig('', String(f.endemic_percent), '%', 'endemism'));
    figs.appendChild(fig('', String(f.genus_count), null, plural(f.genus_count, 'genus', 'genera')));
    figs.appendChild(fig('', String(f.island_count || 0), null, plural(f.island_count || 0, 'island')));
    if (f.dao_listed) figs.appendChild(fig('threat', String(f.dao_listed), null, 'DENR listed'));
    head.appendChild(figs);
    sheet.appendChild(head);

    var tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    [['description', 'Description'], ['key', 'Key path'], ['genera', 'Genera'],
     ['dist', 'Distribution'], ['cons', 'Conservation'], ['sources', 'Sources']]
    .forEach(function (t) {
      var b = el('button', 'tab', t[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', state.tab === t[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.tab = t[0];
        location.hash = '#' + encodeURIComponent(f.family) + (t[0] === 'description' ? '' : '/' + t[0]);
      });
      tabs.appendChild(b);
    });
    sheet.appendChild(tabs);
    sheet.appendChild(tabPanel(f));

    stage.appendChild(sheet);
  }

  // ---------------------------------------------------------------- render

  var PHONE = window.matchMedia('(max-width: 900px)');

  var lastView = null;
  function renderStage(keepScroll) {
    var stage = document.getElementById('stage');
    var y = stage.scrollTop, wy = window.scrollY;
    var open = !!(state.family && BY_NAME[state.family]);
    if (open) renderSheet(BY_NAME[state.family]);
    else { document.title = 'Philippine Vascular Plant Families'; renderLanding(); }

    // Phone layout has three views: overview, the family list, one family.
    document.body.classList.toggle('family-open', open);
    document.body.classList.toggle('browsing', !open && state.browse);

    // Jump to the top when the view changes; keep the reader's place when
    // only a tab or a route changes.
    var view = open ? state.family : (state.browse ? '#families' : '');
    if (keepScroll || view === lastView) { stage.scrollTop = y; window.scrollTo(0, wy); }
    else { stage.scrollTop = 0; window.scrollTo(0, 0); }
    lastView = view;
  }

  function render() {
    renderFacets();
    renderList(sorted(DATA.families.filter(matches)));
    renderStage();
  }

  /* Show the family list: on a phone that is its own view; on a wide screen
     the list is always visible beside the page, so nothing needs to move. */
  function showList() {
    if (PHONE.matches && location.hash !== '#families') location.hash = '#families';
  }

  // ----------------------------------------------------------------- hash

  function readHash() {
    var h = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    state.browse = h === 'families';
    if (!h || state.browse) { state.family = null; state.tab = 'description'; return; }
    var parts = h.split('/');
    var fam = parts[0];
    if (!BY_NAME[fam]) { state.family = null; return; }
    if (fam !== state.family) state.route = 0;
    state.family = fam;
    state.tab = parts[1] || 'description';
  }

  // ---------------------------------------------------------------- theme

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var b = document.getElementById('theme-btn');
    var next = t === 'dark' ? 'light' : 'dark';
    b.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    b.title = 'Switch to ' + next + ' theme';
  }

  // ---------------------------------------------------------------- about

  /* Everything numeric here is read from the data file, like the rest of the app. */
  function renderAbout() {
    var t = DATA.totals;
    var box = document.getElementById('about-body');
    box.textContent = '';

    var head = el('div', 'about-head');
    head.appendChild(el('h2', null, 'About this draft'));
    head.id = 'about-title';
    var x = el('button', 'iconbtn about-close', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', function () { document.getElementById('about').close(); });
    head.appendChild(x);
    box.appendChild(head);

    function section(title, nodes) {
      var s = el('section');
      s.appendChild(el('h3', null, title));
      nodes.forEach(function (n) { s.appendChild(n); });
      box.appendChild(s);
    }
    function para(html) { var p = el('p'); p.innerHTML = html; return p; }

    section('What this is', [
      para('A working draft of a modern successor to E. B. Copeland’s 1908 key to the families of Philippine ' +
        'vascular plants, rebuilt against the <strong>' + num(t.families) + ' families</strong> recognised by ' +
        'Co’s Digital Flora of the Philippines (CDFP). For each family it shows the Philippine figures, every ' +
        'route the key takes to reach it, and — where a checkable source exists — a condensed description.'),
      para('<strong>It is not for citation.</strong> ' + (t.verified
        ? t.verified + ' of ' + t.families + ' family pages have been checked by a co-author.'
        : 'No family page has yet been checked by a co-author.'))
    ]);

    var st = el('dl', 'about-dl');
    var STATUS_TEXT = {
      'complete': 'A description compiled from a named Philippine or Malesian treatment, with no caveat outstanding.',
      'flagged': 'A description is shown, but the page states what is wrong with its source — often that it comes from a flora of another region.',
      'gap': 'No description could be compiled; the page says why.',
      'examined': 'The available treatments were examined and nothing usable was found.',
      'not-started': 'Not worked on yet. The figures and key path are still computed and reliable.'
    };
    STATUS_ORDER.forEach(function (code) {
      if (!t.by_status[code]) return;
      var dt = el('dt');
      dt.appendChild(el('span', 'dot ' + code));
      dt.appendChild(document.createTextNode(STATUS_LABEL[code] + ' '));
      dt.appendChild(el('span', 'n', String(t.by_status[code])));
      st.appendChild(dt);
      st.appendChild(el('dd', null, STATUS_TEXT[code]));
    });
    section('The coloured dots: how far each description has got', [st]);

    var pv = el('dl', 'about-dl');
    [['copeland', 'Copeland 1908', 'Wording kept from Copeland’s key, with his own couplet number alongside.'],
     ['rebuilt', 'Rebuilt for this key', 'Written for this key where modern classification required it, with a cited source.'],
     ['coauthor', 'Co-author review', 'Supplied or rewritten by a co-author in review; each carries the comment it came from.']]
      .forEach(function (o) {
        var dt = el('dt', 'prov ' + o[0]);
        dt.appendChild(el('span', 'sw'));
        dt.appendChild(document.createTextNode(o[1]));
        pv.appendChild(dt);
        pv.appendChild(el('dd', null, o[2]));
      });
    var pvNodes = [pv];
    var review = (t.key_review || [])[(t.key_review || []).length - 1];
    if (review) {
      pvNodes.push(para('<strong>' + num(review.couplets) + ' of ' + num(t.key_couplets) + ' couplets</strong> ' +
        'came from co-author review (' + esc(review.reviewer.replace(/\s*\(.*\)$/, '')) + ', applied ' +
        esc(review.date_display) + ').'));
    }
    section('The Key path tab: where each couplet’s wording comes from', pvNodes);

    section('Where the numbers come from', [
      para('Species, endemism, genera, islands and conservation listings are counted from CDFP’s species records. ' +
        'Couplet numbers run through the whole key, as in the manuscript. Descriptions are condensed in our own ' +
        'words from the treatment named on each page and are never reproduced verbatim. Map coastlines are ' +
        'Natural Earth 1:10m (public domain); islands too small for that scale are listed by name rather than drawn.'),
      para(esc(DATA.cdfp_citation) + ' Data generated ' + esc(DATA.generated) + '.')
    ]);

    section('Getting around', [
      para('Search by family, genus or couplet (for example <code>65a</code>); press <kbd>/</kbd> to jump to ' +
        'the search box and <kbd>Enter</kbd> to open the first match. On a family page, <strong>Prev</strong> ' +
        'and <strong>Next</strong> step through whatever the list is currently filtered to.')
    ]);
  }

  // ------------------------------------------------------------------ boot

  function boot(data) {
    DATA = data;
    data.families.forEach(function (f) { BY_NAME[f.family] = f; });

    document.getElementById('topstats').textContent =
      data.totals.families + ' FAMILIES · ' +
      ((data.totals.by_status.complete || 0) + (data.totals.by_status.flagged || 0)) + ' DESCRIBED · ' +
      data.totals.verified + ' PAGES VERIFIED · ' + num(data.totals.endemic) + ' ENDEMIC SPECIES';

    // ---- search
    var q = document.getElementById('q');
    if (window.matchMedia('(max-width: 600px)').matches) q.placeholder = 'Search';
    var t;
    function runSearch() {
      state.q = q.value.trim();
      renderFacets();
      renderList(sorted(DATA.families.filter(matches)));
    }
    q.addEventListener('input', function () {
      if (PHONE.matches && q.value) showList();   // on a phone the results are the list view
      clearTimeout(t);
      t = setTimeout(runSearch, 90);
    });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        clearTimeout(t); runSearch();
        var hits = sorted(DATA.families.filter(matches));
        if (hits.length) { location.hash = '#' + encodeURIComponent(hits[0].family); q.blur(); }
      } else if (e.key === 'Escape') {
        q.value = ''; runSearch(); q.blur();
      }
    });
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !document.getElementById('about').open) {
        e.preventDefault(); q.focus(); q.select();
      }
    });

    // ---- filters: always shown on a wide screen, folded behind a button on a phone
    var rail = document.getElementById('rail');
    var ft = document.getElementById('filter-toggle');
    function setFilters(open) {
      rail.classList.toggle('filters-open', open);
      ft.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    ft.addEventListener('click', function () { setFilters(!rail.classList.contains('filters-open')); });
    document.getElementById('facets-done').addEventListener('click', function () { setFilters(false); });
    document.getElementById('clear-filters').addEventListener('click', function () {
      state.status = null; state.group = null; state.sort = 'az';
      q.value = ''; state.q = '';
      render();
    });

    // ---- theme
    applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    document.getElementById('theme-btn').addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      applyTheme(next);
      try { localStorage.setItem('phflora-theme', next); } catch (e) {}
    });

    // ---- about
    var about = document.getElementById('about');
    document.getElementById('about-btn').addEventListener('click', function () {
      renderAbout();
      if (about.showModal) about.showModal(); else about.setAttribute('open', '');
    });
    about.addEventListener('click', function (e) { if (e.target === about) about.close(); });

    document.querySelector('[data-home]').addEventListener('click', function (e) {
      e.preventDefault();
      location.hash = '';
    });

    window.addEventListener('hashchange', function () { readHash(); render(); });

    readHash();
    render();
  }

  /* The data file is fetched with the same version stamp as this script, so a
     browser never pairs a new page with a stale cached data file. */
  var script = document.currentScript;
  var version = script && /[?&]v=([^&]+)/.exec(script.src);
  fetch('data/families.json' + (version ? '?v=' + version[1] : ''))
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(boot)
    .catch(function (err) {
      document.getElementById('stage').innerHTML =
        '<div class="loading">Could not load data/families.json (' + esc(err.message) + ').<br><br>' +
        'This app reads a data file, so it needs to be served over http rather than opened straight from disk. ' +
        'Run <code>node tools/serve-app.js</code> from the project folder and open the address it prints.</div>';
    });
})();
