// Wave scripts for Class mode, and the generator for Freeplay.
// Each group is [enemy type, how many, seconds between spawns, seconds after wave start].
// `hp` multiplies every enemy's health for that wave.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});

  var CLASS = [
    /* 1 */ { hp: 1.0, g: [['common', 12, 1.1, 0]] },
    /* 2 */ { hp: 1.0, g: [['common', 18, 0.8, 0], ['commonFast', 5, 0.9, 10]] },
    /* 3 */ { hp: 1.05, g: [['common', 16, 0.7, 0], ['commonFast', 8, 0.6, 6], ['cell_common', 1, 0, 9]] },
    /* 4 */ { hp: 1.1, g: [['common', 14, 0.7, 0], ['cloaked', 8, 1.2, 5], ['cell_common', 1, 0, 14]] },
    /* 5 */ { hp: 1.15, g: [['cloaked', 14, 0.9, 0], ['commonFast', 12, 0.5, 4], ['commonTough', 4, 2, 6], ['cell_common', 2, 6, 10]] },
    /* 6 */ { hp: 1.25, g: [['common', 14, 0.6, 0], ['stealth', 8, 1.6, 6], ['cell_cloaked', 1, 0, 12]] },
    /* 7 */ { hp: 1.35, g: [['stealth', 14, 1.1, 0], ['cloaked', 12, 0.9, 3], ['commonTough', 5, 2, 5], ['cell_stealth', 1, 0, 14]] },
    /* 8 */ { hp: 1.5, g: [['stealth', 20, 0.8, 0], ['commonTough', 10, 1.4, 2], ['cell_cloaked', 2, 7, 8], ['cell_stealth', 2, 7, 12]] },
    /* 9 */ { hp: 1.65, g: [['commonFast', 24, 0.35, 0], ['cloaked', 16, 0.7, 4], ['stealth', 14, 0.8, 8], ['cell_common', 3, 5, 6], ['cell_stealth', 1, 0, 20]] },
    /* 10 */ { hp: 1.8, g: [['common', 20, 0.5, 0], ['stealth', 12, 0.9, 5], ['syn_common', 1, 0, 10], ['cloaked', 12, 0.8, 16]] },
    /* 11 */ { hp: 2.0, g: [['commonTough', 14, 0.9, 0], ['stealth', 22, 0.6, 3], ['cloaked', 18, 0.6, 8], ['cell_cloaked', 3, 5, 6], ['cell_stealth', 3, 5, 9]] },
    /* 12 */ { hp: 2.1, g: [['common', 20, 0.5, 0], ['hiv', 10, 1.4, 6], ['stealth', 10, 0.9, 10], ['cell_common', 2, 6, 8]] },
    /* 13 */ { hp: 2.25, g: [['hiv', 18, 0.9, 0], ['stealth', 16, 0.7, 4], ['commonTough', 10, 1.2, 6], ['cell_hiv', 2, 8, 10], ['cell_stealth', 2, 8, 14]] },
    /* 14 */ { hp: 2.4, g: [['hiv', 24, 0.7, 0], ['cloaked', 20, 0.5, 5], ['cell_hiv', 3, 6, 8], ['syn_stealth', 1, 0, 16], ['stealth', 14, 0.8, 18]] },
    /* 15 */ { hp: 2.6, g: [['commonFast', 30, 0.3, 0], ['hiv', 26, 0.6, 4], ['stealth', 24, 0.6, 8], ['cloaked', 20, 0.6, 12], ['cell_hiv', 3, 6, 10], ['cell_stealth', 3, 6, 14], ['syn_hiv', 1, 0, 22], ['syn_common', 1, 0, 30]] }
  ];

  // Rough "cost" of each enemy when the Freeplay generator spends its budget.
  var COST = {
    common: 1, commonFast: 1.2, commonTough: 3, cloaked: 2.5, stealth: 3, hiv: 4,
    cell_common: 14, cell_cloaked: 16, cell_stealth: 18, cell_hiv: 20,
    syn_common: 70, syn_stealth: 80, syn_hiv: 90
  };

  function generate(level, seed) {
    var rng = CTD.makeRng(seed + level * 7919);
    var pool = ['common', 'commonFast', 'commonTough', 'cloaked', 'stealth', 'cell_common', 'cell_cloaked', 'cell_stealth'];
    if (level >= 9) pool.push('hiv', 'hiv', 'cell_hiv');
    if (level >= 11) pool.push('syn_common', 'syn_stealth');
    if (level >= 14) pool.push('syn_hiv');
    var budget = 40 + level * level * 1.5;
    var hp = 1 + 0.12 * (level - 1);
    if (level > 16) hp *= Math.pow(1.06, level - 16);
    var groups = [];
    var nGroups = 4 + Math.min(4, Math.floor(level / 5));
    for (var i = 0; i < nGroups; i++) {
      var type = pool[Math.floor(rng() * pool.length)];
      var share = (budget / nGroups) * (0.7 + rng() * 0.6);
      var count = Math.max(1, Math.round(share / COST[type]));
      var big = COST[type] >= 10;
      if (COST[type] >= 60) count = Math.min(count, 1 + Math.floor(level / 12));
      var gap = big ? 4 + rng() * 3 : Math.max(0.22, 0.9 - level * 0.02) * (0.7 + rng() * 0.6);
      groups.push([type, count, gap, i * 3 + rng() * 4]);
    }
    return { hp: hp, g: groups };
  }

  CTD.Waves = {
    // mode 'class': waves 1-15 are scripted, later ones generated.
    // mode 'freeplay': every wave is generated, starting a little harder.
    get: function (mode, n, seed) {
      if (mode === 'class' && n <= CLASS.length) return CLASS[n - 1];
      return generate(mode === 'class' ? n : n + 4, seed || 1);
    },
    // Count of each enemy type in a wave, for the "next wave" preview.
    summary: function (wave) {
      var out = {};
      wave.g.forEach(function (grp) {
        out[grp[0]] = (out[grp[0]] || 0) + grp[1];
      });
      return out;
    }
  };
})();
