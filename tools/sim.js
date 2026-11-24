// Headless balance and rules check. Run with:  node tools/sim.js
// Plays whole games with scripted builds (no browser) and checks that the
// teaching rules hold: innate-only loses to stealth viruses, the full adaptive
// chain wins, a chain placed out of range never activates, and so on.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
['js/util.js', 'js/data/enemies.js', 'js/data/towers.js', 'js/data/waves.js', 'js/data/text.js',
  'js/sim/path.js', 'js/sim/enemies.js', 'js/sim/towers.js', 'js/sim/adaptive.js', 'js/sim/game.js'
].forEach((f) => vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f }));
const CTD = globalThis.CTD;
const { Game, Path, Enemies } = CTD;
const DT = 1 / 60;
const verbose = process.argv.includes('-v');

// Find a legal spot for a cell next to the vessel at distance d along it.
function spotByPath(g, type, d, side) {
  const a = Path.posAt(g.path, d - 4), b = Path.posAt(g.path, d + 4);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / len) * side, ny = ((b.x - a.x) / len) * side;
  const p = Path.posAt(g.path, d);
  for (let off = 38; off < 160; off += 4) {
    const x = p.x + nx * off, y = p.y + ny * off;
    if (Game.canPlace(g, type, x, y)) return { x, y };
  }
  return null;
}

// Find a legal spot about `dist` pixels from another cell.
function spotByTower(g, type, t, dist) {
  for (let r = dist; r < dist + 40; r += 4) {
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      const x = t.x + Math.cos(ang) * r, y = t.y + Math.sin(ang) * r;
      if (Game.canPlace(g, type, x, y)) return { x, y };
    }
  }
  return null;
}

// A build is a list of steps done in order as soon as each is affordable.
//   { place, d, side }            cell beside the vessel
//   { place, by: name, dist }     cell near a named earlier cell
//   { up: name, track }           upgrade
//   { wave: n }                   on any step: not before wave n is next
function tryBuild(g, bot) {
  for (;;) {
    const step = bot.steps[bot.i];
    if (!step) return;
    if (step.wave && g.wave + 1 < step.wave) return;
    if (step.place) {
      if (!Game.unlocked(g, step.place) || g.atp < CTD.TOWERS[step.place].cost) return;
      const spot = step.by ? spotByTower(g, step.place, bot.named[step.by], step.dist || 50) : spotByPath(g, step.place, step.d, step.side || 1);
      if (!spot) throw new Error('no spot for ' + JSON.stringify(step));
      const t = Game.place(g, step.place, spot.x, spot.y);
      if (step.name) bot.named[step.name] = t;
    } else if (step.up) {
      const t = bot.named[step.up];
      if (!t || t.dead) { bot.i++; continue; }
      const cost = CTD.Towers.upgradeCost(t, step.track);
      if (cost === null) { bot.i++; continue; }
      if (g.atp < cost) return;
      Game.upgrade(g, t, step.track);
    } else if (step.vaccine) {
      if (g.inWave) return;
      if (!Game.buyVaccine(g, step.vaccine)) return;
    }
    bot.i++;
  }
}

function play(name, steps, opts) {
  opts = opts || {};
  const g = Game.create({ mode: opts.mode || 'class', seed: opts.seed || 7 });
  const bot = { steps, i: 0, named: {} };
  const maxWave = opts.waves || CTD.RULES.classWaves;
  const log = [];
  let prevLeaks = {};
  while (!g.over && g.wave < maxWave) {
    tryBuild(g, bot);
    if (opts.beforeWave) opts.beforeWave(g, bot);
    Game.startWave(g);
    let ticks = 0;
    while (g.inWave && !g.over) {
      Game.step(g, DT);
      if (opts.onTick) opts.onTick(g, bot);
      g.events.length = 0;
      if (++ticks % 30 === 0) tryBuild(g, bot);
      if (ticks > 60 * 600) throw new Error(name + ': wave ' + g.wave + ' never ended');
    }
    log.push('  wave ' + String(g.wave).padStart(2) + '  health ' + String(Math.round(g.health)).padStart(3) +
      '  atp ' + String(g.atp).padStart(5) + '  cells ' + String(g.towers.length).padStart(2) + '  time ' + String(Math.round(g.waveClock)).padStart(3) + 's  leaked ' +
      Object.keys(g.stats.leakBy).map((k) => k + ':' + (g.stats.leakBy[k] - (prevLeaks[k] || 0))).filter((x) => !x.endsWith(':0')).join(' '));
    prevLeaks = Object.assign({}, g.stats.leakBy);
  }
  const result = g.over ? 'LOST on wave ' + g.wave : 'survived wave ' + g.wave + ' with ' + Math.round(g.health) + ' health';
  console.log(name.padEnd(34) + result + '   (bursts ' + g.stats.bursts + ', clean ' + g.stats.cleanKills +
    ', helpers lost ' + g.stats.helpersLost + ', build ' + bot.i + '/' + steps.length + ')');
  if (verbose) console.log(log.join('\n'));
  return { g, bot };
}

