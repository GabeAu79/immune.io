// Immune cells (towers): stats, detection, targeting and attacks.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});
  var Towers = (CTD.Towers = {});

  Towers.create = function (g, type, x, y) {
    var def = CTD.TOWERS[type];
    var t = {
      id: g.nextId++, type: type, def: def, x: x, y: y, r: def.radius,
      levels: def.upgrades.map(function () { return 0; }),
      spent: def.cost, cd: 0, kills: 0, dead: false,
      s: {}, // current stats after upgrades
      buff: 0, // range bonus from a nearby dendritic cell
      boost: 0, // damage bonus from an active helper T-cell (macrophages)
      samples: {}, // antigen samples collected (presenters)
      prime: {}, active: {}, // helper T: priming progress / activated antigens
      learn: {}, learned: {}, // B and killer T: activation progress / learned antigens
      help: {}, // antigens for which a living helper is in range right now
      helpers: [], presenters: [],
      cd4: 0, drainT: 0, drainRate: 0,
      squad: [], launchCd: 0,
      aim: 0, flash: 0
    };
    Towers.recalc(t);
    t.cd4 = t.s.cd4 || 0;
    return t;
  };

  // Recompute stats from base values and upgrade levels.
  Towers.recalc = function (t) {
    var s = {}, k;
    for (k in t.def.stats) s[k] = t.def.stats[k];
    t.def.upgrades.forEach(function (u, i) {
      var lv = t.levels[i];
      if (!lv) return;
      for (k in u.mul || {}) s[k] *= u.mul[k][lv - 1];
      for (k in u.set || {}) s[k] = u.set[k][lv - 1];
      for (k in u.add || {}) s[k] += u.add[k][lv - 1];
    });
    t.s = s;
    if (t.type === 'neutrophil') {
      while (t.squad.length < s.squad) t.squad.push({ state: 'ready', t: 0 });
    }
  };

  Towers.range = function (t) {
    return t.s.range * (1 + t.buff);
  };

  // Can this innate cell recognise that enemy? Rolled once per cell-enemy pair.
  // Antibody-tagged enemies are always visible.
  Towers.sees = function (g, t, e) {
    if (e.tagT > 0) return true;
    var p = e.def.detect;
    if (p >= 1) return true;
    if (p <= 0) return false;
    var seen = e.seen[t.id];
    if (seen === undefined) seen = e.seen[t.id] = g.rng() < p;
    return seen;
  };

  Towers.knows = function (g, t, antigen) {
    return !!t.learned[antigen] || CTD.Game.vaccineActive(g, antigen);
  };

  // The enemy furthest along the vessel that passes `ok`, within range.
  function firstInRange(g, t, range, ok) {
    var best = null;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (e.dead) continue;
      if (CTD.dist(t.x, t.y, e.x, e.y) > range + e.radius) continue;
      if (!ok(e)) continue;
      if (!best || e.d > best.d) best = e;
    }
    return best;
  }
  Towers.firstInRange = firstInRange;

  function aimAt(t, e) {
    t.aim = Math.atan2(e.y - t.y, e.x - t.x);
    t.flash = 0.15;
  }

  var act = {};

  // Macrophage: engulfs free viruses; only chews on infected cells if nothing else is near.
  act.macrophage = function (g, t, dt) {
    if (t.cd > 0) return;
    var range = Towers.range(t);
    var e = firstInRange(g, t, range, function (e) { return e.kind === 'virus' && Towers.sees(g, t, e); }) ||
      firstInRange(g, t, range, function (e) { return e.kind === 'cell' && Towers.sees(g, t, e); });
    if (!e) return;
    aimAt(t, e);
    t.cd = t.s.cooldown;
    g.events.push({ type: 'gulp', x: t.x, y: t.y, tx: e.x, ty: e.y });
    CTD.Enemies.damage(g, e, t.s.damage * (1 + t.boost), { kind: 'innate', tower: t });
  };

  // Neutrophil: sends out short-lived cells that burst into a sticky net.
  act.neutrophil = function (g, t, dt) {
    t.launchCd -= dt;
    for (var i = 0; i < t.squad.length; i++) {
      var m = t.squad[i];
      if (m.state === 'respawn') {
        m.t -= dt;
        if (m.t <= 0) m.state = 'ready';
      } else if (m.state === 'ready' && t.launchCd <= 0) {
        var e = firstInRange(g, t, Towers.range(t), function (e) { return Towers.sees(g, t, e); });
        if (e) {
          aimAt(t, e);
          m.state = 'out';
          t.launchCd = 0.35;
          g.units.push({ x: t.x, y: t.y, tx: e.x, ty: e.y, target: e, tower: t, member: m, dead: false });
        }
      }
    }
  };

  // NK cell: kills infected cells cleanly. Never attacks free virus.
  act.nk = function (g, t, dt) {
    if (t.cd > 0) return;
    var e = firstInRange(g, t, Towers.range(t), function (e) { return e.kind === 'cell'; });
    if (!e) return;
    aimAt(t, e);
    t.cd = t.s.cooldown;
    g.events.push({ type: 'zap', x: t.x, y: t.y, tx: e.x, ty: e.y, by: 'nk' });
    CTD.Enemies.damage(g, e, t.s.damage, { kind: 'cyto', tower: t });
  };

  // B cell: fast antibodies at free viruses it has learned. Antibodies tag and slow.
  act.bcell = function (g, t, dt) {
    if (t.cd > 0) return;
    var range = Towers.range(t);
    function ok(e) { return e.kind === 'virus' && Towers.knows(g, t, e.antigen); }
    var e = firstInRange(g, t, range, function (e) { return ok(e) && e.tagT <= 0; }) || firstInRange(g, t, range, ok);
    if (!e) return;
    aimAt(t, e);
    var helped = t.help[e.antigen];
    t.cd = t.s.cooldown / (helped ? 1 : CTD.RULES.unhelpedOutput);
    e.tagT = Math.max(e.tagT, t.s.tagTime);
    CTD.Enemies.slow(e, t.s.slow, 1);
    g.events.push({ type: 'antibody', x: t.x, y: t.y, tx: e.x, ty: e.y, antigen: e.antigen });
    CTD.Enemies.damage(g, e, t.s.damage, { kind: 'antibody', tower: t });
  };

  // Killer T-cell: slow, but one hit cleanly kills an infected cell it has learned.
  act.killerT = function (g, t, dt) {
    if (t.cd > 0) return;
    var range = Towers.range(t);
    var hit = 0, helped = true, done = {};
    for (var n = 0; n < t.s.targets; n++) {
      var e = firstInRange(g, t, range, function (e) { return e.kind === 'cell' && !done[e.id] && Towers.knows(g, t, e.antigen); });
      if (!e) break;
      done[e.id] = true;
      aimAt(t, e);
      if (!t.help[e.antigen]) helped = false;
      g.events.push({ type: 'zap', x: t.x, y: t.y, tx: e.x, ty: e.y, by: 'killerT' });
      CTD.Enemies.damage(g, e, e.def.boss ? t.s.bossDamage : e.hp, { kind: 'cyto', tower: t });
      hit++;
    }
    if (hit) t.cd = t.s.cooldown / (helped ? 1 : CTD.RULES.unhelpedOutput);
  };

  Towers.update = function (g, dt) {
    for (var i = 0; i < g.towers.length; i++) {
      var t = g.towers[i];
      if (t.cd > 0) t.cd -= dt;
      if (t.flash > 0) t.flash -= dt;
      if (act[t.type]) act[t.type](g, t, dt);
    }
  };

  // Neutrophils in flight.
  Towers.updateUnits = function (g, dt) {
    for (var i = 0; i < g.units.length; i++) {
      var u = g.units[i];
      var t = u.tower;
      if (t.dead) { u.dead = true; continue; }
      if (u.target && u.target.dead) {
        // Target gone: pick another, or head home.
        u.target = firstInRange(g, t, Towers.range(t), function (e) { return Towers.sees(g, t, e); });
        if (!u.target) {
          u.dead = true;
          u.member.state = 'respawn';
          u.member.t = 0.6;
          continue;
        }
      }
      u.tx = u.target.x;
      u.ty = u.target.y;
      var dx = u.tx - u.x, dy = u.ty - u.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var step = t.s.flySpeed * dt;
      if (d <= step + 6) {
        explode(g, u);
      } else {
        u.x += (dx / d) * step;
        u.y += (dy / d) * step;
      }
    }
    g.units = g.units.filter(function (u) { return !u.dead; });
  };

  // The net catches everything nearby, whether or not it was recognised.
  // That includes infected cells, which burst if this kills them.
  function explode(g, u) {
    var t = u.tower;
    u.dead = true;
    u.member.state = 'respawn';
    u.member.t = t.s.respawn;
    g.events.push({ type: 'net', x: u.tx, y: u.ty, r: t.s.blast });
    var src = { kind: 'innate', tower: t };
    var n = g.enemies.length;
    for (var i = 0; i < n; i++) {
      var e = g.enemies[i];
      if (e.dead) continue;
      if (CTD.dist(u.tx, u.ty, e.x, e.y) > t.s.blast + e.radius) continue;
      CTD.Enemies.slow(e, t.s.slow, t.s.slowTime);
      CTD.Enemies.damage(g, e, t.s.damage, src);
    }
  }

  Towers.upgradeCost = function (t, i) {
    var u = t.def.upgrades[i];
    return t.levels[i] < u.costs.length ? u.costs[t.levels[i]] : null;
  };
})();
