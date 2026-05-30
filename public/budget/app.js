/* Household Budget Questionnaire — app logic (vanilla JS, no dependencies).
 * Renders everything generically from window.BUDGET_QUESTIONS. All answers are
 * stored only in localStorage under the "budgetApp." prefix. */
(function () {
  'use strict';

  var Q = window.BUDGET_QUESTIONS;
  var SCHEMA_VERSION = 1;
  var NS = 'budgetApp.';
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

  // Single-person tool: one profile, stored under one key. (Older builds kept
  // multiple profiles under "<NS>profile.<id>"; if such data exists we adopt it
  // once so nothing the user already entered is lost.)
  var PROFILE_KEY = NS + 'profile';
  var LEGACY_KEYS = [NS + 'profile.tom', NS + 'profile.wife'];

  function newProfile(name) {
    return {
      schemaVersion: SCHEMA_VERSION, displayName: name || '',
      createdAt: nowISO(), updatedAt: nowISO(), currency: 'USD',
      answers: {}, attitudes: {}, progress: {}
    };
  }
  function migrate(p) {
    // Forward-compatible: bump and transform here when SCHEMA_VERSION changes.
    if (!p.schemaVersion) p.schemaVersion = 1;
    if (typeof p.displayName !== 'string') p.displayName = '';
    if (!p.answers) p.answers = {};
    if (!p.attitudes) p.attitudes = {};
    if (!p.progress) p.progress = {};
    return p;
  }
  function loadProfile() {
    var p = readJSON(PROFILE_KEY, null);
    if (!p) {
      // One-time adoption of pre-refactor data (first non-empty legacy profile).
      for (var i = 0; i < LEGACY_KEYS.length && !p; i++) p = readJSON(LEGACY_KEYS[i], null);
    }
    if (!p) p = newProfile('');
    return migrate(p);
  }
  function saveProfile(p) { p.updatedAt = nowISO(); writeJSON(PROFILE_KEY, p); }
  function clearProfile() { localStorage.removeItem(PROFILE_KEY); }
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
      if (Array.isArray(v)) return v.length > 0;
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
    var path = h.split('?')[0];
    var seg = path.split('/').filter(Boolean);
    if (seg[0] === 'q') return { view: 'questionnaire', step: seg[1] || Q.groups[0].id };
    if (seg[0] === 'summary') return { view: 'summary' };
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
    ['welcome', 'questionnaire', 'summary'].forEach(function (v) {
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
    document.getElementById('welcome-intro').textContent = Q.intro;

    var p = loadProfile();
    var answered = answeredLeafCount(p);
    var hasData = profileHasData(p);
    var pct = percentComplete(p);

    // Optional name — saved as you type, used only to label the export.
    var nameInput = document.getElementById('welcome-name-input');
    nameInput.value = p.displayName || '';
    nameInput.oninput = function () {
      var fresh = loadProfile();
      fresh.displayName = nameInput.value.trim();
      saveProfile(fresh);
    };

    var status = document.getElementById('welcome-status');
    if (answered === 0) status.textContent = 'You haven’t started yet.';
    else status.textContent = (pct >= 100 ? 'All done' : pct + '% complete') +
      ' · ' + answered + ' item' + (answered === 1 ? '' : 's') + ' entered' +
      (p.updatedAt ? ' · saved ' + fmtTime(p.updatedAt) : '');

    var start = document.getElementById('btn-start');
    start.textContent = answered ? 'Continue →' : 'Start →';
    start.onclick = function () { go('#/q/' + Q.groups[0].id); };

    var sum = document.getElementById('btn-summary');
    sum.disabled = !hasData;
    sum.onclick = function () { go('#/summary'); };

    var exp = document.getElementById('btn-export');
    exp.disabled = !hasData;
    exp.title = hasData ? '' : 'Enter some answers first.';
    document.getElementById('export-hint').hidden = !hasData;
    exp.onclick = exportForClaude;

    showView('welcome');
  }

  /* =================================================================
   * QUESTIONNAIRE
   * ================================================================= */
  function stepIds() { return Q.groups.map(function (g) { return g.id; }).concat([ATT_STEP]); }

  function renderQuestionnaire(stepId) {
    currentProfile = loadProfile();
    touched = {};
    setEditingBadge(currentProfile.displayName || null);

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
      if (pos === ids.length - 1) go('#/summary');
      else go('#/q/' + ids[pos + 1]);
    };
    document.getElementById('q-to-summary').onclick = function () { go('#/summary'); };

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
      case 'cut_ratings': return buildCutRatings(att, A);
      case 'upcoming': return buildUpcoming(att, A);
      case 'reflections': return buildReflections(att, A);
      default: return document.createElement('div');
    }
  }

  function buildSlider(att, A) {
    var wrap = document.createElement('div'); wrap.className = 'slider-row';
    var stored = A[att.id];
    var def = Math.round((att.min + att.max) / 2);
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
   * EXPORT (Markdown, self-describing, for handing to Claude)
   * ================================================================= */
  function profileHasData(p) {
    return answeredLeafCount(p) > 0 || attitudeAnswered(p);
  }

  // One attitude rendered as Markdown lines (driven by questions.js definitions).
  function attitudeLinesMd(p) {
    var A = p.attitudes || {};
    var lines = [];
    Q.attitudes.forEach(function (att) {
      var v = A[att.id];
      if (att.type === 'slider') {
        if (v != null) lines.push('- ' + att.label + ': ' + v + (att.unit || ''));
      } else if (att.type === 'radio') {
        if (v) lines.push('- ' + att.label + ': ' + optLabel(att.id, v));
      } else if (att.type === 'cut_ratings') {
        if (v && Object.keys(v).length) {
          var parts = Q.groups
            .filter(function (g) { return v[g.id] != null; })
            .map(function (g) { return g.title + ' ' + v[g.id]; });
          if (parts.length) lines.push('- ' + att.label + ' (1 = never cut, 5 = cut first): ' + parts.join('; '));
        }
      } else if (att.type === 'upcoming') {
        var rows = (v || []).filter(function (r) { return r && (r.label || r.amount != null); });
        if (rows.length) {
          lines.push('- ' + att.label + ':');
          rows.forEach(function (r) {
            lines.push('  - ' + (r.label || 'Unnamed') +
              (r.amount != null ? ' — ' + fmtMoney(num(r.amount)) : '') +
              (r.when ? ' (' + r.when + ')' : ''));
          });
        }
      } else if (att.type === 'reflections') {
        var R = v || {};
        (att.prompts || []).forEach(function (pr) {
          if (R[pr.id]) lines.push('- ' + pr.label + ': ' + R[pr.id]);
        });
      }
    });
    return lines;
  }

  // Full Markdown for a single profile.
  function profileMarkdown(p, name) {
    var tot = profileTotals(p);
    var pct = percentComplete(p);
    var out = [];
    out.push('## ' + name + '  (' + pct + '% of items filled in)');
    out.push('');
    out.push('- **Minimum:** ' + fmtMoney(tot.min) + '/mo (' + fmtMoney(tot.min * 12) + '/yr)');
    out.push('- **Comfortable:** ' + fmtMoney(tot.comf) + '/mo (' + fmtMoney(tot.comf * 12) + '/yr)');
    out.push('- **Spread (comfortable − minimum):** ' + fmtMoney(tot.comf - tot.min) + '/mo');
    out.push('');

    // Category totals table
    out.push('### Category totals');
    out.push('');
    out.push('| Category | Min/mo | Comfortable/mo | % of comfortable |');
    out.push('| --- | ---: | ---: | ---: |');
    Q.groups.forEach(function (g) {
      var t = groupTotals(p, g);
      if (t.min === 0 && t.comf === 0) return; // skip untouched groups
      var share = tot.comf ? Math.round((t.comf / tot.comf) * 100) : 0;
      out.push('| ' + g.title + ' | ' + fmtMoney(t.min) + ' | ' + fmtMoney(t.comf) + ' | ' + share + '% |');
    });
    out.push('| **Total** | **' + fmtMoney(tot.min) + '** | **' + fmtMoney(tot.comf) + '** | **100%** |');
    out.push('');

    // Line-item detail (answered leaves only)
    out.push('### Detail by item');
    out.push('');
    Q.groups.forEach(function (g) {
      var answered = g.leaves.filter(function (l) { return leafAnswered(p, g.id + '.' + l.id); });
      if (!answered.length) return;
      out.push('#### ' + g.title);
      answered.forEach(function (l) {
        var a = p.answers[g.id + '.' + l.id] || {};
        out.push('- ' + l.label + ': min ' + fmtMoney(num(a.min)) + ' · comfortable ' + fmtMoney(num(a.comfortable)));
        if (a.notes && String(a.notes).trim()) out.push('  - note: ' + String(a.notes).trim());
      });
      out.push('');
    });

    // Attitudes
    var att = attitudeLinesMd(p);
    if (att.length) {
      out.push('### Attitudes & priorities');
      out.push('');
      out.push.apply(out, att);
      out.push('');
    }
    return out.join('\n');
  }

  function buildExportMarkdown() {
    var p = loadProfile();
    var name = (p.displayName || '').trim();

    var head = [];
    head.push('# Household Budget — Export for Analysis');
    head.push('_Generated ' + new Date().toLocaleString() + '_');
    head.push('');
    head.push('> **Instructions for Claude:** Below is a household budget worksheet' + (name ? ' filled out by ' + name : '') + '. ' +
      'For every spending item the person gave a **Minimum** (the least they\'d want to spend if money got tight) and a **Comfortable** amount (what feels good). ' +
      'All amounts are monthly and in US dollars. Please analyse the budget: summarise where the money goes, flag the biggest categories and the biggest gaps between minimum and comfortable, ' +
      'call out anything that looks unusually high or low, and suggest a realistic monthly target. ' +
      'If a second person\'s budget is also provided in this conversation, compare the two — where they align, where they differ most, and where they could meet in the middle on a shared monthly target.');
    head.push('>');
    head.push('> This is a personal/household budget only — it deliberately excludes business expenses and rental-property income or costs.');
    head.push('');

    var body = profileHasData(p)
      ? profileMarkdown(p, name || 'Your budget')
      : '_No answers have been entered yet._';
    return head.join('\n') + '\n' + body + '\n';
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportForClaude() {
    var p = loadProfile();
    var md = buildExportMarkdown();
    var stamp = new Date().toISOString().slice(0, 10);
    var slug = (p.displayName || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    downloadText('household-budget-' + (slug ? slug + '-' : '') + stamp + '.md', md, 'text/markdown');
  }

  /* =================================================================
   * SUMMARY
   * ================================================================= */
  function attDef(id) { return Q.attitudes.filter(function (a) { return a.id === id; })[0]; }
  function optLabel(id, value) {
    var d = attDef(id); if (!d || !d.options) return value;
    var o = d.options.filter(function (x) { return x.value === value; })[0];
    return o ? o.label : (value || '—');
  }

  function renderSummary() {
    var p = loadProfile();
    var name = (p.displayName || '').trim();
    var tot = profileTotals(p);

    var html = '<h1>' + (name ? esc(name) + ' — budget summary' : 'Your budget summary') + '</h1>';
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
    document.getElementById('summary-edit').onclick = function () { go('#/q/' + Q.groups[0].id); };
    document.getElementById('summary-export').onclick = exportForClaude;
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
    row('Save vs. spend (1–10)', A.save_vs_spend != null ? A.save_vs_spend : '—');
    row('Risk tolerance', A.risk_tolerance ? esc(optLabel('risk_tolerance', A.risk_tolerance)) : '—');
    row('Emergency fund target', A.emergency_months != null ? A.emergency_months + ' months' : '—');
    row('Lifestyle importance (1–10)', A.lifestyle_importance != null ? A.lifestyle_importance : '—');
    row('Debt-payoff aggressiveness (1–10)', A.debt_aggressiveness != null ? A.debt_aggressiveness : '—');
    row('Income stability', A.income_stability ? esc(optLabel('income_stability', A.income_stability)) : '—');
    var html = '<table class="tbl"><tbody>' + rows.join('') + '</tbody></table>';

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
   * Reset + boot
   * ================================================================= */
  function wireGlobal() {
    document.getElementById('btn-reset-all').addEventListener('click', function () {
      var t = window.prompt('This permanently deletes all of your budget answers in this browser. Type DELETE to confirm.');
      if (t === 'DELETE') { clearAll(); location.hash = '#/welcome'; renderWelcome(); }
    });
  }

  function route() {
    var r = parseHash();
    if (r.view === 'questionnaire') renderQuestionnaire(r.step);
    else if (r.view === 'summary') renderSummary();
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
