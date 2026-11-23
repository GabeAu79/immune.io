// Enemy stats. Edit numbers here to rebalance; no game logic lives in this file.
//
// hp      health            shield  glycan shield: soaks up innate damage first
// speed   pixels / second   detect  chance an innate cell recognises it (1 = always, 0 = never)
// reward  ATP for a kill    leak    Body Health lost if it reaches the end
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});

  // One antigen "colour" per virus family. Adaptive cells learn these one at a time.
  CTD.ANTIGENS = {
    common: { name: 'Common virus', color: '#6cc04a', dark: '#2f6b1c' },
    cloaked: { name: 'Cloaked virus', color: '#f08a24', dark: '#8a4a08' },
    stealth: { name: 'Stealth virus', color: '#9b6fe0', dark: '#4b2b8a' },
    hiv: { name: 'HIV', color: '#e0457b', dark: '#7d1740' }
  };
  CTD.ANTIGEN_ORDER = ['common', 'cloaked', 'stealth', 'hiv'];

  var E = (CTD.ENEMIES = {
    common: {
      name: 'Common virus', kind: 'virus', antigen: 'common',
      hp: 10, shield: 0, speed: 62, radius: 9, reward: 3, leak: 1, detect: 1
    },
    commonFast: {
      name: 'Fast common virus', kind: 'virus', antigen: 'common',
      hp: 7, shield: 0, speed: 104, radius: 7, reward: 3, leak: 1, detect: 1
    },
    commonTough: {
      name: 'Tough common virus', kind: 'virus', antigen: 'common',
      hp: 34, shield: 0, speed: 48, radius: 12, reward: 6, leak: 2, detect: 1
    },
    cloaked: {
      name: 'Cloaked virus', kind: 'virus', antigen: 'cloaked',
      hp: 12, shield: 12, speed: 58, radius: 10, reward: 5, leak: 1, detect: 0.4
    },
    stealth: {
      name: 'Stealth virus', kind: 'virus', antigen: 'stealth',
      hp: 15, shield: 0, speed: 60, radius: 9, reward: 6, leak: 2, detect: 0
    },
    hiv: {
      name: 'HIV', kind: 'virus', antigen: 'hiv',
      hp: 15, shield: 8, speed: 56, radius: 9, reward: 7, leak: 2, detect: 0.5,
      drain: 2.5, drainRange: 95 // CD4 drained per second from helper T-cells in reach
    }
  });

  // Infected cells: slow virus factories. They shed viruses while alive and burst
  // into more unless a killer T-cell or NK cell kills them cleanly.
  function infectedCell(antigen, virus, extra) {
    var def = {
      name: 'Infected cell (' + CTD.ANTIGENS[antigen].name + ')',
      kind: 'cell', antigen: antigen,
      hp: 110, shield: 0, speed: 30, radius: 20,
      reward: 10, cleanBonus: 18, leak: 8, detect: E[virus].detect,
      shed: { type: virus, every: 3.4 },
      burst: { type: virus, count: 6 }
    };
    for (var k in extra) def[k] = extra[k];
    E['cell_' + antigen] = def;
  }
  infectedCell('common', 'common');
  infectedCell('cloaked', 'cloaked');
  infectedCell('stealth', 'stealth');
  infectedCell('hiv', 'hiv', { drain: 5, drainRange: 115 });

  // Syncytium: many infected cells fused into one giant. Boss enemy.
  function syncytium(antigen, virus) {
    E['syn_' + antigen] = {
      name: 'Syncytium (' + CTD.ANTIGENS[antigen].name + ')',
      kind: 'cell', boss: true, antigen: antigen,
      hp: 650, shield: 0, speed: 20, radius: 32,
      reward: 40, cleanBonus: 80, leak: 30, detect: E[virus].detect,
      shed: { type: virus, every: 1.7 },
      burst: { type: 'cell_' + antigen, count: 3 },
      drain: E[virus].drain ? 7 : 0, drainRange: 130
    };
  }
  syncytium('common', 'common');
  syncytium('stealth', 'stealth');
  syncytium('hiv', 'hiv');
})();