let failures = 0;
function check(label, ok) {
  console.log((ok ? '  ok    ' : '  FAIL  ') + label);
  if (!ok) failures++;
}

// ---------------------------------------------------------------- builds

const innate = [
  { place: 'macrophage', d: 330, side: 1, name: 'm1' },
  { place: 'macrophage', d: 520, side: -1, name: 'm2' },
  { place: 'macrophage', d: 760, side: 1, name: 'n1' },
  { place: 'nk', d: 980, side: -1, name: 'k1' },
  { up: 'm1', track: 0 }, { up: 'm2', track: 2 },
  { place: 'macrophage', d: 1150, side: 1, name: 'm3' },
  { place: 'macrophage', d: 1400, side: -1, name: 'n2' },
  { up: 'm1', track: 2 }, { up: 'm2', track: 0 }, { up: 'n1', track: 0 },
  { place: 'macrophage', d: 1650, side: 1, name: 'm4' },
  { place: 'nk', d: 1500, side: 1, name: 'k2' },
  { up: 'm3', track: 0 }, { up: 'm3', track: 2 }, { up: 'n1', track: 2 }, { up: 'k1', track: 0 },
  { place: 'macrophage', d: 1900, side: 1, name: 'n3' },
  { place: 'macrophage', d: 2100, side: -1, name: 'm5' },
  { up: 'm1', track: 0 }, { up: 'm2', track: 0 }, { up: 'm4', track: 0 }, { up: 'm4', track: 2 },
  { up: 'n2', track: 0 }, { up: 'n2', track: 2 }, { up: 'n1', track: 3 }, { up: 'm5', track: 0 },
  { up: 'm1', track: 0 }, { up: 'm2', track: 0 }, { up: 'm3', track: 0 }, { up: 'k2', track: 0 },
  { place: 'macrophage', d: 2300, side: 1, name: 'm6' }, { up: 'm6', track: 0 }, { up: 'm6', track: 2 }
];

// Innate opening, then a dendritic cell -> helper T -> B cell / killer T chain.
function chain(distHelper, distEffector) {
  return [
    { place: 'macrophage', d: 330, side: 1, name: 'm1' },
    { place: 'macrophage', d: 520, side: -1, name: 'm2' },
    { place: 'macrophage', d: 760, side: 1, name: 'n1' },
    { place: 'nk', d: 980, side: -1, name: 'k1' },
    { up: 'm1', track: 0 },
    { place: 'dc', d: 430, side: -1, name: 'dc1' },
    { place: 'helperT', by: 'dc1', dist: distHelper, name: 'h1', wave: 4 },
    { place: 'bcell', by: 'h1', dist: distEffector, name: 'b1' },
    { up: 'm2', track: 2 },
    { place: 'killerT', by: 'h1', dist: distEffector, name: 'c1' },
    { place: 'macrophage', d: 1150, side: 1, name: 'm3' },
    { up: 'b1', track: 0 }, { up: 'm1', track: 2 },
    { place: 'bcell', by: 'h1', dist: distEffector, name: 'b2' },
    { place: 'dc', d: 1500, side: 1, name: 'dc2' },
    { place: 'helperT', by: 'dc2', dist: distHelper, name: 'h2' },
    { place: 'bcell', by: 'h2', dist: distEffector, name: 'b3' },
    { place: 'killerT', by: 'h2', dist: distEffector, name: 'c2' },
    { up: 'b1', track: 2 }, { up: 'b2', track: 0 }, { up: 'm3', track: 0 },
    { place: 'macrophage', d: 1900, side: 1, name: 'n2' },
    { up: 'b3', track: 0 }, { up: 'b3', track: 2 }, { up: 'c1', track: 0 }, { up: 'h1', track: 1 },
    { place: 'macrophage', d: 1650, side: 1, name: 'm4' }, { up: 'm4', track: 0 },
    { place: 'nk', d: 1750, side: -1, name: 'k2' },
    { up: 'b1', track: 0 }, { up: 'b2', track: 2 }, { up: 'b1', track: 3 }, { up: 'c2', track: 0 },
    { place: 'bcell', by: 'h2', dist: distEffector, name: 'b4' }, { up: 'b4', track: 0 }, { up: 'b4', track: 2 },
    { up: 'm1', track: 0 }, { up: 'm2', track: 0 }, { up: 'm3', track: 2 }, { up: 'b3', track: 3 },
    { up: 'dc1', track: 1 }, { up: 'h2', track: 1 }, { up: 'k1', track: 0 }, { up: 'k2', track: 0 },
    { up: 'b2', track: 3 }, { up: 'c1', track: 2 }, { up: 'c2', track: 2 }, { up: 'b4', track: 3 }
  ];
}

