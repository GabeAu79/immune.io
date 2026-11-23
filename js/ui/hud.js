// Top bar, shop, clinic, info box and the selected-cell panel.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});
  var Hud = (CTD.Hud = {});
  var T = CTD.TEXT, R = CTD.RULES;

  function $(id) { return document.getElementById(id); }

  var shopBtns = {}; // tower type -> button
  var clinicBtns = {}; // item -> button
  var info = { mode: 'wave', key: null, sig: '' };
  var selectSig = '';
  var selectTimer = 0;
  var last = {};

  function setText(id, value) {
    if (last[id] !== value) { last[id] = value; $(id).textContent = value; }
  }

  // ---------------------------------------------------------------- build

  Hud.init = function () {
    var App = CTD.App;

    CTD.TOWER_ORDER.forEach(function (type) {
      var def = CTD.TOWERS[type];
      var b = document.createElement('button');
      b.className = 'shop-btn';
      b.innerHTML = '<canvas></canvas><span><span class="name">' + T.towers[type].name.replace('T-Cell', '<span class="nb">T-Cell</span>') + '</span><span class="cost"></span></span>';
      CTD.Draw.icon(b.querySelector('canvas'), ['tower', type], 40);
      b.addEventListener('click', function () {
        CTD.Sound.unlock();
        if (!CTD.Game.unlocked(App.g, type)) { CTD.Sound.play('nope'); return; }
        App.setPlacing(App.ui.placing === type ? null : type);
      });
      b.addEventListener('pointerenter', function () { if (!App.ui.placing && info.mode !== 'vaccine') setInfo('tower', type); });
      b.addEventListener('pointerleave', function () { if (info.mode === 'tower' && !App.ui.placing) setInfo('wave'); });
      $(def.arm === 'innate' ? 'shop-innate' : 'shop-adaptive').appendChild(b);
      shopBtns[type] = b;
    });

    [['vaccine', 'vaccine'], ['serum', 'serum'], ['art', 'art']].forEach(function (pair) {
      var item = pair[0];
      var b = document.createElement('button');
      b.className = 'shop-btn clinic-btn';
      b.innerHTML = '<canvas></canvas><span class="name">' + (item === 'art' ? 'HIV Medicine' : T.items[item].name) + '</span><span class="cost"></span>';
      CTD.Draw.icon(b.querySelector('canvas'), [pair[1]], 26);
      b.addEventListener('click', function () {
        CTD.Sound.unlock();
        var g = App.g, ok = false;
        if (item === 'vaccine') {
          if (!g.inWave && CTD.Game.unlocked(g, 'helperT')) { App.setPlacing(null); setInfo(info.mode === 'vaccine' ? 'wave' : 'vaccine'); return; }
        } else if (item === 'serum') {
          ok = CTD.Game.useSerum(g);
          if (ok) CTD.Draw.banner('Antibody serum!', '#ffe08a');
        } else {
          ok = CTD.Game.useArt(g);
          if (ok) CTD.Draw.banner('HIV medicine working', '#ff9fc0');
        }
        CTD.Sound.play(ok ? 'buy' : 'nope');
      });
      b.addEventListener('pointerenter', function () { if (!App.ui.placing && info.mode !== 'vaccine') setInfo('item', item); });
      b.addEventListener('pointerleave', function () { if (info.mode === 'item') setInfo('wave'); });
      $('clinic').appendChild(b);
      clinicBtns[item] = b;
    });

    $('btn-start').addEventListener('click', function () { CTD.Sound.unlock(); App.startWave(); });
    $('btn-speed').addEventListener('click', function () {
      App.ui.speed = App.ui.speed === 1 ? 2 : App.ui.speed === 2 ? 3 : 1;
    });
    $('btn-pause').addEventListener('click', function () { App.ui.paused = !App.ui.paused; });
    $('btn-sound').addEventListener('click', function () {
      CTD.Sound.on = !CTD.Sound.on;
      CTD.Sound.unlock();
    });
    $('btn-book').addEventListener('click', function () { CTD.Modals.book(); });
    $('btn-menu').addEventListener('click', function () { CTD.Modals.menu(); });

    // vaccine picker lives in the info box
    $('info').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button[data-vac]') : null;
      if (!b || b.disabled) return;
      var a = b.getAttribute('data-vac');
      if (CTD.Game.buyVaccine(App.g, a)) {
        CTD.Sound.play('learn');
        CTD.Draw.banner('Vaccinated against ' + CTD.ANTIGENS[a].name + '!', CTD.ANTIGENS[a].color);
        setInfo('wave');
      } else {
        CTD.Sound.play('nope');
      }
    });

    // selected-cell panel: act on pointerdown so frequent redraws cannot swallow a click
    $('select').addEventListener('pointerdown', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!b) return;
      var act = b.getAttribute('data-act'), t = App.ui.selected, g = App.g;
      if (act === 'close') App.select(null);
      else if (!t || t.dead) return;
      else if (act === 'sell') { CTD.Game.sell(g, t); CTD.Sound.play('buy'); App.select(null); }
      else if (act === 'up') {
        var ok = CTD.Game.upgrade(g, t, +b.getAttribute('data-i'));
        CTD.Sound.play(ok ? 'buy' : 'nope');
        selectSig = '';
      } else if (act === 'book') {
        CTD.Modals.book(T.towers[t.type].name);
      }
    });
  };

  // ---------------------------------------------------------------- info box

  function setInfo(mode, key) {
    info.mode = mode;
    info.key = key || null;
    info.sig = '';
  }
  Hud.setInfo = setInfo;

  function previewHtml(spec) {
    var sum = CTD.Waves.summary(spec);
    return '<div class="preview">' + Object.keys(sum).map(function (type) {
      return '<span title="' + CTD.ENEMIES[type].name + '"><canvas data-type="' + type + '"></canvas>x' + sum[type] + '</span>';
    }).join('') + '</div>';
  }

  function renderInfo(g, ui) {
    var el = $('info'), html, sig;
    if (info.mode === 'tower') {
      var type = info.key, def = CTD.TOWERS[type], tx = T.towers[type];
      sig = 'tower' + type + CTD.Game.unlocked(g, type);
      if (sig === info.sig) return;
      html = '<div class="title">' + tx.name + '<span class="tag ' + def.arm + '">' + T.arm[def.arm] + '</span></div>' +
        '<div>' + tx.desc + '</div>' +
        (CTD.Game.unlocked(g, type) ? '' : '<div class="hint"><b>' + T.ui.locked + R.adaptiveUnlockWave + '.</b></div>') +
        (ui.placing ? '<div class="hint">' + T.ui.hintPlace + '</div>' : '');
    } else if (info.mode === 'item') {
      sig = 'item' + info.key;
      if (sig === info.sig) return;
      html = '<div class="title">' + T.items[info.key].name + '</div><div>' + T.items[info.key].desc + '</div>';
    } else if (info.mode === 'vaccine') {
      sig = 'vac' + g.atp + g.wave + JSON.stringify(g.vaccine);
      if (sig === info.sig) return;
      html = '<div class="title">Vaccinate against... <span class="tag adaptive">' + R.vaccineCost + ' ATP</span></div>' +
        CTD.ANTIGEN_ORDER.map(function (a) {
          var A = CTD.ANTIGENS[a];
          var active = CTD.Game.vaccineActive(g, a);
          var note = a === 'hiv' ? T.items.noHivVaccine : active ? 'protected through wave ' + g.vaccine[a] : '';
          return '<button class="pick" data-vac="' + a + '"' + (CTD.Game.canVaccinate(g, a) ? '' : ' disabled') + '>' +
            '<span class="dot" style="background:' + A.color + '"></span><span>' + A.name + (note ? '<br><small>' + note + '</small>' : '') + '</span></button>';
        }).join('');
    } else {
      var spec = g.inWave ? CTD.Waves.get(g.mode, g.wave, g.seed) : CTD.Game.nextWaveSpec(g);
      sig = 'wave' + g.wave + g.inWave;
      if (sig !== info.sig) {
        html = '<div class="title">' + (g.inWave ? 'Wave ' + g.wave + ' <span id="left"></span>' : T.ui.nextWave + ': ' + (g.wave + 1)) + '</div>' +
          previewHtml(spec) + '<div class="hint">' + T.ui.hintIdle + '</div>';
      }
    }
    if (html !== undefined) {
      el.innerHTML = html;
      info.sig = sig;
      Array.prototype.forEach.call(el.querySelectorAll('canvas[data-type]'), function (c) {
        CTD.Draw.icon(c, ['enemy', c.getAttribute('data-type')], 24);
      });
    }
    if (info.mode === 'wave' && g.inWave) {
      var left = $('left');
      if (left) left.textContent = '(' + (g.queue.length + g.enemies.length) + ' left)';
    }
  }

  // ---------------------------------------------------------------- selected cell

  function dotsHtml(list) {
    return list.map(function (a) {
      return '<span class="dot" title="' + CTD.ANTIGENS[a].name + '" style="background:' + CTD.ANTIGENS[a].color + '"></span>';
    }).join('');
  }

  function renderSelect(g, ui, dt) {
    var el = $('select'), t = ui.selected;
    if (!t || t.dead) {
      if (!el.classList.contains('hidden')) { el.classList.add('hidden'); el.innerHTML = ''; selectSig = ''; }
      return;
    }
    selectTimer -= dt;
    var sig = t.id + ':' + t.levels.join(',');
    var rebuild = sig !== selectSig;
    if (!rebuild && selectTimer > 0) return;
    selectTimer = 0.2;
    var tx = T.towers[t.type];

    if (rebuild) {
      selectSig = sig;
      el.classList.remove('hidden');
      el.innerHTML = '<div class="head"><canvas></canvas><div><div class="title">' + tx.name + '</div>' +
        '<span class="tag ' + t.def.arm + '">' + T.arm[t.def.arm] + '</span></div>' +
        '<button class="close" data-act="close" title="Close">X</button></div>' +
        '<div class="dyn top"></div><div class="dyn ups"></div><div class="dyn foot"></div>';
      CTD.Draw.icon(el.querySelector('canvas'), ['tower', t.type], 44);
    }

    var html = '';
    var st = CTD.Adaptive.status(g, t);
    if (st) {
      html += '<div class="status ' + st.state + '">' + st.text +
        (st.progressAntigen ? ' ' + Math.round(st.progress * 100) + '%' : '') + '</div>';
      html += '<div class="dots">Trained against: ' + (st.known.length ? dotsHtml(st.known) : 'nothing yet') + '</div>';
    }
    if (t.type === 'helperT') {
      html += '<div class="cd4">CD4 <span class="bar"><span style="width:' + Math.max(0, (t.cd4 / t.s.cd4) * 100) + '%;' +
        (t.drainT > 0 ? 'background:#ff5d8f' : '') + '"></span></span>' + Math.max(0, Math.ceil(t.cd4)) + '</div>';
    }
    if (CTD.Adaptive.isPresenter(t)) {
      var parts = CTD.ANTIGEN_ORDER.filter(function (a) { return t.samples[a] > 0; }).map(function (a) {
        var pct = Math.min(100, Math.round((t.samples[a] / R.sampleThreshold) * 100));
        return dotsHtml([a]) + (pct >= 100 ? 'ready' : pct + '%');
      });
      html += '<div class="dots">Antigen collected: ' + (parts.length ? parts.join(' &nbsp;') : 'none yet') + '</div>';
    }
    setDyn(el, 'top', html);
    html = '<div class="upgrades">';
    t.def.upgrades.forEach(function (u, i) {
      var ut = T.upgrades[t.type][u.key];
      var cost = CTD.Towers.upgradeCost(t, i);
      var pips = '';
      for (var k = 0; k < u.costs.length; k++) pips += k < t.levels[i] ? '●' : '○';
      html += '<button class="up-btn' + (cost !== null && g.atp < cost ? ' poor' : '') + '" data-act="up" data-i="' + i + '"' + (cost === null ? ' disabled' : '') + '>' +
        '<span class="n">' + ut.name + ' <span class="pips">' + pips + '</span></span>' +
        '<span class="c">' + (cost === null ? T.ui.maxed : cost + ' ATP') + '</span>' +
        '<span class="d">' + ut.desc + '</span></button>';
    });
    html += '</div>';
    setDyn(el, 'ups', html);
    html = '<button class="more" data-act="book">Learn more</button>' +
      (t.def.stats.damage || t.type === 'killerT' ? '<span>Stopped: <b>' + t.kills + '</b></span>' : '') +
      '<button class="sell" data-act="sell">' + T.ui.sell + ' +' + CTD.Game.sellValue(t) + '</button>';
    setDyn(el, 'foot', html);
  }

  // Only touch the page when the content really changed, so buttons stay put under the pointer.
  function setDyn(el, part, html) {
    var node = el.querySelector('.dyn.' + part);
    if (node.getAttribute('data-html') === html) return;
    node.setAttribute('data-html', html);
    node.innerHTML = html;
  }

  // ---------------------------------------------------------------- every frame

  Hud.update = function (g, ui, dt) {
    if (!g) return;
    var classMode = g.mode === 'class';
    setText('wave', classMode && g.wave <= R.classWaves ? g.wave + ' / ' + R.classWaves : String(g.wave));
    setText('atp', String(Math.floor(g.atp)));
    setText('health', String(Math.ceil(g.health)));
    var hp = Math.max(0, g.health / R.startHealth) * 100;
    if (last.hp !== hp) {
      last.hp = hp;
      $('health-fill').style.width = hp + '%';
      $('health-fill').style.background = hp > 50 ? '#6cc04a' : hp > 25 ? '#f0b429' : '#e2574c';
    }

    CTD.TOWER_ORDER.forEach(function (type) {
      var b = shopBtns[type], def = CTD.TOWERS[type];
      var unlocked = CTD.Game.unlocked(g, type);
      b.classList.toggle('locked', !unlocked);
      b.classList.toggle('poor', unlocked && g.atp < def.cost);
      b.classList.toggle('selected', ui.placing === type);
      var cost = unlocked ? def.cost + ' ATP' : 'Wave ' + R.adaptiveUnlockWave;
      var c = b.querySelector('.cost');
      if (c.textContent !== cost) c.textContent = cost;
    });

    function clinic(item, text, usable, cooling) {
      var b = clinicBtns[item], c = b.querySelector('.cost');
      if (c.textContent !== text) c.textContent = text;
      b.classList.toggle('poor', !usable);
      b.classList.toggle('cooling', !!cooling);
    }
    var adaptive = CTD.Game.unlocked(g, 'helperT');
    clinic('vaccine', !adaptive ? 'Wave ' + R.adaptiveUnlockWave : g.inWave ? 'between waves' : R.vaccineCost + ' ATP',
      adaptive && !g.inWave && g.atp >= R.vaccineCost, g.inWave || !adaptive);
    clinicBtns.vaccine.classList.toggle('selected', info.mode === 'vaccine');
    clinic('serum', g.serumCd > 0 ? Math.ceil(g.serumCd) + 's' : !g.inWave ? 'during wave' : R.serumCost + ' ATP',
      CTD.Game.canSerum(g), g.serumCd > 0 || !g.inWave);
    var artOk = CTD.Game.artUnlocked(g);
    clinic('art', !artOk ? 'Wave ' + R.artUnlockWave : g.artCd > 0 ? Math.ceil(g.artCd) + 's' : !g.inWave ? 'during wave' : R.artCost + ' ATP',
      CTD.Game.canArt(g), !artOk || g.artCd > 0 || !g.inWave);

    if (info.mode === 'vaccine' && g.inWave) setInfo('wave');

    var start = $('btn-start');
    var label = g.over ? 'Game over' : g.inWave ? 'Wave ' + g.wave + ' in progress' : T.ui.startWave + ' ' + (g.wave + 1);
    if (start.textContent !== label) start.textContent = label;
    start.disabled = g.inWave || g.over;

    setText('btn-speed', 'Speed ' + ui.speed + 'x');
    setText('btn-pause', ui.paused ? 'Resume' : 'Pause');
    $('btn-pause').classList.toggle('active', ui.paused);
    setText('btn-sound', CTD.Sound.on ? 'Sound on' : 'Sound off');

    renderInfo(g, ui);
    renderSelect(g, ui, dt);
  };

  Hud.reset = function () {
    setInfo('wave');
    selectSig = '';
  };
})();
