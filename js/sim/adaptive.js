// The adaptive immune chain:
//   presenter (dendritic cell or macrophage) collects antigen
//   -> primes helper T-cells in the presenter's range
//   -> active helper T-cells activate B cells and killer T-cells in their range.
// Also: dendritic range buff, helper boost for macrophages, HIV damage to helper T-cells.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});
  var Adaptive = (CTD.Adaptive = {});

  function isPresenter(t) { return t.type === 'dc' || t.type === 'macrophage'; }
  function isEffector(t) { return t.type === 'bcell' || t.type === 'killerT'; }
  Adaptive.isPresenter = isPresenter;
  Adaptive.isEffector = isEffector;

  Adaptive.presentRange = function (t) {
    return t.type === 'dc' ? t.s.range : t.s.presentRange;
  };

  Adaptive.presents = function (t, antigen) {
    return (t.samples[antigen] || 0) >= CTD.RULES.sampleThreshold;
  };

  function anyActive(g, h) {
    for (var i = 0; i < CTD.ANTIGEN_ORDER.length; i++) {
      var a = CTD.ANTIGEN_ORDER[i];
      if (h.active[a] || CTD.Game.vaccineActive(g, a)) return true;
    }
    return false;
  }

  Adaptive.update = function (g, dt) {
    var R = CTD.RULES, A = CTD.ANTIGEN_ORDER;
    var towers = g.towers, i, j, k, t, o, a;
    var dcs = [], presenters = [], helpers = [];

    for (i = 0; i < towers.length; i++) {
      t = towers[i];
      t.buff = 0;
      t.boost = 0;
      t.help = {};
      t.helpers.length = 0;
      t.presenters.length = 0;
      if (t.type === 'dc') dcs.push(t);
      if (isPresenter(t)) presenters.push(t);
      if (t.type === 'helperT') helpers.push(t);
    }

    // Dendritic cells extend the range of other cells near them (cytokine signalling).
    for (i = 0; i < dcs.length; i++) {
      for (j = 0; j < towers.length; j++) {
        o = towers[j];
        if (o.type === 'dc') continue;
        if (CTD.dist(dcs[i].x, dcs[i].y, o.x, o.y) <= dcs[i].s.range) o.buff = Math.max(o.buff, dcs[i].s.buff);
      }
    }

    // Dendritic cells sample every enemy passing through their range, even ones
    // the innate attackers cannot recognise.
    for (i = 0; i < dcs.length; i++) {
      t = dcs[i];
      var count = {};
      for (j = 0; j < g.enemies.length; j++) {
        var e = g.enemies[j];
        if (e.dead) continue;
        if (CTD.dist(t.x, t.y, e.x, e.y) <= t.s.range + e.radius) count[e.antigen] = (count[e.antigen] || 0) + 1;
      }
      for (a in count) {
        var before = t.samples[a] || 0;
        t.samples[a] = before + Math.min(count[a], 3) * t.s.sampleRate * dt;
        if (before < R.sampleThreshold && t.samples[a] >= R.sampleThreshold) {
          g.events.push({ type: 'presenting', x: t.x, y: t.y, antigen: a });
        }
      }
    }

    // Helper T-cells: primed by a presenter in range that holds enough antigen.
    for (i = 0; i < helpers.length; i++) {
      var h = helpers[i];
      for (j = 0; j < presenters.length; j++) {
        var p = presenters[j];
        if (CTD.dist(p.x, p.y, h.x, h.y) <= Adaptive.presentRange(p)) h.presenters.push(p);
      }
      for (k = 0; k < A.length; k++) {
        a = A[k];
        if (h.active[a]) continue;
        var speed = 0;
        for (j = 0; j < h.presenters.length; j++) {
          if (Adaptive.presents(h.presenters[j], a)) speed = Math.max(speed, h.presenters[j].s.presentSpeed);
        }
        if (speed > 0) {
          h.prime[a] = (h.prime[a] || 0) + (dt * speed * h.s.primeSpeed) / R.primeTime;
          if (h.prime[a] >= 1) {
            h.active[a] = true;
            g.stats.learned[a] = true;
            g.events.push({ type: 'helperActive', x: h.x, y: h.y, antigen: a });
          }
        }
      }
      // HIV damage (added up by the enemies last tick), and slow recovery.
      if (h.drainRate > 0) {
        h.cd4 -= Math.min(h.drainRate, R.cd4DrainCap) * dt;
        h.drainT = 0.5;
        h.drainRate = 0;
      } else if (h.drainT > 0) {
        h.drainT -= dt;
      } else {
        h.cd4 = Math.min(h.s.cd4, h.cd4 + R.cd4Regen * dt);
      }
    }

    // B cells, killer T-cells and macrophages look for helper T-cells in range.
    for (i = 0; i < towers.length; i++) {
      t = towers[i];
      var eff = isEffector(t);
      if (!eff && t.type !== 'macrophage') continue;
      for (j = 0; j < helpers.length; j++) {
        h = helpers[j];
        if (CTD.dist(h.x, h.y, t.x, t.y) > CTD.Towers.range(h)) continue;
        if (!eff) {
          if (anyActive(g, h)) t.boost = Math.max(t.boost, h.s.macBoost);
          continue;
        }
        t.helpers.push(h);
        for (k = 0; k < A.length; k++) {
          a = A[k];
          var vac = CTD.Game.vaccineActive(g, a);
          if (h.active[a] || vac) t.help[a] = true;
          if (h.active[a] && !t.learned[a]) {
            // Progress is the best helper's speed, not the sum of all helpers.
            t.learnRate = t.learnRate || {};
            t.learnRate[a] = Math.max(t.learnRate[a] || 0, h.s.primeSpeed);
          }
        }
      }
      if (eff && t.learnRate) {
        for (a in t.learnRate) {
          t.learn[a] = (t.learn[a] || 0) + (dt * t.learnRate[a]) / R.learnTime;
          if (t.learn[a] >= 1 && !t.learned[a]) {
            t.learned[a] = true;
            g.events.push({ type: 'learned', x: t.x, y: t.y, antigen: a, tower: t.type });
          }
        }
        t.learnRate = null;
      }
    }

    // A helper T-cell whose CD4 count hits zero is lost, and becomes an HIV factory.
    for (i = 0; i < helpers.length; i++) {
      h = helpers[i];
      if (h.cd4 <= 0 && !h.dead) {
        h.dead = true;
        g.stats.helpersLost++;
        var near = CTD.Path.nearest(g.path, h.x, h.y);
        CTD.Enemies.spawn(g, 'cell_hiv', near.d, { hpMul: g.hpMul || 1, child: true });
        g.events.push({ type: 'helperLost', x: h.x, y: h.y });
      }
    }
    if (g.stats.helpersLost && towers.some(function (t) { return t.dead; })) {
      g.towers = towers.filter(function (t) { return !t.dead; });
    }
  };

  // HIV mutates between waves: everything the cells learned about it is out of date.
  Adaptive.mutateHiv = function (g) {
    var had = false;
    g.towers.forEach(function (t) {
      if (t.samples.hiv || t.prime.hiv || t.active.hiv || t.learn.hiv || t.learned.hiv) had = true;
      delete t.samples.hiv;
      delete t.prime.hiv;
      delete t.active.hiv;
      delete t.learn.hiv;
      delete t.learned.hiv;
    });
    return had;
  };

  // Plain-language status of an adaptive cell, for the side panel and idle markers.
  // state: 'naive' (nothing yet), 'priming' (in progress), 'weak' (trained but no help), 'active'
  Adaptive.status = function (g, t) {
    var A = CTD.ANTIGEN_ORDER, T = CTD.TEXT.status, i, a;
    var known = [], progress = 0, progressAntigen = null;
    if (t.type === 'helperT') {
      for (i = 0; i < A.length; i++) {
        a = A[i];
        if (t.active[a] || CTD.Game.vaccineActive(g, a)) known.push(a);
        else if ((t.prime[a] || 0) > progress) { progress = t.prime[a]; progressAntigen = a; }
      }
      if (known.length) return { state: 'active', known: known, text: T.helperActive, progress: progress, progressAntigen: progressAntigen };
      if (progressAntigen) return { state: 'priming', known: known, text: T.helperPriming, progress: progress, progressAntigen: progressAntigen };
      if (!t.presenters.length) return { state: 'naive', known: known, text: T.helperNoPresenter };
      return { state: 'naive', known: known, text: T.helperWaiting };
    }
    if (isEffector(t)) {
      var helped = false;
      for (i = 0; i < A.length; i++) {
        a = A[i];
        if (CTD.Towers.knows(g, t, a)) { known.push(a); if (t.help[a]) helped = true; }
        else if ((t.learn[a] || 0) > progress) { progress = t.learn[a]; progressAntigen = a; }
      }
      if (known.length && helped) return { state: 'active', known: known, text: T.effectorActive, progress: progress, progressAntigen: progressAntigen };
      if (known.length) return { state: 'weak', known: known, text: T.effectorWeak };
      if (progressAntigen) return { state: 'priming', known: known, text: T.effectorLearning, progress: progress, progressAntigen: progressAntigen };
      if (!t.helpers.length) return { state: 'naive', known: known, text: T.effectorNoHelper };
      return { state: 'naive', known: known, text: T.effectorWaiting };
    }
    return null;
  };
})();
