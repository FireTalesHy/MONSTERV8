/* MONSTER V8 — définition des niveaux et génération du terrain */
(function () {
  'use strict';
  var STEP = 20;
  var TAU = Math.PI * 2;

  // Véhicules écrasables : largeur / hauteur (px monde)
  var KINDS = {
    car:   { w: 170, h: 48 },
    suv:   { w: 190, h: 64 },
    van:   { w: 200, h: 70 },
    limo:  { w: 270, h: 48 },
    wreck: { w: 150, h: 42 },
    truck: { w: 230, h: 84 },
    stack: { w: 170, h: 98 },
    bus:   { w: 340, h: 92 }
  };

  function Builder() {
    var H = [-1600, 0];            // hauteurs aux x = i * STEP (y vers le bas)
    var y = 0;
    var o = { cars: [], coins: [], checks: [], pits: [], finish: 0 };
    var b = {};
    function X() { return (H.length - 1) * STEP; }
    function push(v) { H.push(v); y = v; }
    function nSamples(len) { return Math.max(1, Math.round(len / STEP)); }
    var ease = function (t) { return (1 - Math.cos(Math.PI * t)) / 2; };

    b.X = X;
    b.Y = function () { return y; };
    b.flat = function (len) { var n = nSamples(len); for (var i = 0; i < n; i++) push(y); return b; };
    b.slope = function (len, dy) { var n = nSamples(len), y0 = y; for (var i = 1; i <= n; i++) push(y0 + dy * i / n); return b; };
    b.hill = function (len, dy) { var n = nSamples(len), y0 = y; for (var i = 1; i <= n; i++) push(y0 + dy * ease(i / n)); return b; };
    // tremplin courbe : part à plat et se redresse de plus en plus
    b.ramp = function (len, h) { var n = nSamples(len), y0 = y; for (var i = 1; i <= n; i++) push(y0 - h * Math.pow(i / n, 1.6)); return b; };
    b.waves = function (count, len, h) {
      for (var k = 0; k < count; k++) {
        var m = Math.max(4, nSamples(len)), y0 = y;
        for (var i = 1; i <= m; i++) push(y0 - h * (1 - Math.cos(TAU * i / m)) / 2);
      }
      return b;
    };
    b.step = function (dy) { push(y + dy); return b; };
    b.pit = function (len, kind) {
      var rim = y, x0 = X(), depth = 1800;
      push(rim + depth);
      var n = nSamples(len);
      for (var i = 0; i < n; i++) push(rim + depth);
      push(rim);
      o.pits.push({ x0: x0, x1: X(), rim: rim, kind: kind || 'lava' });
      return b;
    };
    b.crowd = function (list) {
      for (var i = 0; i < list.length; i++) {
        var sp = KINDS[list[i]];
        b.flat(14);
        var x0 = X();
        b.flat(sp.w + 14);
        o.cars.push({
          k: list[i], x: x0 + (sp.w + 14) / 2, w: sp.w, h: sp.h,
          edge: Math.min(48, sp.h * 0.55 + 12), sq: 1, crushed: false, seed: o.cars.length + 1
        });
      }
      return b;
    };
    b.coinsLine = function (n, sp, lift) {
      var x0 = X();
      for (var i = 0; i < n; i++) o.coins.push({ x: x0 + i * sp, lift: lift, abs: false, got: false });
      return b;
    };
    b.coinsArc = function (n, sp, lift, peak) {
      var x0 = X();
      for (var i = 0; i < n; i++) o.coins.push({ x: x0 + i * sp, y: y - lift - peak * Math.sin(Math.PI * i / (n - 1)), abs: true, got: false });
      return b;
    };
    b.check = function () { o.checks.push({ x: X(), hit: false }); return b; };
    b.finish = function () { o.finish = X(); b.flat(900); b.step(-1600); return b; };

    // --- macros -----------------------------------------------------------
    // tremplin, fosse, réception descendante
    b.jumpPit = function (rampLen, h, gap, kind) {
      b.ramp(rampLen, h); b.pit(gap, kind); b.slope(Math.round(rampLen * 1.15), h); return b;
    };
    // tremplin, rangée de véhicules en contrebas, butte de réception
    b.busJump = function (rampLen, h, list, hill) {
      hill = hill === undefined ? 0.5 : hill;
      b.ramp(rampLen, h); b.flat(30); b.step(h);
      b.crowd(list);
      b.slope(150, -h * hill); b.slope(Math.round(rampLen * 0.9), h * hill);
      return b;
    };

    b.done = function () {
      var arr = H.slice();
      function base(x) {
        var f = x / STEP, i = Math.floor(f);
        if (i < 0) return arr[0];
        if (i >= arr.length - 1) return arr[arr.length - 1];
        var t = f - i;
        return arr[i] + (arr[i + 1] - arr[i]) * t;
      }
      var coins = o.coins.map(function (c) {
        return { x: c.x, y: c.abs ? c.y : base(c.x) - c.lift, got: false };
      });
      var minY = 0;
      for (var i = 1; i < arr.length; i++) if (arr[i] < 1500 && arr[i] > minY) minY = arr[i];
      return { H: arr, base: base, cars: o.cars, coins: coins, checks: o.checks, pits: o.pits, finish: o.finish, startX: 260, length: X(), maxY: minY };
    };
    return b;
  }

  var COLORS = ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1', '#16a085'];

  var levels = [
    // ---------------------------------------------------------------- 1
    {
      id: 1, name: 'FERRAILLE PARK', sub: 'Écrase tout ce qui bouge', theme: 'junk',
      c: { skyTop: '#ff7a2f', skyBot: '#ffd98a', far: '#7a4a64', mid: '#563a49', ground: '#6b4a2b', deep: '#3d2918', edge: '#a6803f', hazard: '#ff6a00', hazard2: '#ffd000' },
      par: 45, stars: [13500, 23000],
      build: function (b) {
        b.flat(600);
        b.coinsLine(6, 80, 70); b.flat(520);
        b.crowd(['car', 'car', 'car', 'car']); b.flat(350);
        b.coinsLine(5, 80, 70); b.flat(450);
        b.ramp(260, 90); b.slope(220, 90); b.flat(650);
        b.check();
        b.crowd(['suv', 'car', 'van', 'car', 'suv']); b.flat(500);
        b.waves(5, 300, 46); b.flat(600);
        b.coinsArc(8, 90, 60, 150); b.jumpPit(280, 100, 360); b.flat(750);
        b.check();
        b.crowd(['stack', 'car', 'stack', 'car']); b.flat(550);
        b.coinsArc(10, 100, 150, 200); b.busJump(320, 150, ['car', 'car', 'suv', 'car', 'van']); b.flat(750);
        b.check();
        b.waves(4, 260, 60); b.flat(400);
        b.crowd(['car', 'limo', 'car', 'bus']); b.flat(550);
        b.coinsArc(8, 90, 90, 160); b.ramp(300, 120); b.slope(260, 120); b.flat(400);
        b.finish();
      }
    },
    // ---------------------------------------------------------------- 2
    {
      id: 2, name: 'BOUE & MARAIS', sub: 'Collines grasses et mares sans fond', theme: 'mud',
      c: { skyTop: '#6f8f8a', skyBot: '#cfe0c3', far: '#59775f', mid: '#456a4e', ground: '#6a4a2a', deep: '#3a2815', edge: '#5c8a3a', hazard: '#4c7a5a', hazard2: '#9fd0a6' },
      par: 68, stars: [9500, 16500],
      build: function (b) {
        b.flat(600);
        b.hill(900, -220); b.hill(900, 220); b.flat(300);
        b.coinsLine(6, 80, 80);
        b.crowd(['van', 'suv', 'car', 'van']); b.flat(450);
        b.waves(6, 280, 55); b.flat(500);
        b.check();
        b.coinsArc(8, 90, 60, 160); b.jumpPit(280, 105, 420, 'water'); b.flat(700);
        b.hill(1000, -300); b.flat(200);
        b.coinsArc(10, 90, 140, 200);
        b.ramp(300, 140); b.slope(500, 440); b.flat(500);
        b.check();
        b.crowd(['stack', 'suv', 'stack', 'van', 'car']); b.flat(500);
        b.waves(5, 240, 70); b.flat(600);
        b.coinsArc(9, 100, 80, 180); b.jumpPit(300, 120, 520, 'water'); b.flat(700);
        b.check();
        b.crowd(['bus', 'car', 'bus']); b.flat(500);
        b.hill(800, -240); b.hill(800, 240); b.flat(400);
        b.coinsArc(10, 100, 100, 220); b.busJump(340, 170, ['suv', 'suv', 'van', 'car', 'suv', 'car']); b.flat(600);
        b.finish();
      }
    },
    // ---------------------------------------------------------------- 3
    {
      id: 3, name: 'STADE DES RAMPES', sub: 'Plus haut, plus loin, plus fort', theme: 'city',
      c: { skyTop: '#2c7fd0', skyBot: '#bfe3ff', far: '#7f9bb8', mid: '#5f7a96', ground: '#7a6a58', deep: '#463c33', edge: '#d9c9a6', hazard: '#2a8fd9', hazard2: '#bfeaff' },
      par: 68, stars: [21000, 35500],
      build: function (b) {
        b.flat(650);
        b.coinsLine(6, 80, 70);
        b.crowd(['car', 'car', 'suv', 'car', 'car']); b.flat(500);
        b.coinsArc(10, 100, 120, 220); b.busJump(340, 170, ['car', 'car', 'car', 'suv', 'van', 'car']); b.flat(750);
        b.check();
        b.waves(6, 260, 60); b.flat(500);
        b.coinsArc(10, 100, 80, 200); b.jumpPit(320, 140, 560, 'water'); b.flat(750);
        b.crowd(['stack', 'stack', 'stack']); b.flat(500);
        b.check();
        b.coinsArc(12, 100, 120, 260); b.busJump(380, 210, ['bus', 'limo', 'bus', 'truck'], 0.55); b.flat(800);
        b.waves(4, 300, 80); b.flat(500);
        b.check();
        b.coinsArc(10, 100, 100, 240); b.ramp(320, 150); b.slope(240, 150); b.flat(200); b.ramp(320, 190); b.slope(300, 190); b.flat(700);
        b.crowd(['car', 'suv', 'van', 'limo', 'suv', 'car']); b.flat(500);
        b.coinsArc(12, 110, 140, 280); b.busJump(420, 250, ['bus', 'truck', 'bus', 'limo', 'bus'], 0.5); b.flat(700);
        b.finish();
      }
    },
    // ---------------------------------------------------------------- 4
    {
      id: 4, name: 'MONT GLACÉ', sub: 'Grimpe, plane, atterris', theme: 'snow',
      c: { skyTop: '#4a79b8', skyBot: '#e7f2ff', far: '#8aa3c4', mid: '#6d86a8', ground: '#8a95a3', deep: '#4b5563', edge: '#ffffff', hazard: '#1d4f8a', hazard2: '#9fd0ff' },
      par: 67, stars: [12500, 21500],
      build: function (b) {
        b.flat(650);
        b.coinsLine(6, 80, 70);
        b.slope(1300, -450); b.flat(400);
        b.coinsArc(10, 100, 100, 240);
        b.ramp(300, 130); b.slope(260, 130); b.slope(900, 380); b.flat(700);
        b.check();
        b.crowd(['suv', 'car', 'van', 'car']); b.flat(500);
        b.hill(1000, -500); b.flat(250);
        b.coinsArc(12, 110, 100, 300);
        b.jumpPit(330, 150, 640, 'water'); b.slope(500, 350); b.flat(700);
        b.check();
        b.waves(6, 260, 75); b.flat(500);
        b.crowd(['stack', 'car', 'stack', 'suv']); b.flat(500);
        b.hill(1100, -520); b.flat(200);
        b.coinsArc(12, 110, 120, 320);
        b.busJump(380, 220, ['bus', 'suv', 'van', 'bus'], 0.5); b.slope(700, 520); b.flat(700);
        b.check();
        b.coinsArc(10, 100, 100, 260);
        b.jumpPit(340, 170, 760, 'water'); b.flat(600);
        b.waves(5, 300, 85); b.flat(500);
        b.finish();
      }
    },
    // ---------------------------------------------------------------- 5
    {
      id: 5, name: 'VOLCAN EN FUSION', sub: 'Ne touche pas la lave', theme: 'volcano',
      c: { skyTop: '#2a0a12', skyBot: '#ff5a1f', far: '#4a1a1a', mid: '#2c0f10', ground: '#3b2a2a', deep: '#1a1010', edge: '#ff7a2a', hazard: '#ff5500', hazard2: '#ffd400' },
      par: 62, stars: [19500, 33000],
      build: function (b) {
        b.flat(650);
        b.coinsArc(8, 90, 60, 150); b.jumpPit(280, 110, 420, 'lava'); b.flat(650);
        b.crowd(['wreck', 'wreck', 'car', 'wreck']); b.flat(450);
        b.check();
        b.waves(6, 240, 70); b.flat(500);
        b.coinsArc(10, 100, 100, 230); b.jumpPit(320, 150, 620, 'lava'); b.flat(700);
        b.coinsArc(10, 100, 100, 230); b.jumpPit(320, 150, 640, 'lava'); b.flat(700);
        b.check();
        b.crowd(['stack', 'truck', 'stack', 'truck']); b.flat(500);
        b.hill(800, -280); b.hill(800, 280); b.flat(300);
        b.coinsArc(12, 110, 120, 300);
        b.jumpPit(360, 190, 820, 'lava'); b.flat(700);
        b.check();
        b.waves(5, 280, 90); b.flat(450);
        b.coinsArc(12, 110, 140, 300);
        b.busJump(400, 230, ['truck', 'bus', 'truck', 'stack', 'bus'], 0.5); b.flat(700);
        b.check();
        b.coinsArc(12, 120, 120, 320);
        b.jumpPit(360, 200, 900, 'lava'); b.flat(600);
        b.crowd(['car', 'wreck', 'suv', 'wreck']); b.flat(500);
        b.finish();
      }
    },
    // ---------------------------------------------------------------- 6
    {
      id: 6, name: 'ARÈNE FINALE', sub: 'Le grand spectacle', theme: 'arena',
      c: { skyTop: '#07041a', skyBot: '#3a1d6e', far: '#241446', mid: '#150b2e', ground: '#7a5a34', deep: '#3e2c18', edge: '#d9b36a', hazard: '#7a1aff', hazard2: '#ff4df0' },
      par: 84, stars: [24500, 42500],
      build: function (b) {
        b.flat(650);
        b.coinsLine(6, 80, 70);
        b.crowd(['car', 'suv', 'van', 'car', 'limo']); b.flat(450);
        b.coinsArc(10, 100, 120, 240); b.busJump(360, 200, ['bus', 'car', 'suv', 'bus'], 0.5); b.flat(700);
        b.check();
        b.waves(7, 240, 80); b.flat(450);
        b.coinsArc(10, 100, 100, 260); b.jumpPit(340, 170, 700, 'void'); b.flat(700);
        b.crowd(['stack', 'stack', 'truck', 'stack', 'stack']); b.flat(500);
        b.check();
        b.hill(900, -320); b.coinsArc(10, 100, 120, 300);
        b.ramp(380, 210); b.slope(300, 210); b.slope(800, 320); b.flat(500);
        b.crowd(['limo', 'bus', 'limo']); b.flat(450);
        b.check();
        b.coinsArc(12, 110, 120, 320);
        b.jumpPit(380, 220, 880, 'void'); b.flat(450);
        b.coinsArc(12, 110, 120, 320);
        b.jumpPit(380, 230, 900, 'void'); b.flat(650);
        b.check();
        b.waves(6, 280, 95); b.flat(450);
        b.crowd(['truck', 'bus', 'truck', 'bus', 'truck']); b.flat(500);
        b.coinsArc(14, 120, 160, 360);
        b.busJump(460, 290, ['bus', 'stack', 'truck', 'bus', 'stack', 'limo', 'bus'], 0.5); b.flat(700);
        b.finish();
      }
    }
  ];

  // chaque niveau est joué en 2 boucles : la 1re se termine par un checkpoint au lieu de l'arrivée
  function build(index) {
    var b = Builder(), def = levels[index], loops = def.loops || 2;
    var realFinish = b.finish;
    for (var i = 0; i < loops; i++) {
      if (i < loops - 1) { b.finish = function () { b.flat(500); b.check(); return b; }; }
      else b.finish = realFinish;
      def.build(b);
    }
    return b.done();
  }

  window.MV8_LEVELS = { STEP: STEP, KINDS: KINDS, COLORS: COLORS, levels: levels, build: build };
})();
