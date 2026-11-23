// Cell Tower Defense: shared namespace and small helpers.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});

  CTD.W = 800; // playfield size in logical pixels
  CTD.H = 600;
  CTD.FONT = '"Comic Sans MS", "Comic Sans", "Comic Neue", cursive';

  // Small seeded random number generator (mulberry32) so runs are repeatable.
  CTD.makeRng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  CTD.clamp = function (v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  };

  CTD.dist = function (ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  };
})();