// ---------------------------------------------------------------- runs

console.log('Path length: ' + Math.round(Game.create().path.length) + ' px\n');

const none = play('No defenders', []);
check('no defenders loses within 4 waves', none.g.over && none.g.wave <= 4);

const inn = play('Innate cells only', innate);
check('innate-only survives the first 5 waves', !inn.g.over || inn.g.wave > 5);
check('innate-only loses during or soon after the stealth waves (6-9)', inn.g.over && inn.g.wave >= 6 && inn.g.wave <= 9);

// The bot reaches for HIV medicine when a helper T-cell is in trouble, as a student would.
function useArtWhenNeeded(g) {
  if (g.towers.some((t) => t.type === 'helperT' && t.cd4 < 65)) Game.useArt(g);
}
const full = play('Full adaptive chain, in range', chain(55, 55), { onTick: useArtWhenNeeded });
const noArt = play('Full chain, never uses HIV medicine', chain(55, 55));
check('ignoring HIV medicine costs helper T-cells', noArt.g.stats.helpersLost > full.g.stats.helpersLost);
check('full chain wins all 15 waves', !full.g.over && full.g.wave === 15 && full.g.won);
check('adaptive cells learned the stealth antigen', full.g.towers.some((t) => t.type === 'bcell' && t.learned.stealth));

const broken = play('Chain placed out of range', chain(260, 240));
check('out-of-range chain: no B or killer T cell ever activates',
  !broken.g.towers.some((t) => (t.type === 'bcell' || t.type === 'killerT') && Object.keys(t.learned).length));
check('out-of-range chain loses', broken.g.over);

// --- burst vs clean kill
function oneCellTest(defender) {
  const g = Game.create({ seed: 3 });
  g.atp = 99999;
  const d = 600;
  for (let i = 0; i < 8; i++) {
    const s = spotByPath(g, defender, d + i * 40, i % 2 ? 1 : -1);
    Game.place(g, defender, s.x, s.y);
  }
  g.inWave = true;
  g.queue = [{ t: 9999, type: 'common' }]; // keep the wave open
  Enemies.spawn(g, 'cell_common', 450, { hpMul: 1 });
  let spawnedByBurst = 0;
  for (let i = 0; i < 60 * 40 && g.enemies.length; i++) {
    Game.step(g, DT);
    g.events.forEach((e) => { if (e.type === 'burst') spawnedByBurst++; });
    g.events.length = 0;
  }
  return { bursts: g.stats.bursts, clean: g.stats.cleanKills, events: spawnedByBurst };
}
console.log('\nInfected cell: burst vs clean kill');
const byNeutrophil = oneCellTest('neutrophil');
const byNk = oneCellTest('nk');
check('killed by neutrophils -> bursts (' + byNeutrophil.bursts + ')', byNeutrophil.bursts === 1 && byNeutrophil.clean === 0);
check('killed by NK cells -> clean, no burst (' + byNk.clean + ' clean)', byNk.bursts === 0 && byNk.clean === 1);

// --- neutrophils are single use
console.log('\nNeutrophil: single use');
(function () {
  const g = Game.create({ seed: 4 });
  const s = spotByPath(g, 'neutrophil', 600, 1);
  const before = g.atp;
  Game.place(g, 'neutrophil', s.x, s.y);
  check('neutrophil is cheap (' + (before - g.atp) + ' ATP) and has no upgrades', before - g.atp <= 50 && CTD.TOWERS.neutrophil.upgrades.length === 0);
  g.inWave = true;
  g.queue = [{ t: 9999, type: 'common' }];
  for (let i = 0; i < 4; i++) Enemies.spawn(g, 'common', 560 + i * 14, { hpMul: 1 });
  let nets = 0;
  for (let i = 0; i < 60 * 15; i++) {
    Game.step(g, DT);
    g.events.forEach((e) => { if (e.type === 'net') nets++; });
    g.events.length = 0;
  }
  check('it bursts exactly once (' + nets + ') and stops the group (' + (g.stats.kills.neutrophil || 0) + ' of 4)', nets === 1 && g.stats.kills.neutrophil >= 3);
  check('it does not come back: no neutrophil left on the field', g.towers.length === 0 && g.units.length === 0);

  // target disappears before it gets there: it walks home and can be used later
  const g2 = Game.create({ seed: 4 });
  const n = Game.place(g2, 'neutrophil', s.x, s.y);
  g2.inWave = true;
  g2.queue = [{ t: 9999, type: 'common' }];
  const prey = Enemies.spawn(g2, 'common', 600, { hpMul: 1 });
  for (let i = 0; i < 12; i++) Game.step(g2, DT);
  const left = g2.units.length === 1 && !g2.towers.includes(n);
  prey.dead = true;
  let nets2 = 0;
  for (let i = 0; i < 60 * 4; i++) {
    Game.step(g2, DT);
    g2.events.forEach((e) => { if (e.type === 'net') nets2++; });
    g2.events.length = 0;
  }
  check('a wasted charge is not lost: it returns to its post unused', left && nets2 === 0 && g2.towers.includes(n) && !n.dead);
})();

