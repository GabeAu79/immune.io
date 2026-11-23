// Defender (immune cell) stats, prices and upgrade tracks.
// Edit numbers here to rebalance; wording lives in text.js.
//
// Upgrade tracks: `mul` multiplies a stat, `set` replaces it, `add` adds to it.
// Each array holds the value at level 1, 2, 3...
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});

  CTD.RULES = {
    startAtp: 400,
    startHealth: 100,
    sellBack: 0.7,
    waveBonusBase: 100,
    waveBonusPerWave: 15,
    sampleThreshold: 12, // antigen samples a presenter needs before it can present
    primeTime: 6, // seconds for a helper T-cell to be primed (at speed 1)
    learnTime: 4, // seconds for a B / killer T cell to be activated by a helper
    unhelpedOutput: 0.25, // B / killer T output without a living, active helper T in range
    cd4Regen: 2, // helper T CD4 recovered per second when HIV is not attacking it
    cd4DrainCap: 12, // most CD4 one helper T can lose per second, however much HIV is near
    vaccineCost: 150,
    vaccineWaves: 5,
    serumCost: 90,
    serumTime: 10,
    serumCooldown: 25,
    artCost: 110,
    artTime: 20,
    artCooldown: 30,
    adaptiveUnlockWave: 4,
    artUnlockWave: 12,
    classWaves: 15
  };

  CTD.TOWER_ORDER = ['macrophage', 'neutrophil', 'nk', 'dc', 'helperT', 'bcell', 'killerT'];

  CTD.TOWERS = {
    macrophage: {
      arm: 'innate', cost: 110, radius: 17,
      stats: { range: 78, damage: 5, cooldown: 0.75, presentRange: 70, presentSpeed: 0.33, samplePerKill: 1 },
      upgrades: [
        { key: 'damage', costs: [70, 120, 200], mul: { damage: [1.5, 2.2, 3.2] } },
        { key: 'range', costs: [50, 90, 140], mul: { range: [1.15, 1.3, 1.45] } },
        { key: 'speed', costs: [60, 110, 180], mul: { cooldown: [0.8, 0.64, 0.5] } },
        { key: 'present', costs: [50, 80, 120], mul: { presentSpeed: [1.5, 2.2, 3], presentRange: [1.2, 1.4, 1.6] }, set: { samplePerKill: [2, 3, 4] } }
      ]
    },
    neutrophil: {
      arm: 'innate', cost: 150, radius: 17,
      stats: { range: 115, damage: 9, blast: 44, respawn: 3.5, squad: 1, flySpeed: 240, slow: 0.5, slowTime: 2 },
      upgrades: [
        { key: 'damage', costs: [70, 120, 190], mul: { damage: [1.5, 2.2, 3.0] } },
        { key: 'range', costs: [60, 100, 160], mul: { blast: [1.2, 1.4, 1.6], range: [1.1, 1.2, 1.3] } },
        { key: 'speed', costs: [70, 120, 190], mul: { respawn: [0.75, 0.55, 0.4] } },
        { key: 'squad', costs: [150, 260], add: { squad: [1, 2] } }
      ]
    },
    nk: {
      arm: 'innate', cost: 180, radius: 16,
      stats: { range: 105, damage: 36, cooldown: 1.1 },
      upgrades: [
        { key: 'damage', costs: [80, 140, 220], mul: { damage: [1.6, 2.4, 3.5] } },
        { key: 'range', costs: [60, 100, 160], mul: { range: [1.15, 1.3, 1.45] } },
        { key: 'speed', costs: [70, 120, 190], mul: { cooldown: [0.8, 0.64, 0.5] } }
      ]
    },
    dc: {
      arm: 'innate', cost: 180, radius: 17,
      stats: { range: 135, sampleRate: 1, presentSpeed: 1, buff: 0.15 },
      upgrades: [
        { key: 'range', costs: [70, 110, 170], mul: { range: [1.15, 1.3, 1.45] } },
        { key: 'present', costs: [70, 120, 180], mul: { sampleRate: [1.5, 2.2, 3], presentSpeed: [1.4, 1.9, 2.5] } },
        { key: 'buff', costs: [80, 130, 200], set: { buff: [0.22, 0.3, 0.4] } }
      ]
    },
    helperT: {
      arm: 'adaptive', cost: 150, radius: 15,
      stats: { range: 105, primeSpeed: 1, macBoost: 0.3, cd4: 100 },
      upgrades: [
        { key: 'range', costs: [60, 100, 150], mul: { range: [1.15, 1.3, 1.45] } },
        { key: 'speed', costs: [70, 120, 180], mul: { primeSpeed: [1.5, 2.2, 3] } },
        { key: 'boost', costs: [70, 120, 180], set: { macBoost: [0.5, 0.75, 1] } }
      ]
    },
    bcell: {
      arm: 'adaptive', cost: 200, radius: 15,
      stats: { range: 150, damage: 1.6, cooldown: 0.28, tagTime: 3, slow: 0.8 },
      upgrades: [
        { key: 'speed', costs: [80, 130, 210], mul: { cooldown: [0.8, 0.62, 0.48] } },
        { key: 'range', costs: [60, 100, 160], mul: { range: [1.12, 1.25, 1.4] } },
        { key: 'damage', costs: [80, 140, 220], mul: { damage: [1.5, 2.2, 3.2], tagTime: [1.3, 1.6, 2] } },
        { key: 'plasma', costs: [380], mul: { cooldown: [0.55] } }
      ]
    },
    killerT: {
      arm: 'adaptive', cost: 220, radius: 15,
      stats: { range: 115, cooldown: 2.8, bossDamage: 220, targets: 1 },
      upgrades: [
        { key: 'speed', costs: [80, 130, 210], mul: { cooldown: [0.8, 0.62, 0.48] } },
        { key: 'range', costs: [60, 100, 160], mul: { range: [1.15, 1.3, 1.45] } },
        { key: 'multi', costs: [150, 260], add: { targets: [1, 2] }, mul: { bossDamage: [1.5, 2.2] } }
      ]
    }
  };
})();
