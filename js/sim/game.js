// Game state: money (ATP), Body Health, waves, placing and upgrading cells, clinic items.
// Nothing in js/sim/ touches the page, so the same code runs headless in tools/sim.js.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});
  var Game = (CTD.Game = {});

  Game.create = function (opts) {
    opts = opts || {};
    var R = CTD.RULES;
    var mode = opts.mode || 'class';
    return {
      mode: mode,
      seed: opts.seed || 1,
      rng: CTD.makeRng(opts.seed || 1),
      path: CTD.Path.build(CTD.MAP.points),
      wave: 0, // waves started so far
      inWave: false,
      waveClock: 0,
      queue: [], // enemies still to spawn this wave: { t, type }
      hpMul: 1,
      atp: mode === 'freeplay' ? 1200 : R.startAtp,
      health: R.startHealth,
      towers: [],
      enemies: [],
      units: [], // neutrophils in flight
      vaccine: {}, // antigen -> last wave number it protects
      serumT: 0, serumCd: 0, artT: 0, artCd: 0,
      seen: {}, // enemy types that have appeared
      events: [], // drained by the page for effects, sounds and pop-ups
      nextId: 1,
      time: 0,
      over: false,
      won: false,
      stats: { kills: {}, bursts: 0, cleanKills: 0, leaks: 0, healthLost: 0, helpersLost: 0, atpEarned: 0, learned: {}, leakBy: {}, vaccines: 0 }
    };
  };

  Game.unlocked = function (g, type) {
    if (g.mode === 'freeplay') return true;
    if (CTD.TOWERS[type].arm !== 'adaptive') return true;
    return g.wave + 1 >= CTD.RULES.adaptiveUnlockWave;
  };

  Game.artUnlocked = function (g) {
    return g.mode === 'freeplay' || g.wave + 1 >= CTD.RULES.artUnlockWave;
  };

  Game.vaccineActive = function (g, antigen) {
    var until = g.vaccine[antigen];
    return until !== undefined && g.wave <= until;
  };

  // --- placing, upgrading, selling ---

  Game.canPlace = function (g, type, x, y) {
    var r = CTD.TOWERS[type].radius;
    if (x < r || y < r || x > CTD.W - r || y > CTD.H - r) return false;
    if (CTD.Path.nearest(g.path, x, y).dist < CTD.MAP.vesselHalfWidth + r - 2) return false;
    for (var i = 0; i < g.towers.length; i++) {
      var t = g.towers[i];
      if (CTD.dist(x, y, t.x, t.y) < r + t.r + 2) return false;
    }
    return true;
  };

  Game.place = function (g, type, x, y) {
    var def = CTD.TOWERS[type];
    if (!Game.unlocked(g, type) || g.atp < def.cost || !Game.canPlace(g, type, x, y)) return null;
    g.atp -= def.cost;
    var t = CTD.Towers.create(g, type, x, y);
    g.towers.push(t);
    return t;
  };

  Game.upgrade = function (g, t, i) {
    var cost = CTD.Towers.upgradeCost(t, i);
    if (cost === null || g.atp < cost) return false;
    g.atp -= cost;
    t.spent += cost;
    t.levels[i]++;
    CTD.Towers.recalc(t);
    return true;
  };

  Game.sellValue = function (t) {
    return Math.round(t.spent * CTD.RULES.sellBack);
  };

  Game.sell = function (g, t) {
    if (t.dead) return;
    t.dead = true;
    g.atp += Game.sellValue(t);
    g.towers = g.towers.filter(function (o) { return o !== t; });
  };

  // --- clinic items ---

  // Vaccine: between waves only. Trains adaptive cells against one virus type for a few waves.
  Game.canVaccinate = function (g, antigen) {
    return !g.inWave && antigen !== 'hiv' && g.atp >= CTD.RULES.vaccineCost &&
      Game.unlocked(g, 'helperT') && !(g.vaccine[antigen] >= g.wave + CTD.RULES.vaccineWaves);
  };

  Game.buyVaccine = function (g, antigen) {
    if (!Game.canVaccinate(g, antigen)) return false;
    g.atp -= CTD.RULES.vaccineCost;
    g.vaccine[antigen] = g.wave + CTD.RULES.vaccineWaves;
    g.stats.vaccines++;
    return true;
  };

  // Antibody serum: donated antibodies. Works at once, wears off, teaches the body nothing.
  Game.canSerum = function (g) {
    return g.inWave && g.serumCd <= 0 && g.atp >= CTD.RULES.serumCost;
  };

  Game.useSerum = function (g) {
    if (!Game.canSerum(g)) return false;
    g.atp -= CTD.RULES.serumCost;
    g.serumT = CTD.RULES.serumTime;
    g.serumCd = CTD.RULES.serumCooldown;
    return true;
  };

  // Antiretroviral therapy: stops HIV attacking helper T-cells and stops HIV factories shedding.
  Game.canArt = function (g) {
    return Game.artUnlocked(g) && g.inWave && g.artCd <= 0 && g.atp >= CTD.RULES.artCost;
  };

  Game.useArt = function (g) {
    if (!Game.canArt(g)) return false;
    g.atp -= CTD.RULES.artCost;
    g.artT = CTD.RULES.artTime;
    g.artCd = CTD.RULES.artCooldown;
    return true;
  };

  // --- waves ---

  Game.nextWaveSpec = function (g) {
    return CTD.Waves.get(g.mode, g.wave + 1, g.seed);
  };

  Game.startWave = function (g) {
    if (g.inWave || g.over) return false;
    var spec = Game.nextWaveSpec(g);
    g.wave++;
    g.inWave = true;
    g.waveClock = 0;
    g.hpMul = spec.hp;
    g.queue = [];
    spec.g.forEach(function (grp) {
      for (var i = 0; i < grp[1]; i++) g.queue.push({ t: grp[3] + i * grp[2], type: grp[0] });
    });
    g.queue.sort(function (a, b) { return a.t - b.t; });
    g.events.push({ type: 'waveStart', wave: g.wave });
    return true;
  };

  function endWave(g) {
    var R = CTD.RULES;
    g.inWave = false;
    g.units = [];
    var bonus = R.waveBonusBase + R.waveBonusPerWave * g.wave;
    g.atp += bonus;
    g.stats.atpEarned += bonus;
    g.serumT = 0;
    g.artT = 0;
    var mutated = CTD.Adaptive.mutateHiv(g);
    g.events.push({ type: 'waveEnd', wave: g.wave, bonus: bonus, hivMutated: mutated });
    if (g.mode === 'class' && g.wave === R.classWaves && !g.won) {
      g.won = true;
      g.events.push({ type: 'win' });
    }
  }

  // Serum: every free virus (except HIV) is tagged, slowed and slowly neutralised.
  function serumTick(g, dt) {
    var src = { kind: 'serum', tower: null };
    for (var i = 0, n = g.enemies.length; i < n; i++) {
      var e = g.enemies[i];
      if (e.dead || e.kind !== 'virus' || e.antigen === 'hiv') continue;
      e.tagT = Math.max(e.tagT, 0.5);
      CTD.Enemies.slow(e, 0.7, 0.5);
      CTD.Enemies.damage(g, e, 1.2 * g.hpMul * dt, src);
    }
  }

  // Advance the simulation by dt seconds (call with a fixed small step).
  Game.step = function (g, dt) {
    if (g.over) return;
    g.time += dt;
    if (g.serumCd > 0) g.serumCd -= dt;
    if (g.artCd > 0) g.artCd -= dt;
    if (g.serumT > 0) { g.serumT -= dt; serumTick(g, dt); }
    if (g.artT > 0) g.artT -= dt;

    if (g.inWave) {
      g.waveClock += dt;
      while (g.queue.length && g.queue[0].t <= g.waveClock) {
        CTD.Enemies.spawn(g, g.queue.shift().type, 0, { hpMul: g.hpMul });
      }
    }

    CTD.Adaptive.update(g, dt);
    CTD.Towers.update(g, dt);
    CTD.Towers.updateUnits(g, dt);
    CTD.Enemies.update(g, dt);

    var alive = false;
    for (var i = 0; i < g.enemies.length; i++) if (!g.enemies[i].dead) { alive = true; break; }
    g.enemies = g.enemies.filter(function (e) { return !e.dead; });

    if (g.inWave && !g.queue.length && !alive && !g.over) endWave(g);
  };
})();