// --- HIV kills helper T-cells and that cuts B cell output
console.log('\nHIV and helper T-cells');
(function () {
  const g = Game.create({ seed: 5 });
  g.atp = 99999;
  g.wave = 12;
  const s = spotByPath(g, 'helperT', 700, 1);
  const h = Game.place(g, 'helperT', s.x, s.y);
  const sb = spotByTower(g, 'bcell', h, 50);
  const b = Game.place(g, 'bcell', sb.x, sb.y);
  h.active.common = true;
  b.learned.common = true;
  g.inWave = true;
  g.queue = [{ t: 9999, type: 'common' }];
  Game.step(g, DT);
  const helpedBefore = !!b.help.common;
  for (let i = 0; i < 40; i++) Enemies.spawn(g, 'hiv', 600 - i * 14, { hpMul: 50 });
  for (let i = 0; i < 60 * 30 && !g.stats.helpersLost; i++) { Game.step(g, DT); g.events.length = 0; }
  Game.step(g, DT);
  check('B cell is helped while the helper T-cell lives', helpedBefore);
  check('HIV destroys an exposed helper T-cell', g.stats.helpersLost === 1 && !g.towers.includes(h));
  check('the lost helper becomes an HIV-infected cell', g.enemies.some((e) => e.type === 'cell_hiv'));
  check('B cell keeps its memory but loses help (25% output)', b.learned.common && !b.help.common);

  // ART protects
  const g2 = Game.create({ seed: 5 });
  g2.atp = 99999; g2.wave = 12;
  const h2 = Game.place(g2, 'helperT', s.x, s.y);
  g2.inWave = true; g2.queue = [{ t: 9999, type: 'common' }];
  Game.useArt(g2);
  for (let i = 0; i < 40; i++) Enemies.spawn(g2, 'hiv', 560 + i * 4, { hpMul: 50 });
  for (let i = 0; i < 60 * 8; i++) { Game.step(g2, DT); g2.events.length = 0; }
  check('antiretroviral therapy stops the damage while it lasts', h2.cd4 === h2.s.cd4);
})();

// --- vaccine gives a head start
console.log('\nVaccine');
(function () {
  function run(vaccinate) {
    const g = Game.create({ seed: 9 });
    g.atp = 99999; g.wave = 5;
    const s = spotByPath(g, 'helperT', 500, 1);
    const h = Game.place(g, 'helperT', s.x, s.y);
    const sb = spotByTower(g, 'bcell', h, 50);
    Game.place(g, 'bcell', sb.x, sb.y);
    if (vaccinate) Game.buyVaccine(g, 'stealth');
    g.wave = 6; g.inWave = true; g.queue = [{ t: 9999, type: 'common' }];
    for (let i = 0; i < 6; i++) Enemies.spawn(g, 'stealth', 300 - i * 40, { hpMul: 1 });
    for (let i = 0; i < 60 * 12; i++) { Game.step(g, DT); g.events.length = 0; }
    return (g.stats.kills.bcell || 0);
  }
  const withV = run(true), without = run(false);
  check('vaccinated B cell attacks stealth viruses at once (' + withV + ' kills vs ' + without + ' unvaccinated)', withV > 0 && without === 0);
  const g = Game.create();
  g.wave = 5; g.atp = 9999;
  check('no vaccine can be bought for HIV', !Game.buyVaccine(g, 'hiv'));
})();

// --- freeplay generator sanity
(function () {
  const g = Game.create({ mode: 'freeplay', seed: 11 });
  let total = 0;
  for (let n = 1; n <= 30; n++) {
    const spec = CTD.Waves.get('freeplay', n, 11);
    spec.g.forEach((grp) => { if (!CTD.ENEMIES[grp[0]]) throw new Error('bad type ' + grp[0]); total += grp[1]; });
  }
  console.log('\nFreeplay: 30 generated waves, ' + total + ' enemies, all types valid');
  check('freeplay unlocks every cell from the start', CTD.TOWER_ORDER.every((t) => Game.unlocked(g, t)));
})();

console.log(failures ? '\n' + failures + ' check(s) FAILED' : '\nAll checks passed');
process.exit(failures ? 1 : 0);
