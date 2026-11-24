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
    ui: { placing: null, selected: null, hover: { x: 0, y: 0, on: false }, paused: false, speed: 1, layout: 'desk', fieldScale: 1, touch: false },
    time: 0
  });
  var acc = 0, lastTs = 0;
  var BOOMS = ['KA-BOOM!', 'SPLAT!', 'KABLOOEY!', 'POP!'];
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
        Draw.fx({ kind: 'ring', x: ev.x, y: ev.y, r0: 4, r1: 13, color: '#fff', lw: 2.5, life: 0.18, max: 0.18 });
        Sound.play('gulp', 0.07);
        break;
      case 'charge':
        Draw.floatText(ev.x, ev.y - 24, '!', '#ff5b4d', 26);
        Sound.play('charge', 0.1);
        break;
      case 'fuse':
        Sound.play('fuse', 0.1);
        break;
      case 'confused':
        Draw.floatText(ev.x, ev.y - 22, '?', '#dfe6f2', 22);
        break;
      case 'refund':
        Draw.floatText(ev.x, ev.y - 10, '+' + ev.amount + ' ATP', '#ffe08a', 13);
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
        // the neutrophil's one big moment
        Draw.shake(7);
        Draw.fx({ kind: 'net', x: ev.x, y: ev.y, r: ev.r, life: ev.time, max: ev.time });
        Draw.fx({ kind: 'flash', x: ev.x, y: ev.y, r: ev.r, life: 0.22, max: 0.22 });
        Draw.fx({ kind: 'ring', x: ev.x, y: ev.y, r0: 8, r1: ev.r * 1.15, color: '#ffffff', lw: 7, life: 0.35, max: 0.35 });
        Draw.fx({ kind: 'ring', x: ev.x, y: ev.y, r0: 4, r1: ev.r * 1.6, color: '#ff8a6b', lw: 4, life: 0.55, max: 0.55 });
        Draw.fx({ kind: 'strands', x: ev.x, y: ev.y, r: ev.r, life: 0.7, max: 0.7 });
        Draw.fx({ kind: 'pop', x: ev.x, y: ev.y, color: Draw.COLORS.neutrophil, n: 14, spread: ev.r * 1.1, size: 4.5, life: 0.7, max: 0.7 });
        Draw.fx({ kind: 'pop', x: ev.x + 1, y: ev.y, color: '#7b5bb5', n: 9, spread: ev.r * 0.8, size: 3.5, life: 0.6, max: 0.6 });
        Draw.fx({ kind: 'ghost', x: ev.x, y: ev.y, life: 2.2, max: 2.2 });
        Draw.floatText(ev.x, ev.y - 26, BOOMS[Math.floor(Math.random() * BOOMS.length)], '#fff27a', 24);
        Sound.play('boom', 0.05);
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

  // A finger is much less exact than a mouse, and on a phone the cells are small:
  // a touch picks the nearest cell within about 22 screen pixels.
  function towerAt(g, x, y, touch) {
    var best = null, bestD = Infinity;
    var slop = touch ? 22 / (App.ui.fieldScale || 1) : 0;
    g.towers.forEach(function (t) {
      var d = CTD.dist(t.x, t.y, x, y);
      if (d <= Math.max(t.r + 6, slop) && d < bestD) { best = t; bestD = d; }
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
        // single-use cells stay selected so several can be dropped in a row;
        // for the others, hold Shift to keep placing the same cell
        var keep = ev.shiftKey || CTD.TOWERS[type].consumable;
        if (!keep || g.atp < CTD.TOWERS[type].cost) App.setPlacing(null);
      } else {
        Sound.play('nope');
        if (g.atp < CTD.TOWERS[type].cost) Draw.floatText(p.x, p.y, 'Not enough ATP', '#ff8a6b', 14);
        else Draw.floatText(p.x, p.y, 'Cannot place here', '#ff8a6b', 14);
      }
      return;
    }
    App.select(towerAt(g, p.x, p.y, ev.pointerType === 'touch'));
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

  // Size the stage for the window and keep the canvas sharp.
  //
  // Desktop: the fixed 1070 x 652 stage, scaled to fit. If that would shrink the
  // text too far (phones, small windows), switch to a compact layout that is laid
  // out at about the size of the screen itself, so the scale stays close to 1:
  //   land: slim top bar, playfield on the left, panel on the right
  //   port: top bar, full-width playfield, panel underneath
  // All sizes below are in stage pixels (before scaling).
  var MIN_DESK_SCALE = 0.8;
  var LAND = { h: 400, minW: 720, bar: 38, panelMin: 350, panelMax: 470 };
  var PORT = { w: 400, maxW: 640, panelMin: 345, roomy: 1.15 };

  function fit() {
    var stage = document.getElementById('stage'), body = document.body;
    // the layout viewport, which (unlike innerWidth) does not change when a phone zooms
    var root = document.documentElement;
    var vw = root.clientWidth || window.innerWidth, vh = root.clientHeight || window.innerHeight;
    var s = Math.min(vw / (STAGE_W + 6), vh / (STAGE_H + 6));
    var layout = s >= MIN_DESK_SCALE ? 'desk' : vw > vh * 1.15 ? 'land' : 'port';
    var W = STAGE_W, H = STAGE_H, cw = CTD.W, ch = CTD.H;
    body.classList.toggle('compact', layout !== 'desk');
    body.classList.toggle('land', layout === 'land');
    body.classList.toggle('port', layout === 'port');

    if (layout === 'land') {
      H = LAND.h;
      s = vh / H;
      W = vw / s;
      if (W < LAND.minW) { W = LAND.minW; s = vw / W; H = vh / s; }
      // as tall as the space under the top bar, unless the panel would get too narrow
      ch = Math.floor(Math.min(H - LAND.bar, (W - 3 - LAND.panelMin) * 0.75));
      cw = Math.round(ch * 4 / 3);
      W = Math.min(W, cw + 3 + LAND.panelMax);
    } else if (layout === 'port') {
      W = PORT.w;
      stage.style.width = W + 'px';
      var bar = document.getElementById('topbar').offsetHeight;
      var need = function (w) { return bar + w * 0.75 + 3 + PORT.panelMin; };
      s = Math.min(vw / W, vh / need(W));
      if (s > PORT.roomy) {
        // tablets: spend the spare room on a bigger playfield, not giant buttons
        W = Math.min(PORT.maxW, Math.floor(vw / PORT.roomy));
        s = Math.min(vw / W, vh / need(W));
      }
      H = vh / s;
      cw = W;
      ch = Math.round(W * 0.75);
    } else {
      s = Math.max(0.3, s);
    }
    s = Math.min(s, 2);

    stage.style.width = W + 'px';
    stage.style.height = H + 'px';
    stage.style.setProperty('--cw', cw + 'px');
    stage.style.setProperty('--ch', ch + 'px');
    stage.style.transform = 'scale(' + s + ')';
    stage.style.left = Math.max(0, (vw - W * s) / 2) + 'px';
    stage.style.top = Math.max(0, (vh - H * s) / 2) + 'px';

    // how many screen pixels one playfield unit covers
    var k = (s * cw) / CTD.W;
    App.ui.layout = layout;
    App.ui.fieldScale = k;
    App.ui.touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    // text drawn on the playfield shrinks with it, so make it bigger to compensate
    Draw.setTextScale(Math.max(1, Math.min(1.6, 0.85 / k)));
    backing = Math.max(1, Math.min(3, Math.ceil(k * (window.devicePixelRatio || 1) * 2) / 2));
    canvas.width = CTD.W * backing;
    canvas.height = CTD.H * backing;
  }

  function boot() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    fit();
    window.addEventListener('resize', fit);
    // phones report the new size a moment after they rotate
    window.addEventListener('orientationchange', function () { setTimeout(fit, 250); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
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
