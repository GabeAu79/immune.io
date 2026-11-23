// Pop-ups: main menu, briefing cards, encyclopedia, report card.
// The game is paused while any of these is open.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});
  var Modals = (CTD.Modals = {});
  var T = CTD.TEXT;

  function $(id) { return document.getElementById(id); }

  Modals.isOpen = function () {
    return !$('modal').classList.contains('hidden');
  };

  function open(html, cls) {
    var card = $('modal-card');
    card.className = cls || '';
    card.innerHTML = html;
    $('modal').classList.remove('hidden');
    return card;
  }

  Modals.close = function () {
    $('modal').classList.add('hidden');
    $('modal-card').innerHTML = '';
  };

  function drawArt(card) {
    Array.prototype.forEach.call(card.querySelectorAll('canvas[data-art]'), function (c) {
      CTD.Draw.icon(c, c.getAttribute('data-art').split(','), +c.getAttribute('data-size'));
    });
  }

  function artTag(art, size) {
    return '<canvas data-art="' + art.join(',') + '" data-size="' + size + '"></canvas>';
  }

  // ---------------------------------------------------------------- menu

  Modals.menu = function () {
    var App = CTD.App;
    var running = App.started && App.g && !App.g.over;
    var cast = CTD.TOWER_ORDER.map(function (t) { return artTag(['tower', t], 54); }).join('') +
      artTag(['enemy', 'common'], 54) + artTag(['enemy', 'cloaked'], 54) + artTag(['enemy', 'hiv'], 54);
    var card = open(
      '<h1>' + T.title + '</h1>' +
      '<div class="cast">' + cast + '</div>' +
      '<p class="tagline">' + T.tagline + '</p>' +
      '<div class="mode">' +
      '<div><button class="btn" data-act="class">Class Mode</button><small>15 waves, about 20 minutes. Introduces one idea at a time. Start here.</small></div>' +
      '<div><button class="btn" data-act="freeplay">Freeplay</button><small>Endless random waves with every cell unlocked. For when you have finished Class Mode.</small></div>' +
      '</div>' +
      '<div class="btn-row">' +
      (running ? '<button class="btn plain" data-act="resume">Back to game</button>' : '') +
      '<button class="btn plain" data-act="book">Encyclopedia</button>' +
      '</div>', 'menu');
    Array.prototype.forEach.call(card.querySelectorAll('.cast canvas'), function (c) {
      c.style.background = 'none';
      c.style.border = 'none';
    });
    drawArt(card);
    card.onclick = function (ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (!act) return;
      CTD.Sound.unlock();
      if (act === 'resume') Modals.close();
      else if (act === 'book') Modals.book(null, Modals.menu);
      else { Modals.close(); App.newGame(act); }
    };
  };

  // ---------------------------------------------------------------- briefing cards

  Modals.briefing = function (cards, done) {
    var i = 0;
    function show() {
      var c = cards[i];
      var last = i === cards.length - 1;
      var card = open(
        '<div class="row">' + artTag(c.art, 130) +
        '<div><h2>' + c.title + '</h2><p>' + c.body + '</p></div></div>' +
        '<div class="btn-row"><button class="btn" data-act="next">' + (last ? 'Got it!' : 'Next') + '</button></div>' +
        (cards.length > 1 ? '<div class="count">' + (i + 1) + ' of ' + cards.length + '</div>' : ''), 'card');
      drawArt(card);
      card.onclick = function (ev) {
        if (ev.target.getAttribute('data-act') !== 'next') return;
        CTD.Sound.unlock();
        if (last) { Modals.close(); if (done) done(); } else { i++; show(); }
      };
    }
    show();
  };

  // ---------------------------------------------------------------- encyclopedia

  Modals.book = function (title, onClose) {
    var entries = T.encyclopedia;
    var current = 0;
    if (title) entries.forEach(function (e, i) { if (e.title === title) current = i; });

    var list = T.encyclopediaGroups.map(function (grp) {
      return '<h4>' + grp + '</h4>' + entries.map(function (e, i) {
        return e.group === grp ? '<button data-i="' + i + '">' + e.title + '</button>' : '';
      }).join('');
    }).join('');

    var card = open(
      '<div class="top"><h2>Encyclopedia</h2><button class="btn" data-act="close">Close</button></div>' +
      '<div class="cols"><div class="list">' + list + '</div><div class="entry"></div></div>', 'book');

    function show(i) {
      current = i;
      var e = entries[i];
      card.querySelector('.entry').innerHTML =
        '<div class="hero">' + artTag(e.art, 96) + '<h2>' + e.title + '</h2></div>' +
        '<h4>In the game</h4><div>' + e.game + '</div>' +
        '<h4>In real life</h4><div>' + e.real + '</div>' +
        '<div class="versus"><h4>Game vs. real life</h4><div>' + e.versus + '</div></div>';
      card.querySelector('.entry').scrollTop = 0;
      drawArt(card);
      Array.prototype.forEach.call(card.querySelectorAll('.list button'), function (b) {
        b.classList.toggle('on', +b.getAttribute('data-i') === i);
      });
    }
    show(current);

    card.onclick = function (ev) {
      var t = ev.target;
      if (t.getAttribute('data-act') === 'close') {
        Modals.close();
        if (onClose) onClose();
      } else if (t.getAttribute('data-i') !== null && t.tagName === 'BUTTON') {
        show(+t.getAttribute('data-i'));
      }
    };
  };

  // ---------------------------------------------------------------- report card

  Modals.report = function (g, won) {
    var R = T.report, s = g.stats;
    var rank = '';
    if (won) {
      for (var i = 0; i < R.ranks.length; i++) {
        if (g.health >= R.ranks[i][0]) { rank = R.ranks[i][1]; break; }
      }
    }
    function row(label, value) { return '<tr><td>' + label + '</td><td>' + value + '</td></tr>'; }
    function dots(list) {
      return list.length ? list.map(function (a) {
        return '<span class="dot" title="' + CTD.ANTIGENS[a].name + '" style="background:' + CTD.ANTIGENS[a].color + '"></span>';
      }).join(' ') : 'none';
    }
    var kills = CTD.TOWER_ORDER.filter(function (t) { return s.kills[t]; }).map(function (t) {
      return row(T.towers[t].name, s.kills[t]);
    }).join('') || row('No kills yet', '0');
    var leaked = CTD.ANTIGEN_ORDER.filter(function (a) { return s.leakBy[a]; });
    var leakText = leaked.length ? leaked.map(function (a) { return CTD.ANTIGENS[a].name + ' ' + s.leakBy[a]; }).join(', ') : 'none';

    var card = open(
      '<h2>' + (won ? R.titleWin : R.titleLose) + '</h2>' +
      (won ? '<div class="rank">' + rank + '</div>' : '<p style="text-align:center">' + R.loseBody + '</p>') +
      '<div class="two"><div><table>' +
      row('Waves survived', won ? g.wave : g.wave - 1) +
      row('Body Health left', Math.round(g.health)) +
      row('Infected cells killed cleanly', s.cleanKills) +
      row('Infected cells that burst', s.bursts) +
      row('Helper T-cells lost to HIV', s.helpersLost) +
      row('Antigens learned', dots(CTD.ANTIGEN_ORDER.filter(function (a) { return s.learned[a]; }))) +
      row('Got through', leakText) +
      '</table></div><div><table>' + '<tr><td colspan="2"><b>Stopped by</b></td></tr>' + kills + '</table></div></div>' +
      '<b>What your immune system just did:</b><ul>' + R.recap.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>' +
      '<div class="btn-row">' +
      (won ? '<button class="btn" data-act="keep">Keep going (Freeplay)</button>' : '<button class="btn" data-act="retry">Try again</button>') +
      '<button class="btn plain" data-act="menu">Main menu</button></div>', 'report');

    card.onclick = function (ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (act === 'keep') Modals.close();
      else if (act === 'retry') { Modals.close(); CTD.App.newGame(g.mode); }
      else if (act === 'menu') Modals.menu();
    };
  };
})();
