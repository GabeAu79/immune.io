// Ties everything together: the game loop, mouse / touch / keyboard input,
// and turning simulation events into effects, sounds and pop-ups.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});
  var Game = CTD.Game, Draw = CTD.Draw, Sound = CTD.Sound, Modals = CTD.Modals, Hud = CTD.Hud, T = CTD.TEXT;

  var STEP = 1 / 60;
  var STAGE_W = 1070, STAGE_H = 652;
  var canvas, ctx, backing = 1;

  var App = (CTD.App = {
    g: null,
    ui: { placing: null, selected: null, hover: { x: 0, y: 0, on: false }, paused: false, speed: 1 },
    time: 0
  });
  var acc = 0, lastTs = 0;
  var briefed = {};
  var pendingBriefing = null;

  // ---------------------------------------------------------------- actions

  App.newGame = function (mode) {
    App.g = Game.create({ mode: mode, seed: 1 + Math.floor(Math.random() * 100000) });
    App.started = true;
    App.ui.placing = null;
    App.ui.selected = null;
    App.ui.paused = false;
    briefed = {};
    Draw.clearFx();
    Hud.reset();
    brief(1);
  };

  App.setPlacing = function (type) {
    App.ui.placing = type;
    if (type) {
      App.ui.selected = null;
      Hud.setInfo('tower', type);
    } else {
      Hud.setInfo('wave');
    }
    canvas.classList.toggle('placing', !!type);
  };

  App.select = function (t) {
    App.ui.selected = t;
    if (t) App.setPlacing(null);
  };

  App.startWave = function () {
    if (!App.g || Modals.isOpen()) return;
    if (Game.startWave(App.g)) {
      App.ui.paused = false;
      Sound.play('wave');
    }
  };

  // Class mode: show the cards that introduce what the next wave brings.
  function brief(wave) {
    var g = App.g;
    if (g.mode !== 'class' || briefed[wave] || !T.briefings[wave]) return;
    briefed[wave] = true;
    Modals.briefing(T.briefings[wave]);
  }

  // ---------------------------------------------------------------- events

  function handle(ev) {
    var g = App.g, A = ev.antigen ? CTD.ANTIGENS[ev.antigen] : null;
    switch (ev.type) {
      case 'pop':
        Draw.fx({ kind: 'pop', x: ev.x, y: ev.y, color: A.color, life: 0.3, max: 0.3 });
        if (ev.reward > 1) Draw.floatText(ev.x, ev.y - 8, '+' + ev.reward, '#ffe08a', 11);
        Sound.play('pop', 0.04);
        break;
      case 'burst':
        Draw.fx({ kind: 'ring', x: ev.x, y: ev.y, r0: ev.r, r1: ev.r * 2.6, color: '#ff5a3c', lw: 6, life: 0.45, max: 0.45 });
        Draw.fx({ kind: 'pop', x: ev.x, y: ev.y, color: '#f4c3a6', life: 0.5, max: 0.5 });
        Draw.floatText(ev.x, ev.y - ev.r, T.ui.burst, '#ff8a6b', 17);
        Sound.play('burst', 0.08);
        break;
      case 'clean':
        Draw.fx({ kind: 'blebs', x: ev.x, y: ev.y, r: ev.r, life: 0.7, max: 0.7 });
        Draw.floatText(ev.x, ev.y - ev.r, T.ui.clean + ' +' + ev.reward, '#b8f29a', 14);
        Sound.play('clean', 0.08);
        break;
      case 'gulp':
        Draw.fx({ kind: 'line', x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, color: Draw.COLORS.macrophage, lw: 7, life: 0.12, max: 0.12 });
        Sound.play('gulp', 0.07);
        break;
      case 'zap':
        Draw.fx({ kind: 'line', x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, color: ev.by === 'nk' ? '#ff7b6e' : '#8fa0ff', lw: 4, dash: [3, 6], life: 0.25, max: 0.25 });
        Draw.fx({ kind: 'ring', x: ev.tx, y: ev.ty, r0: 4, r1: 18, color: '#fff', lw: 3, life: 0.25, max: 0.25 });
        Sound.play('zap', 0.08);
        break;
      case 'antibody':
        Draw.fx({ kind: 'antibody', x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, life: 0.12, max: 0.12 });
        break;
      case 'net':
        Draw.fx({ kind: 'net', x: ev.x, y: ev.y, r: ev.r, life: 0.5, max: 0.5 });
        Sound.play('net', 0.06);
        break;
      case 'shed':
        Draw.fx({ kind: 'ring', x: ev.x, y: ev.y, r0: 6, r1: 16, color: '#fff', lw: 2, life: 0.25, max: 0.25 });
        break;
      case 'leak':
        Draw.fever();
        Draw.floatText(CTD.W - 70, 470 - Math.random() * 30, T.ui.fever + ' -' + ev.amount, '#ff6b5e', 17);
        Sound.play('leak', 0.15);
        break;
      case 'presenting':
        Draw.floatText(ev.x, ev.y - 24, 'Antigen ready!', A.color, 13);
        break;
      case 'helperActive':
        Draw.floatText(ev.x, ev.y - 24, 'Helper T activated!', A.color, 14);
        Draw.fx({ kind: 'ring', x: ev.x, y: ev.y, r0: 12, r1: 60, color: A.color, lw: 4, life: 0.6, max: 0.6 });
        Sound.play('learn', 0.2);
        break;
      case 'learned':
        Draw.floatText(ev.x, ev.y - 24, 'Trained: ' + A.name, A.color, 13);
        Draw.fx({ kind: 'ring', x: ev.x, y: ev.y, r0: 10, r1: 40, color: A.color, lw: 3, life: 0.5, max: 0.5 });
        Sound.play('learn', 0.2);
        break;
      case 'helperLost':
        Draw.banner(T.ui.helperLost, '#ff9fc0');
        Draw.fx({ kind: 'ring', x: ev.x, y: ev.y, r0: 10, r1: 70, color: '#e0457b', lw: 6, life: 0.7, max: 0.7 });
        Sound.play('lost');
        break;
      case 'waveEnd':
        Draw.banner(T.ui.waveClear + ' +' + ev.bonus + ' ATP', '#b8f29a');
        if (ev.hivMutated) Draw.banner(T.ui.hivMutated, '#ff9fc0');
        pendingBriefing = ev.wave + 1;
        break;
      case 'win':
        Sound.play('win');
        Modals.report(g, true);
        break;
      case 'gameover':
        Sound.play('lost');
        Modals.report(g, false);
        break;
    }
  }

  // ---------------------------------------------------------------- loop

  function frame(ts) {
    var dt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    var g = App.g, ui = App.ui;
    App.time += dt;

    if (g && !ui.paused && !Modals.isOpen()) {
      acc += dt * ui.speed;
      var guard = 0;
      while (acc >= STEP && guard++ < 12) {
        Game.step(g, STEP);
        acc -= STEP;
        for (var i = 0; i < g.events.length; i++) handle(g.events[i]);
        g.events.length = 0;
        if (Modals.isOpen()) { acc = 0; break; }
      }
      if (guard >= 12) acc = 0;
      if (pendingBriefing && !Modals.isOpen()) {
        brief(pendingBriefing);
        pendingBriefing = null;
      }
    }
    if (ui.selected && ui.selected.dead) ui.selected = null;

    ctx.setTransform(backing, 0, 0, backing, 0, 0);
    Draw.render(ctx, g, ui, Modals.isOpen() || ui.paused ? 0 : dt, App.time);
    if (ui.paused && g && !Modals.isOpen()) {
      ctx.fillStyle = 'rgba(59, 35, 20, 0.35)';
      ctx.fillRect(0, 0, CTD.W, CTD.H);
      ctx.font = Draw.font(40);
      ctx.textAlign = 'center';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#3b2314';
      ctx.lineJoin = 'round';
      ctx.strokeText('Paused', CTD.W / 2, CTD.H / 2);
      ctx.fillStyle = '#fff';
      ctx.fillText('Paused', CTD.W / 2, CTD.H / 2);
    }
    Hud.update(g, ui, dt);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- input

  function toField(ev) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * CTD.W,
      y: ((ev.clientY - rect.top) / rect.height) * CTD.H
    };
  }

  function towerAt(g, x, y) {
    var best = null, bestD = Infinity;
    g.towers.forEach(function (t) {
      var d = CTD.dist(t.x, t.y, x, y);
      if (d <= t.r + 6 && d < bestD) { best = t; bestD = d; }
    });
    return best;
  }

  function onMove(ev) {
    var p = toField(ev);
    App.ui.hover.x = p.x;
    App.ui.hover.y = p.y;
    App.ui.hover.on = true;
  }

  function onDown(ev) {
    var g = App.g, ui = App.ui;
    if (!g || Modals.isOpen()) return;
    Sound.unlock();
    if (ev.button === 2) { App.setPlacing(null); App.select(null); return; }
    onMove(ev);
    var p = toField(ev);
    if (ui.placing) {
      var type = ui.placing;
      var t = Game.place(g, type, p.x, p.y);
      if (t) {
        Sound.play('place');
        Draw.fx({ kind: 'ring', x: t.x, y: t.y, r0: t.r, r1: t.r + 16, color: '#fff', lw: 3, life: 0.3, max: 0.3 });
        // hold Shift to keep placing the same cell
        if (!ev.shiftKey || g.atp < CTD.TOWERS[type].cost) App.setPlacing(null);
      } else {
        Sound.play('nope');
        if (g.atp < CTD.TOWERS[type].cost) Draw.floatText(p.x, p.y, 'Not enough ATP', '#ff8a6b', 14);
        else Draw.floatText(p.x, p.y, 'Cannot place here', '#ff8a6b', 14);
      }
      return;
    }
    App.select(towerAt(g, p.x, p.y));
  }

  function onKey(ev) {
    var g = App.g;
    if (!g) return;
    if (ev.key === 'Escape') {
      if (App.ui.placing) App.setPlacing(null); else App.select(null);
    } else if (Modals.isOpen()) {
      return;
    } else if (ev.key === ' ') {
      ev.preventDefault();
      if (g.inWave) App.ui.paused = !App.ui.paused; else App.startWave();
    } else if (ev.key >= '1' && ev.key <= '7') {
      var type = CTD.TOWER_ORDER[+ev.key - 1];
      if (Game.unlocked(g, type)) App.setPlacing(App.ui.placing === type ? null : type);
    }
  }

  // Scale the fixed-size stage to fit the window, and keep the canvas sharp.
  function fit() {
    var stage = document.getElementById('stage');
    var s = Math.min(window.innerWidth / (STAGE_W + 6), window.innerHeight / (STAGE_H + 6));
    s = Math.max(0.3, Math.min(s, 2));
    stage.style.transform = 'scale(' + s + ')';
    stage.style.left = Math.max(0, (window.innerWidth - STAGE_W * s) / 2) + 'px';
    stage.style.top = Math.max(0, (window.innerHeight - STAGE_H * s) / 2) + 'px';
    backing = Math.max(1, Math.min(3, Math.ceil(s * (window.devicePixelRatio || 1) * 2) / 2));
    canvas.width = CTD.W * backing;
    canvas.height = CTD.H * backing;
  }

  function boot() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    fit();
    window.addEventListener('resize', fit);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerleave', function () { App.ui.hover.on = false; });
    canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    window.addEventListener('keydown', onKey);

    App.g = Game.create({ mode: 'class' });
    Draw.buildMap(App.g.path);
    Hud.init();
    Modals.menu();
    requestAnimationFrame(frame);
  }

  // Wait for the font so text drawn on the canvas uses it from the first frame.
  function start() {
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('bold 16px ' + CTD.FONT), document.fonts.load('16px ' + CTD.FONT)]).then(boot, boot);
    } else {
      boot();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
