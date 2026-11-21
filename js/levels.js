/* MONSTER V8 — 4 mondes × 10 parcours + défi du jour : terrain généré par segments, adapté à chaque véhicule */
(function () {
  'use strict';
  var STEP = 20;
  var TAU = Math.PI * 2;
  var G = 1250;
  var PER_WORLD = 10;

  // Obstacles écrasables : largeur / hauteur (px monde)
  var KINDS = {
    cones: { w: 90, h: 30 }, barrel: { w: 70, h: 34 }, crate: { w: 84, h: 44 }, tnt: { w: 70, h: 40 },
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
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function Builder() {
    var H = [-1600, 0];
    var y = 0;
    var o = { cars: [], coins: [], nitros: [], pits: [], pads: [], springs: [], rings: [], checks: [], finish: 0 };
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
    // tremplin à ressort : propulse le véhicule vers le haut
    b.spring = function (len) { var x0 = X(); b.flat(len); o.springs.push({ x0: x0, x1: X(), y: y }); return b; };
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
    b.nitroItem = function (dx, lift) { o.nitros.push({ x: X() + dx, lift: lift }); return b; };
    b.coinsLine = function (n, sp, lift) { var x0 = X(); for (var i = 0; i < n; i++) o.coins.push({ x: x0 + i * sp, lift: lift, abs: false }); return b; };
    b.coinsArc = function (n, sp, lift, peak) { var x0 = X(); for (var i = 0; i < n; i++) o.coins.push({ x: x0 + i * sp, y: y - lift - peak * Math.sin(Math.PI * i / (n - 1)), abs: true }); return b; };
    // anneaux placés sur la trajectoire balistique prévue depuis la position actuelle
    b.ringsBallistic = function (v, slope, n, lift, fix) {
      var x0 = X(), y0 = y - lift, c = 1 / Math.sqrt(1 + slope * slope), vx = v * c, vy = -v * slope * c;
      var T = 2 * -vy / G;
      for (var i = 1; i <= n; i++) {
        var t = T * i / (n + 1);
        o.rings.push({ x: x0 + vx * t, y: y0 + vy * t + 0.5 * G * t * t - (fix ? fix[i - 1] || 0 : 0), r: 82, got: false });
      }
      return b;
    };
    b.finish = function () { o.finish = X(); b.flat(900); b.step(-1600); return b; };

    // --- macros de parcours -------------------------------------------------
    b.jumpPit = function (rl, h, gap, kind) { b.ramp(rl, h); b.pit(gap, kind); b.slope(Math.round(rl * 1.15), h); return b; };
    b.busJump = function (rl, h, list, hill) {
      hill = hill === undefined ? 0.5 : hill;
      b.ramp(rl, h); b.flat(30); b.step(h); b.crowd(list);
      b.slope(150, -h * hill); b.slope(Math.round(rl * 0.9), h * hill);
      return b;
    };
    b.kicker = function (rl, h) { b.ramp(rl, h); b.slope(Math.round(rl * 0.9), h); return b; };
    b.stairs = function (n, len, h, plat) { for (var i = 0; i < n; i++) { b.hill(len, -h); b.flat(plat); } return b; };
    b.stairsDown = function (n, len, h, plat) { for (var i = 0; i < n; i++) { b.hill(len, h); b.flat(plat); } return b; };
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
      var nitros = o.nitros.map(function (c) { return { x: c.x, y: base(c.x) - c.lift, got: false }; });
      var maxY = 0;
      for (var i = 1; i < arr.length; i++) if (arr[i] < 1500 && arr[i] > maxY) maxY = arr[i];
      return { H: arr, base: base, cars: o.cars, coins: coins, nitros: nitros, checks: o.checks, pits: o.pits, pads: o.pads, springs: o.springs, rings: o.rings, finish: o.finish, startX: 260, length: X(), maxY: maxY };
    };
    return b;
  }

  var COLORS = ['#ff2e97', '#00e5ff', '#ffe14d', '#8b5cf6', '#7dffd4', '#ff9a3c', '#f8fafc', '#3b82f6'];

  // ---------------------------------------------------------------- profils par véhicule
  // v : vitesse typique au décollage (sert à placer les anneaux) · spring : hauteur max des murs à ressort
  var PROF = {
    moto:    { kinds: ['barrel', 'crate', 'cones'], gap: [300, 620], ramp: [50, 85], rl: 230, wave: [22, 42], stepH: [40, 80], hop: 0.85, cliff: [40, 70], v: 980, wall: [90, 140], ringFix: [70, 115, 165] },
    monster: { kinds: ['car', 'suv', 'van', 'stack', 'bus', 'truck', 'limo', 'wreck'], gap: [380, 800], ramp: [90, 150], rl: 320, wave: [46, 90], stepH: [60, 140], hop: 1.0, cliff: [60, 120], v: 950, wall: [110, 170], ringFix: [80, 107, 155] },
    civic:   { kinds: ['car', 'cones', 'crate', 'suv'], gap: [340, 720], ramp: [70, 115], rl: 280, wave: [34, 70], stepH: [50, 100], hop: 0.95, cliff: [50, 90], v: 1000, wall: [90, 150], ringFix: [58, 84, 129] },
    truck:   { kinds: ['car', 'suv', 'van', 'limo', 'stack', 'bus'], gap: [260, 560], ramp: [80, 130], rl: 360, wave: [40, 80], stepH: [60, 120], hop: 0.9, cliff: [50, 90], v: 820, wall: [100, 150], ringFix: [71, 82, 110] }
  };

  var BIG = { jump: 1, rings: 1, chain: 1, bus: 1, spring: 1, wall: 1, tnt: 1 };
  function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

  // li : 0..9 (difficulté)
  function genLevel(vk, li, seed, kind) {
    var P = PROF[vk];
    return function (b) {
      var r = rngFor(seed), d = li / (PER_WORLD - 1);
      var budget = (7000 + li * 1400) * (vk === 'truck' ? 0.85 : 1);
      var pool = ['crowd', 'jump', 'waves', 'stairs'];
      if (li >= 1) pool.push('chain', 'jump', 'kick');
      if (li >= 2) pool.push('spring', 'cliff', 'bus');
      if (li >= 3) pool.push('rings', 'wall');
      if (li >= 4) pool.push('tnt', 'chain', 'rings');
      if (li >= 6) pool.push('jump', 'chain', 'wall', 'bus', 'rings');
      // nouveautés présentées dès le parcours où elles apparaissent
      var intro = { 2: 'spring', 3: 'rings', 4: 'tnt' }[li];
      b.flat(700); b.pad(320); b.flat(260);
      var last = '', x0 = b.X(), i = 0;
      while (b.X() - x0 < budget) {
        var t = (i === 0) ? (intro || 'crowd') : (i === 1 && intro ? 'crowd' : pick(r, pool));
        if (t === last && r() < 0.7) t = pick(r, pool);
        last = t;
        var dd = clamp01(d * 0.8 + ((b.X() - x0) / budget) * 0.3 + r() * 0.12 - 0.06);
        var gap = Math.round(lerp(P.gap[0], P.gap[1], dd) / 10) * 10;
        var h = Math.round(lerp(P.ramp[0], P.ramp[1], dd));
        var rl = P.rl;
        if (BIG[t] || i % 3 === 0) { b.flat(80); b.nitroItem(0, 70); b.flat(160); }
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
        } else if (t === 'spring') {
          // tremplin à ressort au bord d'un gouffre : il suffit d'arriver lancé
          b.flat(260);
          b.coinsArc(6, Math.round(gap * 0.9 / 6), 120, 260);
          b.spring(160); b.flat(30); b.pit(Math.round(gap * 0.75 / 10) * 10, kind); b.flat(700);
        } else if (t === 'wall') {
          // tremplin à ressort devant un mur : on rebondit sur le plateau
          var wh = Math.round(lerp(P.wall[0], P.wall[1], dd));
          b.flat(240); b.coinsLine(3, 60, wh + 120);
          b.spring(160); b.flat(150); b.step(-wh); b.flat(620);
          b.hill(Math.round(wh * 4.5), wh);
        } else if (t === 'rings') {
          // anneaux de feu au-dessus d'un grand saut sans gouffre
          b.pad(220); b.flat(180);
          var hr = Math.round(h * 1.1), slope = 1.6 * hr / rl;
          b.ramp(rl, hr);
          b.ringsBallistic(P.v, slope, 3, 0, P.ringFix);
          b.slope(Math.round(rl * 0.9), hr); b.flat(900);
        } else if (t === 'tnt') {
          var tl = [], tn = 3 + Math.floor(dd * 2);
          for (var z = 0; z < tn; z++) tl.push(z % 2 ? 'tnt' : pick(r, P.kinds));
          b.coinsLine(5, 80, 140); b.crowd(tl); b.flat(500);
        }
        b.flat(650);
        i++;
      }
      b.finish();
    };
  }

  // ---------------------------------------------------------------- mondes
  var WORLDS = [
    {
      id: 1, key: 'moto', veh: 'moto', name: 'OCEAN DRIVE', vehName: 'MOTO', scene: 'beach', pitKind: 'water',
      blurb: 'Légère, nerveuse, wheelies faciles. Gare à la tête.',
      c: { skyTop: '#2a0a5e', skyBot: '#ff9a6c', far: '#9b3fa8', mid: '#5f2a8c', ground: '#e9b88f', deep: '#a8603f', edge: '#ffd9b8', hazard: '#00c6e0', hazard2: '#9bffe6' },
      names: [['PREMIÈRE VAGUE', 'Les bases du parcours'], ['PALMIERS', 'Sauts entre les dunes'], ['RESSORTS', 'Premiers tremplins à ressort'], ['ANNEAUX', 'Vise les anneaux de feu'], ['BARILS', 'Attention à la TNT'],
        ['PONTON', 'Plateformes sur l\'eau'], ['MARÉE HAUTE', 'Ça monte et ça descend'], ['JETÉE', 'Sauts au bout du quai'], ['TEMPÊTE', 'Plus vite, plus loin'], ['GRAND FINAL', 'Tout Ocean Drive']]
    },
    {
      id: 2, key: 'monster', veh: 'monster', name: 'NEON JUNKYARD', vehName: 'MONSTER TRUCK', scene: 'junk', pitKind: 'lava',
      blurb: 'Coupé V8 sur gros pneus. Écrase tout, vole haut.',
      c: { skyTop: '#12052e', skyBot: '#b3207f', far: '#43157a', mid: '#2a0d52', ground: '#3a2562', deep: '#1b0e38', edge: '#00e5ff', hazard: '#ff2e97', hazard2: '#ffe14d' },
      names: [['FERRAILLE', 'Écrase les premières épaves'], ['ÉCRASE-TOUT', 'Piles de voitures'], ['GROS RESSORTS', 'Bondis par-dessus la lave'], ['ANNEAUX DE FEU', 'Le grand show'], ['DYNAMITE', 'Les barils sautent'],
        ['TOUR DE GRUE', 'Sauts au-dessus du vide'], ['COMPACTEUR', 'Murs et plateaux'], ['PILES DE BUS', 'Les gros porteurs'], ['CHAOS', 'Tout en même temps'], ['CASSE FINALE', 'Le grand spectacle']]
    },
    {
      id: 3, key: 'civic', veh: 'civic', name: 'MIDNIGHT TOUGE', vehName: 'CIVIC TYPE R', scene: 'touge', pitKind: 'void',
      blurb: 'Hatchback tuning, néons verts, VTEC. Rapide et précise.',
      c: { skyTop: '#05031a', skyBot: '#43207f', far: '#2a1656', mid: '#170c36', ground: '#262148', deep: '#0f0b24', edge: '#ff2e97', hazard: '#7a1aff', hazard2: '#ff4df0' },
      names: [['ÉCHAUFFEMENT', 'Un tour pour chauffer les pneus'], ['COL DE NUIT', 'Enchaînements précis'], ['TOIT DU GARAGE', 'Rebonds en hauteur'], ['TUNNEL NÉON', 'Anneaux dans la nuit'], ['FEU D\'ARTIFICE', 'Barils explosifs'],
        ['ÉPINGLES', 'Virages serrés… en ligne droite'], ['PARKING VIDE', 'Plateaux et ressorts'], ['SAUT DU PONT', 'Le vide sous les roues'], ['VTEC KICK', 'À fond dans les tours'], ['R-ÉVOLUTION', 'La descente finale']]
    },
    {
      id: 4, key: 'truck', veh: 'truck', name: 'CHROME HIGHWAY', vehName: 'CAMION', scene: 'desert', pitKind: 'lava',
      blurb: 'Poids lourd. Lent à lancer, impossible à arrêter.',
      c: { skyTop: '#46105f', skyBot: '#ffb15c', far: '#c24f6e', mid: '#963a5c', ground: '#c9784e', deep: '#7a3b2a', edge: '#ffd28a', hazard: '#ff5500', hazard2: '#ffd000' },
      names: [['DÉPART DÉPÔT', 'Chargement, démarrage'], ['DÉSERT', 'Droit devant'], ['RESSORTS GÉANTS', '30 tonnes en l\'air'], ['ANNEAUX DU CANYON', 'Vise juste'], ['DYNAMITE', 'Livraison explosive'],
        ['PONT CASSÉ', 'Il manque un bout'], ['CONVOI', 'Écrase le trafic'], ['CANYON', 'Gouffres et falaises'], ['MIRAGE', 'Le désert sans fin'], ['DERNIER RELAIS', 'Livraison finale']]
    }
  ];

  // seuils d'étoiles (calibrés par simulation) : [2★, 3★] et temps de référence
  var CAL = {
    1: { par: 11, stars: [3500, 7000] },
    2: { par: 12, stars: [3100, 6200] },
    3: { par: 13, stars: [2700, 5500] },
    4: { par: 15, stars: [5800, 11600] },
    5: { par: 19, stars: [7900, 15700] },
    6: { par: 25, stars: [8300, 16700] },
    7: { par: 23, stars: [4500, 9100] },
    8: { par: 24, stars: [4900, 9900] },
    9: { par: 28, stars: [9200, 18400] },
    10: { par: 33, stars: [6400, 12700] },
    11: { par: 10, stars: [1500, 3000] },
    12: { par: 14, stars: [2900, 5800] },
    13: { par: 16, stars: [5000, 9900] },
    14: { par: 18, stars: [4900, 9800] },
    15: { par: 19, stars: [5500, 11100] },
    16: { par: 25, stars: [13500, 26900] },
    17: { par: 26, stars: [3300, 6700] },
    18: { par: 27, stars: [4600, 9300] },
    19: { par: 31, stars: [8200, 16400] },
    20: { par: 29, stars: [12300, 24600] },
    21: { par: 12, stars: [1600, 3100] },
    22: { par: 15, stars: [2500, 5000] },
    23: { par: 14, stars: [3400, 6900] },
    24: { par: 17, stars: [4300, 8700] },
    25: { par: 17, stars: [2900, 5800] },
    26: { par: 23, stars: [7600, 15300] },
    27: { par: 23, stars: [6700, 13500] },
    28: { par: 22, stars: [4900, 9800] },
    29: { par: 27, stars: [8500, 17100] },
    30: { par: 30, stars: [3800, 7700] },
    31: { par: 11, stars: [800, 1700] },
    32: { par: 13, stars: [3500, 7000] },
    33: { par: 14, stars: [5600, 11200] },
    34: { par: 17, stars: [8000, 16100] },
    35: { par: 19, stars: [5200, 10300] },
    36: { par: 21, stars: [11200, 22300] },
    37: { par: 22, stars: [5300, 10500] },
    38: { par: 23, stars: [5500, 10900] },
    39: { par: 34, stars: [5300, 10600] },
    40: { par: 29, stars: [6000, 12000] }
  };

  var levels = [];
  WORLDS.forEach(function (w, wi) {
    w.levels = [];
    for (var li = 0; li < PER_WORLD; li++) {
      var id = wi * PER_WORLD + li + 1;
      var lv = {
        id: id, world: wi, li: li, veh: w.veh, name: w.names[li][0], sub: w.names[li][1], theme: w.scene, c: w.c,
        par: 30, stars: [3000, 6000], build: genLevel(w.veh, li, 1000 * (wi + 1) + 37 * li + 11, w.pitKind)
      };
      levels.push(lv); w.levels.push(lv);
    }
  });

  function setCal(table) {
    Object.keys(table).forEach(function (k) { var l = levels[k - 1]; if (l) { l.par = table[k].par; l.stars = table[k].stars; } });
  }
  setCal(CAL);

  function buildDef(def) {
    var b = Builder();
    def.build(b);
    return b.done();
  }
  function build(index) { return buildDef(levels[index]); }

  // ---------------------------------------------------------------- défi du jour
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function daily(key) {
    key = key || dayKey();
    var seed = 0;
    for (var i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
    var wi = seed % 4, w = WORLDS[wi];
    var li = 5 + (seed >> 3) % 4;
    return {
      id: 'daily', daily: key, world: wi, li: li, veh: w.veh, name: 'DÉFI DU JOUR', sub: key, theme: w.scene, c: w.c,
      par: 24, stars: [4000, 8000], build: genLevel(w.veh, li, seed ^ 0x5bd1e995, w.pitKind)
    };
  }

  window.MV8_LEVELS = { STEP: STEP, KINDS: KINDS, COLORS: COLORS, PER_WORLD: PER_WORLD, worlds: WORLDS, levels: levels, build: build, buildDef: buildDef, setCal: setCal, CAL: CAL, daily: daily, dayKey: dayKey };
})();
