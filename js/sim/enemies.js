// Viruses and infected cells: spawning, movement, damage, death.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});
  var Enemies = (CTD.Enemies = {});
  var tmp = {};

  Enemies.spawn = function (g, type, d, opts) {
    var def = CTD.ENEMIES[type];
    var hpMul = (opts && opts.hpMul) || 1;
    var e = {
      id: g.nextId++, type: type, def: def, kind: def.kind, antigen: def.antigen,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      shield: (def.shield || 0) * hpMul, maxShield: (def.shield || 0) * hpMul,
      d: d || 0, x: 0, y: 0, radius: def.radius, hpMul: hpMul,
      slowT: 0, slowMul: 1, tagT: 0,
      seen: {}, // which innate cells recognised it (rolled once per cell)
      shedT: def.shed ? def.shed.every : 0,
      child: !!(opts && opts.child), // shed or burst from an infected cell
      dead: false, wobble: g.rng() * 6.28
    };
    CTD.Path.posAt(g.path, e.d, e);
    g.enemies.push(e);
    if (!g.seen[type]) g.seen[type] = true;
    return e;
  };

  // Slow an enemy to `mul` of its speed for `time` seconds (strongest slow wins).
  Enemies.slow = function (e, mul, time) {
    if (e.slowT <= 0) e.slowMul = 1;
    e.slowMul = Math.min(e.slowMul, mul);
    e.slowT = Math.max(e.slowT, time);
  };

  // src = { kind: 'innate' | 'antibody' | 'cyto' | 'serum', tower }
  Enemies.damage = function (g, e, amount, src) {
    if (e.dead) return;
    if (src.kind === 'innate') {
      if (e.tagT > 0) {
        amount *= 2; // antibody-tagged: phagocytes grab it easily (opsonisation)
      } else if (e.shield > 0) {
        var soak = Math.min(e.shield, amount);
        e.shield -= soak;
        amount -= soak;
      }
    }
    e.hp -= amount;
    if (e.hp <= 0) Enemies.kill(g, e, src);
  };

  Enemies.kill = function (g, e, src) {
    e.dead = true;
    var isCell = e.kind === 'cell';
    var clean = !isCell || src.kind === 'cyto';
    var reward = e.child ? (isCell ? e.def.reward * 0.5 : 1) : e.def.reward;
    if (isCell && clean) reward += e.child ? e.def.cleanBonus * 0.5 : e.def.cleanBonus;
    reward = Math.round(reward);
    g.atp += reward;
    g.stats.atpEarned += reward;
    var t = src.tower;
    if (t) {
      t.kills++;
      g.stats.kills[t.type] = (g.stats.kills[t.type] || 0) + 1;
      if (t.type === 'macrophage') {
        t.samples[e.antigen] = (t.samples[e.antigen] || 0) + t.s.samplePerKill;
      }
    } else if (src.kind === 'serum') {
      g.stats.kills.serum = (g.stats.kills.serum || 0) + 1;
    }
    if (isCell && !clean) {
      g.stats.bursts++;
      Enemies.burst(g, e);
      g.events.push({ type: 'burst', x: e.x, y: e.y, r: e.radius, reward: reward, antigen: e.antigen });
    } else if (isCell) {
      g.stats.cleanKills++;
      g.events.push({ type: 'clean', x: e.x, y: e.y, r: e.radius, reward: reward, antigen: e.antigen });
    } else {
      g.events.push({ type: 'pop', x: e.x, y: e.y, reward: reward, antigen: e.antigen });
    }
  };

  // An infected cell breaks open and releases what it was building.
  Enemies.burst = function (g, e) {
    var b = e.def.burst;
    var spread = b.type.indexOf('cell_') === 0 ? 34 : 11;
    for (var i = 0; i < b.count; i++) {
      var d = e.d + (i - (b.count - 1) / 2) * spread;
      Enemies.spawn(g, b.type, CTD.clamp(d, 0, g.path.length - 1), { hpMul: e.hpMul, child: true });
    }
  };

  Enemies.update = function (g, dt) {
    var list = g.enemies;
    var artOn = g.artT > 0;
    for (var i = 0, n = list.length; i < n; i++) {
      var e = list[i];
      if (e.dead) continue;
      if (e.tagT > 0) e.tagT -= dt;
      var speed = e.def.speed;
      if (e.slowT > 0) { e.slowT -= dt; speed *= e.slowMul; }
      e.d += speed * dt;
      e.wobble += dt * 3;

      if (e.d >= g.path.length) {
        Enemies.leak(g, e);
        continue;
      }
      CTD.Path.posAt(g.path, e.d, e);

      // Infected cells keep releasing new viruses while they are alive.
      if (e.def.shed && !(artOn && e.antigen === 'hiv')) {
        e.shedT -= dt;
        if (e.shedT <= 0) {
          e.shedT += e.def.shed.every;
          Enemies.spawn(g, e.def.shed.type, e.d + e.radius * 0.6, { hpMul: e.hpMul, child: true });
          g.events.push({ type: 'shed', x: e.x, y: e.y });
        }
      }

      // HIV attacks helper T-cells within reach.
      if (e.def.drain && !artOn) {
        for (var j = 0; j < g.towers.length; j++) {
          var t = g.towers[j];
          if (t.type !== 'helperT' || t.dead) continue;
          if (CTD.dist(t.x, t.y, e.x, e.y) <= e.def.drainRange) {
            t.drainRate += e.def.drain;
          }
        }
      }
    }
  };

  // Reached the vital organs: fever and inflammation burn it off, at a cost.
  Enemies.leak = function (g, e) {
    e.dead = true;
    g.health -= e.def.leak;
    g.stats.leaks++;
    g.stats.healthLost += e.def.leak;
    g.stats.leakBy[e.antigen] = (g.stats.leakBy[e.antigen] || 0) + 1;
    CTD.Path.posAt(g.path, g.path.length, tmp);
    g.events.push({ type: 'leak', x: tmp.x, y: tmp.y, amount: e.def.leak });
    if (g.health <= 0) {
      g.health = 0;
      if (!g.over) {
        g.over = true;
        g.events.push({ type: 'gameover' });
      }
    }
  };
})();
