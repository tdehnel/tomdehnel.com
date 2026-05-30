/* Household Budget Questionnaire — app logic (vanilla JS, no dependencies).
 * Renders everything generically from window.BUDGET_QUESTIONS. All answers are
 * stored only in localStorage under the "budgetApp." prefix. */
(function () {
  'use strict';

  var Q = window.BUDGET_QUESTIONS;
  var SCHEMA_VERSION = 1;
  var NS = 'budgetApp.';
  var INDEX_KEY = NS + 'index';
  var ATT_STEP = '__attitudes__';

  /* =================================================================
   * Storage layer
   * ================================================================= */
  function readJSON(key, fallback) {
    try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.error('localStorage write failed', e); return false; }
  }
  function nowISO() { return new Date().toISOString(); }

  function defaultIndex() {
    return {
      schemaVersion: SCHEMA_VERSION,
      profiles: [{ id: 'tom', name: 'Tom' }, { id: 'wife', name: 'Wife' }],
      activeProfileId: 'tom'
    };
  }
  function loadIndex() {
    var idx = readJSON(INDEX_KEY, null);
    if (!idx || !idx.profiles) { idx = defaultIndex(); writeJSON(INDEX_KEY, idx); }
    return idx;
  }
  function saveIndex(idx) { writeJSON(INDEX_KEY, idx); }

  function profileKey(id) { return NS + 'profile.' + id; }
  function newProfile(id, name) {
    return {
      schemaVersion: SCHEMA_VERSION, profileId: id, displayName: name || id,
      createdAt: nowISO(), updatedAt: nowISO(), currency: 'USD',
      answers: {}, attitudes: {}, progress: {}
    };
  }
  function migrate(p) {
    // Forward-compatible: bump and transform here when SCHEMA_VERSION changes.
    if (!p.schemaVersion) p.schemaVersion = 1;
    if (!p.answers) p.answers = {};
    if (!p.attitudes) p.attitudes = {};
    if (!p.progress) p.progress = {};
    return p;
  }
  function loadProfile(id) {
    var p = readJSON(profileKey(id), null);
    if (!p) {
      var meta = loadIndex().profiles.filter(function (x) { return x.id === id; })[0];
      p = newProfile(id, meta ? meta.name : id);
    }
    return migrate(p);
  }
  function saveProfile(p) { p.updatedAt = nowISO(); writeJSON(profileKey(p.profileId), p); }
  function clearProfile(id) { localStorage.removeItem(profileKey(id)); }
  function clearAll() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(NS) === 0) keys.push(k);
    }
    keys.forEach(function (k) { localStorage.removeItem(k); });
  }

  /* =================================================================
   * Helpers
   * ================================================================= */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { if (v === null || v === undefined || v === '') return 0; var n = Number(v); return isNaN(n) ? 0 : n; }
  function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtTime(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleString(); } catch (e) { return ''; } }

  function allLeaves() {
    var out = [];
    Q.groups.forEach(function (g) { g.leaves.forEach(function (l) { out.push({ group: g, leaf: l, key: g.id + '.' + l.id }); }); });
    return out;
  }
  function leafAnswered(p, key) {
    var a = p.answers[key];
    return !!(a && ((a.min != null && a.min !== '') || (a.comfortable != null && a.comfortable !== '')));
  }
  function groupTotals(p, group) {
    var min = 0, comf = 0;
    group.leaves.forEach(function (l) { var a = p.answers[group.id + '.' + l.id] || {}; min += num(a.min); comf += num(a.comfortable); });
    return { min: min, comf: comf };
  }
  function profileTotals(p) {
    var min = 0, comf = 0;
    Q.groups.forEach(function (g) { var t = groupTotals(p, g); min += t.min; comf += t.comf; });
    return { min: min, comf: comf };
  }
  function groupStatus(p, group) {
    var answered = 0, invalid = false;
    group.leaves.forEach(function (l) {
      var key = group.id + '.' + l.id;
      if (leafAnswered(p, key)) answered++;
      var a = p.answers[key];
      if (a && a.min != null && a.comfortable != null && a.min !== '' && a.comfortable !== '' && num(a.comfortable) < num(a.min)) invalid = true;
    });
    if (invalid) return 'invalid';
    if (answered === 0) return 'empty';
    if (answered === group.leaves.length) return 'done';
    return 'partial';
  }
  function attitudeAnswered(p) {
    return Object.keys(p.attitudes || {}).some(function (k) {
      var v = p.attitudes[k];
      if (v == null) return false;
      if (Array.isArray(v)) return v.length > 0 && !(k === 'priority_ranking');
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return true;
    });
  }
  function answeredLeafCount(p) {
    return allLeaves().reduce(function (n, x) { return n + (leafAnswered(p, x.key) ? 1 : 0); }, 0);
  }
  function percentComplete(p) {
    var total = allLeaves().length;
    return total ? Math.round((answeredLeafCount(p) / total) * 100) : 0;
  }

  /* =================================================================
   * Routing
   * ================================================================= */
  function parseHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h || h === '/') return { view: 'welcome' };
    var parts = h.split('?');
    var path = parts[0], query = {};
    if (parts[1]) parts[1].split('&').forEach(function (kv) { var p = kv.split('='); query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    var seg = path.split('/').filter(Boolean);
    if (seg[0] === 'q') return { view: 'questionnaire', step: seg[1] || Q.groups[0].id };
    if (seg[0] === 'summary') return { view: 'summary', profile: query.p };
    if (seg[0] === 'compare') return { view: 'compare' };
    return { view: 'welcome' };
  }
  function go(hash) { location.hash = hash; }

  /* =================================================================
   * Module state + autosave
   * ================================================================= */
  var currentProfile = null;
  var saveTimer = null;
  var touched = {};   // leafKey -> true (for validation display)

  function scheduleSave() {
    var ind = document.getElementById('autosave-indicator');
    if (ind) { ind.textContent = 'Saving…'; ind.classList.remove('saved'); }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveProfile(currentProfile);
      if (ind) {
        var t = new Date();
        ind.textContent = 'Saved ✓ ' + t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        ind.classList.add('saved');
      }
    }, 400);
  }

  /* =================================================================
   * View switching
   * ================================================================= */
  function showView(name) {
    ['welcome', 'questionnaire', 'summary', 'compare'].forEach(function (v) {
      document.getElementById('view-' + v).hidden = (v !== name);
    });
    var main = document.getElementById('main');
    if (main) main.focus();
    window.scrollTo(0, 0);
  }
  function setEditingBadge(name) {
    var b = document.getElementById('editing-badge');
    if (!name) { b.hidden = true; return; }
    b.hidden = false; b.textContent = 'Editing: ' + name;
  }

  /* =================================================================
   * WELCOME
   * ================================================================= */
  function renderWelcome() {
    setEditingBadge(null);
    var idx = loadIndex();
    document.getElementById('welcome-intro').textContent = Q.intro;

    var wrap = document.getElementById('profile-cards');
    wrap.innerHTML = '';
    idx.profiles.forEach(function (meta) {
      var p = loadProfile(meta.id);
      var pct = percentComplete(p);
      var answered = answeredLeafCount(p);
      var statusText = answered === 0 ? 'Not started'
        : (pct >= 100 ? 'Complete' : pct + '% complete');
      var card = document.createElement('div');
      card.className = 'profile-card';
      card.innerHTML =
        '<div class="pc-name">' +
          '<h3 data-name>' + esc(meta.name) + '</h3>' +
          '<button class="pc-edit-name" type="button" title="Rename" aria-label="Rename ' + esc(meta.name) + '">✎</button>' +
        '</div>' +
        '<div class="pc-status">' + statusText + (p.updatedAt && answered ? ' · saved ' + esc(fmtTime(p.updatedAt)) : '') + '</div>' +
        '<div class="pc-bar"><span style="width:' + pct + '%"></span></div>' +
        '<div class="pc-actions">' +
          '<button class="btn btn-primary btn-sm" data-act="edit">' + (answered ? 'Continue' : 'Start') + '</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="summary"' + (answered ? '' : ' disabled') + '>Summary</button>' +
          '<button class="btn btn-danger-ghost btn-sm" data-act="clear"' + (answered || attitudeAnswered(p) ? '' : ' disabled') + '>Clear</button>' +
        '</div>';

      card.querySelector('[data-act="edit"]').addEventListener('click', function () {
        idx.activeProfileId = meta.id; saveIndex(idx);
        go('#/q/' + Q.groups[0].id);
      });
      card.querySelector('[data-act="summary"]').addEventListener('click', function () { go('#/summary?p=' + meta.id); });
      card.querySelector('[data-act="clear"]').addEventListener('click', function () {
        if (window.confirm('Clear all of ' + meta.name + "'s answers? This can't be undone.")) {
          clearProfile(meta.id); renderWelcome();
        }
      });
      card.querySelector('.pc-edit-name').addEventListener('click', function () { startRename(card, idx, meta); });

      wrap.appendChild(card);
    });

    // Compare enabled when both profiles have at least one answer.
    var bothReady = idx.profiles.length >= 2 && idx.profiles.every(function (m) { return answeredLeafCount(loadProfile(m.id)) > 0; });
    var cmp = document.getElementById('btn-compare');
    cmp.disabled = !bothReady;
    cmp.title = bothReady ? '' : 'Both people need at least some answers first.';

    showView('welcome');
  }

  function startRename(card, idx, meta) {
    var nameWrap = card.querySelector('.pc-name');
    var current = meta.name;
    nameWrap.innerHTML = '<input type="text" value="' + esc(current) + '" maxlength="24" aria-label="Profile name">' +
      '<button class="btn btn-sm" type="button">Save</button>';
    var input = nameWrap.querySelector('input');
    input.focus(); input.select();
    function commit() {
      var v = input.value.trim() || current;
      meta.name = v; saveIndex(idx);
      var p = loadProfile(meta.id); p.displayName = v; saveProfile(p);
      renderWelcome();
    }
    nameWrap.querySelector('button').addEventListener('click', commit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); });
  }

  /* =================================================================
   * QUESTIONNAIRE
   * ================================================================= */
  function stepIds() { return Q.groups.map(function (g) { return g.id; }).concat([ATT_STEP]); }

  function renderQuestionnaire(stepId) {
    var idx = loadIndex();
    currentProfile = loadProfile(idx.activeProfileId);
    touched = {};
    setEditingBadge(currentProfile.displayName);

    var ids = stepIds();
    if (ids.indexOf(stepId) === -1) stepId = ids[0];
    var pos = ids.indexOf(stepId);

    document.getElementById('q-scope-banner').textContent = Q.intro;
    document.getElementById('q-step-label').textContent = 'Step ' + (pos + 1) + ' of ' + ids.length;
    updateProgressBar();
    renderSectionNav(stepId);

    var area = document.getElementById('q-group-area');
    if (stepId === ATT_STEP) renderAttitudes(area);
    else renderGroup(area, groupById(stepId));

    // Footer
    var back = document.getElementById('q-back');
    var next = document.getElementById('q-next');
    back.onclick = function () { pos === 0 ? go('#/welcome') : go('#/q/' + ids[pos - 1]); };
    next.textContent = (pos === ids.length - 1) ? 'Finish → Summary' : 'Next →';
    next.onclick = function () {
      if (pos === ids.length - 1) go('#/summary?p=' + currentProfile.profileId);
      else go('#/q/' + ids[pos + 1]);
    };
    document.getElementById('q-to-summary').onclick = function () { go('#/summary?p=' + currentProfile.profileId); };

    showView('questionnaire');
  }

  function groupById(id) { return Q.groups.filter(function (g) { return g.id === id; })[0]; }

  function renderSectionNav(activeId) {
    var nav = document.getElementById('q-section-nav');
    nav.innerHTML = '';
    Q.groups.forEach(function (g) {
      nav.appendChild(navItem(g.id, g.title, groupStatus(currentProfile, g), activeId));
    });
    nav.appendChild(navItem(ATT_STEP, 'Attitudes & priorities', attitudeAnswered(currentProfile) ? 'done' : 'empty', activeId));
  }
  function navItem(id, label, status, activeId) {
    var btn = document.createElement('button');
    btn.className = 'q-nav-item' + (id === activeId ? ' active' : '');
    btn.type = 'button';
    var dotClass = status === 'done' ? 'done' : status === 'partial' ? 'partial' : status === 'invalid' ? 'invalid' : '';
    btn.innerHTML = '<span class="dot ' + dotClass + '"></span><span class="nav-label">' + esc(label) + '</span>';
    btn.addEventListener('click', function () { go('#/q/' + id); });
    return btn;
  }
  function updateNavDot(groupId) {
    var nav = document.getElementById('q-section-nav');
    var items = nav.querySelectorAll('.q-nav-item');
    var ids = stepIds();
    var i = ids.indexOf(groupId);
    if (i < 0 || !items[i]) return;
    var status = groupId === ATT_STEP ? (attitudeAnswered(currentProfile) ? 'done' : 'empty') : groupStatus(currentProfile, groupById(groupId));
    var dot = items[i].querySelector('.dot');
    dot.className = 'dot ' + (status === 'done' ? 'done' : status === 'partial' ? 'partial' : status === 'invalid' ? 'invalid' : '');
  }
  function updateProgressBar() {
    var pct = percentComplete(currentProfile);
    document.getElementById('q-percent').textContent = pct + '% of categories entered';
    document.getElementById('q-progress-fill').style.width = pct + '%';
  }

  // ---- group of dollar leaves ----
  function renderGroup(area, group) {
    var t = groupTotals(currentProfile, group);
    var html = '<div class="q-group-head"><div><h2>' + esc(group.title) + '</h2></div>' +
      '<div class="q-subtotal" id="grp-subtotal">Comfortable so far: <strong>' + fmtMoney(t.comf) + '</strong></div></div>' +
      '<p class="q-group-blurb">' + esc(group.blurb) + '</p>';

    group.leaves.forEach(function (l) {
      var key = group.id + '.' + l.id;
      var a = currentProfile.answers[key] || {};
      html += '<div class="leaf">' +
        '<div class="leaf-top">' +
          '<div class="leaf-label"><span class="lbl">' + esc(l.label) + '</span>' +
            (l.help ? '<span class="help">' + esc(l.help) + '</span>' : '') + '</div>' +
          moneyField(key, 'min', 'Minimum', a.min) +
          moneyField(key, 'comfortable', 'Comfortable', a.comfortable) +
        '</div>' +
        '<details class="leaf-notes"' + (a.notes ? ' open' : '') + '><summary>Add a note</summary>' +
          '<textarea data-key="' + key + '" data-field="notes" rows="2" placeholder="Optional context…">' + esc(a.notes || '') + '</textarea>' +
        '</details>' +
      '</div>';
    });
    area.innerHTML = html;
    area.dataset.groupId = group.id;

    area.oninput = function (e) { onFieldInput(e, group); };
    area.onfocusout = function (e) { onFieldBlur(e); };

    // show any existing validation problems straightaway for filled-in pairs
    group.leaves.forEach(function (l) {
      var key = group.id + '.' + l.id;
      var a = currentProfile.answers[key];
      if (a && a.min != null && a.comfortable != null && num(a.comfortable) < num(a.min)) { touched[key] = true; validateLeaf(key); }
    });
  }

  function moneyField(key, field, label, val) {
    return '<div class="field">' +
      '<label for="f-' + key + '-' + field + '">' + label + '</label>' +
      '<div class="money-input"><span class="cur">$</span>' +
      '<input id="f-' + key + '-' + field + '" type="number" inputmode="decimal" min="0" step="1" ' +
        'data-key="' + key + '" data-field="' + field + '" value="' + (val == null ? '' : esc(val)) + '">' +
      '</div><p class="field-error" aria-live="polite"></p></div>';
  }

  function setAnswer(key, field, raw) {
    var a = currentProfile.answers[key] || (currentProfile.answers[key] = { min: null, comfortable: null, notes: '' });
    if (field === 'notes') a.notes = raw;
    else a[field] = (raw === '' ? null : Number(raw));
  }

  function onFieldInput(e, group) {
    var t = e.target;
    if (!t.dataset || !t.dataset.key) return;
    setAnswer(t.dataset.key, t.dataset.field, t.value);
    scheduleSave();
    if (t.dataset.field !== 'notes') {
      // live subtotal + progress + nav dot
      var sub = document.getElementById('grp-subtotal');
      if (sub) sub.querySelector('strong').textContent = fmtMoney(groupTotals(currentProfile, group).comf);
      updateProgressBar();
      updateNavDot(group.id);
      if (touched[t.dataset.key]) validateLeaf(t.dataset.key);
    }
  }
  function onFieldBlur(e) {
    var t = e.target;
    if (!t.dataset || !t.dataset.key || t.dataset.field === 'notes') return;
    touched[t.dataset.key] = true;
    validateLeaf(t.dataset.key);
    var gid = document.getElementById('q-group-area').dataset.groupId;
    if (gid) updateNavDot(gid);
  }

  function qInput(key, field) {
    return document.querySelector('#q-group-area input[data-key="' + key + '"][data-field="' + field + '"]');
  }
  function setFieldError(input, msg) {
    var errEl = input.closest('.field').querySelector('.field-error');
    if (msg) { input.setAttribute('aria-invalid', 'true'); errEl.textContent = msg; }
    else { input.removeAttribute('aria-invalid'); errEl.textContent = ''; }
  }
  function validateLeaf(key) {
    var minIn = qInput(key, 'min'), comfIn = qInput(key, 'comfortable');
    if (!minIn || !comfIn) return true;
    setFieldError(minIn, ''); setFieldError(comfIn, '');
    var minV = minIn.value === '' ? null : Number(minIn.value);
    var comfV = comfIn.value === '' ? null : Number(comfIn.value);
    var ok = true;
    if (minV !== null && (isNaN(minV) || minV < 0)) { setFieldError(minIn, 'Enter an amount of $0 or more.'); ok = false; }
    if (comfV !== null && (isNaN(comfV) || comfV < 0)) { setFieldError(comfIn, 'Enter an amount of $0 or more.'); ok = false; }
    if (ok && minV !== null && comfV !== null && comfV < minV) {
      setFieldError(comfIn, 'Comfortable (' + fmtMoney(comfV) + ') should be at least the minimum (' + fmtMoney(minV) + ').');
      ok = false;
    }
    comfIn.setCustomValidity(ok ? '' : 'invalid');
    return ok;
  }

  // ---- attitudes step ----
  function renderAttitudes(area) {
    area.oninput = null; area.onfocusout = null;
    area.innerHTML = '<div class="q-group-head"><h2>Attitudes &amp; priorities</h2></div>' +
      '<p class="q-group-blurb">These don’t affect the dollar totals — they help the Compare view show where the two of you see money differently.</p>';
    Q.attitudes.forEach(function (att) {
      var node = document.createElement('div');
      node.className = 'attitude';
      node.innerHTML = '<h3>' + esc(att.label) + '</h3>' + (att.help ? '<p class="help">' + esc(att.help) + '</p>' : '');
      var body = buildAttitude(att);
      node.appendChild(body);
      area.appendChild(node);
    });
  }

  function buildAttitude(att) {
    var A = currentProfile.attitudes;
    switch (att.type) {
      case 'slider': return buildSlider(att, A);
      case 'radio': return buildRadio(att, A);
      case 'ranking': return buildRanking(att, A);
      case 'cut_ratings': return buildCutRatings(att, A);
      case 'upcoming': return buildUpcoming(att, A);
      case 'reflections': return buildReflections(att, A);
      default: return document.createElement('div');
    }
  }

  function buildSlider(att, A) {
    var wrap = document.createElement('div'); wrap.className = 'slider-row';
    var stored = A[att.id];
    var def = att.id === 'savings_rate_target' ? 15 : Math.round((att.min + att.max) / 2);
    var range = document.createElement('input');
    range.type = 'range'; range.min = att.min; range.max = att.max; range.step = att.step;
    range.value = stored != null ? stored : def;
    range.setAttribute('aria-label', att.label);
    var out = document.createElement('span'); out.className = 'slider-val';
    function show() { out.textContent = (A[att.id] != null) ? (range.value + att.unit) : 'not set'; }
    show();
    range.addEventListener('input', function () { A[att.id] = Number(range.value); show(); scheduleSave(); markAttNav(); });
    wrap.appendChild(range); wrap.appendChild(out);
    return wrap;
  }

  function buildRadio(att, A) {
    var wrap = document.createElement('div'); wrap.className = 'radio-list';
    att.options.forEach(function (opt) {
      var id = 'att-' + att.id + '-' + opt.value;
      var lbl = document.createElement('label'); lbl.setAttribute('for', id);
      var r = document.createElement('input');
      r.type = 'radio'; r.name = 'att-' + att.id; r.id = id; r.value = opt.value;
      if (A[att.id] === opt.value) r.checked = true;
      r.addEventListener('change', function () { A[att.id] = opt.value; scheduleSave(); markAttNav(); });
      lbl.appendChild(r); lbl.appendChild(document.createTextNode(' ' + opt.label));
      wrap.appendChild(lbl);
    });
    return wrap;
  }

  function buildRanking(att, A) {
    var wrap = document.createElement('div');
    var order = (A[att.id] && A[att.id].length) ? A[att.id].slice() : Q.groups.map(function (g) { return g.id; });
    // keep in sync with current group set
    order = order.filter(function (id) { return groupById(id); });
    Q.groups.forEach(function (g) { if (order.indexOf(g.id) === -1) order.push(g.id); });
    A[att.id] = order;

    function render() {
      wrap.innerHTML = '';
      var ul = document.createElement('ul'); ul.className = 'rank-list';
      order.forEach(function (gid, i) {
        var g = groupById(gid);
        var li = document.createElement('li'); li.className = 'rank-item'; li.draggable = true; li.dataset.gid = gid;
        li.innerHTML = '<span class="rank-num">' + (i + 1) + '</span><span class="rank-grip" aria-hidden="true">☰</span>' +
          '<span class="rank-name">' + esc(g.title) + '</span>' +
          '<span class="rank-move">' +
            '<button class="btn btn-sm" type="button" data-dir="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button class="btn btn-sm" type="button" data-dir="1" aria-label="Move down"' + (i === order.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '</span>';
        li.querySelectorAll('button').forEach(function (b) {
          b.addEventListener('click', function () { move(i, Number(b.dataset.dir)); });
        });
        addDrag(li);
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }
    function move(i, dir) {
      var j = i + dir; if (j < 0 || j >= order.length) return;
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
      A[att.id] = order.slice(); scheduleSave(); markAttNav(); render();
    }
    var dragFrom = null;
    function addDrag(li) {
      li.addEventListener('dragstart', function () { dragFrom = order.indexOf(li.dataset.gid); li.classList.add('dragging'); });
      li.addEventListener('dragend', function () { li.classList.remove('dragging'); });
      li.addEventListener('dragover', function (e) { e.preventDefault(); });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        var to = order.indexOf(li.dataset.gid);
        if (dragFrom == null || to < 0 || dragFrom === to) return;
        var moved = order.splice(dragFrom, 1)[0];
        order.splice(to, 0, moved);
        A[att.id] = order.slice(); scheduleSave(); markAttNav(); render();
      });
    }
    render();
    return wrap;
  }

  function buildCutRatings(att, A) {
    var wrap = document.createElement('div'); wrap.className = 'cut-grid';
    var store = A[att.id] || (A[att.id] = {});
    Q.groups.forEach(function (g) {
      var row = document.createElement('div'); row.className = 'cut-row';
      var scale = '<span class="cut-scale">';
      for (var n = 1; n <= 5; n++) {
        var id = 'cut-' + g.id + '-' + n;
        scale += '<label for="' + id + '" title="' + n + '"><input type="radio" id="' + id + '" name="cut-' + g.id + '" value="' + n + '"' +
          (store[g.id] === n ? ' checked' : '') + '>' + n + '</label>';
      }
      scale += '</span>';
      row.innerHTML = '<span>' + esc(g.title) + '</span>' + scale;
      row.querySelectorAll('input').forEach(function (inp) {
        inp.addEventListener('change', function () { store[g.id] = Number(inp.value); A[att.id] = store; scheduleSave(); markAttNav(); });
      });
      wrap.appendChild(row);
    });
    return wrap;
  }

  function buildUpcoming(att, A) {
    var wrap = document.createElement('div');
    var rows = A[att.id] || (A[att.id] = []);
    function render() {
      wrap.innerHTML = '';
      rows.forEach(function (r, i) {
        var div = document.createElement('div'); div.className = 'upcoming-row';
        div.innerHTML =
          '<input type="text" placeholder="e.g. New roof" value="' + esc(r.label || '') + '" data-f="label" aria-label="Expense">' +
          '<div class="money-input"><span class="cur">$</span><input type="number" min="0" step="1" placeholder="Amount" value="' + (r.amount == null ? '' : esc(r.amount)) + '" data-f="amount" aria-label="Amount"></div>' +
          '<input type="month" value="' + esc(r.when || '') + '" data-f="when" aria-label="When">' +
          '<button class="btn btn-sm btn-danger-ghost" type="button" aria-label="Remove">✕</button>';
        div.querySelectorAll('input').forEach(function (inp) {
          inp.addEventListener('input', function () {
            var f = inp.dataset.f;
            rows[i][f] = (f === 'amount') ? (inp.value === '' ? null : Number(inp.value)) : inp.value;
            A[att.id] = rows; scheduleSave(); markAttNav();
          });
        });
        div.querySelector('button').addEventListener('click', function () { rows.splice(i, 1); A[att.id] = rows; scheduleSave(); markAttNav(); render(); });
        wrap.appendChild(div);
      });
      var add = document.createElement('button'); add.className = 'btn btn-sm'; add.type = 'button'; add.textContent = '+ Add an upcoming expense';
      add.addEventListener('click', function () { rows.push({ label: '', amount: null, when: '' }); A[att.id] = rows; render(); });
      wrap.appendChild(add);
    }
    render();
    return wrap;
  }

  function buildReflections(att, A) {
    var wrap = document.createElement('div');
    var store = A[att.id] || (A[att.id] = {});
    att.prompts.forEach(function (pr) {
      var block = document.createElement('div'); block.className = 'reflection-block';
      var id = 'refl-' + pr.id;
      block.innerHTML = '<label for="' + id + '">' + esc(pr.label) + '</label>' +
        '<textarea id="' + id + '" rows="2">' + esc(store[pr.id] || '') + '</textarea>';
      block.querySelector('textarea').addEventListener('input', function (e) { store[pr.id] = e.target.value; A[att.id] = store; scheduleSave(); markAttNav(); });
      wrap.appendChild(block);
    });
    return wrap;
  }

  function markAttNav() { updateNavDot(ATT_STEP); }

  /* =================================================================
   * SUMMARY
   * ================================================================= */
  function attDef(id) { return Q.attitudes.filter(function (a) { return a.id === id; })[0]; }
  function optLabel(id, value) {
    var d = attDef(id); if (!d || !d.options) return value;
    var o = d.options.filter(function (x) { return x.value === value; })[0];
    return o ? o.label : (value || '—');
  }

  function renderSummary(profileId) {
    var idx = loadIndex();
    if (!profileId) profileId = idx.activeProfileId;
    var p = loadProfile(profileId);
    var meta = idx.profiles.filter(function (m) { return m.id === profileId; })[0] || { name: p.displayName };
    var tot = profileTotals(p);

    var html = '<h1>' + esc(meta.name) + ' — budget summary</h1>';
    html += '<div class="stat-cards">' +
      statCard('Minimum / month', fmtMoney(tot.min), fmtMoney(tot.min * 12) + ' / year') +
      statCard('Comfortable / month', fmtMoney(tot.comf), fmtMoney(tot.comf * 12) + ' / year') +
      statCard('Monthly spread', fmtMoney(tot.comf - tot.min), 'gap between min and comfortable') +
    '</div>';

    // group table
    html += '<h2>By category</h2><table class="tbl"><thead><tr><th>Category</th><th>Min / mo</th><th>Comfortable / mo</th><th>% of comf.</th></tr></thead><tbody>';
    Q.groups.forEach(function (g) {
      var t = groupTotals(p, g);
      var pct = tot.comf ? Math.round((t.comf / tot.comf) * 100) : 0;
      html += '<tr class="group-row"><td>' + esc(g.title) + '</td><td>' + fmtMoney(t.min) + '</td><td>' + fmtMoney(t.comf) + '</td><td>' + pct + '%</td></tr>';
    });
    html += '</tbody><tfoot><tr><td>Total</td><td>' + fmtMoney(tot.min) + '</td><td>' + fmtMoney(tot.comf) + '</td><td>100%</td></tr></tfoot></table>';

    // attitudes recap
    html += '<h2>Attitudes &amp; priorities</h2>' + attitudeRecap(p);

    document.getElementById('summary-area').innerHTML = html;

    document.getElementById('summary-back').onclick = function () { go('#/welcome'); };
    document.getElementById('summary-edit').onclick = function () { idx.activeProfileId = profileId; saveIndex(idx); go('#/q/' + Q.groups[0].id); };
    document.getElementById('summary-compare').onclick = function () { go('#/compare'); };
    document.getElementById('summary-print').onclick = function () { window.print(); };

    setEditingBadge(null);
    showView('summary');
  }

  function statCard(label, value, sub) {
    return '<div class="stat-card"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) + '</div><div class="sub">' + esc(sub) + '</div></div>';
  }

  function attitudeRecap(p) {
    var A = p.attitudes || {};
    var rows = [];
    function row(k, v) { rows.push('<tr><td>' + esc(k) + '</td><td>' + v + '</td></tr>'); }
    row('Target savings rate', A.savings_rate_target != null ? A.savings_rate_target + '%' : '—');
    row('Save vs. spend (1–10)', A.save_vs_spend != null ? A.save_vs_spend : '—');
    row('Risk tolerance', A.risk_tolerance ? esc(optLabel('risk_tolerance', A.risk_tolerance)) : '—');
    row('Emergency fund target', A.emergency_months != null ? A.emergency_months + ' months' : '—');
    row('Lifestyle importance (1–10)', A.lifestyle_importance != null ? A.lifestyle_importance : '—');
    row('Debt-payoff aggressiveness (1–10)', A.debt_aggressiveness != null ? A.debt_aggressiveness : '—');
    row('Income stability', A.income_stability ? esc(optLabel('income_stability', A.income_stability)) : '—');
    var html = '<table class="tbl"><tbody>' + rows.join('') + '</tbody></table>';

    if (A.priority_ranking && A.priority_ranking.length) {
      var top = A.priority_ranking.slice(0, 3).map(function (id) { var g = groupById(id); return g ? esc(g.title) : id; });
      html += '<p><strong>Top priorities to protect:</strong> ' + top.join(' · ') + '</p>';
    }
    if (A.upcoming_expenses && A.upcoming_expenses.length) {
      html += '<p><strong>Upcoming expenses:</strong></p><ul>';
      A.upcoming_expenses.forEach(function (r) {
        if (!r.label && r.amount == null) return;
        html += '<li>' + esc(r.label || 'Unnamed') + (r.amount != null ? ' — ' + fmtMoney(r.amount) : '') + (r.when ? ' (' + esc(r.when) + ')' : '') + '</li>';
      });
      html += '</ul>';
    }
    if (A.reflections) {
      var R = A.reflections, refl = [];
      ['protect', 'happy_to_cut', 'biggest_worry'].forEach(function (k) {
        if (R[k]) { var d = attDef('reflections').prompts.filter(function (x) { return x.id === k; })[0]; refl.push('<p><strong>' + esc(d.label) + ':</strong> ' + esc(R[k]) + '</p>'); }
      });
      html += refl.join('');
    }
    return html;
  }

  /* =================================================================
   * COMPARE
   * ================================================================= */
  function renderCompare() {
    var idx = loadIndex();
    if (idx.profiles.length < 2) { document.getElementById('compare-area').innerHTML = '<p class="empty-note">Need two profiles to compare.</p>'; showView('compare'); return; }
    var a = loadProfile(idx.profiles[0].id), b = loadProfile(idx.profiles[1].id);
    var an = idx.profiles[0].name, bn = idx.profiles[1].name;

    // household range
    var floor = 0, ceiling = 0, target = 0;
    var leaves = allLeaves();
    var detail = []; // {group, label, aMin, aComf, bMin, bComf}
    leaves.forEach(function (x) {
      var aa = a.answers[x.key] || {}, bb = b.answers[x.key] || {};
      var aMin = num(aa.min), aComf = num(aa.comfortable), bMin = num(bb.min), bComf = num(bb.comfortable);
      floor += Math.max(aMin, bMin);
      ceiling += Math.max(aComf, bComf);
      target += (((aMin + aComf) / 2) + ((bMin + bComf) / 2)) / 2;
      detail.push({ group: x.group, leaf: x.leaf, key: x.key, aMin: aMin, aComf: aComf, bMin: bMin, bComf: bComf });
    });
    var ta = profileTotals(a), tb = profileTotals(b);

    var html = '<h1>Compare — ' + esc(an) + ' &amp; ' + esc(bn) + '</h1>';

    html += '<h2>Suggested household range (monthly)</h2>';
    html += '<div class="range-cards">' +
      rangeCard('floor', 'Floor', floor) +
      rangeCard('target', 'Target', target) +
      rangeCard('ceiling', 'Ceiling', ceiling) +
    '</div>';
    html += '<p class="muted small">Floor = the higher of each person’s minimum in every category (so neither of you is below your own floor). ' +
      'Ceiling = the higher comfortable amount. Target = a blended midpoint to budget toward. ' +
      'For reference: ' + esc(an) + '’s comfortable total is ' + fmtMoney(ta.comf) + '/mo and ' + esc(bn) + '’s is ' + fmtMoney(tb.comf) + '/mo.</p>';

    // per-person totals
    html += '<h2>Per-person totals</h2><table class="tbl"><thead><tr><th></th><th>' + esc(an) + '</th><th>' + esc(bn) + '</th></tr></thead><tbody>' +
      '<tr><td>Minimum / month</td><td>' + fmtMoney(ta.min) + '</td><td>' + fmtMoney(tb.min) + '</td></tr>' +
      '<tr><td>Comfortable / month</td><td>' + fmtMoney(ta.comf) + '</td><td>' + fmtMoney(tb.comf) + '</td></tr>' +
      '<tr><td>Minimum / year</td><td>' + fmtMoney(ta.min * 12) + '</td><td>' + fmtMoney(tb.min * 12) + '</td></tr>' +
      '<tr><td>Comfortable / year</td><td>' + fmtMoney(ta.comf * 12) + '</td><td>' + fmtMoney(tb.comf * 12) + '</td></tr>' +
      '</tbody></table>';

    // biggest disagreements (by comfortable gap)
    var gaps = detail.map(function (d) { return { label: d.group.title + ' · ' + d.leaf.label, a: d.aComf, b: d.bComf, gap: Math.abs(d.aComf - d.bComf) }; })
      .filter(function (d) { return d.gap > 0; })
      .sort(function (x, y) { return y.gap - x.gap; })
      .slice(0, 10);
    html += '<h2>Biggest disagreements (comfortable amounts)</h2>';
    if (!gaps.length) html += '<p class="empty-note">No differences in comfortable amounts yet.</p>';
    else {
      html += '<ul class="disagree-list">';
      gaps.forEach(function (d) {
        html += '<li><span>' + esc(d.label) + '<br><span class="who">' + esc(an) + ' ' + fmtMoney(d.a) + ' · ' + esc(bn) + ' ' + fmtMoney(d.b) + '</span></span>' +
          '<span class="amt">' + fmtMoney(d.gap) + ' apart</span></li>';
      });
      html += '</ul>';
    }

    // attitude comparison
    html += '<h2>Attitudes</h2>' + attitudeCompare(a, b, an, bn);

    // category detail (expandable)
    html += '<h2>Category detail</h2><p class="muted small no-print">Click a category row to expand. Shaded rows show larger gaps.</p>';
    html += '<table class="tbl" id="compare-detail"><thead><tr><th>Category</th><th>' + esc(an) + ' min</th><th>' + esc(an) + ' comf</th><th>' + esc(bn) + ' min</th><th>' + esc(bn) + ' comf</th><th>HH floor</th><th>HH ceil</th></tr></thead><tbody>';
    Q.groups.forEach(function (g) {
      var rows = detail.filter(function (d) { return d.group.id === g.id; });
      var gA = groupTotals(a, g), gB = groupTotals(b, g);
      var gFloor = rows.reduce(function (s, d) { return s + Math.max(d.aMin, d.bMin); }, 0);
      var gCeil = rows.reduce(function (s, d) { return s + Math.max(d.aComf, d.bComf); }, 0);
      html += '<tr class="group-row" data-group="' + g.id + '"><td>▸ ' + esc(g.title) + '</td><td>' + fmtMoney(gA.min) + '</td><td>' + fmtMoney(gA.comf) + '</td><td>' + fmtMoney(gB.min) + '</td><td>' + fmtMoney(gB.comf) + '</td><td>' + fmtMoney(gFloor) + '</td><td>' + fmtMoney(gCeil) + '</td></tr>';
      rows.forEach(function (d) {
        var gap = Math.abs(d.aComf - d.bComf);
        var base = Math.max((d.aComf + d.bComf) / 2, 1);
        var cls = gap === 0 ? 'gap-0' : (gap / base > 0.5 ? 'gap-2' : 'gap-1');
        html += '<tr class="leaf-row ' + cls + '" data-group="' + g.id + '" style="display:none"><td>' + esc(d.leaf.label) + '</td>' +
          '<td>' + fmtMoney(d.aMin) + '</td><td>' + fmtMoney(d.aComf) + '</td><td>' + fmtMoney(d.bMin) + '</td><td>' + fmtMoney(d.bComf) + '</td>' +
          '<td>' + fmtMoney(Math.max(d.aMin, d.bMin)) + '</td><td>' + fmtMoney(Math.max(d.aComf, d.bComf)) + '</td></tr>';
      });
    });
    html += '</tbody><tfoot><tr><td>Household total</td><td>' + fmtMoney(ta.min) + '</td><td>' + fmtMoney(ta.comf) + '</td><td>' + fmtMoney(tb.min) + '</td><td>' + fmtMoney(tb.comf) + '</td><td>' + fmtMoney(floor) + '</td><td>' + fmtMoney(ceiling) + '</td></tr></tfoot></table>';

    document.getElementById('compare-area').innerHTML = html;

    // expand/collapse leaves
    document.querySelectorAll('#compare-detail .group-row').forEach(function (gr) {
      gr.addEventListener('click', function () {
        var gid = gr.dataset.group;
        document.querySelectorAll('#compare-detail .leaf-row[data-group="' + gid + '"]').forEach(function (lr) {
          lr.style.display = lr.style.display === 'none' ? 'table-row' : 'none';
        });
      });
    });

    document.getElementById('compare-back').onclick = function () { go('#/welcome'); };
    document.getElementById('compare-print').onclick = function () { window.print(); };

    setEditingBadge(null);
    showView('compare');
  }

  function rangeCard(cls, label, value) {
    return '<div class="range-card ' + cls + '"><div class="label">' + esc(label) + '</div>' +
      '<div class="value">' + fmtMoney(value) + '</div><div class="sub">' + fmtMoney(value * 12) + ' / year</div></div>';
  }

  function attitudeCompare(a, b, an, bn) {
    var A = a.attitudes || {}, B = b.attitudes || {};
    var out = '<div class="insight-grid">';

    function numRow(label, x, y, unit) {
      var has = x != null || y != null;
      var gap = (x != null && y != null) ? Math.abs(x - y) : null;
      return '<tr><td>' + esc(label) + '</td><td>' + (x != null ? x + unit : '—') + '</td><td>' + (y != null ? y + unit : '—') + '</td><td>' + (gap != null ? gap + unit + ' apart' : (has ? '—' : '')) + '</td></tr>';
    }
    out += '<div class="insight-card"><h3>Numbers</h3><table class="tbl"><thead><tr><th></th><th>' + esc(an) + '</th><th>' + esc(bn) + '</th><th>Gap</th></tr></thead><tbody>';
    out += numRow('Savings rate', A.savings_rate_target, B.savings_rate_target, '%');
    out += numRow('Save vs. spend', A.save_vs_spend, B.save_vs_spend, '');
    out += numRow('Emergency months', A.emergency_months, B.emergency_months, '');
    out += numRow('Lifestyle importance', A.lifestyle_importance, B.lifestyle_importance, '');
    out += numRow('Debt aggressiveness', A.debt_aggressiveness, B.debt_aggressiveness, '');
    out += '</tbody></table>';
    function cmpChoice(label, id) {
      var xa = A[id], xb = B[id];
      var same = xa && xb && xa === xb;
      var cls = (xa && xb) ? (same ? 'agree' : 'mismatch') : '';
      return '<p>' + esc(label) + ': <strong>' + esc(xa ? optLabel(id, xa) : '—') + '</strong> vs <strong>' + esc(xb ? optLabel(id, xb) : '—') + '</strong> ' +
        (xa && xb ? '<span class="' + cls + '">' + (same ? '(agree)' : '(differ)') + '</span>' : '') + '</p>';
    }
    out += cmpChoice('Risk tolerance', 'risk_tolerance');
    out += cmpChoice('Income stability', 'income_stability');
    out += '</div>';

    // priority divergence
    out += '<div class="insight-card"><h3>Priority alignment</h3>';
    if (A.priority_ranking && A.priority_ranking.length && B.priority_ranking && B.priority_ranking.length) {
      var posA = {}, posB = {};
      A.priority_ranking.forEach(function (id, i) { posA[id] = i + 1; });
      B.priority_ranking.forEach(function (id, i) { posB[id] = i + 1; });
      var div = Q.groups.map(function (g) { return { title: g.title, a: posA[g.id], b: posB[g.id], d: Math.abs((posA[g.id] || 0) - (posB[g.id] || 0)) }; })
        .sort(function (x, y) { return y.d - x.d; }).slice(0, 5).filter(function (x) { return x.d > 0; });
      if (!div.length) out += '<p class="agree">Your priority orders match closely.</p>';
      else {
        out += '<p class="muted small">Biggest differences in where you rank things:</p><ul>';
        div.forEach(function (x) { out += '<li>' + esc(x.title) + ': ' + esc(an) + ' #' + x.a + ', ' + esc(bn) + ' #' + x.b + '</li>'; });
        out += '</ul>';
      }
    } else out += '<p class="empty-note">Both need to set a priority ranking.</p>';
    out += '</div>';
    out += '</div>';

    // merged upcoming
    var ups = [];
    (A.upcoming_expenses || []).forEach(function (r) { if (r.label || r.amount != null) ups.push({ who: an, r: r }); });
    (B.upcoming_expenses || []).forEach(function (r) { if (r.label || r.amount != null) ups.push({ who: bn, r: r }); });
    ups.sort(function (x, y) { return String(x.r.when || '').localeCompare(String(y.r.when || '')); });
    if (ups.length) {
      out += '<h3>Upcoming expenses (combined)</h3><ul>';
      ups.forEach(function (u) { out += '<li>' + (u.r.when ? esc(u.r.when) + ' — ' : '') + esc(u.r.label || 'Unnamed') + (u.r.amount != null ? ' — ' + fmtMoney(u.r.amount) : '') + ' <span class="who">(' + esc(u.who) + ')</span></li>'; });
      out += '</ul>';
    }

    // reflections side by side
    var rd = attDef('reflections');
    if (rd) {
      var any = (A.reflections && Object.keys(A.reflections).length) || (B.reflections && Object.keys(B.reflections).length);
      if (any) {
        out += '<h3>Reflections</h3>';
        rd.prompts.forEach(function (pr) {
          var xa = (A.reflections || {})[pr.id], xb = (B.reflections || {})[pr.id];
          if (!xa && !xb) return;
          out += '<p><strong>' + esc(pr.label) + '</strong><br>' +
            esc(an) + ': ' + (xa ? esc(xa) : '—') + '<br>' + esc(bn) + ': ' + (xb ? esc(xb) : '—') + '</p>';
        });
      }
    }
    return out;
  }

  /* =================================================================
   * Welcome reset-all + boot
   * ================================================================= */
  function wireGlobal() {
    document.getElementById('btn-compare').addEventListener('click', function () { go('#/compare'); });
    document.getElementById('btn-reset-all').addEventListener('click', function () {
      var t = window.prompt('This permanently deletes ALL budget answers in this browser. Type DELETE to confirm.');
      if (t === 'DELETE') { clearAll(); location.hash = '#/welcome'; renderWelcome(); }
    });
  }

  function route() {
    var r = parseHash();
    if (r.view === 'welcome') renderWelcome();
    else if (r.view === 'questionnaire') renderQuestionnaire(r.step);
    else if (r.view === 'summary') renderSummary(r.profile);
    else if (r.view === 'compare') renderCompare();
    else renderWelcome();
  }

  function init() {
    if (!Q || !Q.groups) { document.getElementById('main').innerHTML = '<p>Could not load questions.js</p>'; return; }
    wireGlobal();
    window.addEventListener('hashchange', route);
    if (!location.hash) location.hash = '#/welcome';
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
