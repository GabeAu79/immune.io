// All canvas drawing. Every picture is drawn in code: no image files.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});
  var Draw = (CTD.Draw = {});

  var INK = '#3b2314'; // outline colour for everything
  var TAU = Math.PI * 2;
  var COLORS = {
    macrophage: '#f6c445', neutrophil: '#cfeaf8', nk: '#e2574c', dc: '#2fb8a0',
    helperT: '#4a90e2', bcell: '#fff3c4', killerT: '#3d4fb8', antibody: '#b86a1c'
  };
  Draw.COLORS = COLORS;

  var mapCanvas = null;
  var effects = [];
  var banners = [];
  var feverT = 0;
  var shakeT = 0, shakeAmp = 0;

  // On a phone the playfield is shown at about half size, so text drawn on it is
  // scaled up (main.js sets this) to stay readable.
  var textScale = 1;
  var mapPath = null;

  function font(px, bold) {
    return (bold === false ? '' : 'bold ') + Math.round(px * textScale * 10) / 10 + 'px ' + CTD.FONT;
  }
  Draw.font = font;

  Draw.setTextScale = function (v) {
    v = Math.round(v * 20) / 20;
    if (v === textScale) return;
    textScale = v;
    if (mapPath) Draw.buildMap(mapPath); // the map has labels baked in
  };

  // ---------------------------------------------------------------- shapes

  function blob(ctx, x, y, r, lobes, amp, phase) {
    ctx.beginPath();
    for (var i = 0; i <= 40; i++) {
      var a = (i / 40) * TAU;
      var rr = r * (1 + amp * Math.sin(lobes * a + phase));
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function paint(ctx, fill, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw || 3;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Googly eyes that look toward `aim`. mood: 'angry' | 'happy' | undefined
  function eyes(ctx, x, y, r, aim, mood) {
    var ex = r * 0.36, ey = -r * 0.12, er = r * 0.27;
    var lx = Math.cos(aim || 0) * er * 0.4, ly = Math.sin(aim || 0) * er * 0.4;
    for (var s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.arc(x + s * ex, y + ey, er, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + s * ex + lx, y + ey + ly, er * 0.5, 0, TAU);
      ctx.fillStyle = INK;
      ctx.fill();
      if (mood === 'angry') {
        ctx.beginPath();
        ctx.moveTo(x + s * (ex + er), y + ey - er * 1.25);
        ctx.lineTo(x + s * (ex - er * 0.9), y + ey - er * 0.45);
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }
  }

  function mouth(ctx, x, y, r, kind) {
    ctx.beginPath();
    if (kind === 'open' || kind === 'wide') {
      var big = kind === 'wide' ? 1.5 : 1;
      ctx.ellipse(x, y + r * 0.42, r * 0.3 * big, r * 0.26 * big, 0, 0, TAU);
      ctx.fillStyle = '#7a1f1f';
      ctx.fill();
    } else if (kind === 'flat') {
      ctx.moveTo(x - r * 0.3, y + r * 0.45);
      ctx.lineTo(x + r * 0.3, y + r * 0.45);
    } else if (kind === 'frown') {
      ctx.arc(x, y + r * 0.62, r * 0.28, Math.PI * 1.15, Math.PI * 1.85);
    } else {
      ctx.arc(x, y + r * 0.22, r * 0.34, Math.PI * 0.15, Math.PI * 0.85);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // A little Y-shaped antibody with its stem at (x, y) pointing along `ang`.
  function antibodyY(ctx, x, y, ang, len, color, lw) {
    var c = Math.cos(ang), s = Math.sin(ang);
    var mx = x + c * len * 0.55, my = y + s * len * 0.55;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(mx, my);
    ctx.lineTo(mx + Math.cos(ang - 0.7) * len * 0.5, my + Math.sin(ang - 0.7) * len * 0.5);
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(ang + 0.7) * len * 0.5, my + Math.sin(ang + 0.7) * len * 0.5);
    ctx.strokeStyle = color || COLORS.antibody;
    ctx.lineWidth = lw || 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  Draw.antibodyY = antibodyY;

  // Short receptor stubs around a T-cell.
  function stubs(ctx, x, y, r, n, phase) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var a = phase + (i / n) * TAU;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4));
      ctx.stroke();
    }
  }

  function mixColor(a, b, k) {
    var out = '#';
    for (var i = 1; i < 7; i += 2) {
      var v = Math.round(parseInt(a.substr(i, 2), 16) * (1 - k) + parseInt(b.substr(i, 2), 16) * k);
      out += (v < 16 ? '0' : '') + v.toString(16);
    }
    return out;
  }

  // The neutrophil: a little round cell on legs. (x, y) is where it stands; b is body radius.
  // o.state: 'idle' waiting at its post | 'windup' revving up | 'run' charging |
  //          'fuse' clinging on and swelling (o.k = 0..1) | 'return' trudging home
  function neutrophilGuy(ctx, x, y, b, o) {
    var state = o.state || 'idle', age = o.age || 0, time = o.time || 0;
    var dir = o.dir || 0;
    var face = Math.cos(dir) >= 0 ? 1 : -1;
    var k = state === 'fuse' ? CTD.clamp(o.k || 0, 0, 1) : 0;
    var size = b * (1 + 1.9 * Math.pow(k, 0.8));
    var squash = state === 'windup' ? 0.8 : 1;
    var bounce = state === 'run' ? Math.abs(Math.sin(age * 24)) * b * 0.4
      : state === 'return' ? Math.abs(Math.sin(age * 9)) * b * 0.12
        : state === 'idle' ? Math.sin(time * 3) * b * 0.05 : 0;
    var jx = k ? Math.sin(time * 97) * (0.6 + 2.6 * k) : state === 'windup' ? Math.sin(time * 80) * 1.2 : 0;
    var jy = k ? Math.cos(time * 83) * (0.6 + 2.6 * k) : 0;
    var lean = state === 'run' ? face * size * 0.18 : state === 'windup' ? -face * size * 0.12 : 0;
    var cx = x + jx, cy = y - b * 0.35 - bounce + jy + (1 - squash) * b * 0.7;
    var footY = y + b * 0.95, hipY = cy + size * squash * 0.8;
    var i, a;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;

    // legs
    ctx.lineWidth = 2.2;
    if (state === 'run' || state === 'windup') {
      // cartoon leg-wheel
      ctx.save();
      ctx.globalAlpha *= 0.25;
      ctx.beginPath();
      ctx.arc(cx, hipY + b * 0.25, b * 0.75, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
      for (i = 0; i < 4; i++) {
        a = age * 40 * face + (i / 4) * TAU;
        var lx = cx + Math.cos(a) * b * 0.8, ly = hipY + b * 0.25 + Math.sin(a) * b * 0.7;
        ctx.beginPath();
        ctx.moveTo(cx, hipY - b * 0.1);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(lx + face * 1.5, ly, 2.6, 1.6, 0, 0, TAU);
        ctx.fill();
      }
    } else if (state === 'fuse') {
      for (i = -1; i <= 1; i += 2) {
        a = Math.PI / 2 + i * 0.7 + Math.sin(time * 40 + i) * 0.25;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * size * 0.95, cy + Math.sin(a) * size * 0.95);
        ctx.lineTo(cx + Math.cos(a) * (size + b * 0.55), cy + Math.sin(a) * (size + b * 0.55));
        ctx.stroke();
      }
    } else {
      var swing = state === 'return' ? Math.sin(age * 9) * b * 0.45 : 0;
      for (i = -1; i <= 1; i += 2) {
        var fx = cx + i * b * 0.4 + i * swing * face;
        ctx.beginPath();
        ctx.moveTo(cx + i * b * 0.35, hipY - b * 0.1);
        ctx.lineTo(fx, footY);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(fx + face * 1.5, footY, 2.8, 1.7, 0, 0, TAU);
        ctx.fill();
      }
    }

    // arms
    ctx.lineWidth = 2;
    for (i = -1; i <= 1; i += 2) {
      var sx = cx + i * size * 0.92, sy = cy + size * 0.05;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      if (state === 'run') {
        ctx.lineTo(cx + i * size * 0.95 + Math.sin(age * 30 + i) * b * 0.35, cy - size * 1.75);
      } else if (state === 'windup') {
        ctx.lineTo(sx - face * b * 0.8, sy + b * 0.45);
      } else if (state === 'fuse') {
        ctx.lineTo(sx + i * b * 0.6, sy + Math.sin(time * 45 + i) * b * 0.3);
      } else if (state === 'return') {
        ctx.lineTo(sx + i * b * 0.1, sy + b * 0.8);
      } else {
        // hands on hips
        ctx.lineTo(sx + i * b * 0.45, sy + b * 0.3);
        ctx.lineTo(sx - i * b * 0.05, sy + b * 0.6);
      }
      ctx.stroke();
    }

    // body: turns red and flashes as it swells
    var color = COLORS.neutrophil;
    if (k) {
      color = mixColor(COLORS.neutrophil, '#ff5b4d', Math.min(1, k * 1.2));
      if (k > 0.25 && Math.sin(k * k * 70) > 0.35) color = '#fff3ef';
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * (2 - squash), size * squash, 0, 0, TAU);
    paint(ctx, color, 2.4);

    // its lobed nucleus, worn like a hairdo
    ctx.fillStyle = '#7b5bb5';
    for (i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(cx + lean * 0.5 + i * size * 0.36, cy - size * squash * (i === 0 ? 0.62 : 0.5), size * 0.2, 0, TAU);
      ctx.fill();
    }

    // face
    var er = size * (state === 'fuse' ? 0.3 : state === 'run' ? 0.27 : 0.23);
    var pr = er * (state === 'fuse' ? 0.22 : state === 'run' ? 0.34 : 0.48);
    var ey = cy + size * 0.02;
    for (i = -1; i <= 1; i += 2) {
      var ex = cx + lean + i * size * 0.34;
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex + Math.cos(dir) * er * 0.35, ey + Math.sin(dir) * er * 0.35, pr, 0, TAU);
      ctx.fillStyle = INK;
      ctx.fill();
      // eyebrows: determined, or droopy on the walk home
      var slant = state === 'return' ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(ex + i * er * 1.1, ey - er * (1.25 + 0.25 * slant));
      ctx.lineTo(ex - i * er * 0.8, ey - er * (1.25 - 0.4 * slant));
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    var mx = cx + lean, my = cy + size * 0.5;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (state === 'run') {
      ctx.ellipse(mx, my, size * 0.26, size * 0.3, 0, 0, TAU);
      ctx.fillStyle = '#7a1f1f';
      ctx.fill();
      ctx.stroke();
    } else if (state === 'fuse') {
      ctx.arc(mx, my, size * 0.08, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 120, 150, 0.7)';
      for (i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.arc(mx + i * size * 0.5, my - size * 0.08, size * 0.17, 0, TAU);
        ctx.fill();
      }
    } else if (state === 'return') {
      ctx.arc(mx, my + size * 0.25, size * 0.24, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    } else if (state === 'windup') {
      ctx.moveTo(mx - size * 0.28, my);
      ctx.lineTo(mx + size * 0.28, my);
      ctx.stroke();
    } else {
      ctx.arc(mx, my - size * 0.18, size * 0.28, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }

    // sweat flying off as it swells
    if (k) {
      ctx.fillStyle = '#7fd0ff';
      for (i = 0; i < 5; i++) {
        var q = (time * 2.2 + i * 0.2) % 1;
        a = i * 1.26 - 2.5;
        ctx.globalAlpha = 1 - q;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * size * (1.15 + q * 0.9), cy + Math.sin(a) * size * (1.15 + q * 0.9), 2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- defenders

  // o: { t (time), aim, flash, dim, ready (neutrophils at home), squad, plasma }
  Draw.tower = function (ctx, type, x, y, r, o) {
    o = o || {};
    var t = o.t || 0, aim = o.aim || 0;
    ctx.save();
    if (o.dim) ctx.globalAlpha *= 0.55;
    if (type === 'macrophage') {
      // o.eat: the lunge in progress. It stretches toward its prey, then wobbles as it chews.
      var eat = o.eat, face = 'smile';
      if (eat) {
        var out = eat.phase === 'out';
        var p = Math.min(1, eat.t / (out ? eat.out : eat.back));
        var ang = Math.abs(eat.cx) + Math.abs(eat.cy) > 1 ? Math.atan2(eat.cy, eat.cx) : aim;
        var s = out ? 0.08 + 0.2 * Math.sin(p * Math.PI) : eat.ate ? 0.16 * (1 - p) * Math.cos(p * 20) : 0;
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.scale(1 + s, 1 - s * 0.4);
        ctx.rotate(-ang);
        ctx.translate(-x, -y);
        face = out ? 'wide' : !eat.ate ? 'smile' : Math.sin(p * 26) > 0 ? 'flat' : 'open';
      }
      blob(ctx, x, y, r, 5, 0.11, t * 1.6);
      paint(ctx, COLORS.macrophage);
      eyes(ctx, x, y, r, aim);
      mouth(ctx, x, y, r, face);
    } else if (type === 'neutrophil') {
      neutrophilGuy(ctx, x, y + r * 0.12, r * 0.72, { state: 'idle', time: t, dir: aim });
    } else if (type === 'nk') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      paint(ctx, COLORS.nk);
      ctx.fillStyle = '#8f2018';
      for (var k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(k * 1.3 + 2.4) * r * 0.62, y + r * 0.3 + Math.sin(k * 2.1) * r * 0.3, r * 0.1, 0, TAU);
        ctx.fill();
      }
      eyes(ctx, x, y, r, aim, 'angry');
    } else if (type === 'dc') {
      ctx.beginPath();
      var arms = 7;
      for (var j = 0; j < arms * 2; j++) {
        var ang = (j / (arms * 2)) * TAU + Math.sin(t * 1.2 + j) * 0.06;
        var rad = j % 2 === 0 ? r * 1.25 : r * 0.62;
        var px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      paint(ctx, COLORS.dc);
      eyes(ctx, x, y, r * 0.8, aim);
      mouth(ctx, x, y, r * 0.8, 'smile');
    } else if (type === 'helperT') {
      stubs(ctx, x, y, r, 8, t * 0.4);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      paint(ctx, COLORS.helperT);
      eyes(ctx, x, y, r, aim);
      mouth(ctx, x, y, r, 'smile');
    } else if (type === 'bcell') {
      var rr = o.plasma ? r * 1.08 : r;
      for (var m = 0; m < 6; m++) {
        var aa = (m / 6) * TAU + t * 0.3;
        antibodyY(ctx, x + Math.cos(aa) * rr, y + Math.sin(aa) * rr, aa, 8, COLORS.antibody, 2.2);
      }
      ctx.beginPath();
      if (o.plasma) ctx.ellipse(x, y, rr * 1.08, rr * 0.92, 0, 0, TAU); else ctx.arc(x, y, rr, 0, TAU);
      paint(ctx, o.plasma ? '#ffe08a' : COLORS.bcell);
      eyes(ctx, x, y, r, aim);
      mouth(ctx, x, y, r, 'smile');
    } else if (type === 'killerT') {
      stubs(ctx, x, y, r, 8, -t * 0.4);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      paint(ctx, COLORS.killerT);
      eyes(ctx, x, y, r, aim, 'angry');
      mouth(ctx, x, y, r, 'frown');
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------- invaders

  function spikes(ctx, x, y, r, n, len, phase, knob) {
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 1.6;
    for (var i = 0; i < n; i++) {
      var a = phase + (i / n) * TAU;
      var c = Math.cos(a), s = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(x + c * r, y + s * r);
      ctx.lineTo(x + c * (r + len), y + s * (r + len));
      ctx.stroke();
      if (knob) {
        ctx.beginPath();
        ctx.arc(x + c * (r + len), y + s * (r + len), knob, 0, TAU);
        ctx.fill();
      }
    }
  }

  function virusBody(ctx, x, y, r, antigen, phase, shade) {
    var A = CTD.ANTIGENS[antigen];
    spikes(ctx, x, y, r, antigen === 'hiv' ? 8 : 9, r * 0.42, phase, antigen === 'hiv' ? r * 0.2 : r * 0.13);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    paint(ctx, shade || A.color, 2);
    if (antigen === 'hiv') {
      // the cone-shaped core HIV is known for
      ctx.beginPath();
      ctx.moveTo(x - r * 0.45, y + r * 0.45);
      ctx.lineTo(x + r * 0.1, y - r * 0.55);
      ctx.lineTo(x + r * 0.5, y - r * 0.2);
      ctx.closePath();
      ctx.fillStyle = A.dark;
      ctx.fill();
    } else if (r >= 7) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x - r * 0.33, y - r * 0.08, r * 0.13, 0, TAU);
      ctx.arc(x + r * 0.33, y - r * 0.08, r * 0.13, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.58, y - r * 0.42);
      ctx.lineTo(x - r * 0.14, y - r * 0.2);
      ctx.moveTo(x + r * 0.58, y - r * 0.42);
      ctx.lineTo(x + r * 0.14, y - r * 0.2);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  function cellBody(ctx, x, y, r, antigen, phase, boss) {
    var A = CTD.ANTIGENS[antigen];
    var parts = boss ? [[-0.42, -0.22, 0.66], [0.42, -0.2, 0.62], [-0.2, 0.36, 0.64], [0.36, 0.34, 0.6]] : [[0, 0, 1]];
    var i, p;
    // outline pass then fill pass, so overlapping lobes merge into one shape
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      blob(ctx, x + p[0] * r, y + p[1] * r, p[2] * r, 6, 0.05, phase + i);
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      blob(ctx, x + p[0] * r, y + p[1] * r, p[2] * r, 6, 0.05, phase + i);
      ctx.fillStyle = '#f4c3a6';
      ctx.fill();
    }
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      var cx = x + p[0] * r, cy = y + p[1] * r, cr = p[2] * r;
      ctx.beginPath();
      ctx.arc(cx - cr * 0.25, cy + cr * 0.2, cr * 0.3, 0, TAU);
      ctx.fillStyle = '#c9788a';
      ctx.fill();
      // the viruses being built inside
      for (var k = 0; k < 3; k++) {
        var a = phase * 0.7 + k * 2.1 + i;
        var vx = cx + Math.cos(a) * cr * 0.5, vy = cy + Math.sin(a) * cr * 0.45;
        ctx.beginPath();
        ctx.arc(vx, vy, Math.max(2.5, cr * 0.16), 0, TAU);
        ctx.fillStyle = A.color;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = A.dark;
        ctx.stroke();
      }
    }
    if (!boss) {
      // dizzy face
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      for (var s = -1; s <= 1; s += 2) {
        var ex = x + s * r * 0.34, ey = y - r * 0.3, q = r * 0.12;
        ctx.beginPath();
        ctx.moveTo(ex - q, ey - q); ctx.lineTo(ex + q, ey + q);
        ctx.moveTo(ex + q, ey - q); ctx.lineTo(ex - q, ey + q);
        ctx.stroke();
      }
    }
  }

  // o: { phase, shieldFrac, tagged, hpFrac }
  Draw.enemy = function (ctx, type, x, y, o) {
    o = o || {};
    var def = CTD.ENEMIES[type];
    var r = o.r || def.radius, phase = o.phase || 0;
    ctx.save();
    if (def.kind === 'cell') {
      if (def.detect <= 0 && !o.tagged) ctx.globalAlpha *= 0.6;
      cellBody(ctx, x, y, r, def.antigen, phase, def.boss);
    } else {
      if (def.detect <= 0 && !o.tagged) ctx.globalAlpha *= 0.45; // stealth: hard to see
      var shade = type === 'commonFast' ? '#a5e08a' : type === 'commonTough' ? '#3f8f2a' : null;
      virusBody(ctx, x, y, r, def.antigen, phase * 0.5, shade);
      if (def.shield && (o.shieldFrac === undefined || o.shieldFrac > 0)) {
        // stolen membrane + sugar shield
        ctx.beginPath();
        ctx.arc(x, y, r * 1.62, 0, TAU);
        ctx.fillStyle = 'rgba(255, 200, 215, 0.2)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(214, 92, 130, ' + (0.35 + 0.65 * (o.shieldFrac === undefined ? 1 : o.shieldFrac)) + ')';
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (o.tagged) {
      for (var i = 0; i < 3; i++) {
        var a = phase * 0.3 + (i / 3) * TAU;
        antibodyY(ctx, x + Math.cos(a) * (r + 9), y + Math.sin(a) * (r + 9), a + Math.PI, 7, COLORS.antibody, 1.8);
      }
    }
    if (o.hpFrac !== undefined && o.hpFrac < 1) {
      var w = r * 1.8;
      ctx.fillStyle = INK;
      ctx.fillRect(x - w / 2 - 1, y - r - 12, w + 2, 6);
      ctx.fillStyle = o.hpFrac > 0.5 ? '#6cc04a' : o.hpFrac > 0.25 ? '#f0b429' : '#e2574c';
      ctx.fillRect(x - w / 2, y - r - 11, w * Math.max(0, o.hpFrac), 4);
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------- icons

  // Pictures for briefing cards, the shop and the encyclopedia. art: ['tower'|'enemy', type] or [name]
  Draw.art = function (ctx, art, cx, cy, size) {
    var kind = art[0], s = size / 2;
    if (kind === 'tower') {
      Draw.tower(ctx, art[1], cx, cy, s * 0.62, { t: 1 });
    } else if (kind === 'enemy') {
      var def = CTD.ENEMIES[art[1]];
      var scale = def.kind === 'cell' ? (def.boss ? 0.62 : 0.72) : 0.5;
      Draw.enemy(ctx, art[1], cx, cy, { r: s * scale, phase: 1 });
    } else if (kind === 'fever') {
      ctx.lineWidth = 3; ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.roundRect(cx - s * 0.14, cy - s * 0.75, s * 0.28, s * 1.1, s * 0.14);
      paint(ctx, '#fff');
      ctx.fillStyle = '#e2574c';
      ctx.fillRect(cx - s * 0.06, cy - s * 0.4, s * 0.12, s * 0.8);
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.5, s * 0.28, 0, TAU);
      paint(ctx, '#e2574c');
    } else if (kind === 'vaccine') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath();
      ctx.rect(-s * 0.45, -s * 0.16, s * 0.75, s * 0.32);
      paint(ctx, '#d9f3ff');
      ctx.fillStyle = '#58b7e8';
      ctx.fillRect(-s * 0.1, -s * 0.12, s * 0.38, s * 0.24);
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s * 0.3, 0); ctx.lineTo(s * 0.78, 0);
      ctx.moveTo(-s * 0.45, 0); ctx.lineTo(-s * 0.72, 0);
      ctx.moveTo(-s * 0.72, -s * 0.2); ctx.lineTo(-s * 0.72, s * 0.2);
      ctx.stroke();
      ctx.restore();
    } else if (kind === 'serum') {
      ctx.beginPath();
      ctx.roundRect(cx - s * 0.32, cy - s * 0.45, s * 0.64, s * 1.05, s * 0.12);
      paint(ctx, '#fff6d6');
      ctx.beginPath();
      ctx.rect(cx - s * 0.22, cy - s * 0.68, s * 0.44, s * 0.24);
      paint(ctx, '#b0b7c3');
      antibodyY(ctx, cx, cy + s * 0.42, -Math.PI / 2, s * 0.62, COLORS.antibody, 3);
    } else if (kind === 'art') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.6);
      ctx.beginPath();
      ctx.roundRect(-s * 0.7, -s * 0.28, s * 1.4, s * 0.56, s * 0.28);
      paint(ctx, '#fff');
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#e0457b';
      ctx.fillRect(-s * 0.7, -s * 0.3, s * 0.7, s * 0.6);
      ctx.restore();
      ctx.beginPath();
      ctx.roundRect(-s * 0.7, -s * 0.28, s * 1.4, s * 0.56, s * 0.28);
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.restore();
    } else if (kind === 'antigens') {
      CTD.ANTIGEN_ORDER.forEach(function (a, i) {
        ctx.beginPath();
        ctx.arc(cx + ((i % 2) - 0.5) * s * 0.8, cy + (Math.floor(i / 2) - 0.5) * s * 0.8, s * 0.26, 0, TAU);
        paint(ctx, CTD.ANTIGENS[a].color, 2.5);
      });
    }
  };

  // Fill a small <canvas> element with a picture (shop buttons, cards).
  Draw.icon = function (canvas, art, size) {
    var k = Math.min(3, (globalThis.devicePixelRatio || 1) * 1.5);
    canvas.width = size * k;
    canvas.height = size * k;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    Draw.art(ctx, art, size / 2, size / 2, size);
  };

  // ---------------------------------------------------------------- map

  function tracePath(ctx, path) {
    ctx.beginPath();
    path.pts.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
  }

  Draw.buildMap = function (path) {
    var k = 2;
    mapPath = path;
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = CTD.W * k;
    mapCanvas.height = CTD.H * k;
    var ctx = mapCanvas.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    var rng = CTD.makeRng(42);

    // tissue: a pavement of soft pink cells
    ctx.fillStyle = '#f9cfc4';
    ctx.fillRect(0, 0, CTD.W, CTD.H);
    for (var gy = -20; gy < CTD.H + 40; gy += 46) {
      for (var gx = -20; gx < CTD.W + 40; gx += 52) {
        var x = gx + (rng() - 0.5) * 22 + ((gy / 46) % 2 ? 26 : 0), y = gy + (rng() - 0.5) * 18;
        blob(ctx, x, y, 24 + rng() * 6, 5, 0.08, rng() * 6);
        ctx.fillStyle = rng() < 0.5 ? '#fbd9cf' : '#f7c8bc';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#eeb3a6';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + (rng() - 0.5) * 10, y + (rng() - 0.5) * 10, 5 + rng() * 2, 0, TAU);
        ctx.fillStyle = '#f1b5a8';
        ctx.fill();
      }
    }

    // the blood vessel
    var w = CTD.MAP.vesselHalfWidth * 2;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    tracePath(ctx, path);
    ctx.strokeStyle = INK; ctx.lineWidth = w + 12; ctx.stroke();
    ctx.strokeStyle = '#a8202f'; ctx.lineWidth = w + 6; ctx.stroke();
    ctx.strokeStyle = '#d9434e'; ctx.lineWidth = w - 2; ctx.stroke();
    ctx.strokeStyle = '#e8666c'; ctx.lineWidth = w - 22; ctx.stroke();

    // red blood cells drifting along
    var tmp = {};
    for (var d = 30; d < path.length; d += 70 + rng() * 60) {
      CTD.Path.posAt(path, d, tmp);
      var ox = (rng() - 0.5) * 20, oy = (rng() - 0.5) * 20;
      ctx.beginPath();
      ctx.ellipse(tmp.x + ox, tmp.y + oy, 8, 6, rng() * 3, 0, TAU);
      ctx.fillStyle = '#c93040';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(tmp.x + ox, tmp.y + oy, 3.5, 2.5, 0, 0, TAU);
      ctx.fillStyle = '#b02535';
      ctx.fill();
    }

    // labels
    function label(text, x, y, align) {
      ctx.font = font(15);
      ctx.textAlign = align;
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x, y);
    }
    label('ENTRY', 8, 68, 'left');
    label('VITAL ORGANS', CTD.W - 8, 492, 'right');
  };

  // ---------------------------------------------------------------- effects

  Draw.fx = function (e) { effects.push(e); };

  Draw.floatText = function (x, y, text, color, size) {
    effects.push({ kind: 'text', x: x, y: y, text: text, color: color || '#fff', size: size || 13, life: 1, max: 1 });
  };

  Draw.banner = function (text, color) {
    banners.push({ text: text, color: color || '#fff', life: 2.6, max: 2.6 });
    if (banners.length > 3) banners.shift();
  };

  Draw.fever = function () { feverT = 0.7; };

  // Shake the whole playfield for a moment (big explosions).
  Draw.shake = function (amount) { shakeT = 0.4; shakeAmp = Math.max(shakeAmp, amount); };

  Draw.clearFx = function () { effects.length = 0; banners.length = 0; feverT = 0; shakeT = 0; shakeAmp = 0; };

  function outlined(ctx, text, x, y, fill, lw) {
    ctx.lineWidth = lw || 4;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function drawEffects(ctx, dt) {
    for (var i = 0; i < effects.length; i++) {
      var e = effects[i];
      e.life -= dt;
      if (e.life <= 0) continue;
      var f = e.life / e.max, p = 1 - f, j, a;
      ctx.save();
      if (e.kind === 'text') {
        ctx.globalAlpha = Math.min(1, f * 2);
        ctx.font = font(e.size);
        ctx.textAlign = 'center';
        // keep the whole word on the playfield, even right at the edge
        var half = ctx.measureText(e.text).width / 2 + 5;
        var tx = half * 2 >= CTD.W ? CTD.W / 2 : Math.max(half, Math.min(CTD.W - half, e.x));
        outlined(ctx, e.text, tx, Math.max(14 * textScale, e.y - p * 26), e.color, 3.5);
      } else if (e.kind === 'pop') {
        ctx.globalAlpha = f;
        ctx.fillStyle = e.color;
        var count = e.n || 6, spread = e.spread || 16, dot = e.size || 2.6;
        for (j = 0; j < count; j++) {
          a = j * (TAU / count) * 1.003 + e.x;
          var fly = spread * (0.55 + 0.45 * ((j * 7) % 5) / 4) * (1 - f * f);
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * fly, e.y + Math.sin(a) * fly, dot * f + 0.5, 0, TAU);
          ctx.fill();
        }
      } else if (e.kind === 'puff') {
        ctx.globalAlpha = f * 0.7;
        ctx.beginPath();
        ctx.arc(e.x, e.y - p * 4, 2 + p * 5, 0, TAU);
        ctx.fillStyle = '#fff6ee';
        ctx.fill();
      } else if (e.kind === 'flash') {
        ctx.globalAlpha = f * 0.9;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * (0.45 + 0.75 * p), 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else if (e.kind === 'strands') {
        // strings of DNA flung outward
        ctx.globalAlpha = f;
        ctx.strokeStyle = '#a58be0';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        for (j = 0; j < 9; j++) {
          a = j * (TAU / 9) + e.x;
          var c = Math.cos(a), s = Math.sin(a);
          var r1 = e.r * (0.15 + 0.6 * (1 - f * f));
          ctx.beginPath();
          for (var q = 0; q <= 6; q++) {
            var rr2 = r1 + (q / 6) * e.r * 0.4;
            var wig = Math.sin(q * 1.6 + j) * 5;
            var px = e.x + c * rr2 - s * wig, py = e.y + s * rr2 + c * wig;
            if (q === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      } else if (e.kind === 'ghost') {
        // the spent neutrophil floats off
        var gx = e.x + Math.sin(p * 9) * 7, gy = e.y - 10 - p * 70;
        ctx.globalAlpha = Math.min(1, f * 2.5) * Math.min(1, p * 6) * 0.85;
        ctx.fillStyle = '#ffffff';
        for (j = -1; j <= 1; j += 2) {
          ctx.beginPath();
          ctx.ellipse(gx + j * 11, gy - 1 + Math.sin(p * 40) * 2, 6, 3.5, j * -0.5, 0, TAU);
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = INK;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(gx, gy, 8, 0, TAU);
        paint(ctx, '#eef8ff', 1.8);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = INK;
        for (j = -1; j <= 1; j += 2) {
          ctx.beginPath();
          ctx.arc(gx + j * 3, gy - 1, 1.8, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(gx, gy + 1.5, 2.6, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(gx, gy - 13, 7, 2.6, 0, 0, TAU);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffcf33';
        ctx.stroke();
      } else if (e.kind === 'ring') {
        ctx.globalAlpha = f;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r0 + (e.r1 - e.r0) * p, 0, TAU);
        ctx.lineWidth = e.lw || 4;
        ctx.strokeStyle = e.color;
        ctx.stroke();
      } else if (e.kind === 'net') {
        // the sticky net stays on the vessel for as long as it slows things down
        ctx.globalAlpha = Math.min(1, f * 3) * 0.9;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        var rr = e.r * Math.min(1, 0.3 + (e.max - e.life) * 6);
        for (j = 0; j < 10; j++) {
          a = j * (TAU / 10) + e.x;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
          ctx.stroke();
        }
        for (j = 1; j <= 3; j++) {
          ctx.beginPath();
          ctx.arc(e.x, e.y, (rr * j) / 3, 0, TAU);
          ctx.stroke();
        }
      } else if (e.kind === 'line') {
        ctx.globalAlpha = f;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.tx, e.ty);
        ctx.lineWidth = e.lw || 3;
        ctx.strokeStyle = e.color;
        ctx.lineCap = 'round';
        if (e.dash) ctx.setLineDash(e.dash);
        ctx.stroke();
      } else if (e.kind === 'antibody') {
        var ax = e.x + (e.tx - e.x) * p, ay = e.y + (e.ty - e.y) * p;
        antibodyY(ctx, ax, ay, Math.atan2(e.ty - e.y, e.tx - e.x), 9, COLORS.antibody, 2.2);
      } else if (e.kind === 'blebs') {
        // an infected cell shutting down neatly: it shrinks into small sealed bags
        ctx.globalAlpha = f;
        for (j = 0; j < 7; j++) {
          a = j * 0.9 + e.x;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * e.r * (0.3 + p * 0.5), e.y + Math.sin(a) * e.r * (0.3 + p * 0.5), e.r * 0.22 * f + 1, 0, TAU);
          ctx.fillStyle = '#f4c3a6';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = INK;
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    effects = effects.filter(function (e) { return e.life > 0; });
  }

  function drawBanners(ctx, dt) {
    var y = 22 / textScale;
    for (var i = 0; i < banners.length; i++) {
      var b = banners[i];
      b.life -= dt;
      if (b.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.life * 2, (b.max - b.life) * 4);
      ctx.font = font(26);
      ctx.textAlign = 'center';
      // long banners shrink to fit the playfield
      var wide = ctx.measureText(b.text).width, px = 26;
      if (wide > CTD.W - 30) { px = (26 * (CTD.W - 30)) / wide; ctx.font = font(px); }
      // stack downward from the top edge, each line as tall as its own text
      y += px * textScale * 0.85;
      outlined(ctx, b.text, CTD.W / 2, y, b.color, 6);
      y += px * textScale * 0.55;
      ctx.restore();
    }
    banners = banners.filter(function (b) { return b.life > 0; });
  }

  // ---------------------------------------------------------------- frame

  function rangeCircle(ctx, x, y, r, color, dashed) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = color.replace('1)', '0.13)');
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color.replace('1)', '0.75)');
    if (dashed) ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function link(ctx, a, b, color, alpha, dashOffset) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    if (dashOffset !== undefined) {
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = dashOffset;
    }
    ctx.stroke();
    ctx.restore();
  }

  // The antigen a presenter is handing to a helper right now (first one not yet active).
  function handingOver(p, h) {
    for (var i = 0; i < CTD.ANTIGEN_ORDER.length; i++) {
      var a = CTD.ANTIGEN_ORDER[i];
      if (!h.active[a] && CTD.Adaptive.presents(p, a)) return a;
    }
    return null;
  }

  function drawLinks(ctx, g, time) {
    var i, j, t, a;
    for (i = 0; i < g.towers.length; i++) {
      t = g.towers[i];
      if (t.type === 'helperT') {
        for (j = 0; j < t.presenters.length; j++) {
          a = handingOver(t.presenters[j], t);
          if (a) link(ctx, t.presenters[j], t, CTD.ANTIGENS[a].color, 0.95, -time * 40);
          else if (t.presenters[j].type === 'dc') link(ctx, t.presenters[j], t, '#1d8f7a', 0.4);
        }
      } else if (CTD.Adaptive.isEffector(t)) {
        for (j = 0; j < t.helpers.length; j++) {
          var h = t.helpers[j], active = false, teaching = null;
          for (var k = 0; k < CTD.ANTIGEN_ORDER.length; k++) {
            a = CTD.ANTIGEN_ORDER[k];
            if (h.active[a]) { active = true; if (!t.learned[a]) teaching = a; }
          }
          if (teaching) link(ctx, h, t, CTD.ANTIGENS[teaching].color, 0.95, -time * 40);
          else link(ctx, h, t, active ? '#2f6fc4' : '#7d8794', active ? 0.5 : 0.35);
        }
      }
    }
  }

  function towerOpts(g, t, time) {
    var o = { t: time + t.id, aim: t.aim, flash: t.flash };
    if (t.type === 'macrophage') o.eat = t.eat;
    if (t.type === 'bcell') o.plasma = t.levels[3] > 0;
    return o;
  }

  function drawTowerExtras(ctx, g, t, time) {
    var st = CTD.Adaptive.status(g, t);
    var i;
    if (st) {
      // learned antigens: coloured dots underneath
      var n = st.known.length;
      for (i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(t.x + (i - (n - 1) / 2) * 9, t.y + t.r + 8, 3.6, 0, TAU);
        ctx.fillStyle = CTD.ANTIGENS[st.known[i]].color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      // training progress ring
      if (st.progressAntigen && st.progress > 0) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, st.progress));
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = CTD.ANTIGENS[st.progressAntigen].color;
        ctx.stroke();
      }
      if (st.state === 'naive' || st.state === 'weak') {
        ctx.font = font(st.state === 'naive' ? 13 : 12);
        ctx.textAlign = 'center';
        outlined(ctx, st.state === 'naive' ? 'zzz' : '25%', t.x + t.r * 0.8, t.y - t.r - 3 + Math.sin(time * 2 + t.id) * 2, st.state === 'naive' ? '#dfe6f2' : '#ffd166', 3);
      }
    }
    if (t.type === 'dc' || t.type === 'macrophage') {
      // antigen it is ready to present
      var ready = CTD.ANTIGEN_ORDER.filter(function (a) { return CTD.Adaptive.presents(t, a); });
      if (t.type === 'dc' || ready.length) {
        for (i = 0; i < ready.length; i++) {
          ctx.beginPath();
          ctx.rect(t.x + (i - (ready.length - 1) / 2) * 9 - 3, t.y + t.r + (t.type === 'dc' ? 9 : 5), 6, 6);
          ctx.fillStyle = CTD.ANTIGENS[ready[i]].color;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = INK;
          ctx.stroke();
        }
      }
    }
    if (t.type === 'helperT' && (t.cd4 < t.s.cd4 || g.seen.hiv)) {
      var w = 30, frac = Math.max(0, t.cd4 / t.s.cd4);
      ctx.fillStyle = INK;
      ctx.fillRect(t.x - w / 2 - 1, t.y - t.r - 13, w + 2, 7);
      ctx.fillStyle = t.drainT > 0 ? (Math.sin(time * 20) > 0 ? '#ff5d8f' : '#ffd1df') : '#7fd0ff';
      ctx.fillRect(t.x - w / 2, t.y - t.r - 12, w * frac, 5);
    }
  }

  // ui: { placing, hover: {x, y, on}, selected }
  Draw.render = function (ctx, g, ui, dt, time) {
    var i, t, e;
    ctx.clearRect(0, 0, CTD.W, CTD.H);
    ctx.save();
    if (shakeT > 0) {
      shakeT -= dt;
      var sh = shakeAmp * Math.max(0, shakeT / 0.4);
      ctx.translate(Math.sin(time * 95) * sh, Math.cos(time * 78) * sh);
      if (shakeT <= 0) shakeAmp = 0;
    }
    if (mapCanvas) ctx.drawImage(mapCanvas, 0, 0, CTD.W, CTD.H);
    if (!g) { ctx.restore(); return; }

    // ranges of partner cells while placing something that needs a partner
    var placing = ui.placing;
    if (placing) {
      for (i = 0; i < g.towers.length; i++) {
        t = g.towers[i];
        if (placing === 'helperT' && CTD.Adaptive.isPresenter(t)) {
          rangeCircle(ctx, t.x, t.y, CTD.Adaptive.presentRange(t), 'rgba(29, 143, 122, 1)', true);
        } else if ((placing === 'bcell' || placing === 'killerT') && t.type === 'helperT') {
          rangeCircle(ctx, t.x, t.y, CTD.Towers.range(t), 'rgba(47, 111, 196, 1)', true);
        }
      }
    }

    var sel = ui.selected;
    if (sel && !sel.dead) {
      rangeCircle(ctx, sel.x, sel.y, CTD.Towers.range(sel), 'rgba(255, 255, 255, 1)');
      if (sel.type === 'macrophage') rangeCircle(ctx, sel.x, sel.y, sel.s.presentRange, 'rgba(29, 143, 122, 1)', true);
    }

    drawLinks(ctx, g, time);

    // enemies (infected cells underneath, viruses on top)
    for (var pass = 0; pass < 2; pass++) {
      for (i = 0; i < g.enemies.length; i++) {
        e = g.enemies[i];
        if ((e.kind === 'cell') !== (pass === 0)) continue;
        Draw.enemy(ctx, e.type, e.x, e.y + (e.kind === 'virus' ? Math.sin(e.wobble) * 1.5 : 0), {
          phase: e.wobble,
          shieldFrac: e.maxShield ? e.shield / e.maxShield : undefined,
          tagged: e.tagT > 0,
          hpFrac: e.kind === 'cell' ? e.hp / e.maxHp : undefined
        });
      }
    }

    for (i = 0; i < g.towers.length; i++) {
      t = g.towers[i];
      var st = CTD.Adaptive.status(g, t);
      var o = towerOpts(g, t, time);
      o.dim = st && st.state === 'naive';
      var tx = t.x, ty = t.y;
      if (o.eat) {
        // the macrophage has left home: it stays attached by a stretchy foot
        tx += o.eat.cx;
        ty += o.eat.cy;
        if (Math.abs(o.eat.cx) + Math.abs(o.eat.cy) > 5) {
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(tx, ty);
          ctx.strokeStyle = INK;
          ctx.lineWidth = t.r * 0.42 + 5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.r * 0.5, 0, TAU);
          paint(ctx, COLORS.macrophage);
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(tx, ty);
          ctx.strokeStyle = COLORS.macrophage;
          ctx.lineWidth = t.r * 0.42;
          ctx.stroke();
        }
      }
      Draw.tower(ctx, t.type, tx, ty, t.r, o);
      drawTowerExtras(ctx, g, t, time);
    }

    // neutrophils on their one charge
    for (i = 0; i < g.units.length; i++) {
      var u = g.units[i], ub = u.tower.r * 0.72;
      var swell = u.state === 'fuse' ? 1 - u.timer / u.s.fuse : 0;
      if (u.state === 'fuse') {
        // where the net is about to land
        ctx.save();
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.s.blast, 0, TAU);
        ctx.fillStyle = 'rgba(255, 70, 60, ' + (0.08 + 0.14 * swell) + ')';
        ctx.fill();
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -time * 60;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255, 70, 60, ' + (0.5 + 0.5 * swell) + ')';
        ctx.stroke();
        ctx.restore();
      } else if (u.state !== 'return' && time - (u.puffT || 0) > 0.07) {
        u.puffT = time;
        effects.push({ kind: 'puff', x: u.x - Math.cos(u.dir) * 6, y: u.y + ub * 0.9, life: 0.35, max: 0.35 });
      }
      neutrophilGuy(ctx, u.x, u.y + (u.state === 'fuse' ? 0 : u.tower.r * 0.12), ub, { state: u.state, age: u.age, dir: u.dir, k: swell, time: time });
      if (u.state === 'run') {
        ctx.font = font(12);
        ctx.textAlign = 'center';
        outlined(ctx, 'AAAAH!', u.x + Math.sin(time * 60) * 1.5, u.y - ub * 2.6, '#fff27a', 3);
      }
    }

    drawEffects(ctx, dt);

    // placement ghost
    if (placing && ui.hover.on) {
      var ok = CTD.Game.canPlace(g, placing, ui.hover.x, ui.hover.y);
      var def = CTD.TOWERS[placing];
      rangeCircle(ctx, ui.hover.x, ui.hover.y, def.stats.range, ok ? 'rgba(255, 255, 255, 1)' : 'rgba(226, 60, 60, 1)');
      ctx.save();
      ctx.globalAlpha = ok ? 0.85 : 0.45;
      Draw.tower(ctx, placing, ui.hover.x, ui.hover.y, def.radius, { t: time });
      ctx.restore();
      if (ok) {
        // show which partners this spot would connect to
        var ghost = { x: ui.hover.x, y: ui.hover.y };
        for (i = 0; i < g.towers.length; i++) {
          t = g.towers[i];
          var d = CTD.dist(t.x, t.y, ghost.x, ghost.y);
          if (placing === 'helperT' && CTD.Adaptive.isPresenter(t) && d <= CTD.Adaptive.presentRange(t)) link(ctx, t, ghost, '#1d8f7a', 0.9);
          if (placing === 'helperT' && CTD.Adaptive.isEffector(t) && d <= def.stats.range) link(ctx, ghost, t, '#2f6fc4', 0.9);
          if ((placing === 'bcell' || placing === 'killerT') && t.type === 'helperT' && d <= CTD.Towers.range(t)) link(ctx, t, ghost, '#2f6fc4', 0.9);
          if (placing === 'dc' && t.type === 'helperT' && d <= def.stats.range) link(ctx, ghost, t, '#1d8f7a', 0.9);
        }
      }
    }

    ctx.restore(); // end of screen shake

    // clinic effects
    if (g.serumT > 0 || g.artT > 0) {
      ctx.font = font(14);
      ctx.textAlign = 'left';
      var yy = CTD.H - 12;
      if (g.serumT > 0) { outlined(ctx, 'Antibody serum: ' + Math.ceil(g.serumT) + 's', 10, yy, '#ffe08a', 4); yy -= 20 * textScale; }
      if (g.artT > 0) outlined(ctx, 'HIV medicine: ' + Math.ceil(g.artT) + 's', 10, yy, '#ff9fc0', 4);
    }

    // fever flash when something reaches the vital organs
    if (feverT > 0) {
      feverT -= dt;
      var grad = ctx.createRadialGradient(CTD.W / 2, CTD.H / 2, CTD.H * 0.35, CTD.W / 2, CTD.H / 2, CTD.W * 0.7);
      grad.addColorStop(0, 'rgba(255, 40, 40, 0)');
      grad.addColorStop(1, 'rgba(255, 40, 40, ' + 0.55 * Math.max(0, feverT / 0.7) + ')');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CTD.W, CTD.H);
    }

    drawBanners(ctx, dt);
  };
})();
