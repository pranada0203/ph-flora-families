/* Philippine vascular plant families — app shell.
   All content comes from data/families.json, which tools/build-app-data.js
   generates from the canonical project data. Nothing is hard-coded here. */

(function () {
  'use strict';

  var DATA = null;
  // the cache stamp this script was loaded with (see tools/build-app-data.js)
  var VERSION = (function () { var s = document.currentScript; var m = s && /[?&]v=([^&]+)/.exec(s.src); return m ? m[1] : ''; })();

  // species-name index for search, loaded on first use (tools/build-species.js)
  var SPX = null, SPX_META = null, spxLoading = null;
  function loadSpeciesIndex() {
    if (!spxLoading) {
      spxLoading = fetch('data/species-index.json' + (VERSION ? '?v=' + VERSION : ''))
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) {
          SPX = {}; SPX_META = j.sources;
          j.names.forEach(function (r) { (SPX[r[1]] = SPX[r[1]] || []).push(r[0]); });
        })
        .catch(function () { spxLoading = null; });
    }
    return spxLoading;
  }
  /** The first species of a family whose name contains the query, if the index is loaded. */
  function speciesHit(f, q) {
    if (!SPX || !q || q.length < 3 || !SPX[f.family]) return null;
    q = q.toLowerCase();
    for (var i = 0; i < SPX[f.family].length; i++) if (SPX[f.family][i].toLowerCase().indexOf(q) !== -1) return SPX[f.family][i];
    return null;
  }
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
      if (speciesHit(f, q)) return true;
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
      var nmBox = el('span', 'nm', f.family);
      var hitName = state.q && f.family.toLowerCase().indexOf(state.q.toLowerCase()) === -1 ? speciesHit(f, state.q) : null;
      if (hitName) { var hn = el('span', 'hint'); hn.appendChild(el('em', null, hitName)); nmBox.appendChild(hn); }
      a.appendChild(nmBox);
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

    var spx = el('a', 'spx-cta');
    spx.href = '#species';
    var spxT = el('span', 't');
    spxT.appendChild(el('span', 'k', 'SPECIES OF THE PHILIPPINES'));
    spxT.appendChild(el('span', 'h', 'Build a species list by island'));
    spxT.appendChild(el('span', 'd', 'Every species Kew accepts for the Philippines, with CDFP’s islands: for example, all the species known only from Palawan. Filter, open, download.'));
    spx.appendChild(spxT);
    spx.appendChild(el('span', 'arr', '→'));
    wrap.appendChild(spx);

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
    else if (state.tab === 'species') panelSpecies(p, f);
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

  /* ------------------------------------------------------------ species
     Built by tools/build-species.js. The species list is Kew's World Checklist
     of Vascular Plants; each species' island names come from CDFP (names only,
     credited); GBIF records and photos are fetched live, here in the browser,
     when a species is opened. One file per family, fetched on first use. */

  var SPECIES = {};
  function loadSpecies(fam) {
    if (SPECIES[fam]) return SPECIES[fam];
    SPECIES[fam] = fetch('data/species/' + encodeURIComponent(fam) + '.json' + (VERSION ? '?v=' + VERSION : ''))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    SPECIES[fam].catch(function () { delete SPECIES[fam]; });
    return SPECIES[fam];
  }

  // ---- GBIF, live
  var GBIF = 'https://api.gbif.org/v1/';
  var gbifCache = {};
  /* GBIF sometimes answers 429 ("too many requests") or 5xx when busy; wait and
     ask again twice before giving up, so a busy moment is not mistaken for
     "no records". */
  function gbifJson(url) {
    if (!gbifCache[url]) {
      var attempt = function (n) {
        return fetch(url).then(function (r) {
          if (r.ok) return r.json();
          if ((r.status === 429 || r.status >= 500) && n < 2) {
            return new Promise(function (res) { setTimeout(res, n ? 4000 : 1500); }).then(function () { return attempt(n + 1); });
          }
          throw new Error(r.status === 429 ? 'GBIF is busy' : 'GBIF ' + r.status);
        });
      };
      gbifCache[url] = attempt(0);
      gbifCache[url].catch(function () { delete gbifCache[url]; });
    }
    return gbifCache[url];
  }
  /** GBIF's own key for a name, or null when GBIF has no exact species match. */
  function gbifKey(name) {
    return gbifJson(GBIF + 'species/match?kingdom=Plantae&strict=true&name=' + encodeURIComponent(name)).then(function (m) {
      return m && m.usageKey && m.rank === 'SPECIES' && (m.matchType === 'EXACT' || m.matchType === 'FUZZY') ? m.usageKey : null;
    });
  }
  var PH_FILTER = '&country=PH&hasCoordinate=true&hasGeospatialIssue=false';
  function gbifRecords(key, observations) {
    return gbifJson(GBIF + 'occurrence/search?taxonKey=' + key + PH_FILTER + '&limit=300&basisOfRecord=' +
      (observations ? 'HUMAN_OBSERVATION' : 'PRESERVED_SPECIMEN'));
  }
  function gbifPhotos(key) {
    return gbifJson(GBIF + 'occurrence/search?taxonKey=' + key + '&country=PH&mediaType=StillImage&limit=12');
  }

  /* MD5, for GBIF's image cache, which addresses a photo by the MD5 of its
     original URL (https://api.gbif.org/v1/image/cache/200x200/occurrence/<key>/media/<md5>).
     Compact standard implementation (RFC 1321) over the UTF-8 bytes. */
  function md5(str) {
    var bytes = unescape(encodeURIComponent(str)), n = bytes.length;
    var words = [], i;
    for (i = 0; i < n; i++) words[i >> 2] |= bytes.charCodeAt(i) << ((i % 4) * 8);
    words[n >> 2] |= 0x80 << ((n % 4) * 8);
    words[(((n + 8) >> 6) + 1) * 16 - 2] = n * 8;
    var S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21], K = [];
    for (i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    var a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
    for (var blk = 0; blk < words.length; blk += 16) {
      var A = a0, B = b0, C = c0, D = d0;
      for (i = 0; i < 64; i++) {
        var F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        var tmp = D; D = C; C = B;
        var x = (A + F + K[i] + (words[blk + g] | 0)) | 0;
        var s = S[(i >> 4) * 4 + (i % 4)];
        B = (B + ((x << s) | (x >>> (32 - s)))) | 0;
        A = tmp;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    return [a0, b0, c0, d0].map(function (v) {
      var h = '';
      for (var j = 0; j < 4; j++) h += ('0' + ((v >>> (j * 8)) & 255).toString(16)).slice(-2);
      return h;
    }).join('');
  }
  function licenceShort(u) {
    if (!u) return 'licence unstated';
    if (/publicdomain\/zero/.test(u)) return 'CC0';
    var m = /licenses\/([a-z-]+)\/([0-9.]+)/.exec(u);
    return m ? 'CC ' + m[1].toUpperCase() + ' ' + m[2] : u;
  }

  // ---- the species' own mini map: CDFP islands shaded, GBIF points on top
  function speciesMiniMap(s) {
    var M = DATA.map;
    var vb = M.viewBox.split(' ').map(Number), W = vb[2], H = vb[3];
    var svg = svgEl('svg', { viewBox: M.viewBox, class: 'phmap mini', role: 'img',
      'aria-label': s.n + ': islands CDFP records it from, and GBIF record points' });
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, class: 'mini-sea' }));
    svg.appendChild(svgEl('path', { d: M.polys.join(''), class: 'base' }));
    var shade = rampColour(0.55);
    (s.ci || []).forEach(function (tok) {
      (M.islands[tok] || []).forEach(function (pi) {
        svg.appendChild(svgEl('path', { d: M.polys[pi], fill: shade, stroke: shade, class: 'hit static' }));
      });
    });
    svg.appendChild(svgEl('path', { d: M.coast, class: 'coast' }));
    svg.appendChild(svgEl('g', { class: 'dots' }));
    return svg;
  }
  function plotRecords(svg, results) {
    var P = DATA.map.projection, g = svg.querySelector('.dots');
    g.textContent = '';
    var seen = {};
    results.forEach(function (r) {
      if (r.decimalLatitude == null || r.decimalLongitude == null) return;
      var x = Math.round((r.decimalLongitude - P.lon0) * P.k * P.px * 2) / 2, y = Math.round((P.lat0 - r.decimalLatitude) * P.px * 2) / 2;
      if (seen[x + ',' + y]) return;
      seen[x + ',' + y] = 1;
      var c = svgEl('circle', { cx: x, cy: y, r: 5, class: r.basisOfRecord === 'PRESERVED_SPECIMEN' ? 'spec' : 'obs' });
      c.appendChild(svgEl('title', null, (r.basisOfRecord === 'PRESERVED_SPECIMEN' ? 'Specimen' : 'Observation') +
        (r.year ? ', ' + r.year : '') + (r.institutionCode ? ', ' + r.institutionCode : '') + (r.locality ? ' — ' + r.locality : '')));
      g.appendChild(c);
    });
  }

  function speciesDetail(s, fam, onIsland) {
    var d = el('div', 'spdetail');
    var left = el('div', 'spleft');
    var mapWrap = el('div', 'spmap');
    var svg = speciesMiniMap(s);
    mapWrap.appendChild(svg);
    left.appendChild(mapWrap);
    var mapKey = el('div', 'spmapkey');
    mapKey.innerHTML = '<span class="k isl"></span>islands, from CDFP &nbsp; <span class="k spec"></span>specimens &nbsp; <span class="k obs"></span>observations';
    left.appendChild(mapKey);
    d.appendChild(left);

    var right = el('div', 'spright');
    var facts = el('dl', 'spfacts');
    function fact(k, v) { if (v == null || v === '') return; facts.appendChild(el('dt', null, k)); var dd = el('dd'); dd.innerHTML = v; facts.appendChild(dd); }
    fact('Status in the Philippines', s.i ? 'Introduced' : s.e ? '<strong>Endemic</strong> — native nowhere else' : 'Native');
    if (s.x) fact('Note', 'Kew records it as extinct in the Philippines');
    if (s.dq) fact('Note', 'Kew marks its Philippine occurrence as doubtful');
    fact('Life form', s.lf ? esc(s.lf) : null);
    fact('Native range', s.rg ? esc(s.rg) : null);
    fact('Islands', s.ci && s.ci.length
      ? s.ci.map(function (t) { return '<button type="button" class="isl" data-t="' + esc(t) + '" title="Show the species of this family on ' + esc(titleCase(t)) + '">' + esc(titleCase(t)) + '</button>'; }).join(' · ') + ' <span class="cred">— CDFP</span>'
      : (s.c === 'not listed' ? 'Not listed by CDFP, so no island record here' : 'CDFP gives no island for it'));
    fact('CDFP', s.c === 'listed' ? 'Listed under this name'
      : /^as /.test(s.c) ? 'Listed under the synonym <em>' + esc(s.c.slice(3)) + '</em>'
      : 'Not listed — a name to check');
    right.appendChild(facts);
    if (onIsland) [].forEach.call(facts.querySelectorAll('button.isl'), function (b) {
      b.addEventListener('click', function () { onIsland(b.getAttribute('data-t')); });
    });

    // GBIF, live
    var gb = el('div', 'spgbif');
    var gbHead = el('div', 'gbhead');
    gbHead.appendChild(el('span', 'h', 'GBIF records in the Philippines'));
    var tog = el('label', 'gbtoggle');
    var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!state.spobs;
    tog.appendChild(cb);
    tog.appendChild(document.createTextNode(' include field observations'));
    gbHead.appendChild(tog);
    gb.appendChild(gbHead);
    var gbLine = el('p', 'gbline', 'Asking GBIF…');
    gb.appendChild(gbLine);
    var photos = el('div', 'gbphotos');
    gb.appendChild(photos);
    right.appendChild(gb);

    var links = el('div', 'splinks');
    function link(label, href) { var a = el('a', null, label); a.href = href; a.target = '_blank'; a.rel = 'noopener'; links.appendChild(a); return a; }
    if (s.powo) link('Kew POWO', 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:' + s.powo);
    var gLink = link('Search GBIF', 'https://www.gbif.org/species/search?q=' + encodeURIComponent(s.n));
    var fp = BY_NAME[fam] && BY_NAME[fam].cdfp_url;
    if (fp) link('CDFP family page', fp);
    right.appendChild(links);
    d.appendChild(right);

    gbifKey(s.n).then(function (key) {
      if (!key) { gbLine.textContent = 'GBIF has no exact match for this name, so no records are shown.'; return; }
      gLink.textContent = 'GBIF species';
      gLink.href = 'https://www.gbif.org/species/' + key;
      link('All GBIF records in PH', 'https://www.gbif.org/occurrence/search?taxon_key=' + key + '&country=PH');
      function showRecords() {
        gbLine.textContent = 'Asking GBIF…';
        var asks = [gbifRecords(key, false)];
        // observations: the records when ticked, otherwise just their number
        asks.push(cb.checked ? gbifRecords(key, true)
          : gbifJson(GBIF + 'occurrence/search?taxonKey=' + key + PH_FILTER + '&limit=0&basisOfRecord=HUMAN_OBSERVATION'));
        Promise.all(asks).then(function (res) {
          var all = res[0].results.concat(cb.checked ? res[1].results : []);
          plotRecords(svg, all);
          var spec = res[0].count, obs = res[1].count;
          var years = all.map(function (r) { return r.year; }).filter(Boolean);
          var shown = all.length < spec + (cb.checked ? obs : 0) ? ' The map shows the first ' + num(all.length) + '.' : '';
          gbLine.innerHTML = '<strong>' + num(spec) + '</strong> herbarium ' + plural(spec, 'specimen') +
            ' and <strong>' + num(obs) + '</strong> field ' + plural(obs, 'observation') + ' with coordinates' +
            (years.length ? '; mapped records span ' + Math.min.apply(null, years) + '–' + Math.max.apply(null, years) : '') + '.' +
            (!cb.checked && obs ? ' Tick <em>include field observations</em> to map them.' : '') +
            shown + ' <span class="warn">Not checked: GBIF records include misidentifications and misplaced points.</span>';
        }).catch(function (e) { gbLine.textContent = 'GBIF did not answer (' + e.message + '). Try again later.'; });
      }
      cb.addEventListener('change', function () { state.spobs = cb.checked; showRecords(); });
      showRecords();

      gbifPhotos(key).then(function (res) {
        var n = 0;
        res.results.forEach(function (r) {
          (r.media || []).forEach(function (m) {
            if (n >= 8 || m.type !== 'StillImage' || !m.identifier) return;
            n++;
            var a = el('a', 'ph');
            a.href = 'https://www.gbif.org/occurrence/' + r.key;
            a.target = '_blank'; a.rel = 'noopener';
            var img = el('img');
            img.loading = 'lazy';
            img.alt = s.n + ', ' + (r.basisOfRecord === 'PRESERVED_SPECIMEN' ? 'herbarium specimen' : 'photograph') + (r.year ? ', ' + r.year : '');
            img.src = GBIF + 'image/cache/200x200/occurrence/' + r.key + '/media/' + md5(m.identifier);
            // GBIF's image cache can refuse a burst of requests: retry once, then say so plainly
            img.onerror = function () {
              if (!img.dataset.retried) {
                img.dataset.retried = '1';
                var src = img.src;          // the cache refuses extra query text, so re-set the same address
                img.removeAttribute('src');
                setTimeout(function () { img.src = src; }, 2500);
              } else {
                a.classList.add('failed');
                img.remove();
                a.insertBefore(el('span', 'fail', 'Photo not available just now — open on GBIF'), a.firstChild);
              }
            };
            a.appendChild(img);
            var who = m.rightsHolder || m.creator || r.institutionCode || r.publisher || '';
            a.appendChild(el('span', 'cap', (who ? '© ' + who + ' · ' : '') + licenceShort(m.license || r.license)));
            a.title = (who ? '© ' + who + ', ' : '') + licenceShort(m.license || r.license) + '. Open this ' +
              (r.basisOfRecord === 'PRESERVED_SPECIMEN' ? 'herbarium specimen' : 'observation') + ' on GBIF.';
            photos.appendChild(a);
          });
        });
        if (!n) photos.appendChild(el('p', 'nomap', 'No photographs on GBIF for this species in the Philippines.'));
      }).catch(function () { /* photos are optional */ });
    }).catch(function (e) { gbLine.textContent = 'GBIF did not answer (' + e.message + '). Try again later.'; });

    return d;
  }

  function panelSpecies(p, f) {
    var wait = el('p', 'keyintro', 'Loading the species of ' + f.family + '…');
    p.appendChild(wait);
    Promise.all([loadSpecies(f.family), loadSpeciesIndex()]).then(function (res) {
      var data = res[0];
      if (state.family !== f.family || state.tab !== 'species') return;
      p.textContent = '';
      renderSpecies(p, f, data);
    }).catch(function (e) {
      wait.textContent = 'The species list could not be loaded (' + e.message + ').';
    });
  }

  function renderSpecies(p, f, data) {
    var c = data.counts, sp = data.species;
    var lead = el('p', 'keyintro');
    if (!sp.length) {
      lead.innerHTML = 'Kew’s World Checklist of Vascular Plants places no Philippine species in ' + esc(f.family) +
        ' as this app defines it.' + (c.cdfp_only ? ' CDFP lists ' + c.cdfp_only + ' name' + (c.cdfp_only > 1 ? 's' : '') + ' here that Kew does not accept for the Philippines.' : '');
      p.appendChild(lead);
      p.appendChild(speciesSources());
      return;
    }
    lead.innerHTML = 'Kew’s World Checklist of Vascular Plants accepts <strong>' + num(c.species) + '</strong> ' +
      plural(c.species, 'species') + ' of ' + esc(f.family) + ' for the Philippines: ' + num(c.native) + ' native, <strong>' +
      num(c.endemic) + '</strong> of them endemic' + (c.introduced ? ', and ' + num(c.introduced) + ' introduced' : '') + '. ' +
      'Open a species for its islands, its GBIF records and photographs. ' +
      '<a href="#species">Search all Philippine species by island →</a>';
    p.appendChild(lead);
    var cmp = el('p', 'keyintro');
    cmp.innerHTML = 'Cross-check with CDFP, the source of this app’s family figures (' + num(f.species) + ' species): it lists ' +
      num(c.cdfp_listed) + ' of Kew’s ' + num(c.species) + ', some under another name' +
      (c.cdfp_only ? ', and ' + num(c.cdfp_only) + ' more that Kew does not accept for the Philippines' : '') +
      '. Disagreements are worth a taxonomist’s look; neither list is assumed right.';
    p.appendChild(cmp);
    speciesExplorer(p, sp, { family: f.family });
    p.appendChild(speciesSources());
  }

  /* The filterable species list: used on a family's Species tab (ctx.family set)
     and on the flora-wide page (ctx.family null, where each row carries s.f). */
  function speciesExplorer(p, sp, ctx) {
    var flora = !ctx.family;
    var famOf = function (s) { return s.f || ctx.family; };
    // alphabetise hybrids by the name after the multiplication sign, as botanists do
    var sortName = function (s) { return s.n.replace(/^×\s*/, ''); };
    var byName = function (a, b) { return sortName(a).localeCompare(sortName(b)); };
    var STATUS = [['all', 'All', function () { return true; }],
      ['endemic', 'Endemic', function (s) { return s.e; }],
      ['introduced', 'Introduced', function (s) { return s.i; }],
      ['nocdfp', 'Not in CDFP', function (s) { return s.c === 'not listed'; }]];
    var MODES = [['any', 'Found on'], ['only', 'Only on'], ['also', 'Also elsewhere'], ['every', 'On all of these']];
    if (!state.spisl) state.spisl = [];
    var filt = state.spf || 'all', sortBy = state.sps || 'az', mode = state.spmode || 'any';
    var famFilter = flora ? (state.spfam || '') : '';
    var PAGE = 200, shownMax = PAGE;

    var panel = el('div', 'spfilter');
    panel.setAttribute('role', 'search');

    // row 1: search + sort
    var r1 = el('div', 'fr');
    var qWrap = el('div', 'fsearch');
    qWrap.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4.5 4.5"/></svg>';
    var q = el('input');
    q.type = 'search';
    q.placeholder = flora ? 'Filter by species, genus or family' : 'Filter by name';
    q.setAttribute('aria-label', 'Filter species by name');
    q.value = state.spq || '';
    qWrap.appendChild(q);
    r1.appendChild(qWrap);
    var sortSel = el('select', 'fselect');
    sortSel.setAttribute('aria-label', 'Sort species');
    [['az', 'Sort: A–Z'], ['isl', 'Sort: most islands'], ['fewisl', 'Sort: fewest islands']]
      .concat(flora ? [['fam', 'Sort: by family']] : []).forEach(function (o) {
        var op = el('option', null, o[1]); op.value = o[0]; if (o[0] === sortBy) op.selected = true; sortSel.appendChild(op);
      });
    r1.appendChild(sortSel);
    panel.appendChild(r1);

    function segmented(label, items, current, onPick) {
      var row = el('div', 'fr');
      row.appendChild(el('span', 'flabel', label));
      var seg = el('div', 'seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', label);
      items.forEach(function (it) {
        var b = el('button', null);
        b.type = 'button';
        b.appendChild(document.createTextNode(it[1]));
        if (it[2] != null) b.appendChild(el('span', 'n', num(it[2])));
        b.setAttribute('aria-pressed', it[0] === current ? 'true' : 'false');
        b.addEventListener('click', function () {
          [].forEach.call(seg.children, function (x) { x.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true');
          onPick(it[0]);
        });
        seg.appendChild(b);
      });
      row.appendChild(seg);
      return row;
    }
    panel.appendChild(segmented('Status', STATUS.filter(function (s) { return s[0] === 'all' || sp.some(s[2]); })
      .map(function (s) { return [s[0], s[1], sp.filter(s[2]).length]; }), filt,
      function (v) { filt = v; state.spf = v; draw(true); }));

    // flora-wide only: a family filter
    if (flora) {
      var famCount = {};
      sp.forEach(function (s) { famCount[s.f] = (famCount[s.f] || 0) + 1; });
      var rf = el('div', 'fr');
      rf.appendChild(el('span', 'flabel', 'Family'));
      var famSel = el('select', 'fselect');
      famSel.setAttribute('aria-label', 'Filter by family');
      var all = el('option', null, 'All families (' + Object.keys(famCount).length + ')'); all.value = ''; famSel.appendChild(all);
      Object.keys(famCount).sort().forEach(function (fa) {
        var op = el('option', null, fa + '  (' + num(famCount[fa]) + ')'); op.value = fa;
        if (fa === famFilter) op.selected = true;
        famSel.appendChild(op);
      });
      famSel.addEventListener('change', function () { famFilter = famSel.value; state.spfam = famFilter; draw(true); });
      rf.appendChild(famSel);
      panel.appendChild(rf);
    }

    // distribution - islands (from CDFP) and how to match them
    var islCount = {};
    sp.forEach(function (s) { s.ci.forEach(function (t) { islCount[t] = (islCount[t] || 0) + 1; }); });
    var islands = Object.keys(islCount).sort(function (a, b) { return islCount[b] - islCount[a] || a.localeCompare(b); });
    var r3 = el('div', 'fr fdist');
    r3.appendChild(el('span', 'flabel', 'Islands'));
    var distBox = el('div', 'fdistbox');
    var picked = el('div', 'picked');
    var add = el('select', 'fselect');
    add.setAttribute('aria-label', 'Add an island to the filter');
    distBox.appendChild(picked);
    distBox.appendChild(add);
    r3.appendChild(distBox);
    panel.appendChild(r3);
    var modeRow = el('div', 'fr fmode');
    panel.appendChild(modeRow);
    var modeHint = el('p', 'fhint');
    panel.appendChild(modeHint);

    function drawIslands() {
      picked.textContent = '';
      state.spisl.forEach(function (t) {
        var b = el('button', 'ipick');
        b.type = 'button';
        b.appendChild(document.createTextNode(titleCase(t)));
        b.appendChild(el('span', 'x', '×'));
        b.setAttribute('aria-label', 'Remove ' + titleCase(t) + ' from the filter');
        b.addEventListener('click', function () {
          state.spisl = state.spisl.filter(function (x) { return x !== t; });
          drawIslands(); draw(true);
        });
        picked.appendChild(b);
      });
      add.textContent = '';
      var first = el('option', null, state.spisl.length ? '+ add another island' : 'Choose an island…');
      first.value = '';
      add.appendChild(first);
      islands.forEach(function (t) {
        if (state.spisl.indexOf(t) !== -1) return;
        var op = el('option', null, titleCase(t) + '  (' + num(islCount[t]) + ')');
        op.value = t;
        add.appendChild(op);
      });
      modeRow.textContent = '';
      modeHint.textContent = '';
      if (!state.spisl.length) { modeRow.hidden = true; modeHint.hidden = true; return; }
      modeRow.hidden = false; modeHint.hidden = false;
      var modes = MODES.filter(function (m) { return m[0] !== 'every' || state.spisl.length > 1; });
      if (!modes.some(function (m) { return m[0] === mode; })) mode = 'any';
      var seg = segmented('Match', modes, mode, function (v) { mode = v; state.spmode = v; hint(); draw(true); });
      [].slice.call(seg.childNodes).forEach(function (n) { modeRow.appendChild(n); });   // copy first: moving nodes empties the live list
      hint();
    }
    function hint() {
      var names = sentence(state.spisl.map(titleCase)).replace(/ and ([^ ]+)$/, (state.spisl.length > 1 && mode !== 'every' ? ' or ' : ' and ') + '$1');
      modeHint.textContent = {
        any: 'Species CDFP records from ' + names + ', whether or not they occur elsewhere.',
        only: 'Species CDFP records from ' + names + ' and from no other island.',
        also: 'Species CDFP records from ' + names + ' and from at least one other island as well.',
        every: 'Species CDFP records from every one of ' + names + '.',
      }[mode] + ' Island records are CDFP’s; nearby islets (for example Busuanga or Culion off Palawan) count as separate islands.';
    }
    add.addEventListener('change', function () {
      if (!add.value) return;
      state.spisl = state.spisl.concat([add.value]);
      drawIslands(); draw(true);
    });
    drawIslands();
    p.appendChild(panel);

    // result line: count + download
    var resRow = el('div', 'spresult');
    var count = el('div', 'spcount');
    resRow.appendChild(count);
    var dl = el('button', 'dlbtn');
    dl.type = 'button';
    dl.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10M5.5 8.5L10 13l4.5-4.5M4 16.5h12"/></svg>Download this list (CSV)';
    resRow.appendChild(dl);
    p.appendChild(resRow);
    var list = el('ul', 'splist' + (flora ? ' flora' : ''));
    p.appendChild(list);
    var more = el('div', 'spmore');
    p.appendChild(more);

    function islandTest(s) { return islandMatch(s.ci, state.spisl, mode); }
    var current = [];
    var open = state.spopen || null;
    function draw(reset) {
      if (reset) shownMax = PAGE;
      var needle = q.value.trim().toLowerCase();
      var fn = STATUS.filter(function (x) { return x[0] === filt; })[0][2];
      var rows = sp.filter(function (s) {
        return fn(s) && (!famFilter || s.f === famFilter) && islandTest(s) &&
          (!needle || s.n.toLowerCase().indexOf(needle) !== -1 || (flora && s.f.toLowerCase().indexOf(needle) !== -1));
      });
      if (sortBy === 'isl') rows = rows.slice().sort(function (a, b) { return b.ci.length - a.ci.length || byName(a, b); });
      if (sortBy === 'fewisl') rows = rows.slice().sort(function (a, b) { return (a.ci.length || 999) - (b.ci.length || 999) || byName(a, b); });
      if (sortBy === 'fam') rows = rows.slice().sort(function (a, b) { return a.f.localeCompare(b.f) || byName(a, b); });
      if (sortBy === 'az') rows = rows.slice().sort(byName);
      current = rows;
      count.innerHTML = rows.length === sp.length ? '<strong>' + num(sp.length) + '</strong> species'
        : '<strong>' + num(rows.length) + '</strong> of ' + num(sp.length) + ' species' +
          (flora ? ' in ' + num(Object.keys(rows.reduce(function (m, s) { m[s.f] = 1; return m; }, {})).length) + ' ' +
            plural(Object.keys(rows.reduce(function (m, s) { m[s.f] = 1; return m; }, {})).length, 'family', 'families') : '');
      dl.disabled = !rows.length;
      list.textContent = '';
      rows.slice(0, shownMax).forEach(function (s) {
        var key = famOf(s) + '|' + s.id;
        var li = el('li', 'sprow' + (open === key ? ' open' : ''));
        var b = el('button', 'sphead');
        b.type = 'button';
        b.setAttribute('aria-expanded', open === key ? 'true' : 'false');
        var nm = el('span', 'spname');
        nm.appendChild(el('em', null, s.n));
        if (s.au) nm.appendChild(el('span', 'au', ' ' + s.au));
        if (flora) nm.appendChild(el('span', 'fam', s.f));
        b.appendChild(nm);
        var tags = el('span', 'sptags');
        if (s.e) tags.appendChild(el('span', 'tag end', 'endemic'));
        if (s.i) tags.appendChild(el('span', 'tag intro', 'introduced'));
        if (s.c === 'not listed') tags.appendChild(el('span', 'tag nocdfp', 'not in CDFP'));
        b.appendChild(tags);
        b.appendChild(el('span', 'sprec', s.ci.length ? s.ci.length + ' ' + plural(s.ci.length, 'island') : '—'));
        b.addEventListener('click', function () {
          open = open === key ? null : key;
          state.spopen = open;
          draw(false);
        });
        li.appendChild(b);
        if (open === key) {
          var det = speciesDetail(s, famOf(s), function (tok) {
            if (state.spisl.indexOf(tok) === -1) state.spisl = state.spisl.concat([tok]);
            drawIslands(); draw(true);
            panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          });
          if (flora) {
            var fl = el('a', 'tofam', 'Open ' + s.f + ' →');
            fl.href = '#' + encodeURIComponent(s.f) + '/species';
            det.querySelector('.splinks').insertBefore(fl, det.querySelector('.splinks').firstChild);
          }
          li.appendChild(det);
        }
        list.appendChild(li);
      });
      if (!rows.length) list.appendChild(el('li', 'spempty', 'No species match these filters.'));
      more.textContent = '';
      if (rows.length > shownMax) {
        var mb = el('button', 'dlbtn', 'Show ' + num(Math.min(PAGE, rows.length - shownMax)) + ' more');
        mb.type = 'button';
        mb.addEventListener('click', function () { shownMax += PAGE; draw(false); });
        more.appendChild(mb);
        var ab = el('button', 'linkbtn', 'show all ' + num(rows.length));
        ab.type = 'button';
        ab.addEventListener('click', function () { shownMax = rows.length; draw(false); });
        more.appendChild(ab);
        more.appendChild(el('span', 'spcount', 'showing ' + num(shownMax) + ' of ' + num(rows.length)));
      }
    }

    // the current list as a spreadsheet file, with its sources written into it
    dl.addEventListener('click', function () {
      var cell = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var desc = [ctx.family || (famFilter || 'All Philippine species')];
      if (filt !== 'all') desc.push(STATUS.filter(function (x) { return x[0] === filt; })[0][1]);
      if (state.spisl.length) desc.push(MODES.filter(function (m) { return m[0] === mode; })[0][1] + ' ' + state.spisl.map(titleCase).join(' + '));
      if (q.value.trim()) desc.push('name contains "' + q.value.trim() + '"');
      var lines = [
        ['# ' + desc.join(' · ') + ' — ' + current.length + ' species. Exported ' + new Date().toISOString().slice(0, 10) + ' from the PH·FLORA working draft (not for citation).'],
        ['# Species and status: World Checklist of Vascular Plants, Royal Botanic Gardens, Kew (CC BY 4.0). Islands: Co’s Digital Flora of the Philippines (Pelser, Barcelona & Nickrent, 2011 onwards).'],
        ['species', 'authors', 'family', 'status', 'islands (CDFP)', 'CDFP listing', 'Kew POWO'],
      ];
      current.forEach(function (s) {
        lines.push([s.n, s.au, famOf(s), s.i ? 'introduced' : s.e ? 'endemic' : 'native',
          s.ci.map(titleCase).join('; '),
          s.c === 'listed' ? 'listed' : /^as /.test(s.c) ? 'listed as ' + s.c.slice(3) : 'not listed',
          s.powo ? 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:' + s.powo : '']);
      });
      var csv = '﻿' + lines.map(function (r) { return r.map(cell).join(','); }).join('\r\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = desc.join(' ').replace(/[^A-Za-z0-9+ -]+/g, '').replace(/\s+/g, '-').slice(0, 90) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });

    var t;
    q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.spq = q.value; draw(true); }, 120); });
    sortSel.addEventListener('change', function () { sortBy = sortSel.value; state.sps = sortBy; draw(true); });
    draw(true);
  }

  // ------------------------------------------------ the flora-wide species page (#species)
  var ALLSP = null;
  function loadAllSpecies() {
    if (!ALLSP) {
      ALLSP = fetch('data/species-all.json' + (VERSION ? '?v=' + VERSION : ''))
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      ALLSP.catch(function () { ALLSP = null; });
    }
    return ALLSP;
  }
  function renderAllSpecies() {
    var stage = document.getElementById('stage');
    stage.textContent = '';
    document.title = 'Species of the Philippines — PH·FLORA';
    var nav = el('nav', 'sheetnav');
    var back = el('a', 'back', '← Overview'); back.href = '#';
    nav.appendChild(back);
    stage.appendChild(nav);
    var sheet = el('article', 'sheet');
    var head = el('div', 'sheet-head');
    head.appendChild(el('div', 'eyebrow', 'All 294 families'));
    head.appendChild(el('h1', null, 'Species of the Philippines'));
    sheet.appendChild(head);
    var p = el('div', 'panel');
    var wait = el('p', 'keyintro', 'Loading 9,900 species…');
    p.appendChild(wait);
    sheet.appendChild(p);
    stage.appendChild(sheet);
    Promise.all([loadAllSpecies(), loadSpeciesIndex()]).then(function (res) {
      if (!state.allsp) return;
      var sp = res[0].species, T = null;
      p.textContent = '';
      var lead = el('p', 'keyintro');
      var end = sp.filter(function (s) { return s.e; }).length, intro = sp.filter(function (s) { return s.i; }).length;
      lead.innerHTML = 'Every species Kew’s World Checklist of Vascular Plants accepts for the Philippines — <strong>' + num(sp.length) +
        '</strong>, of which <strong>' + num(end) + '</strong> are endemic and ' + num(intro) + ' introduced — placed in this ' +
        'app’s 294 families. Choose islands below to build a list, for example every species known <em>only</em> from Palawan, ' +
        'and download it.';
      p.appendChild(lead);
      speciesExplorer(p, sp, { family: null });
      p.appendChild(speciesSources());
    }).catch(function (e) { wait.textContent = 'The species list could not be loaded (' + e.message + ').'; });
  }

  function speciesSources() {
    var s = el('div', 'srcline');
    var src = SPX_META || {};
    s.innerHTML = 'Species list: ' + esc(src.wcvp || 'World Checklist of Vascular Plants, Royal Botanic Gardens, Kew (CC BY 4.0)') + '. ' +
      'Islands: ' + esc(src.cdfp || 'Co’s Digital Flora of the Philippines') + ' ' +
      'Records and photographs: fetched live from <a href="https://www.gbif.org" target="_blank" rel="noopener">GBIF.org</a>, each photograph ' +
      'credited to its owner under its own licence; they are shown as published and have not been checked.';
    return s;
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

  /* One matching rule for every island filter in the app, so the map and the
     species lists can never disagree. sel: chosen island tokens; ci: a
     species' CDFP island tokens. */
  var MATCH_MODES = [['any', 'Found on'], ['only', 'Only on'], ['also', 'Also elsewhere'], ['every', 'On all of these']];
  function islandMatch(ci, sel, mode) {
    if (!sel.length) return true;
    if (!ci || !ci.length) return false;
    var hits = ci.filter(function (t) { return sel.indexOf(t) !== -1; }).length;
    if (mode === 'only') return hits > 0 && hits === ci.length;
    if (mode === 'also') return hits > 0 && hits < ci.length;
    if (mode === 'every') return sel.every(function (t) { return ci.indexOf(t) !== -1; });
    return hits > 0;
  }
  function matchSentence(sel, mode) {
    var names = sentence(sel.map(titleCase)).replace(/ and ([^ ]+)$/, (sel.length > 1 && mode !== 'every' ? ' or ' : ' and ') + '$1');
    return {
      any: 'recorded from ' + names + ', whether or not they occur elsewhere',
      only: 'recorded from ' + names + ' and from no other island',
      also: 'recorded from ' + names + ' and from at least one other island as well',
      every: 'recorded from every one of ' + names,
    }[mode] || '';
  }

  function panelDistribution(p, f) {
    if (!f.islands.length) {
      p.appendChild(el('p', 'missing', 'CDFP records no island-level distribution for this family.'));
      return;
    }
    var M = DATA.map;
    var famCounts = {};
    f.islands.forEach(function (i) { famCounts[i.name] = i.count; });
    var famMax = f.islands[0].count || 1;
    if (!state.spisl) state.spisl = [];
    var mode = state.spmode || 'any';
    var SPD = null;              // this family's species, once loaded (for filtering)
    var view = null;             // what the map currently shades: { counts, max, filtered }

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

    // land: one silhouette; the shaded islands, the focus veil, the chosen islands'
    // outlines, the coastline and the names are separate layers above it
    var land = svgEl('g', { class: 'land', filter: 'url(#land-shadow)' });
    land.appendChild(svgEl('path', { d: M.polys.join(''), class: 'base' }));
    svg.appendChild(land);
    var hits = svgEl('g', { class: 'hits' });
    svg.appendChild(hits);
    // Focus: a translucent veil over the whole map, with the chosen island's
    // polygons copied above it (dimming each polygon separately would show the
    // province borders where neighbouring fills overlap).
    var veil = svgEl('rect', { x: 0, y: 0, width: W, height: H, class: 'veil' });
    svg.appendChild(veil);
    var litLayer = svgEl('g', { class: 'litlayer' });
    svg.appendChild(litLayer);
    svg.appendChild(svgEl('path', { d: M.coast, class: 'coast' }));
    var selLayer = svgEl('g', { class: 'sellayer' });
    svg.appendChild(selLayer);
    var lg = svgEl('g', { class: 'labels' });
    svg.appendChild(lg);

    // scale bar (0-200 km) and north arrow
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
    svg.appendChild(svgEl('rect', { x: 5.5, y: 5.5, width: W - 11, height: H - 11, class: 'neatline' }));
    fig.appendChild(svg);

    var tip = el('div', 'maptip');
    tip.hidden = true;
    fig.appendChild(tip);

    // legend (redrawn when the map switches between family and filtered shading)
    var leg = el('figcaption', 'maplegend');
    var lrow = el('div', 'lrow');
    leg.appendChild(lrow);
    var placed = f.islands.filter(function (i) { return i.mapped; }).length;
    var mapnote = el('p', 'mapnote');
    leg.appendChild(mapnote);
    fig.appendChild(leg);
    wrap.appendChild(fig);

    // ------------------------------------------------ the shaded islands
    var hitPaths = {};
    var NOMATCH = '#DCE3D5';
    function drawHits() {
      hits.textContent = '';
      hitPaths = {};
      var shade = function (n) { return rampColour(Math.sqrt(n / view.max)); };
      // every island the family is recorded from stays drawn (and clickable);
      // under a filter, those with no matching species are drawn pale
      var cover = {};
      Object.keys(M.islands).forEach(function (tok) {
        if (!famCounts[tok]) return;
        M.islands[tok].forEach(function (pi) { (cover[pi] = cover[pi] || []).push(tok); });
      });
      Object.keys(cover).forEach(function (pi) {
        var toks = cover[pi].sort(function (a, b) { return (view.counts[b] || 0) - (view.counts[a] || 0) || famCounts[b] - famCounts[a]; });
        var n = view.counts[toks[0]] || 0;
        var colour = n ? shade(n) : NOMATCH;
        var path = svgEl('path', { d: M.polys[pi], class: 'hit' + (n ? '' : ' none'), fill: colour, stroke: colour, 'data-toks': toks.join('|') });
        hits.appendChild(path);
        toks.forEach(function (t) { (hitPaths[t] = hitPaths[t] || []).push(path); });
      });

      // island names: the islands big enough to carry a label, most species first
      lg.textContent = '';
      var boxes = [];
      Object.keys(view.counts).filter(function (t) { return view.counts[t] && M.labels[t] && M.labels[t][2] >= 16; })
        .sort(function (a, b) { return view.counts[b] - view.counts[a] || M.labels[b][2] - M.labels[a][2]; })
        .slice(0, 9)
        .forEach(function (tok) {
          var L = M.labels[tok], name = titleCase(tok).replace(' (Metro Manila)', '');
          var w = name.length * 5.4 + 4, h = 12, bx = [L[0] - w / 2, L[1] - h / 2, L[0] + w / 2, L[1] + h / 2];
          if (boxes.some(function (b) { return !(bx[2] < b[0] || bx[0] > b[2] || bx[3] < b[1] || bx[1] > b[3]); })) return;
          boxes.push(bx);
          var size = Math.max(10, Math.min(13.5, 8.5 + L[2] / 45));
          lg.appendChild(svgEl('text', { x: L[0], y: L[1] + 4, 'text-anchor': 'middle', class: 'isle-name', 'font-size': size.toFixed(1) }, name));
        });

      // the chosen islands, outlined
      selLayer.textContent = '';
      state.spisl.forEach(function (t) {
        (M.islands[t] || []).forEach(function (pi) { selLayer.appendChild(svgEl('path', { d: M.polys[pi], class: 'selpoly' })); });
      });

      // legend
      lrow.textContent = '';
      var none = el('span', 'none');
      none.appendChild(el('span', 'sw'));
      none.appendChild(document.createTextNode('not recorded'));
      lrow.appendChild(none);
      if (view.filtered) {
        var nm = el('span', 'none');
        var sw2 = el('span', 'sw'); sw2.style.background = NOMATCH; sw2.style.borderColor = '#C4CDBD';
        nm.appendChild(sw2);
        nm.appendChild(document.createTextNode('recorded, none match'));
        lrow.appendChild(nm);
      }
      var rr = el('span', 'rr');
      var bar = el('div', 'ramp');
      bar.style.background = 'linear-gradient(90deg,' + [0, 0.25, 0.5, 0.75, 1].map(rampColour).join(',') + ')';
      rr.appendChild(el('span', 'lo', '1'));
      rr.appendChild(bar);
      rr.appendChild(el('span', 'hi', num(view.max) + ' ' + (view.filtered ? 'matching' : plural(view.max, 'species'))));
      lrow.appendChild(rr);
      mapnote.textContent = view.filtered
        ? 'Shading follows how many of the matching species CDFP records from each island. Outlined: the islands you chose. ' +
          'Click islands to change the choice. Coastlines: Natural Earth 1:10m, public domain.'
        : 'Shading follows the number of this family’s species CDFP records from each island. ' + placed + ' of ' +
          f.islands.length + ' recorded ' + plural(f.islands.length, 'island') + ' can be drawn at this scale; every one is ' +
          'listed by name. Click an island to filter by it. Coastlines: Natural Earth 1:10m, public domain.';
    }

    // ------------------------------------------------ the list column
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

    // the island filter, shared with the Species tab
    var box = el('div', 'dfilter');
    var bhead = el('div', 'dhead');
    bhead.appendChild(el('span', 'h', 'Filter by island'));
    var clearB = el('button', 'linkbtn', 'Clear');
    clearB.type = 'button';
    bhead.appendChild(clearB);
    box.appendChild(bhead);
    var tags = el('div', 'dtags');
    box.appendChild(tags);
    var modeRow = el('div', 'seg dseg');
    modeRow.setAttribute('role', 'group');
    modeRow.setAttribute('aria-label', 'How to match the chosen islands');
    box.appendChild(modeRow);
    var result = el('div', 'dresult');
    box.appendChild(result);
    list.appendChild(box);

    var set = el('div', 'chipset');
    var chips = {};
    f.islands.forEach(function (i) {
      var c = el(i.mapped ? 'button' : 'span', 'ichip' + (i.mapped ? ' mapped' : ''));
      if (i.mapped) {
        c.type = 'button';
        var sw = el('span', 'sw');
        sw.style.background = rampColour(Math.sqrt(i.count / famMax));
        c.appendChild(sw);
        c.setAttribute('aria-label', titleCase(i.name) + ', ' + i.count + ' ' + plural(i.count, 'species') + '. Filter by this island');
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
      'A species recorded from several islands is counted under each. Filtered counts come from the Species tab’s list ' +
      '(Kew’s names with CDFP’s islands), so they can differ slightly from the family totals.';
    list.appendChild(cap);
    wrap.appendChild(list);
    p.appendChild(wrap);

    // ------------------------------------------------ applying the filter
    function toggleIsland(tok) {
      state.spisl = state.spisl.indexOf(tok) === -1 ? state.spisl.concat([tok]) : state.spisl.filter(function (x) { return x !== tok; });
      apply();
    }
    function apply() {
      var sel = state.spisl;
      box.classList.toggle('on', !!sel.length);
      Object.keys(chips).forEach(function (t) { chips[t].classList.toggle('sel', sel.indexOf(t) !== -1); });

      tags.textContent = '';
      if (!sel.length) {
        tags.appendChild(el('p', 'dempty', 'Click an island on the map or in the list below to see which species grow there — and only there, or also elsewhere.'));
      }
      sel.forEach(function (t) {
        var b = el('button', 'ipick');
        b.type = 'button';
        b.appendChild(document.createTextNode(titleCase(t)));
        b.appendChild(el('span', 'x', '×'));
        b.setAttribute('aria-label', 'Remove ' + titleCase(t) + ' from the filter');
        b.addEventListener('click', function () { toggleIsland(t); });
        tags.appendChild(b);
      });

      modeRow.textContent = '';
      modeRow.hidden = !sel.length;
      var modes = MATCH_MODES.filter(function (m) { return m[0] !== 'every' || sel.length > 1; });
      if (!modes.some(function (m) { return m[0] === mode; })) mode = 'any';
      modes.forEach(function (m) {
        var b = el('button', null, m[1]);
        b.type = 'button';
        b.setAttribute('aria-pressed', m[0] === mode ? 'true' : 'false');
        b.addEventListener('click', function () { mode = m[0]; state.spmode = mode; apply(); });
        modeRow.appendChild(b);
      });

      result.textContent = '';
      if (!sel.length || !SPD) {
        view = { counts: famCounts, max: famMax, filtered: false };
        if (sel.length && !SPD) result.appendChild(el('p', 'dempty', 'Loading this family’s species…'));
        drawHits();
        return;
      }
      var matching = SPD.species.filter(function (s) { return islandMatch(s.ci, sel, mode); })
        .sort(function (a, b) { return a.n.localeCompare(b.n); });
      var counts = {}, max = 0;
      matching.forEach(function (s) { s.ci.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; max = Math.max(max, counts[t]); }); });
      view = { counts: counts, max: max || 1, filtered: true };
      drawHits();

      var head = el('p', 'dcount');
      head.innerHTML = '<strong>' + num(matching.length) + '</strong> ' + plural(matching.length, 'species') + ' of ' + esc(f.family) +
        ' ' + esc(matchSentence(sel, mode)) + '.';
      result.appendChild(head);
      if (matching.length) {
        var ul = el('ul', 'dnames');
        matching.slice(0, 12).forEach(function (s) {
          var li = el('li');
          li.appendChild(el('em', null, s.n));
          if (s.e) li.appendChild(el('span', 'tag end', 'endemic'));
          ul.appendChild(li);
        });
        result.appendChild(ul);
        var go = el('a', 'dgo', matching.length > 12 ? 'All ' + num(matching.length) + ' in the Species tab →' : 'Open them in the Species tab →');
        go.href = '#' + encodeURIComponent(f.family) + '/species';
        result.appendChild(go);
      }
    }
    clearB.addEventListener('click', function () { state.spisl = []; apply(); });

    // ------------------------------------------------ hover and click
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
        row.appendChild(el('span', 'ct', view.filtered
          ? num(view.counts[t] || 0) + ' of ' + num(famCounts[t]) + ' match'
          : famCounts[t] + ' ' + plural(famCounts[t], 'species')));
        tip.appendChild(row);
      });
      tip.appendChild(el('div', 'act', state.spisl.indexOf(mostSpecific(toks)) === -1 ? 'Click to filter by ' + titleCase(mostSpecific(toks)) : 'Click to remove from the filter'));
      tip.hidden = false;
      var r = fig.getBoundingClientRect();
      var x = evt.clientX - r.left, y = evt.clientY - r.top;
      tip.style.left = Math.min(x + 14, r.width - tip.offsetWidth - 6) + 'px';
      tip.style.top = Math.max(6, y - tip.offsetHeight - 10) + 'px';
    }
    // a polygon inside both ITBAYAT and BATANES is Itbayat: the token with the fewest polygons
    function mostSpecific(toks) {
      return toks.slice().sort(function (a, b) { return (M.islands[a] || []).length - (M.islands[b] || []).length; })[0];
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
    svg.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('.hits .hit');
      if (!t) return;
      toggleIsland(mostSpecific(t.getAttribute('data-toks').split('|')));
      clear();
    });
    Object.keys(chips).forEach(function (tok) {
      if (!M.islands[tok]) return;
      var c = chips[tok];
      var on = function () { clear(); current = [tok]; light([tok], true); };
      c.addEventListener('mouseenter', on);
      c.addEventListener('focus', on);
      c.addEventListener('mouseleave', clear);
      c.addEventListener('blur', clear);
      c.addEventListener('click', function () { toggleIsland(tok); });
    });

    apply();
    loadSpecies(f.family).then(function (data) {
      if (state.family !== f.family || state.tab !== 'dist') return;
      SPD = data;
      apply();
    }).catch(function () { /* the map still works without the species list */ });
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
    [['description', 'Description'], ['key', 'Key path'], ['species', 'Species'], ['genera', 'Genera'],
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
    else if (state.allsp) renderAllSpecies();
    else { document.title = 'Philippine Vascular Plant Families'; renderLanding(); }

    // Phone layout has three views: overview, the family list, one family.
    document.body.classList.toggle('family-open', open || !!state.allsp);
    document.body.classList.toggle('browsing', !open && state.browse);

    // Jump to the top when the view changes; keep the reader's place when
    // only a tab or a route changes.
    var view = open ? state.family : (state.browse ? '#families' : state.allsp ? '#species' : '');
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
    state.allsp = h === 'species';
    if (!h || state.browse || state.allsp) { state.family = null; state.tab = 'description'; return; }
    var parts = h.split('/');
    var fam = parts[0];
    if (!BY_NAME[fam]) { state.family = null; return; }
    if (fam !== state.family) { state.route = 0; state.spq = ''; state.spf = 'all'; state.spopen = null; }
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

    section('The Species tab', [
      para('The species list is Kew’s <strong>World Checklist of Vascular Plants</strong> (CC BY 4.0): every species it accepts for the ' +
        'Philippines, native or introduced. Island names come from <strong>Co’s Digital Flora of the Philippines</strong> (names only, ' +
        'credited on every list), and each species says whether CDFP lists it. <strong>GBIF</strong> records and photographs are fetched ' +
        'live when a species is opened: herbarium specimens by default, field observations on request. None of it has been checked, ' +
        'and GBIF records include misidentifications and misplaced points.')
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
      if (q.value.trim().length >= 3 && !SPX) loadSpeciesIndex().then(runSearch);
      if (PHONE.matches && q.value) showList();   // on a phone the results are the list view
      clearTimeout(t);
      t = setTimeout(runSearch, 90);
    });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        clearTimeout(t); runSearch();
        var hits = sorted(DATA.families.filter(matches));
        if (hits.length) {
          var viaSpecies = hits[0].family.toLowerCase().indexOf(state.q.toLowerCase()) === -1 && speciesHit(hits[0], state.q);
          if (viaSpecies) { state.spq = state.q; }
          location.hash = '#' + encodeURIComponent(hits[0].family) + (viaSpecies ? '/species' : '');
          if (viaSpecies) setTimeout(function () { state.spq = q.value.trim(); renderStage(true); }, 0);
          q.blur();
        }
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
  fetch('data/families.json' + (VERSION ? '?v=' + VERSION : ''))
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
