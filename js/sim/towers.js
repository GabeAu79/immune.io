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
      launchCd: 0, // neutrophil: time until it next looks for a target
      eat: null, // macrophage: the lunge in progress
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
  // It physically lunges at its target, bites, and snaps back home. The target is
  // chosen within the normal range; the lunge is animation and a split-second delay.
  // t.eat = { target, phase: 'out' | 'back', t, out, back, cx, cy (current offset from home) ... }
  function eatPlace(t, eat) {
    var k;
    if (eat.phase === 'out') {
      var dx = eat.tx - t.x, dy = eat.ty - t.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var reach = Math.max(0, d - t.r * 0.5);
      k = Math.min(1, eat.t / eat.out);
      k = 1 - (1 - k) * (1 - k);
      eat.cx = eat.ox + ((dx / d) * reach - eat.ox) * k;
      eat.cy = eat.oy + ((dy / d) * reach - eat.oy) * k;
    } else {
      k = Math.min(1, eat.t / eat.back);
      k = k * k * (3 - 2 * k);
      eat.cx = eat.ox * (1 - k);
      eat.cy = eat.oy * (1 - k);
    }
  }

  function eatReturn(eat, ate) {
    eat.phase = 'back';
    eat.t = 0;
    eat.ox = eat.cx;
    eat.oy = eat.cy;
    eat.ate = ate;
  }

  act.macrophage = function (g, t, dt) {
    var eat = t.eat;
    if (eat) {
      eat.t += dt;
      if (eat.phase === 'out') {
        var prey = eat.target;
        if (prey.dead) {
          // Someone else got it first: turn around, and be ready to pick again at once.
          eatReturn(eat, false);
          t.cd = 0;
        } else {
          eat.tx = prey.x;
          eat.ty = prey.y;
          eatPlace(t, eat);
          if (eat.t < eat.out) return;
          g.events.push({ type: 'gulp', x: prey.x, y: prey.y });
          CTD.Enemies.damage(g, prey, t.s.damage * (1 + t.boost), { kind: 'innate', tower: t });
          eatReturn(eat, true);
        }
      }
      eatPlace(t, eat);
      if (eat.t >= eat.back) { t.eat = null; eat = null; }
    }
    if (t.cd > 0) return;
    var range = Towers.range(t);
    var e = firstInRange(g, t, range, function (e) { return e.kind === 'virus' && Towers.sees(g, t, e); }) ||
      firstInRange(g, t, range, function (e) { return e.kind === 'cell' && Towers.sees(g, t, e); });
    if (!e) return;
    aimAt(t, e);
    t.cd = t.s.cooldown;
    t.eat = {
      target: e, tx: e.x, ty: e.y, phase: 'out', t: 0,
      out: Math.min(0.14, t.s.cooldown * 0.3), back: Math.min(0.24, t.s.cooldown * 0.5),
      ox: eat ? eat.cx : 0, oy: eat ? eat.cy : 0, cx: eat ? eat.cx : 0, cy: eat ? eat.cy : 0, ate: false
    };
  };

  // Neutrophil: single use. It waits, then charges at the busiest group of enemies
  // it can recognise, swells up and bursts into a sticky net. Then it is gone.
  // It will not pile onto a group another neutrophil is already heading for.
  function pickCluster(g, t) {
    var range = Towers.range(t), blast = t.s.blast;
    var best = null, bestScore = -1, i, j;
    for (i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (e.dead || CTD.dist(t.x, t.y, e.x, e.y) > range + e.radius || !Towers.sees(g, t, e)) continue;
      var claimed = false;
      for (j = 0; j < g.units.length; j++) {
        var u = g.units[j];
        if (u.state !== 'return' && !u.target.dead && CTD.dist(u.target.x, u.target.y, e.x, e.y) <= u.s.blast) { claimed = true; break; }
      }
      if (claimed) continue;
      var score = 0;
      for (j = 0; j < g.enemies.length; j++) {
        var o = g.enemies[j];
        if (!o.dead && CTD.dist(o.x, o.y, e.x, e.y) <= blast + o.radius) score += o.kind === 'cell' ? 2 : 1;
      }
      if (score > bestScore || (score === bestScore && e.d > best.d)) { best = e; bestScore = score; }
    }
    return best;
  }

  act.neutrophil = function (g, t, dt) {
    t.launchCd -= dt;
    if (t.launchCd > 0) return;
    t.launchCd = 0.15;
    var e = pickCluster(g, t);
    if (!e) return;
    aimAt(t, e);
    t.dead = true; // it leaves its post; Towers.update takes it off the list
    g.units.push({
      x: t.x, y: t.y, tx: e.x, ty: e.y, target: e, tower: t, s: t.s,
      state: 'windup', timer: t.s.windup, age: 0, dir: t.aim, dead: false
    });
    g.events.push({ type: 'charge', x: t.x, y: t.y });
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
    // neutrophils that just charged have left their posts
    for (i = 0; i < g.towers.length; i++) {
      if (g.towers[i].dead) {
        g.towers = g.towers.filter(function (t) { return !t.dead; });
        break;
      }
    }
  };

  // A neutrophil on its one and only charge.
  //   windup : spots the target and revs up on the spot
  //   run    : sprints at it
  //   fuse   : clings on and swells up
  //   return : target vanished before it got there, so it trots home and waits again
  Towers.updateUnits = function (g, dt) {
    for (var i = 0; i < g.units.length; i++) {
      var u = g.units[i];
      var t = u.tower;
      u.age += dt;

      if (u.state === 'fuse') {
        // It bursts where it is, even if its target is already gone.
        if (!u.target.dead) { u.x = u.target.x; u.y = u.target.y; }
        u.timer -= dt;
        if (u.timer <= 0) explode(g, u);
        continue;
      }

      if (u.state === 'return' || u.target.dead) {
        var again = pickCluster(g, t);
        if (again) {
          u.target = again;
          if (u.state === 'return') u.state = 'run';
        } else if (u.state !== 'return') {
          u.state = 'return';
          g.events.push({ type: 'confused', x: u.x, y: u.y });
        }
      }

      if (u.state === 'windup') {
        u.dir = Math.atan2(u.target.y - u.y, u.target.x - u.x);
        u.timer -= dt;
        if (u.timer <= 0) u.state = 'run';
        continue;
      }

      var home = u.state === 'return';
      u.tx = home ? t.x : u.target.x;
      u.ty = home ? t.y : u.target.y;
      var dx = u.tx - u.x, dy = u.ty - u.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var step = u.s.flySpeed * (home ? 0.5 : 1) * dt;
      if (d > step + (home ? 0 : 6)) {
        u.dir = Math.atan2(dy, dx);
        u.x += (dx / d) * step;
        u.y += (dy / d) * step;
      } else if (home) {
        // Back at its post. If something was built there meanwhile, refund it instead.
        u.dead = true;
        if (CTD.Game.canPlace(g, t.type, t.x, t.y)) {
          t.dead = false;
          t.launchCd = 0.3;
          g.towers.push(t);
        } else {
          g.atp += t.spent;
          g.events.push({ type: 'refund', x: t.x, y: t.y, amount: t.spent });
        }
      } else {
        u.state = 'fuse';
        u.timer = u.s.fuse;
        g.events.push({ type: 'fuse', x: u.x, y: u.y });
      }
    }
    g.units = g.units.filter(function (u) { return !u.dead; });
  };

  // The net catches everything nearby, whether or not it was recognised.
  // That includes infected cells, which burst if this kills them.
  function explode(g, u) {
    var t = u.tower, s = u.s;
    u.dead = true;
    g.stats.netsThrown = (g.stats.netsThrown || 0) + 1;
    g.events.push({ type: 'net', x: u.x, y: u.y, r: s.blast, time: s.slowTime });
    var src = { kind: 'innate', tower: t };
    var n = g.enemies.length;
    for (var i = 0; i < n; i++) {
      var e = g.enemies[i];
      if (e.dead) continue;
      if (CTD.dist(u.x, u.y, e.x, e.y) > s.blast + e.radius) continue;
      CTD.Enemies.slow(e, s.slow, s.slowTime);
      CTD.Enemies.damage(g, e, s.damage, src);
    }
  }

  Towers.upgradeCost = function (t, i) {
    var u = t.def.upgrades[i];
    return t.levels[i] < u.costs.length ? u.costs[t.levels[i]] : null;
  };
})();
