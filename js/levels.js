/* MONSTER V8 — 4 mondes × 5 parcours : terrain généré par segments, adapté à chaque véhicule */
(function () {
  'use strict';
  var STEP = 20;
  var TAU = Math.PI * 2;

  // Obstacles écrasables : largeur / hauteur (px monde)
  var KINDS = {
    cones: { w: 90, h: 30 }, barrel: { w: 70, h: 34 }, crate: { w: 84, h: 44 },
    car: { w: 170, h: 48 }, suv: { w: 190, h: 64 }, van: { w: 200, h: 70 }, limo: { w: 270, h: 48 },
    wreck: { w: 150, h: 42 }, truck: { w: 230, h: 84 }, stack: { w: 170, h: 98 }, bus: { w: 340, h: 92 }
  };

  function rngFor(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  function Builder() {
    var H = [-1600, 0];
    var y = 0;
    var o = { cars: [], coins: [], pits: [], pads: [], checks: [], finish: 0 };
    var b = {};
    function X() { return (H.length - 1) * STEP; }
    function push(v) { H.push(v); y = v; }
    function nS(len) { return Math.max(1, Math.round(len / STEP)); }
    var ease = function (t) { return (1 - Math.cos(Math.PI * t)) / 2; };

    b.X = X; b.Y = function () { return y; };
    b.flat = function (len) { var n = nS(len); for (var i = 0; i < n; i++) push(y); return b; };
    b.slope = function (len, dy) { var n = nS(len), y0 = y; for (var i = 1; i <= n; i++) push(y0 + dy * i / n); return b; };
    b.hill = function (len, dy) { var n = nS(len), y0 = y; for (var i = 1; i <= n; i++) push(y0 + dy * ease(i / n)); return b; };
    b.ramp = function (len, h) { var n = nS(len), y0 = y; for (var i = 1; i <= n; i++) push(y0 - h * Math.pow(i / n, 1.6)); return b; };
    b.waves = function (count, len, h) {
      for (var k = 0; k < count; k++) {
        var m = Math.max(4, nS(len)), y0 = y;
        for (var i = 1; i <= m; i++) push(y0 - h * (1 - Math.cos(TAU * i / m)) / 2);
      }
      return b;
    };
    b.step = function (dy) { push(y + dy); return b; };
    b.pit = function (len, kind) {
      var rim = y, x0 = X(), depth = 1800;
      push(rim + depth);
      var n = nS(len);
      for (var i = 0; i < n; i++) push(rim + depth);
      push(rim);
      o.pits.push({ x0: x0, x1: X(), rim: rim, kind: kind || 'lava' });
      return b;
    };
    b.pad = function (len) { var x0 = X(); b.flat(len); o.pads.push({ x0: x0, x1: X() }); return b; };
    b.crowd = function (list) {
      for (var i = 0; i < list.length; i++) {
        var sp = KINDS[list[i]];
        b.flat(14);
        var x0 = X();
        b.flat(sp.w + 14);
        o.cars.push({ k: list[i], x: x0 + (sp.w + 14) / 2, w: sp.w, h: sp.h, edge: Math.min(48, sp.h * 0.55 + 12), sq: 1, crushed: false, seed: o.cars.length + 1 });
      }
      return b;
    };
    b.coinsLine = function (n, sp, lift) { var x0 = X(); for (var i = 0; i < n; i++) o.coins.push({ x: x0 + i * sp, lift: lift, abs: false }); return b; };
    b.coinsArc = function (n, sp, lift, peak) { var x0 = X(); for (var i = 0; i < n; i++) o.coins.push({ x: x0 + i * sp, y: y - lift - peak * Math.sin(Math.PI * i / (n - 1)), abs: true }); return b; };
    b.finish = function () { o.finish = X(); b.flat(900); b.step(-1600); return b; };

    // --- macros de parcours -------------------------------------------------
    b.jumpPit = function (rl, h, gap, kind) { b.ramp(rl, h); b.pit(gap, kind); b.slope(Math.round(rl * 1.15), h); return b; };
    b.busJump = function (rl, h, list, hill) {
      hill = hill === undefined ? 0.5 : hill;
      b.ramp(rl, h); b.flat(30); b.step(h); b.crowd(list);
      b.slope(150, -h * hill); b.slope(Math.round(rl * 0.9), h * hill);
      return b;
    };
    b.hump = function (len, h) { b.hill(len, -h); b.hill(len, h); return b; };
    b.kicker = function (rl, h) { b.ramp(rl, h); b.slope(Math.round(rl * 0.9), h); return b; };
    b.stairs = function (n, len, h, plat) { for (var i = 0; i < n; i++) { b.hill(len, -h); b.flat(plat); } return b; };
    b.stairsDown = function (n, len, h, plat) { for (var i = 0; i < n; i++) { b.hill(len, h); b.flat(plat); } return b; };
    // poutre étroite entre deux gouffres
    b.beam = function (rl, h, g1, w, g2, kind) {
      b.ramp(rl, h); b.pit(g1, kind); b.flat(w); b.ramp(160, 36); b.pit(g2, kind); b.slope(Math.round(rl * 1.2), h + 36);
      return b;
    };
    b.cliff = function (h, list) { b.flat(60); b.step(h); b.flat(200); if (list) b.crowd(list); return b; };

    b.done = function () {
      var arr = H.slice();
      function base(x) {
        var f = x / STEP, i = Math.floor(f);
        if (i < 0) return arr[0];
        if (i >= arr.length - 1) return arr[arr.length - 1];
        var t = f - i;
        return arr[i] + (arr[i + 1] - arr[i]) * t;
      }
      var coins = o.coins.map(function (c) { return { x: c.x, y: c.abs ? c.y : base(c.x) - c.lift, got: false }; });
      var maxY = 0;
      for (var i = 1; i < arr.length; i++) if (arr[i] < 1500 && arr[i] > maxY) maxY = arr[i];
      return { H: arr, base: base, cars: o.cars, coins: coins, checks: o.checks, pits: o.pits, pads: o.pads, finish: o.finish, startX: 260, length: X(), maxY: maxY };
    };
    return b;
  }

  var COLORS = ['#ff2e97', '#00e5ff', '#ffe14d', '#8b5cf6', '#7dffd4', '#ff9a3c', '#f8fafc', '#3b82f6'];

  // ---------------------------------------------------------------- profils par véhicule
  var PROF = {
    moto:    { kinds: ['barrel', 'crate', 'cones'], gap: [300, 620], ramp: [50, 85], rl: 230, wave: [22, 42], stepH: [40, 80], hop: 0.85, cliff: [40, 70] },
    monster: { kinds: ['car', 'suv', 'van', 'stack', 'bus', 'truck', 'limo', 'wreck'], gap: [380, 800], ramp: [90, 150], rl: 320, wave: [46, 90], stepH: [60, 140], hop: 1.0, cliff: [60, 120] },
    civic:   { kinds: ['car', 'cones', 'crate', 'suv'], gap: [340, 720], ramp: [70, 115], rl: 280, wave: [34, 70], stepH: [50, 100], hop: 0.95, cliff: [50, 90] },
    truck:   { kinds: ['car', 'suv', 'van', 'limo', 'stack', 'bus'], gap: [260, 560], ramp: [80, 130], rl: 360, wave: [40, 80], stepH: [60, 120], hop: 0.9, cliff: [50, 90] }
  };

  function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

  function genLevel(vk, li, seed, kind) {
    var P = PROF[vk];
    return function (b) {
      var r = rngFor(seed), d = li / 4;
      var budget = (7000 + li * 2200) * (vk === 'truck' ? 0.85 : 1);   // parcours courts
      var pool = ['crowd', 'jump', 'waves', 'stairs'];
      if (li >= 1) pool.push('chain', 'jump', 'kick');
      if (li >= 2) pool.push('bus', 'cliff', 'chain');
      if (li >= 3) pool.push('chain', 'bus', 'jump', 'cliff');
      b.flat(700); b.pad(320); b.flat(260);
      var last = '', x0 = b.X(), i = 0;
      while (b.X() - x0 < budget) {
        var t = (i === 0) ? 'crowd' : pick(r, pool);
        if (t === last && r() < 0.7) t = pick(r, pool);
        last = t;
        var dd = clamp01(d * 0.75 + ((b.X() - x0) / budget) * 0.35 + r() * 0.12 - 0.05);
        var gap = Math.round(lerp(P.gap[0], P.gap[1], dd) / 10) * 10;
        var h = Math.round(lerp(P.ramp[0], P.ramp[1], dd));
        var rl = P.rl;
        if (t === 'crowd') {
          var list = [], n = 2 + Math.floor(dd * 3 + r() * 2);
          for (var k = 0; k < n; k++) list.push(pick(r, P.kinds));
          b.coinsLine(5, 80, 70); b.crowd(list);
        } else if (t === 'waves') {
          b.waves(3 + Math.floor(dd * 3), Math.max(340, Math.round(rl * 1.1)), Math.round(lerp(P.wave[0], P.wave[1], dd)));
        } else if (t === 'jump') {
          b.pad(220); b.flat(180);
          b.coinsArc(8, Math.round(gap / 8), 60, Math.round(h * 1.1));
          b.jumpPit(rl, h, gap, kind);
        } else if (t === 'kick') {
          b.coinsArc(6, 90, 50, 120); b.kicker(rl, Math.round(h * 0.8));
        } else if (t === 'stairs') {
          var n2 = 2 + Math.floor(dd * 3), sh = Math.round(lerp(P.stepH[0], P.stepH[1], dd));
          b.flat(120); b.stairs(n2, Math.round(sh * 4.5), sh, 160); b.flat(120);
          b.stairsDown(n2, Math.round(sh * 4.5), sh, 160);
        } else if (t === 'chain') {
          // sauts à plat vers des plateaux plus bas, puis remontée sur sol solide
          b.pad(200); b.flat(180);
          var gp = Math.round((240 + 100 * dd) * P.hop / 10) * 10, D = Math.round((140 + 120 * dd) * P.hop);
          var nn = 2 + (dd > 0.55 ? 1 : 0);
          for (var c = 0; c < nn; c++) {
            b.coinsArc(5, Math.round(gp / 5), 40, 80);
            b.pit(gp, kind); b.step(D); b.flat(720);
            b.slope(Math.round(D * 4.2), -D); b.flat(260);
          }
        } else if (t === 'bus') {
          b.pad(220); b.flat(160);
          var bl = [], bn = 3 + Math.floor(dd * 2);
          for (var q = 0; q < bn; q++) bl.push(pick(r, P.kinds));
          b.coinsArc(8, 100, 100, Math.round(h * 0.9));
          b.busJump(rl, Math.round(h * 0.85), bl, 0.4);
        } else if (t === 'cliff') {
          b.flat(120);
          b.coinsLine(4, 70, 80);
          b.cliff(Math.round(lerp(P.cliff[0], P.cliff[1], dd)), [pick(r, P.kinds), pick(r, P.kinds)]);
        }
        b.flat(650);
        i++;
      }
      b.finish();
    };
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ---------------------------------------------------------------- mondes
  var WORLDS = [
    {
      id: 1, key: 'moto', veh: 'moto', name: 'OCEAN DRIVE', vehName: 'MOTO', scene: 'beach', pitKind: 'water',
      blurb: 'Légère, nerveuse, wheelies faciles. Gare à la tête.',
      c: { skyTop: '#2a0a5e', skyBot: '#ff9a6c', far: '#9b3fa8', mid: '#5f2a8c', ground: '#e9b88f', deep: '#a8603f', edge: '#ffd9b8', hazard: '#00c6e0', hazard2: '#9bffe6' },
      names: [['PREMIÈRE VAGUE', 'Les bases du parcours'], ['PALMIERS', 'Sauts entre les dunes'], ['PONTON', 'Plateformes sur l\'eau'], ['NÉON NIGHT', 'Poutres et gouffres'], ['GRAND FINAL', 'Tout Ocean Drive']]
    },
    {
      id: 2, key: 'monster', veh: 'monster', name: 'NEON JUNKYARD', vehName: 'MONSTER TRUCK', scene: 'junk', pitKind: 'lava',
      blurb: 'Coupé V8 sur gros pneus. Écrase tout, vole haut.',
      c: { skyTop: '#12052e', skyBot: '#b3207f', far: '#43157a', mid: '#2a0d52', ground: '#3a2562', deep: '#1b0e38', edge: '#00e5ff', hazard: '#ff2e97', hazard2: '#ffe14d' },
      names: [['FERRAILLE', 'Écrase les premières épaves'], ['ÉCRASE-TOUT', 'Piles de voitures'], ['TOUR DE GRUE', 'Sauts au-dessus du vide'], ['PILES DE BUS', 'Les gros porteurs'], ['CASSE FINALE', 'Le grand spectacle']]
    },
    {
      id: 3, key: 'civic', veh: 'civic', name: 'MIDNIGHT TOUGE', vehName: 'CIVIC TYPE R', scene: 'touge', pitKind: 'void',
      blurb: 'Tuning, néons, VTEC. Rapide et précise.',
      c: { skyTop: '#05031a', skyBot: '#43207f', far: '#2a1656', mid: '#170c36', ground: '#262148', deep: '#0f0b24', edge: '#ff2e97', hazard: '#7a1aff', hazard2: '#ff4df0' },
      names: [['ÉCHAUFFEMENT', 'Un tour pour chauffer les pneus'], ['COL DE NUIT', 'Enchaînements précis'], ['TOIT DU GARAGE', 'Plateformes en hauteur'], ['DRIFT PIT', 'Poutres et gouffres'], ['R-ÉVOLUTION', 'La descente finale']]
    },
    {
      id: 4, key: 'truck', veh: 'truck', name: 'CHROME HIGHWAY', vehName: 'CAMION', scene: 'desert', pitKind: 'lava',
      blurb: 'Poids lourd. Lent à lancer, impossible à arrêter.',
      c: { skyTop: '#46105f', skyBot: '#ffb15c', far: '#c24f6e', mid: '#963a5c', ground: '#c9784e', deep: '#7a3b2a', edge: '#ffd28a', hazard: '#ff5500', hazard2: '#ffd000' },
      names: [['DÉPART DÉPÔT', 'Chargement, démarrage'], ['DÉSERT', 'Droit devant'], ['PONT CASSÉ', 'Il manque un bout'], ['CONVOI', 'Écrase le trafic'], ['DERNIER RELAIS', 'Livraison finale']]
    }
  ];

  // seuils d'étoiles (calibrés par simulation) : [2★, 3★] et temps de référence
  var CAL = {
    1: { par: 12, stars: [2000, 4100] },
    2: { par: 13, stars: [2600, 5200] },
    3: { par: 15, stars: [3000, 6000] },
    4: { par: 18, stars: [2100, 4200] },
    5: { par: 21, stars: [3300, 6500] },
    6: { par: 13, stars: [1400, 2700] },
    7: { par: 14, stars: [2700, 5300] },
    8: { par: 18, stars: [4800, 9600] },
    9: { par: 23, stars: [5600, 11200] },
    10: { par: 23, stars: [5600, 11200] },
    11: { par: 11, stars: [1300, 2600] },
    12: { par: 15, stars: [1900, 3800] },
    13: { par: 16, stars: [3800, 7500] },
    14: { par: 18, stars: [5000, 9900] },
    15: { par: 25, stars: [4700, 9300] },
    16: { par: 11, stars: [800, 1600] },
    17: { par: 13, stars: [3300, 6700] },
    18: { par: 21, stars: [2600, 5200] },
    19: { par: 20, stars: [5000, 10000] },
    20: { par: 24, stars: [3500, 7000] }
  };

  var levels = [];
  WORLDS.forEach(function (w, wi) {
    w.levels = [];
    for (var li = 0; li < 5; li++) {
      var id = wi * 5 + li + 1;
      var cal = CAL[id] || { par: 30 + li * 4, stars: [3000 + li * 800, 6000 + li * 1500] };
      var lv = {
        id: id, world: wi, li: li, veh: w.veh, name: w.names[li][0], sub: w.names[li][1], theme: w.scene, c: w.c,
        par: cal.par, stars: cal.stars, build: genLevel(w.veh, li, 1000 * (wi + 1) + 37 * li + 11, w.pitKind)
      };
      levels.push(lv); w.levels.push(lv);
    }
  });

  function build(index) {
    var b = Builder();
    levels[index].build(b);
    return b.done();
  }
  function setCal(table) { Object.keys(table).forEach(function (k) { var l = levels[k - 1]; l.par = table[k].par; l.stars = table[k].stars; }); }

  window.MV8_LEVELS = { STEP: STEP, KINDS: KINDS, COLORS: COLORS, worlds: WORLDS, levels: levels, build: build, setCal: setCal, CAL: CAL };
})();
