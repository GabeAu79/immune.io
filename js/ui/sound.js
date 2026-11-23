// Tiny synthesized sound effects (no audio files).
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});
  var Sound = (CTD.Sound = { on: true });
  var ac = null;
  var last = {};

  // Browsers only allow sound after the first click or key press.
  Sound.unlock = function () {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    var AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (AC) { try { ac = new AC(); } catch (err) { ac = null; } }
  };

  function tone(freq, endFreq, dur, type, vol, delay) {
    var t0 = ac.currentTime + (delay || 0);
    var osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  var SOUNDS = {
    pop: function () { tone(620 + Math.random() * 240, 240, 0.07, 'triangle', 0.07); },
    gulp: function () { tone(210, 120, 0.09, 'sine', 0.06); },
    net: function () { tone(160, 60, 0.22, 'sawtooth', 0.06); },
    zap: function () { tone(900, 300, 0.12, 'square', 0.04); },
    burst: function () { tone(140, 50, 0.3, 'sawtooth', 0.1); tone(400, 90, 0.2, 'square', 0.05); },
    clean: function () { tone(660, 0, 0.08, 'sine', 0.07); tone(990, 0, 0.12, 'sine', 0.07, 0.07); },
    leak: function () { tone(130, 70, 0.4, 'sawtooth', 0.12); },
    learn: function () { tone(523, 0, 0.1, 'triangle', 0.08); tone(659, 0, 0.1, 'triangle', 0.08, 0.09); tone(784, 0, 0.18, 'triangle', 0.08, 0.18); },
    place: function () { tone(330, 520, 0.09, 'sine', 0.08); },
    buy: function () { tone(520, 780, 0.1, 'triangle', 0.08); },
    nope: function () { tone(170, 130, 0.14, 'square', 0.05); },
    wave: function () { tone(392, 0, 0.12, 'triangle', 0.08); tone(523, 0, 0.2, 'triangle', 0.08, 0.12); },
    lost: function () { tone(300, 80, 0.6, 'sawtooth', 0.1); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0, 0.22, 'triangle', 0.09, i * 0.14); }); }
  };

  // minGap (seconds) keeps very frequent sounds from piling up.
  Sound.play = function (name, minGap) {
    if (!Sound.on || !ac || !SOUNDS[name]) return;
    var now = ac.currentTime;
    if (minGap && last[name] !== undefined && now - last[name] < minGap) return;
    last[name] = now;
    try { SOUNDS[name](); } catch (err) { /* sound is optional */ }
  };
})();
