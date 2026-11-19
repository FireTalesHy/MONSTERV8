/* MONSTER V8 — moteur de jeu : physique arcade, rendu canvas, HUD */
(function () {
  'use strict';
  var LV = window.MV8_LEVELS, SND = window.MV8_SND;
  var STEP = LV.STEP, TAU = Math.PI * 2;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }

  // ---------------------------------------------------------------- constantes physiques
  var G = 1250;            // gravité (px/s²) — un peu allégée pour de grands sauts
  var R = 78;              // longueur de suspension (attache → sol)
  var WR = 38;             // rayon des roues
  var WB = 68;             // demi-empattement
  var K = 46, C = 10;      // ressort / amortisseur
  var KH = 420;            // butée de fin de course
  var MAXC = R - WR - 8;
  var INV_I = 1 / 2800;    // inertie
  var P_DRIVE = 820;       // poussée par roue
  var BRAKE = 1100;
  var VMAX = 1800, RMAX = 520;
  var MU = 2.6;
  var BOOST = 1500;
  var DQ = 0.00026;        // traînée quadratique
  var WHEELIE = 1.0;       // couple cabré à l'accélération
  var AIR_ROT = 9.5;       // contrôle en l'air (rad/s²)
  var BODY_PTS = [
    [112, -18], [112, -34], [34, -68], [-40, -68], [-110, -34], [-108, -14], [66, -50], [-70, -46]
  ];
  var ROOF = { 2: 1, 3: 1 };
  var CAR_COLORS = [
    { n: 'Orange', a: '#ff8a1f', b: '#c2410c' },
    { n: 'Rouge', a: '#ff3b30', b: '#9f1239' },
    { n: 'Bleu', a: '#2f8cff', b: '#1e3a8a' },
    { n: 'Jaune', a: '#ffd21f', b: '#b45309' },
    { n: 'Vert', a: '#3ddc84', b: '#166534' },
    { n: 'Noir', a: '#4b5563', b: '#0b0f14' }
  ];

  // ---------------------------------------------------------------- canvas / état global
  var cv = document.getElementById('c'), g = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1, DPR_CAP = 2, slowFrames = 0;
  function shade(hex, f) {
    if (hex.charAt(0) !== '#' || hex.length !== 7) return hex;
    var r = Math.min(255, Math.round(parseInt(hex.substr(1, 2), 16) * f));
    var gg = Math.min(255, Math.round(parseInt(hex.substr(3, 2), 16) * f));
    var b = Math.min(255, Math.round(parseInt(hex.substr(5, 2), 16) * f));
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  window.addEventListener('resize', resize); resize();

  var SAVE_KEY = 'monsterv8.save.v1';
  var save = { unlocked: 1, stars: {}, best: {}, color: 0, muted: false };
  try { var raw = localStorage.getItem(SAVE_KEY); if (raw) Object.assign(save, JSON.parse(raw)); } catch (e) { /* ok */ }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ok */ } }
  SND.setMuted(!!save.muted);

  var state = 'menu';       // menu | play | pause | result
  var S = null;             // monde courant
  var menuT = 0;

  // ---------------------------------------------------------------- entrées
  var keys = {};
  var touch = { gas: false, brake: false, left: false, right: false, boost: false };
  var override = null;
  function readInput() {
    if (override) return override;
    return {
      gas: !!(keys.ArrowUp || keys.KeyW || touch.gas),
      brake: !!(keys.ArrowDown || keys.KeyS || touch.brake),
      left: !!(keys.ArrowLeft || keys.KeyA || touch.left),
      right: !!(keys.ArrowRight || keys.KeyD || touch.right),
      boost: !!(keys.Space || keys.ShiftLeft || keys.ShiftRight || touch.boost)
    };
  }
  window.addEventListener('keydown', function (e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    SND.init();
    keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') pause(); else if (state === 'pause') resume(); }
    else if (e.code === 'KeyR' && state === 'play') respawn('R');
    else if (e.code === 'KeyM') toggleMute();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; if (state === 'play') pause(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'play') pause(); });
  window.addEventListener('pointerdown', function () { SND.init(); }, { passive: true });

  function toggleMute() {
    save.muted = !SND.isMuted(); SND.setMuted(save.muted); persist();
    var b = document.getElementById('btn-mute'); if (b) b.textContent = save.muted ? '🔇' : '🔊';
  }

  // ---------------------------------------------------------------- terrain
  function getH(x) {
    var T = S.T, h = T.base(x), cs = T.cars;
    for (var i = 0; i < cs.length; i++) {
      var o = cs[i], hw = o.w / 2, dx = x - o.x;
      if (dx < 0) dx = -dx;
      if (dx < hw) {
        var e = (hw - dx) / o.edge; if (e > 1) e = 1;
        h -= o.h * o.sq * (e * e * (3 - 2 * e));
      }
    }
    return h;
  }
  var NRM = { x: 0, y: -1 };
  function normalAt(x) {
    var s = (getH(x + 9) - getH(x - 9)) / 18;
    var l = Math.sqrt(1 + s * s);
    NRM.x = s / l; NRM.y = -1 / l;
    return NRM;
  }
  // lance un rayon (ox,oy)+t*(dx,dy) ; retourne t du premier contact sol ou -1
  function ray(ox, oy, dx, dy, len) {
    if (oy >= getH(ox)) return 0;
    var prev = 0, t = 0;
    while (t < len) {
      t = Math.min(len, t + 7);
      if (oy + dy * t >= getH(ox + dx * t)) {
        var lo = prev, hi = t;
        for (var i = 0; i < 6; i++) {
          var mid = (lo + hi) / 2;
          if (oy + dy * mid >= getH(ox + dx * mid)) hi = mid; else lo = mid;
        }
        return hi;
      }
      prev = t;
    }
    return -1;
  }

  // ---------------------------------------------------------------- voiture
  function newCar(x, y) {
    return {
      x: x, y: y, a: 0, vx: 0, vy: 0, w: 0, nitro: 100, rpm: 1000, boosting: false,
      wheels: [{ dist: R, spin: 0, gr: false, vt: 0 }, { dist: R, spin: 0, gr: false, vt: 0 }],
      grounded: 0, bodyHit: false, roofHit: false, impact: 0, gspeed: 0
    };
  }

  function physStep(h, inp) {
    var car = S.car, ca = Math.cos(car.a), sa = Math.sin(car.a);
    var ax = 0, ay = G, aw = 0;
    var drive = (inp.gas ? 1 : 0) - (inp.brake ? 1 : 0);
    var grounded = 0, gsum = 0;
    var boosting = inp.boost && car.nitro > 0 && !S.finished;
    var vmax = VMAX * (boosting ? 1.4 : 1);

    for (var i = 0; i < 2; i++) {
      var wh = car.wheels[i], lx = i === 0 ? -WB : WB;
      var px = car.x + lx * ca, py = car.y + lx * sa;
      var dx = -sa, dy = ca;
      var t = ray(px, py, dx, dy, R);
      if (t < 0) {
        wh.dist += (R - wh.dist) * Math.min(1, h * 14);
        wh.gr = false;
        wh.spin += (drive > 0 ? 38 : wh.vt / WR) * h;
        wh.vt *= (1 - h * 0.8);
        continue;
      }
      var comp = R - t;
      wh.dist = t;
      var cx = px + dx * t;
      var n = normalAt(cx), nx = n.x, ny = n.y;
      var rx = px - car.x, ry = py - car.y;
      var pvx = car.vx - car.w * ry, pvy = car.vy + car.w * rx;
      var vn = pvx * nx + pvy * ny;
      var f = K * comp - C * vn;
      if (comp > MAXC) f += KH * (comp - MAXC);
      if (f < 0) f = 0; else if (f > 7000) f = 7000;
      if (!wh.gr && vn < -380 && -vn > car.impact) car.impact = -vn;
      if (!wh.gr) wh.gr = true;
      grounded++;
      ax += nx * f; ay += ny * f;
      aw += (rx * ny * f - ry * nx * f) * INV_I;

      // traction
      var tx = -ny, ty = nx;
      var vt = pvx * tx + pvy * ty;
      wh.vt = vt; gsum += vt;
      var ft = 0;
      if (drive > 0) {
        ft = P_DRIVE * clamp(1 - Math.max(vt, 0) / vmax, 0, 1.3);
        if (vt < 0) ft *= 1.6;
      } else if (drive < 0) {
        if (vt > 40) ft = -BRAKE; else ft = -P_DRIVE * 0.8 * clamp(1 + vt / RMAX, 0, 1);
      } else {
        ft = -vt * 0.55;
      }
      var lim = MU * f + 120;
      ft = clamp(ft, -lim, lim);
      ax += tx * ft; ay += ty * ft;
      aw += (rx * ty * ft - ry * tx * ft) * INV_I;
      wh.spin += (vt / WR) * h;

      if (S.finished === false) crushAt(cx);
    }

    // collisions de la carrosserie
    car.bodyHit = false; car.roofHit = false;
    for (var k = 0; k < BODY_PTS.length; k++) {
      var bp = BODY_PTS[k];
      var wx = car.x + bp[0] * ca - bp[1] * sa, wy = car.y + bp[0] * sa + bp[1] * ca;
      var pen = wy - getH(wx);
      if (pen > 0) {
        var m = normalAt(wx);
        var brx = wx - car.x, bry = wy - car.y;
        var bvx = car.vx - car.w * bry, bvy = car.vy + car.w * brx;
        var bvn = bvx * m.x + bvy * m.y;
        var bf = 420 * pen - 24 * bvn;
        if (bf < 0) bf = 0; else if (bf > 9000) bf = 9000;
        var bnx = m.x, bny = m.y;
        ax += bnx * bf; ay += bny * bf;
        aw += (brx * bny * bf - bry * bnx * bf) * INV_I;
        var btx = -bny, bty = bnx;
        var bvt = bvx * btx + bvy * bty;
        var bft = clamp(-bvt * 3.5, -bf * 0.8, bf * 0.8);
        ax += btx * bft; ay += bty * bft;
        aw += (brx * bty * bft - bry * btx * bft) * INV_I;
        car.bodyHit = true;
        if (ROOF[k]) car.roofHit = true;
        if (bvn < -300 && -bvn > car.impact) car.impact = -bvn;
        if (S.finished === false) crushAt(wx);
      }
    }

    car.grounded = grounded;
    car.gspeed = grounded ? gsum / grounded : car.gspeed;

    // couples supplémentaires
    var rot = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (grounded) {
      if (drive > 0) aw -= WHEELIE;
      aw += rot * 3.2;
    }

    // traînée + nitro
    var spd = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    ax -= car.vx * spd * DQ; ay -= car.vy * spd * DQ;
    if (boosting) {
      ax += ca * BOOST; ay += sa * BOOST;
      car.nitro = Math.max(0, car.nitro - 26 * h);
    } else if (grounded && car.nitro < 100) {
      car.nitro = Math.min(100, car.nitro + 3 * h);
    }
    car.boosting = boosting;

    car.vx += ax * h; car.vy += ay * h; car.w += aw * h;
    if (!grounded && !car.bodyHit) {
      if (rot) car.w += rot * AIR_ROT * h;
      else car.w *= Math.exp(-1.1 * h);
    } else {
      car.w *= Math.exp(-0.6 * h);
    }
    car.w = clamp(car.w, -8.5, 8.5);
    car.x += car.vx * h; car.y += car.vy * h; car.a += car.w * h;
  }

  // ---------------------------------------------------------------- écrasement / score
  function crushAt(x) {
    var cs = S.T.cars;
    for (var i = 0; i < cs.length; i++) {
      var o = cs[i];
      if (!o.crushed && Math.abs(x - o.x) <= o.w / 2 + 6) crush(o);
    }
  }
  function mult() { return Math.min(5, 1 + S.combo * 0.5); }
  function addScore(pts, label, wx, wy, col, noCombo) {
    var m = mult(), v = Math.round(pts * m);
    S.score += v;
    if (!noCombo) { S.combo++; S.comboT = 4; }
    popup(label ? label + ' +' + v : '+' + v, wx, wy, col || '#fff', 1);
  }
  function popup(txt, x, y, col, size) { S.pops.push({ txt: txt, x: x, y: y, t: 0, life: 1.3, col: col, size: size || 1 }); }
  function banner(txt, col) { S.banner = { txt: txt, t: 0, col: col || '#ffd21f' }; }
  function crush(o) {
    o.crushed = true; S.stats.crushed++;
    var big = o.h > 80;
    addScore(big ? 200 : 100, 'CRUSH', o.x, S.T.base(o.x) - o.h - 20, '#ffd21f');
    S.car.nitro = Math.min(100, S.car.nitro + 6);
    S.shake = Math.max(S.shake, big ? 16 : 9);
    var gy = S.T.base(o.x);
    for (var i = 0; i < 18; i++) spawn(o.x + rnd(-o.w / 2, o.w / 2), gy - rnd(5, o.h), rnd(-260, 260), rnd(-520, -80), rnd(0.5, 1), rnd(3, 7), i % 3 ? '#b9c7d6' : '#ffb020', 1);
    SND.crush();
  }

  // ---------------------------------------------------------------- particules
  function spawn(x, y, vx, vy, life, size, col, grav, add) {
    if (S.parts.length > 500) S.parts.shift();
    S.parts.push({ x: x, y: y, vx: vx, vy: vy, t: 0, life: life, size: size, col: col, grav: grav || 0, add: !!add });
  }
  function updateParts(dt) {
    var p = S.parts;
    for (var i = p.length - 1; i >= 0; i--) {
      var q = p[i];
      q.t += dt;
      if (q.t >= q.life) { p.splice(i, 1); continue; }
      q.vy += q.grav * G * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= (1 - dt * 0.8);
    }
    var ps = S.pops;
    for (var j = ps.length - 1; j >= 0; j--) { ps[j].t += dt; ps[j].y -= 50 * dt; if (ps[j].t > ps[j].life) ps.splice(j, 1); }
  }

  // ---------------------------------------------------------------- niveaux
  var ghostCar = null;
  function startLevel(i) {
    var def = LV.levels[i], T = LV.build(i);
    var sx = T.startX;
    S = {
      idx: i, def: def, T: T, car: newCar(sx, T.base(sx) - 110),
      parts: [], pops: [], banner: null, t: 0, score: 0, combo: 0, comboT: 0, shake: 0,
      cp: { x: sx }, finished: false, finishT: 0, done: false,
      air: { t: 0, rot: 0, last: 0, pending: null, prevA: 0, active: false },
      wheelie: 0, upsideT: 0, stats: { crushed: 0, coins: 0, flips: 0, bestAir: 0, crashes: 0 },
      cam: { x: sx + 200, y: T.base(sx) - 100, s: Math.min(H / 700, W / 900) }, dustT: 0, smokeT: 0, hint: 4
    };
    S.car.vx = 0;
    state = 'play';
    UI.show(null);
    UI.hud(true);
  }

  function respawn(why) {
    if (!S || S.finished) return;
    var T = S.T, x = S.cp.x, keepNitro = S.car.nitro;
    var c = newCar(x, T.base(x) - 120);
    c.nitro = keepNitro; c.vx = 250;
    S.car = c; S.combo = 0; S.comboT = 0; S.air.active = false; S.air.pending = null; S.upsideT = 0;
    S.stats.crashes++;
    if (why === 'lava') { banner('SPLASH !', '#ff6a00'); SND.splash(); }
  }

  function finishLevel() {
    S.finished = true; S.finishT = 0;
    var def = S.def;
    var bonus = Math.max(0, Math.round((def.par - S.t) * 25));
    S.timeBonus = bonus; S.score += bonus;
    S.starsEarned = S.score >= def.stars[1] ? 3 : S.score >= def.stars[0] ? 2 : 1;
    banner('ARRIVÉE !', '#3ddc84');
    SND.fanfare();
    S.shake = 10;
    for (var i = 0; i < 80; i++) spawn(S.car.x + rnd(-300, 300), S.car.y - rnd(100, 500), rnd(-200, 200), rnd(-100, 300), rnd(1, 2), rnd(4, 8), ['#ff3b30', '#ffd21f', '#2f8cff', '#3ddc84', '#fff'][i % 5], 0.2);
  }

  // ---------------------------------------------------------------- mise à jour
  function update(dt) {
    var inp = readInput();
    if (S.finished) inp = { gas: false, brake: true, left: false, right: false, boost: false };
    var timeScale = S.finished ? clamp(1 - S.finishT * 0.3, 0.45, 1) : 1;
    dt *= timeScale;
    S.t += S.finished ? 0 : dt;
    var steps = Math.max(1, Math.ceil(dt / (1 / 180))), h = dt / steps;
    var car = S.car;
    car.impact = 0;
    for (var i = 0; i < steps; i++) physStep(h, inp);
    car = S.car;

    // obstacles écrasés
    var cs = S.T.cars;
    for (var c = 0; c < cs.length; c++) if (cs[c].crushed) cs[c].sq += (0.26 - cs[c].sq) * Math.min(1, dt * 14);

    // atterrissages / chocs
    if (car.impact > 0) {
      S.shake = Math.max(S.shake, Math.min(18, car.impact / 70));
      SND.land(car.impact);
      for (var d = 0; d < 10; d++) {
        var wi = car.wheels[d % 2], ang = car.a;
        spawn(car.x + (d % 2 ? WB : -WB) * Math.cos(ang), car.y + 60, rnd(-300, 300), rnd(-300, -40), rnd(0.4, 0.9), rnd(4, 9), S.def.c.edge, 0.3);
      }
    }

    updateStunts(dt, inp);

    // pièces
    var coins = S.T.coins;
    for (var q = 0; q < coins.length; q++) {
      var co = coins[q];
      if (co.got) continue;
      var ddx = co.x - car.x, ddy = co.y - (car.y - 20);
      if (ddx * ddx + ddy * ddy < 80 * 80) {
        co.got = true; S.stats.coins++; S.score += 50; car.nitro = Math.min(100, car.nitro + 8);
        popup('+50', co.x, co.y - 10, '#ffd21f', 0.8); SND.coin();
        for (var z = 0; z < 6; z++) spawn(co.x, co.y, rnd(-200, 200), rnd(-200, 200), 0.5, 4, '#ffd21f', 0, true);
      }
    }

    // checkpoints
    var cks = S.T.checks;
    for (var m = 0; m < cks.length; m++) {
      if (!cks[m].hit && car.x > cks[m].x) {
        cks[m].hit = true; S.cp = cks[m]; car.nitro = Math.min(100, car.nitro + 30);
        banner('CHECKPOINT', '#2f8cff'); SND.checkpoint();
      }
    }

    // lave / vide
    var T = S.T;
    for (var p = 0; p < T.pits.length; p++) {
      var pit = T.pits[p];
      if (car.x > pit.x0 && car.x < pit.x1 && car.y > pit.rim + 360) { respawn('lava'); break; }
    }
    if (car.y > T.maxY + 1400 || car.y > 3000) respawn('lava');

    // retournée trop longtemps → remise sur roues
    if (Math.cos(car.a) < 0.15 && (car.grounded || car.bodyHit) && Math.hypot(car.vx, car.vy) < 260) S.upsideT += dt; else S.upsideT = 0;
    if (S.upsideT > 1.1) {
      var gy = getH(car.x);
      car.y = gy - 150; car.a = 0; car.w = 0; car.vy = 0; car.vx *= 0.5; S.upsideT = 0;
      banner('REMIS SUR ROUES', '#fff');
    }

    // arrivée
    if (!S.finished && car.x >= T.finish) finishLevel();
    if (S.finished) {
      S.finishT += dt / timeScale;
      if (S.finishT > 2.6 && !S.done) { S.done = true; showResult(); }
    }

    // combo
    if (S.combo > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
    if (S.banner) { S.banner.t += dt; if (S.banner.t > 1.6) S.banner = null; }
    if (S.hint > 0) S.hint -= dt;

    effects(dt, inp);
    updateParts(dt);
    updateCamera(dt);
    S.shake *= Math.exp(-dt * 6);
    updateEngine(inp);
  }

  function updateStunts(dt, inp) {
    var car = S.car, A = S.air;
    var inAir = car.grounded === 0 && !car.bodyHit;
    if (inAir) {
      if (!A.active) { A.active = true; A.t = 0; A.rot = 0; A.prevA = car.a; }
      A.t += dt;
      A.rot += car.a - A.prevA; A.prevA = car.a;
      if (A.pending) A.pending = null;
    } else if (A.active) {
      A.active = false;
      if (A.t > 0.55) {
        var flips = Math.floor(Math.abs(A.rot) / (TAU * 0.86));
        A.pending = { t: 0.4, air: A.t, flips: flips, dir: A.rot < 0 ? -1 : 1 };
      }
      if (A.t > S.stats.bestAir) S.stats.bestAir = A.t;
    }
    var P = A.pending;
    if (P) {
      P.t -= dt;
      if (car.roofHit) { A.pending = null; S.stats.crashes++; S.combo = 0; banner('CRASH !', '#ff3b30'); SND.crash(); S.shake = 18; }
      else if (P.t <= 0) {
        A.pending = null;
        var up = Math.cos(car.a) > 0.35;
        if (!up) { S.combo = 0; banner('CRASH !', '#ff3b30'); SND.crash(); }
        else {
          var pts = Math.round(P.air * 90);
          var label = 'AIR ' + P.air.toFixed(1) + 's';
          if (P.flips > 0) {
            pts += P.flips * 600 + (P.flips - 1) * 400;
            S.stats.flips += P.flips;
            label = (P.dir < 0 ? 'BACKFLIP' : 'FRONTFLIP') + (P.flips > 1 ? ' x' + P.flips : '');
            car.nitro = Math.min(100, car.nitro + 12 * P.flips);
          }
          if (P.air > 0.9 || P.flips) { addScore(pts, label, car.x, car.y - 140, '#ff8a1f'); banner(label, '#ffd21f'); SND.stunt(); }
          else { S.score += pts; }
        }
      }
    }
    // wheelie
    var rearOnly = car.wheels[0].gr && !car.wheels[1].gr;
    if (rearOnly && car.a < -0.3) S.wheelie += dt; else {
      if (S.wheelie > 1.0) addScore(Math.round(S.wheelie * 120), 'WHEELIE', car.x, car.y - 140, '#2f8cff');
      S.wheelie = 0;
    }
  }

  function updateEngine(inp) {
    var car = S.car;
    var thr = inp.gas ? 1 : 0;
    var sp = car.grounded ? Math.abs(car.gspeed) : Math.abs(car.vx) * 0.6;
    var gears = [0, 360, 720, 1080, 1440, 1900], gi = 0;
    while (gi < 4 && sp > gears[gi + 1]) gi++;
    var frac = clamp((sp - gears[gi]) / (gears[gi + 1] - gears[gi]), 0, 1);
    var target = car.grounded ? 1100 + frac * 4600 + thr * 400 : (thr ? 6200 : 1500);
    if (car.boosting) target += 600;
    car.rpm += (target - car.rpm) * 0.12;
    if (state === 'play') SND.engine(car.rpm, thr, car.boosting);
  }

  function effects(dt, inp) {
    var car = S.car, ca = Math.cos(car.a), sa = Math.sin(car.a);
    var sp = Math.hypot(car.vx, car.vy);
    S.dustT -= dt; S.smokeT -= dt;
    if (S.dustT <= 0 && car.grounded && sp > 140) {
      S.dustT = 0.025;
      for (var i = 0; i < 2; i++) {
        var wh = car.wheels[i];
        if (!wh.gr) continue;
        var lx = i === 0 ? -WB : WB;
        var wx = car.x + lx * ca - (wh.dist - WR) * -sa * -1 * 0 + (-sa) * wh.dist, wy = car.y + lx * sa + ca * wh.dist;
        spawn(wx, wy - 4, -car.vx * 0.15 + rnd(-60, 60), rnd(-220, -40), rnd(0.35, 0.8), rnd(4, 11), S.def.c.edge, 0.15);
      }
    }
    // échappement
    var ex = car.x + (-114) * ca - (-12) * sa, ey = car.y + (-114) * sa + (-12) * ca;
    if (car.boosting) {
      for (var f = 0; f < 3; f++) {
        spawn(ex, ey, -ca * rnd(500, 900) + car.vx * 0.5, -sa * rnd(500, 900) + car.vy * 0.5 + rnd(-60, 60), rnd(0.15, 0.3), rnd(7, 15), f ? '#ffb020' : '#7ad1ff', 0, true);
      }
    } else if (S.smokeT <= 0) {
      S.smokeT = inp.gas ? 0.04 : 0.12;
      spawn(ex, ey, -ca * 80 + rnd(-20, 20), -40 + rnd(-20, 10), rnd(0.5, 1), rnd(5, 10), 'rgba(200,200,200,0.5)', -0.05);
    }
  }

  function updateCamera(dt) {
    var car = S.car, cam = S.cam, T = S.T;
    var sp = Math.hypot(car.vx, car.vy);
    var gh = T.base(car.x);
    var alt = clamp(gh - car.y - 60, 0, 700);
    var base = Math.min(H / 700, W / 900);
    var ts = base * (1 - clamp(sp / 4200, 0, 0.2)) * (1 - alt / 2400);
    cam.s += (ts - cam.s) * Math.min(1, dt * 2.5);
    var tx = car.x + clamp(car.vx, -300, 2200) * 0.26;
    var ty = car.y - 30 - clamp(alt * 0.15, 0, 80);
    cam.x += (tx - cam.x) * Math.min(1, dt * 5);
    cam.y += (ty - cam.y) * Math.min(1, dt * 3.5);
  }

  // ---------------------------------------------------------------- rendu : décors
  function noise(x) { return Math.sin(x * 0.0041) * 0.5 + Math.sin(x * 0.0113 + 1.3) * 0.3 + Math.sin(x * 0.0271 + 4) * 0.2; }
  function ridge(cam, par, yFrac, amp, col, freq, jag) {
    var ox = cam.x * par * cam.s;
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    var yb = H * yFrac - (cam.y * 0.05) * cam.s * par * 0.0;
    for (var sx = 0; sx <= W + 24; sx += 24) {
      var wx = (sx + ox) / (freq || 1);
      var y = yb - amp * (noise(wx) * 0.5 + 0.5) * H - (jag ? Math.abs(Math.sin(wx * 0.05)) * jag * H : 0);
      g.lineTo(sx, y);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  }

  function drawBackdrop(def, cam, t) {
    var c = def.c, th = def.theme;
    var gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, c.skyTop); gr.addColorStop(0.75, c.skyBot); gr.addColorStop(1, c.skyBot);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    var ox = cam.x * 0.02 * cam.s;

    if (th === 'arena') {
      for (var i = 0; i < 70; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.3 + hash(i) * 0.6) + ')'; g.fillRect(hash(i + 3) * W, hash(i + 9) * H * 0.5, 2, 2); }
      for (var b = 0; b < 5; b++) {
        var bx = ((b * 0.25 + 0.05) * W * 1.3 - ox * 3) % (W * 1.4);
        var beam = g.createLinearGradient(bx, 0, bx, H * 0.8);
        beam.addColorStop(0, 'rgba(255,255,255,0.35)'); beam.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = beam; g.beginPath();
        var sw = Math.sin(t * 0.8 + b) * 90;
        g.moveTo(bx - 8, 0); g.lineTo(bx + 8, 0); g.lineTo(bx + sw + 120, H * 0.8); g.lineTo(bx + sw - 120, H * 0.8); g.fill();
      }
    } else if (th === 'junk') {
      g.fillStyle = 'rgba(255,240,190,0.9)'; g.beginPath(); g.arc(W * 0.78 - ox * 0.4, H * 0.22, Math.min(W, H) * 0.09, 0, TAU); g.fill();
    } else if (th === 'city') {
      g.fillStyle = 'rgba(255,255,255,0.65)';
      for (var cl = 0; cl < 6; cl++) { var cx = ((cl * 330 + t * 8) - ox * 2) % (W + 300) - 100; g.beginPath(); g.ellipse(cx, 70 + (cl % 3) * 55, 90, 22, 0, 0, TAU); g.ellipse(cx + 50, 60 + (cl % 3) * 55, 60, 24, 0, 0, TAU); g.fill(); }
    } else if (th === 'mud') {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (var cm = 0; cm < 5; cm++) { var cmx = ((cm * 400 + t * 6) - ox * 2) % (W + 400) - 150; g.beginPath(); g.ellipse(cmx, 80 + (cm % 2) * 60, 140, 28, 0, 0, TAU); g.fill(); }
    } else if (th === 'snow') {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (var sn = 0; sn < 40; sn++) { g.fillRect((hash(sn) * W + t * 20 * (0.4 + hash(sn + 1)) - ox * 4) % W, (hash(sn + 7) * H + t * 40 * (0.5 + hash(sn + 2))) % H, 2.5, 2.5); }
    } else if (th === 'volcano') {
      var vx = W * 0.62 - ox * 1.5, vy = H * 0.75;
      g.fillStyle = '#1b0b0c'; g.beginPath(); g.moveTo(vx - W * 0.45, vy); g.lineTo(vx - W * 0.07, H * 0.28); g.lineTo(vx + W * 0.07, H * 0.28); g.lineTo(vx + W * 0.45, vy); g.fill();
      var glow = g.createRadialGradient(vx, H * 0.26, 4, vx, H * 0.26, H * 0.4);
      glow.addColorStop(0, 'rgba(255,200,60,0.9)'); glow.addColorStop(1, 'rgba(255,80,0,0)');
      g.fillStyle = glow; g.fillRect(vx - W, 0, W * 2, H);
      g.fillStyle = 'rgba(30,10,10,0.55)';
      for (var sm = 0; sm < 6; sm++) { g.beginPath(); g.arc(vx + Math.sin(t * 0.4 + sm) * 40 + sm * 22, H * 0.2 - sm * 28 - (t * 12 % 40), 40 + sm * 9, 0, TAU); g.fill(); }
      g.fillStyle = '#ffb020';
      for (var em = 0; em < 30; em++) g.fillRect(hash(em) * W, (hash(em + 4) * H - t * (30 + hash(em) * 40) + H * 2) % H, 2, 2);
    }

    // couches lointaines
    ridge(cam, 0.05, 0.58, 0.20, c.far, 1, th === 'snow' ? 0.1 : 0);
    if (th === 'snow') { g.fillStyle = 'rgba(255,255,255,0.55)'; ridgeCaps(cam, 0.05, 0.58, 0.20, 0.1); }
    if (th === 'city') skyline(cam, 0.09, c.mid);
    else if (th === 'junk') scrapPiles(cam, 0.1, c.mid);
    else if (th === 'arena') crowd(cam, 0.12, c.mid, t);
    else if (th === 'mud') trees(cam, 0.1, c.mid, '#2f5a38');
    else ridge(cam, 0.1, 0.66, 0.17, c.mid, 1, 0);
    ridge(cam, 0.24, 0.8, 0.07, shade(c.mid, 0.72), 1.6, 0);
  }
  function ridgeCaps(cam, par, yFrac, amp, jag) {
    var ox = cam.x * par * cam.s;
    for (var sx = 0; sx <= W; sx += 24) {
      var wx = (sx + ox);
      var y = H * yFrac - amp * (noise(wx) * 0.5 + 0.5) * H - Math.abs(Math.sin(wx * 0.05)) * jag * H;
      if (noise(wx) > 0.15) g.fillRect(sx, y, 24, 7);
    }
  }
  function skyline(cam, par, col) {
    var ox = cam.x * par * cam.s;
    for (var sx = -((ox % 70) + 70); sx < W + 70; sx += 70) {
      var idx = Math.floor((sx + ox) / 70), bh = (0.12 + hash(idx) * 0.3) * H;
      g.fillStyle = col; g.fillRect(sx, H * 0.7 - bh, 58, bh + H);
      g.fillStyle = 'rgba(255,230,150,0.55)';
      for (var wy = H * 0.7 - bh + 10; wy < H * 0.7 - 8; wy += 18) for (var wx = sx + 8; wx < sx + 50; wx += 14) if (hash(idx * 7 + wx + wy) > 0.55) g.fillRect(wx, wy, 6, 8);
    }
  }
  function scrapPiles(cam, par, col) {
    var ox = cam.x * par * cam.s;
    for (var sx = -((ox % 120) + 120); sx < W + 120; sx += 120) {
      var idx = Math.floor((sx + ox) / 120), bh = (0.08 + hash(idx) * 0.16) * H;
      g.fillStyle = col; g.beginPath(); g.moveTo(sx - 20, H); g.lineTo(sx, H * 0.7 - bh * 0.6); g.lineTo(sx + 40, H * 0.7 - bh); g.lineTo(sx + 90, H * 0.7 - bh * 0.5); g.lineTo(sx + 130, H); g.fill();
    }
    g.fillStyle = col; g.fillRect(0, H * 0.7, W, H);
  }
  function crowd(cam, par, col, t) {
    var ox = cam.x * par * cam.s;
    g.fillStyle = col; g.fillRect(0, H * 0.55, W, H);
    for (var row = 0; row < 4; row++) {
      for (var sx = -((ox % 18) + 18); sx < W + 18; sx += 18) {
        var idx = Math.floor((sx + ox) / 18) + row * 97;
        var y = H * (0.57 + row * 0.045) - Math.abs(Math.sin(t * 3 + idx)) * 4 * hash(idx);
        g.fillStyle = 'hsl(' + Math.floor(hash(idx) * 360) + ',60%,' + (35 + row * 5) + '%)';
        g.beginPath(); g.arc(sx + 9, y, 6, 0, TAU); g.fill();
        g.fillRect(sx + 3, y + 5, 12, 14);
      }
    }
  }
  function trees(cam, par, col, col2) {
    ridge(cam, par * 0.7, 0.66, 0.12, col, 1, 0);
    var ox = cam.x * par * cam.s;
    for (var sx = -((ox % 90) + 90); sx < W + 90; sx += 90) {
      var idx = Math.floor((sx + ox) / 90), hh = (0.07 + hash(idx) * 0.1) * H;
      g.fillStyle = col2; g.beginPath(); g.arc(sx + 30, H * 0.7 - hh, 34 + hash(idx + 5) * 20, 0, TAU); g.fill();
      g.fillStyle = '#3b2b1b'; g.fillRect(sx + 27, H * 0.7 - hh, 6, hh + H);
    }
    g.fillStyle = col; g.fillRect(0, H * 0.7, W, H);
  }

  // ---------------------------------------------------------------- rendu : monde
  var DB = 38, DF = 16;   // profondeur : voie arrière / bord avant de la piste
  function drawTerrain(def, T, vl, vr, vb) {
    var c = def.c;
    var i0 = Math.max(0, Math.floor(vl / STEP) - 1), i1 = Math.min(T.H.length - 1, Math.ceil(vr / STEP) + 1);
    var i, j, k;
    // lave / eau derrière
    for (var p = 0; p < T.pits.length; p++) {
      var pit = T.pits[p];
      if (pit.x1 < vl || pit.x0 > vr) continue;
      var ly = pit.rim + 330;
      var hz = g.createLinearGradient(0, ly, 0, ly + 400);
      hz.addColorStop(0, c.hazard2); hz.addColorStop(0.15, c.hazard); hz.addColorStop(1, '#000');
      g.fillStyle = hz;
      g.beginPath(); g.moveTo(pit.x0, ly + 4);
      for (var x = pit.x0; x <= pit.x1; x += 24) g.lineTo(x, ly + Math.sin(x * 0.03 + S.t * 3) * 6);
      g.lineTo(pit.x1, ly + 800); g.lineTo(pit.x0, ly + 800); g.fill();
    }
    // voie arrière (profondeur du décor)
    g.beginPath();
    for (i = i0; i <= i1; i++) g.lineTo(i * STEP, T.H[i] - DB);
    for (i = i1; i >= i0; i--) g.lineTo(i * STEP, T.H[i]);
    g.closePath();
    g.fillStyle = shade(c.edge, 0.68); g.fill();
    g.strokeStyle = shade(c.edge, 0.45); g.lineWidth = 4; g.lineJoin = 'round';
    g.beginPath();
    for (i = i0; i <= i1; i++) { if (i === i0) g.moveTo(i * STEP, T.H[i] - DB); else g.lineTo(i * STEP, T.H[i] - DB); }
    g.stroke();
    // reflet de la piste (là où roulent les véhicules)
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 10;
    g.beginPath();
    for (i = i0; i <= i1; i++) { if (i === i0) g.moveTo(i * STEP, T.H[i] - 6); else g.lineTo(i * STEP, T.H[i] - 6); }
    g.stroke();
    // face avant du terrain
    g.beginPath();
    g.moveTo(i0 * STEP, vb + 400);
    for (i = i0; i <= i1; i++) g.lineTo(i * STEP, T.H[i] + DF);
    g.lineTo(i1 * STEP, vb + 400); g.closePath();
    var gr = g.createLinearGradient(0, vb - 900, 0, vb + 400);
    gr.addColorStop(0, c.ground); gr.addColorStop(1, c.deep);
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (k = i0; k <= i1; k++) {
      if (hash(k * 1.7) > 0.7 && T.H[k] < 1000) { var r = 4 + hash(k) * 10; g.beginPath(); g.arc(k * STEP, T.H[k] + 50 + hash(k + 3) * 160, r, 0, TAU); g.fill(); }
    }
    g.restore();
    // bord avant clair + ombre sous le bord
    g.beginPath();
    for (i = i0; i <= i1; i++) g.lineTo(i * STEP, T.H[i]);
    for (i = i1; i >= i0; i--) g.lineTo(i * STEP, T.H[i] + DF);
    g.closePath(); g.fillStyle = c.edge; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 5;
    g.beginPath();
    for (j = i0; j <= i1; j++) { if (j === i0) g.moveTo(j * STEP, T.H[j] + DF + 2); else g.lineTo(j * STEP, T.H[j] + DF + 2); }
    g.stroke();
  }

  function inPit(x) { var ps = S.T.pits; for (var i = 0; i < ps.length; i++) if (x > ps[i].x0 - 30 && x < ps[i].x1 + 30) return true; return false; }
  function onCar(x) { var cs = S.T.cars; for (var i = 0; i < cs.length; i++) if (Math.abs(x - cs[i].x) < cs[i].w / 2 + 40) return true; return false; }

  // front = false : décor de la voie arrière ; front = true : décor devant la piste
  function drawProps(def, T, vl, vr, front) {
    var th = def.theme, step = 240;
    for (var i = Math.floor(vl / step); i <= Math.ceil(vr / step); i++) {
      var hv = hash(i * 3.3 + (front ? 977 : 0));
      if (hv < (front ? 0.78 : 0.35)) continue;
      var x = i * step + hv * 120;
      if (x < 120 || inPit(x) || onCar(x)) continue;
      var sl = Math.abs(T.base(x + 30) - T.base(x - 30));
      if (sl > 40) continue;
      var y = front ? T.base(x) + DF + 14 : T.base(x) - DB * 0.5;
      g.save(); g.translate(x, y);
      if (front) g.scale(1.3, 1.3); else g.scale(0.85, 0.85);
      var k = Math.floor(hv * 10) % 3;
      if (th === 'junk') {
        if (k === 0) { tire(0, -16, 26); tire(8, -48, 26); }
        else if (k === 1) { g.fillStyle = '#d9822b'; g.beginPath(); g.moveTo(-12, 0); g.lineTo(0, -44); g.lineTo(12, 0); g.fill(); g.fillStyle = '#fff'; g.fillRect(-7, -22, 14, 6); }
        else { g.fillStyle = '#5b4636'; g.fillRect(-40, -40, 80, 40); g.fillStyle = '#7a5b46'; g.fillRect(-30, -62, 50, 24); }
      } else if (th === 'mud') {
        g.strokeStyle = '#2f5a38'; g.lineWidth = 3;
        for (var r = -3; r <= 3; r++) { g.beginPath(); g.moveTo(r * 6, 0); g.quadraticCurveTo(r * 8, -30, r * 12, -60 - Math.abs(r) * 4); g.stroke(); }
        if (k === 0) { g.fillStyle = '#5a3a1e'; g.fillRect(34, -4, 8, 10); }
      } else if (th === 'city') {
        if (k === 0) { tire(0, -16, 26); tire(0, -46, 26); }
        else if (k === 1) { g.fillStyle = '#ffd21f'; g.fillRect(-4, -90, 8, 90); g.fillStyle = '#e63946'; g.fillRect(4, -90, 44, 28); }
        else { g.fillStyle = '#d9d9d9'; g.fillRect(-45, -30, 90, 30); g.fillStyle = '#e63946'; g.fillRect(-45, -30, 30, 30); g.fillRect(15, -30, 30, 30); }
      } else if (th === 'snow') {
        g.fillStyle = '#1f4a38'; g.beginPath(); g.moveTo(-26, 0); g.lineTo(0, -90); g.lineTo(26, 0); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-14, -48); g.lineTo(0, -90); g.lineTo(14, -48); g.fill();
      } else if (th === 'volcano') {
        g.fillStyle = '#2a1a1a'; g.beginPath(); g.moveTo(-34, 0); g.lineTo(-14, -48); g.lineTo(14, -36); g.lineTo(34, 0); g.fill();
        g.fillStyle = '#ff6a00'; g.fillRect(-6, -30, 12, 3);
      } else {
        if (k === 0) { g.fillStyle = '#ff2fd0'; g.fillRect(-3, -110, 6, 110); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(3, -110); g.lineTo(60, -95); g.lineTo(3, -78); g.fill(); }
        else { tire(0, -16, 26); tire(0, -46, 26); }
      }
      g.restore();
    }
  }
  function tire(x, y, r) {
    g.fillStyle = '#16181c'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = '#4b5563'; g.beginPath(); g.arc(x, y, r * 0.42, 0, TAU); g.fill();
  }

  function drawObstacle(o, T) {
    var gy = T.base(o.x);
    var col = LV.COLORS[o.seed % LV.COLORS.length];
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(o.x, gy + 8, o.w * 0.55, 9, 0, 0, TAU); g.fill();
    paint(true); paint(false);
    function paint(back) {
      var F = function (c) { return back ? shade(c, 0.5) : c; };
      g.save(); g.translate(o.x + (back ? -12 : 0), gy + (back ? -18 : 0));
      var sx = 1 + (1 - o.sq) * 0.18;
      g.scale(sx, o.sq);
      var w = o.w, k = o.k;
      var wheel = function (x) { g.fillStyle = F('#111'); g.beginPath(); g.arc(x, -15, 16, 0, TAU); g.fill(); g.fillStyle = F('#9aa4ae'); g.beginPath(); g.arc(x, -15, 7, 0, TAU); g.fill(); };
      var car = function (oy, c, ww) {
        var hw = ww / 2;
        g.fillStyle = F(c); g.beginPath(); g.moveTo(-hw, oy - 8); g.lineTo(-hw, oy - 26); g.lineTo(-hw * 0.55, oy - 30); g.lineTo(-hw * 0.3, oy - 48); g.lineTo(hw * 0.35, oy - 48); g.lineTo(hw * 0.62, oy - 30); g.lineTo(hw, oy - 26); g.lineTo(hw, oy - 8); g.closePath(); g.fill();
        g.fillStyle = F('#a9d3ee'); g.beginPath(); g.moveTo(-hw * 0.5, oy - 31); g.lineTo(-hw * 0.28, oy - 45); g.lineTo(hw * 0.32, oy - 45); g.lineTo(hw * 0.55, oy - 31); g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-hw, oy - 14, ww, 6);
        // toit : face supérieure (profondeur)
        if (!back) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(-hw * 0.3, oy - 48); g.lineTo(hw * 0.35, oy - 48); g.lineTo(hw * 0.35 - 6, oy - 54); g.lineTo(-hw * 0.3 - 6, oy - 54); g.fill(); }
      };
      if (k === 'car' || k === 'wreck') { car(0, k === 'wreck' ? '#7a4e2e' : col, w - 14); wheel(-w * 0.3); wheel(w * 0.3); }
      else if (k === 'limo') { car(0, '#15181d', w - 14); g.fillStyle = F('#a9d3ee'); g.fillRect(-w * 0.3, -44, w * 0.3, 14); wheel(-w * 0.34); wheel(w * 0.34); }
      else if (k === 'stack') { car(0, col, w - 14); wheel(-w * 0.3); wheel(w * 0.3); car(-46, LV.COLORS[(o.seed + 3) % LV.COLORS.length], w - 40); }
      else if (k === 'suv' || k === 'van' || k === 'truck') {
        var hh = o.h; g.fillStyle = F(col); g.fillRect(-w / 2 + 4, -hh, w - 8, hh - 8);
        g.fillStyle = F('#a9d3ee'); g.fillRect(-w / 2 + 14, -hh + 8, w - 28, Math.min(24, hh * 0.35));
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(-w / 2 + 4, -18, w - 8, 6);
        if (!back) { g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(-w / 2 + 4, -hh - 6, w - 8, 6); }
        wheel(-w * 0.3); wheel(w * 0.3);
      } else if (k === 'bus') {
        g.fillStyle = F('#ffc61a'); g.fillRect(-w / 2 + 4, -o.h, w - 8, o.h - 8);
        g.fillStyle = F('#222'); g.fillRect(-w / 2 + 4, -o.h * 0.42, w - 8, 4);
        g.fillStyle = F('#a9d3ee');
        for (var i = 0; i < 8; i++) g.fillRect(-w / 2 + 14 + i * ((w - 28) / 8), -o.h + 12, (w - 28) / 8 - 6, 26);
        if (!back) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(-w / 2 + 4, -o.h - 6, w - 8, 6); }
        wheel(-w * 0.32); wheel(w * 0.32);
      }
      if (o.crushed && !back) {
        g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(-w * 0.3, -o.h * 0.9); g.lineTo(w * 0.1, -4); g.moveTo(w * 0.3, -o.h * 0.8); g.lineTo(-w * 0.1, -6); g.stroke();
      }
      g.restore();
    }
  }

  function drawCoins(T, vl, vr, t) {
    var cs = T.coins;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c.got || c.x < vl - 40 || c.x > vr + 40) continue;
      var sc = Math.abs(Math.cos(t * 3 + i * 0.5));
      g.save(); g.translate(c.x, c.y + Math.sin(t * 4 + i) * 4);
      g.fillStyle = '#ffd21f'; g.strokeStyle = '#b45309'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 0, 18 * (0.25 + sc * 0.75), 18, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#b45309'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (sc > 0.5) g.fillText('V8', 0, 1);
      g.restore();
    }
  }

  function drawFlags(T, vl, vr, t) {
    for (var i = 0; i < T.checks.length; i++) {
      var c = T.checks[i]; if (c.x < vl - 80 || c.x > vr + 80) continue;
      var y = T.base(c.x);
      g.fillStyle = '#d1d5db'; g.fillRect(c.x - 3, y - 150, 6, 150);
      g.fillStyle = c.hit ? '#3ddc84' : '#2f8cff';
      g.beginPath(); g.moveTo(c.x + 3, y - 150); g.lineTo(c.x + 70, y - 135 + Math.sin(t * 6) * 4); g.lineTo(c.x + 3, y - 112); g.fill();
    }
    // départ
    var sx = T.startX - 160; if (sx > vl - 200 && sx < vr + 200) { var sy = T.base(sx); g.fillStyle = '#fff'; g.fillRect(sx, sy - 160, 8, 160); g.fillStyle = '#ffd21f'; g.fillRect(sx, sy - 160, 90, 36); g.fillStyle = '#111'; g.font = 'bold 22px Impact, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('START', sx + 10, sy - 142); }
    // arrivée
    var f = T.finish; if (f > vl - 200 && f < vr + 200) {
      var fy = T.base(f), top = fy - 260;
      g.fillStyle = '#d1d5db'; g.fillRect(f - 140, top, 14, 260); g.fillRect(f + 126, top, 14, 260);
      for (var cx = 0; cx < 14; cx++) for (var cy = 0; cy < 3; cy++) { g.fillStyle = (cx + cy) % 2 ? '#111' : '#fff'; g.fillRect(f - 140 + cx * 20, top + cy * 20, 20, 20); }
      g.fillStyle = '#ff3b30'; g.fillRect(f - 140, top + 60, 280, 30);
      g.fillStyle = '#fff'; g.font = 'bold 26px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINISH', f, top + 76);
    }
  }

  // ---------------------------------------------------------------- rendu : voiture
  function drawCar(gx, car, ci, boosting, t) {
    var col = CAR_COLORS[ci] || CAR_COLORS[0];
    gx.save(); gx.translate(car.x, car.y); gx.rotate(car.a);

    // roues du côté éloigné (profondeur 2.5D) : plus hautes, plus sombres
    for (var fw = 0; fw < 2; fw++) {
      var fl2 = fw === 0 ? -WB : WB, fc = car.wheels[fw].dist - WR;
      gx.save(); gx.translate(fl2 - 14, fc - 17); gx.scale(0.93, 0.93); gx.rotate(car.wheels[fw].spin * 0.97);
      gx.fillStyle = '#0c0d10'; gx.beginPath(); gx.arc(0, 0, WR, 0, TAU); gx.fill();
      gx.fillStyle = '#1d2027';
      for (var fl = 0; fl < 14; fl++) { gx.save(); gx.rotate(fl * TAU / 14); gx.fillRect(WR - 9, -5, 11, 10); gx.restore(); }
      gx.fillStyle = '#3b4250'; gx.beginPath(); gx.arc(0, 0, 17, 0, TAU); gx.fill();
      gx.restore();
    }

    // suspensions (ressorts)
    for (var i = 0; i < 2; i++) {
      var lx = i === 0 ? -WB : WB, wy = car.wheels[i].dist - WR;
      gx.strokeStyle = '#ffd21f'; gx.lineWidth = 6; gx.lineJoin = 'round';
      gx.beginPath(); gx.moveTo(lx, -14);
      var coils = 6, y0 = -14, y1 = wy;
      for (var c = 1; c <= coils; c++) gx.lineTo(lx + (c % 2 ? 11 : -11), y0 + (y1 - y0) * c / (coils + 1));
      gx.lineTo(lx, y1); gx.stroke();
      gx.strokeStyle = '#444'; gx.lineWidth = 8; gx.beginPath(); gx.moveTo(lx, -14); gx.lineTo(lx, y1); gx.globalAlpha = 0.5; gx.stroke(); gx.globalAlpha = 1;
    }

    // flammes du nitro
    if (boosting) {
      var fl = 40 + Math.random() * 40;
      var fg = gx.createLinearGradient(-112, 0, -112 - fl * 2, 0);
      fg.addColorStop(0, '#fff'); fg.addColorStop(0.3, '#ffb020'); fg.addColorStop(1, 'rgba(255,60,0,0)');
      gx.fillStyle = fg; gx.beginPath(); gx.moveTo(-112, -20); gx.lineTo(-112 - fl * 2, -14 + Math.random() * 8); gx.lineTo(-112, -4); gx.fill();
    }

    // carrosserie : coupé muscle car
    var body = new Path2D();
    body.moveTo(-106, -8); body.lineTo(-112, -24); body.quadraticCurveTo(-111, -38, -100, -41);
    body.lineTo(-64, -45); body.quadraticCurveTo(-48, -52, -37, -62); body.quadraticCurveTo(-30, -69, -18, -69);
    body.lineTo(14, -69); body.quadraticCurveTo(26, -68, 34, -61); body.lineTo(54, -47);
    body.lineTo(98, -43); body.quadraticCurveTo(111, -42, 114, -31); body.lineTo(115, -16); body.quadraticCurveTo(114, -8, 106, -8);
    body.closePath();
    var bg = gx.createLinearGradient(0, -70, 0, -6);
    bg.addColorStop(0, col.a); bg.addColorStop(0.55, col.a); bg.addColorStop(1, col.b);
    // épaisseur de la carrosserie (extrusion vers le fond)
    for (var ex = 7; ex >= 1; ex--) {
      gx.save(); gx.translate(-ex * 1.0, -ex * 1.35);
      gx.fillStyle = ex > 4 ? shade(col.b, 0.55) : shade(col.b, 0.8);
      gx.fill(body); gx.restore();
    }
    gx.fillStyle = bg; gx.fill(body);
    gx.lineWidth = 3; gx.strokeStyle = 'rgba(0,0,0,0.55)'; gx.stroke(body);
    // reflet
    gx.fillStyle = 'rgba(255,255,255,0.28)'; gx.beginPath(); gx.moveTo(-96, -39); gx.lineTo(-60, -43); gx.lineTo(96, -42); gx.lineTo(96, -38); gx.lineTo(-96, -36); gx.fill();
    // bande de course
    gx.fillStyle = 'rgba(255,255,255,0.85)'; gx.fillRect(-104, -22, 214, 5);
    // vitres
    gx.fillStyle = '#16222e'; gx.beginPath(); gx.moveTo(-56, -47); gx.lineTo(-33, -62); gx.lineTo(-18, -65); gx.lineTo(13, -65); gx.lineTo(25, -61); gx.lineTo(44, -47); gx.closePath(); gx.fill();
    gx.fillStyle = 'rgba(120,180,230,0.35)'; gx.beginPath(); gx.moveTo(-30, -61); gx.lineTo(-18, -64); gx.lineTo(-4, -64); gx.lineTo(-24, -48); gx.lineTo(-40, -48); gx.fill();
    gx.fillStyle = col.b; gx.fillRect(-6, -66, 5, 20);
    gx.fillStyle = '#0a0f14'; gx.beginPath(); gx.arc(-22, -54, 6, 0, TAU); gx.fill(); gx.fillRect(-28, -49, 13, 4);
    // blower V8 sur le capot
    gx.fillStyle = '#9aa4ae'; gx.beginPath(); gx.moveTo(62, -45); gx.lineTo(66, -60); gx.lineTo(90, -60); gx.lineTo(94, -45); gx.fill();
    gx.fillStyle = '#e5e7eb'; gx.fillRect(66, -63, 24, 5);
    gx.fillStyle = '#111'; gx.fillRect(70, -59, 16, 4);
    gx.strokeStyle = '#555'; gx.lineWidth = 2; gx.beginPath(); for (var s = 0; s < 4; s++) { gx.moveTo(69 + s * 6, -58); gx.lineTo(69 + s * 6, -46); } gx.stroke();
    // phares / feux
    gx.fillStyle = '#fff6b0'; gx.beginPath(); gx.arc(109, -31, 6, 0, TAU); gx.fill();
    gx.fillStyle = '#ff2d2d'; gx.fillRect(-113, -35, 5, 10);
    // pare-chocs chromés
    gx.fillStyle = '#e5e7eb'; gx.fillRect(111, -24, 8, 14); gx.fillRect(-117, -22, 7, 12);
    // échappements latéraux
    gx.fillStyle = '#cbd5e1'; gx.fillRect(-46, -13, 54, 5);
    // numéro
    gx.fillStyle = '#111'; gx.beginPath(); gx.arc(-12, -31, 11, 0, TAU); gx.fill();
    gx.fillStyle = '#fff'; gx.font = 'bold 12px Impact, sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.fillText('V8', -12, -30);

    // roues monstres
    for (var w = 0; w < 2; w++) {
      var wl = w === 0 ? -WB : WB, wc = car.wheels[w].dist - WR;
      gx.save(); gx.translate(wl, wc); gx.rotate(car.wheels[w].spin);
      gx.fillStyle = '#121418'; gx.beginPath(); gx.arc(0, 0, WR, 0, TAU); gx.fill();
      gx.fillStyle = '#272b33';
      for (var l = 0; l < 14; l++) { gx.save(); gx.rotate(l * TAU / 14); gx.fillRect(WR - 9, -5, 11, 10); gx.restore(); }
      gx.fillStyle = '#2d323b'; gx.beginPath(); gx.arc(0, 0, WR - 10, 0, TAU); gx.fill();
      var rg = gx.createRadialGradient(-4, -4, 2, 0, 0, 18);
      rg.addColorStop(0, '#f1f5f9'); rg.addColorStop(1, '#8b95a3');
      gx.fillStyle = rg; gx.beginPath(); gx.arc(0, 0, 18, 0, TAU); gx.fill();
      gx.strokeStyle = '#475569'; gx.lineWidth = 3;
      for (var sp = 0; sp < 5; sp++) { gx.beginPath(); gx.moveTo(0, 0); gx.lineTo(Math.cos(sp * TAU / 5) * 17, Math.sin(sp * TAU / 5) * 17); gx.stroke(); }
      gx.fillStyle = '#ffd21f'; gx.beginPath(); gx.arc(0, 0, 5, 0, TAU); gx.fill();
      gx.restore();
    }
    gx.restore();
  }

  function drawWorld(t) {
    var cam = S.cam, s = cam.s, T = S.T, def = S.def;
    drawBackdrop(def, cam, t);
    var ax = W * 0.36, ay = H * 0.62;
    var sx = (Math.random() - 0.5) * S.shake, sy = (Math.random() - 0.5) * S.shake;
    g.save();
    g.translate(ax + sx, ay + sy); g.scale(s, s); g.translate(-cam.x, -cam.y);
    var vl = cam.x - ax / s - 60, vr = cam.x + (W - ax) / s + 60, vb = cam.y + (H - ay) / s;
    drawTerrain(def, T, vl, vr, vb);
    drawProps(def, T, vl, vr, false);
    drawFlags(T, vl, vr, t);
    for (var i = 0; i < T.cars.length; i++) { var o = T.cars[i]; if (o.x + o.w > vl && o.x - o.w < vr) drawObstacle(o, T); }
    drawCoins(T, vl, vr, t);
    drawParts(false);
    // ombre portée sur la piste
    var cgh = getH(S.car.x), calt = Math.max(0, cgh - S.car.y);
    g.save(); g.translate(S.car.x, cgh + 12); g.rotate(Math.atan2(getH(S.car.x + 30) - getH(S.car.x - 30), 60));
    g.globalAlpha = clamp(0.38 - calt / 900, 0.06, 0.38); g.fillStyle = '#000';
    g.beginPath(); g.ellipse(0, 0, 130, 14, 0, 0, TAU); g.fill(); g.restore();
    drawCar(g, S.car, save.color, S.car.boosting, t);
    drawProps(def, T, vl, vr, true);
    drawParts(true);
    g.restore();
    drawForeground(def, cam);
    drawHud(t);
  }
  // premier plan flou qui défile plus vite que le décor (effet de profondeur)
  function drawForeground(def, cam) {
    var ox = cam.x * 1.45 * cam.s, c = def.c;
    g.fillStyle = shade(c.deep, 0.5); g.globalAlpha = 0.92;
    for (var sx = -((ox % 190) + 190); sx < W + 190; sx += 190) {
      var idx = Math.floor((sx + ox) / 190);
      if (hash(idx * 5.1) < 0.5) continue;
      var hh = (0.035 + hash(idx) * 0.06) * H, w = 70 + hash(idx + 2) * 90;
      g.beginPath(); g.moveTo(sx, H + 4);
      g.quadraticCurveTo(sx + w * 0.15, H - hh * 1.2, sx + w * 0.45, H - hh);
      g.quadraticCurveTo(sx + w * 0.85, H - hh * 0.5, sx + w, H + 4); g.fill();
      if (def.theme === 'mud' || def.theme === 'snow') {
        g.strokeStyle = shade(c.deep, 0.5); g.lineWidth = 3;
        for (var b = 0; b < 5; b++) { g.beginPath(); g.moveTo(sx + w * (0.2 + b * 0.12), H - hh * 0.8); g.lineTo(sx + w * (0.15 + b * 0.14), H - hh * 1.5 - hash(idx + b) * 20); g.stroke(); }
      }
    }
    g.globalAlpha = 1;
    // vignettage
    var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  function drawParts(add) {
    var p = S.parts;
    for (var i = 0; i < p.length; i++) {
      var q = p[i]; if (q.add !== add) continue;
      var k = 1 - q.t / q.life;
      g.globalAlpha = Math.max(0, Math.min(1, k * (q.add ? 1 : 0.9)));
      g.fillStyle = q.col;
      if (add) g.globalCompositeOperation = 'lighter';
      var sz = q.size * (q.add ? k : (1.4 - k * 0.4));
      g.beginPath(); g.arc(q.x, q.y, Math.max(0.5, sz), 0, TAU); g.fill();
      if (add) g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- HUD
  function txt(str, x, y, size, col, align, stroke) {
    g.font = '900 ' + size + 'px Impact, "Arial Black", sans-serif';
    g.textAlign = align || 'left'; g.textBaseline = 'middle';
    g.lineWidth = Math.max(3, size / 6); g.strokeStyle = stroke || 'rgba(0,0,0,0.7)'; g.lineJoin = 'round';
    g.strokeText(str, x, y); g.fillStyle = col || '#fff'; g.fillText(str, x, y);
  }
  function drawHud(t) {
    var car = S.car, cam = S.cam, m = Math.max(10, Math.min(W, H) * 0.02), u = Math.max(0.7, Math.min(1.25, Math.min(W, H) / 700));
    // popups (coordonnées monde → écran)
    for (var i = 0; i < S.pops.length; i++) {
      var p = S.pops[i], px = (p.x - cam.x) * cam.s + W * 0.36, py = (p.y - cam.y) * cam.s + H * 0.62;
      g.globalAlpha = Math.max(0, 1 - p.t / p.life);
      txt(p.txt, px, py, 26 * u * p.size, p.col, 'center');
    }
    g.globalAlpha = 1;
    // score
    txt(String(S.score), m, m + 22 * u, 46 * u, '#fff');
    if (S.combo > 1) {
      txt('COMBO x' + mult().toFixed(1), m, m + 62 * u, 24 * u, '#ffd21f');
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(m, m + 80 * u, 150 * u, 8 * u);
      g.fillStyle = '#ffd21f'; g.fillRect(m, m + 80 * u, 150 * u * clamp(S.comboT / 4, 0, 1), 8 * u);
    }
    // nitro
    var ny = m + (S.combo > 1 ? 110 : 80) * u, nw = 190 * u, nh = 16 * u;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(m, ny, nw, nh);
    var ng = g.createLinearGradient(m, 0, m + nw, 0); ng.addColorStop(0, '#ff8a1f'); ng.addColorStop(1, '#ffe23a');
    g.fillStyle = car.nitro < 15 ? '#ff3b30' : ng; g.fillRect(m, ny, nw * car.nitro / 100, nh);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(m, ny, nw, nh);
    txt('NITRO', m + nw + 8, ny + nh / 2, 15 * u, '#ffd21f');
    // progression
    var pw = Math.min(W * 0.34, 420), px0 = W / 2 - pw / 2, py0 = m + 14 * u;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(px0, py0, pw, 10 * u);
    g.fillStyle = '#3ddc84'; g.fillRect(px0, py0, pw * clamp(car.x / S.T.finish, 0, 1), 10 * u);
    g.fillStyle = '#fff'; g.fillRect(px0 + pw * clamp(car.x / S.T.finish, 0, 1) - 3, py0 - 4 * u, 6, 18 * u);
    txt(S.def.name, W / 2, py0 + 34 * u, 18 * u, '#fff', 'center');
    // vitesse
    var kmh = Math.round(Math.hypot(car.vx, car.vy) * 0.12);
    var sy0 = Math.max(78, 22 * u + m + 50);
    txt(kmh + ' km/h', W - m, sy0, 26 * u, '#fff', 'right');
    // temps
    txt(S.t.toFixed(1) + ' s', W - m, sy0 + 30 * u, 20 * u, '#cbd5e1', 'right');
    // bannière
    if (S.banner) {
      var b = S.banner, k = Math.min(1, b.t * 6), a = b.t > 1.2 ? 1 - (b.t - 1.2) / 0.4 : 1;
      g.globalAlpha = Math.max(0, a);
      txt(b.txt, W / 2, H * 0.27, (54 + 14 * (1 - k)) * u, b.col, 'center');
      g.globalAlpha = 1;
    }
    // en l'air
    if (S.air.active && S.air.t > 0.5) {
      var fl = Math.floor(Math.abs(S.air.rot) / (TAU * 0.86));
      txt('AIR ' + S.air.t.toFixed(1) + 's' + (fl ? '  ·  ' + fl + ' FLIP' + (fl > 1 ? 'S' : '') : ''), W / 2, H * 0.36, 28 * u, '#ff8a1f', 'center');
    }
    if (S.hint > 0 && !isTouch) {
      g.globalAlpha = Math.min(1, S.hint);
      txt('↑ gaz   ↓ frein/marche arrière   ← → rotation en l\'air   ESPACE nitro   R reset', W / 2, H - 28 * u, 18 * u, '#fff', 'center');
      g.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- menu (décor animé)
  function drawMenuScene(t) {
    var def = LV.levels[Math.min(menuLevelTheme, LV.levels.length - 1)];
    var cam = { x: t * 300, y: 0, s: H / 860 };
    drawBackdrop(def, cam, t);
    var portrait = W < H;
    var sc = portrait ? W / 620 : Math.min(W, H) / 520 * 1.15;
    var gy = H * (portrait ? 0.92 : 0.84);
    var carX = W * (portrait ? 0.5 : 0.72);
    g.fillStyle = shade(def.c.edge, 0.68); g.fillRect(0, gy - 40 * sc, W, 40 * sc);
    g.fillStyle = def.c.ground; g.fillRect(0, gy, W, H - gy);
    g.fillStyle = def.c.edge; g.fillRect(0, gy, W, 14 * sc);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(carX, gy + 4, 135 * sc, 12 * sc, 0, 0, TAU); g.fill();
    var car = { x: 0, y: 0, a: -0.04 + Math.sin(t * 2) * 0.012, wheels: [{ dist: R - 18 + Math.sin(t * 2.3) * 3, spin: t * 6 }, { dist: R - 18 + Math.cos(t * 2.1) * 3, spin: t * 6 }] };
    g.save(); g.translate(carX, gy - (R - 18 - WR + WR) * sc + 6 * sc); g.scale(sc, sc);
    drawCar(g, car, save.color, false, t);
    g.restore();
  }
  var menuLevelTheme = 5;

  // ---------------------------------------------------------------- boucle
  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;
    if (state === 'play') {
      if (rawDt > 0.03) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 90 && DPR_CAP > 1) { DPR_CAP = Math.max(1, DPR_CAP - 0.5); slowFrames = 0; resize(); }
    }
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    if (state === 'play') { update(dt); drawWorld(performance.now() / 1000); }
    else if ((state === 'pause' || state === 'result') && S) { drawWorld(performance.now() / 1000); }
    else { menuT += dt; drawMenuScene(menuT); }
  }

  // ---------------------------------------------------------------- interface (DOM)
  var UI = {
    show: function (id) {
      var all = document.querySelectorAll('.screen');
      for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i].id === id);
    },
    hud: function (on) {
      document.getElementById('pausebtn').classList.toggle('hidden', !on);
      document.getElementById('touch').classList.toggle('hidden', !(on && isTouch));
    document.getElementById('btn-full').classList.toggle('lowered', on);
    }
  };
  var isTouch = !!((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints > 0));
  window.addEventListener('touchstart', function () { isTouch = true; if (state === 'play') UI.hud(true); }, { passive: true, once: true });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function toggleFS() {
    var d = document.documentElement;
    if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    var f = d.requestFullscreen || d.webkitRequestFullscreen;
    if (f) {
      var pr = f.call(d);
      var lock = function () { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) { /* ok */ } };
      if (pr && pr.then) pr.then(lock, function () {}); else lock();
    }
  }
  if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) document.getElementById('btn-full').classList.add('hidden');

  function pause() { if (state !== 'play') return; state = 'pause'; SND.silence(); UI.show('screen-pause'); }
  function resume() { if (state !== 'pause') return; state = 'play'; last = performance.now(); UI.show(null); }
  function toMenu() { state = 'menu'; S = null; SND.silence(); UI.hud(false); UI.show('screen-menu'); }

  function stars(n) { var s = ''; for (var i = 0; i < 3; i++) s += i < n ? '★' : '☆'; return s; }

  function buildLevelGrid() {
    var grid = document.getElementById('level-grid'); grid.innerHTML = '';
    LV.levels.forEach(function (lv, i) {
      var locked = i + 1 > save.unlocked;
      var d = document.createElement('button');
      d.className = 'lvl' + (locked ? ' locked' : '');
      d.style.setProperty('--sky1', lv.c.skyTop); d.style.setProperty('--sky2', lv.c.skyBot);
      d.innerHTML = '<span class="n">' + lv.id + '</span><span class="t">' + lv.name + '</span><span class="s">' + lv.sub + '</span>' +
        '<span class="st">' + (locked ? '🔒' : stars(save.stars[lv.id] || 0)) + '</span>' +
        (save.best[lv.id] ? '<span class="b">Record ' + save.best[lv.id] + '</span>' : '');
      if (!locked) d.addEventListener('click', function () { SND.init(); SND.click(); startLevel(i); });
      grid.appendChild(d);
    });
    var sw = document.getElementById('swatches'); sw.innerHTML = '';
    CAR_COLORS.forEach(function (c, i) {
      var b = document.createElement('button'); b.className = 'sw' + (i === save.color ? ' sel' : ''); b.title = c.n;
      b.style.background = 'linear-gradient(135deg,' + c.a + ',' + c.b + ')';
      b.addEventListener('click', function () { save.color = i; persist(); buildLevelGrid(); });
      sw.appendChild(b);
    });
  }

  function showResult() {
    state = 'result'; SND.silence(); UI.hud(false);
    var id = S.def.id, prev = save.stars[id] || 0;
    save.stars[id] = Math.max(prev, S.starsEarned);
    save.best[id] = Math.max(save.best[id] || 0, S.score);
    if (id + 1 > save.unlocked && id < LV.levels.length) save.unlocked = id + 1;
    persist();
    var last = S.idx >= LV.levels.length - 1;
    document.getElementById('res-title').textContent = last ? 'CHAMPION DU MONSTER V8 !' : 'NIVEAU TERMINÉ';
    document.getElementById('res-stars').textContent = stars(S.starsEarned);
    document.getElementById('res-score').textContent = S.score;
    document.getElementById('res-goal').textContent = '★★ ' + S.def.stars[0] + '   ·   ★★★ ' + S.def.stars[1];
    document.getElementById('res-stats').innerHTML =
      '<li><b>' + S.t.toFixed(1) + ' s</b> temps (bonus +' + S.timeBonus + ')</li>' +
      '<li><b>' + S.stats.crushed + '</b> véhicules écrasés</li>' +
      '<li><b>' + S.stats.flips + '</b> flips · plus long saut <b>' + S.stats.bestAir.toFixed(1) + ' s</b></li>' +
      '<li><b>' + S.stats.coins + '</b> pièces V8</li>';
    document.getElementById('btn-next').style.display = last ? 'none' : '';
    UI.show('screen-result');
  }

  function bind(id, fn) { document.getElementById(id).addEventListener('click', function () { SND.init(); SND.click(); fn(); }); }
  bind('btn-play', function () { buildLevelGrid(); UI.show('screen-levels'); });
  bind('btn-help', function () { UI.show('screen-help'); });
  bind('btn-help-back', function () { UI.show('screen-menu'); });
  bind('btn-levels-back', function () { UI.show('screen-menu'); });
  bind('btn-resume', resume);
  bind('btn-restart', function () { startLevel(S.idx); });
  bind('btn-quit', function () { toMenu(); buildLevelGrid(); UI.show('screen-levels'); });
  bind('btn-retry', function () { startLevel(S.idx); });
  bind('btn-next', function () { startLevel(Math.min(S.idx + 1, LV.levels.length - 1)); });
  bind('btn-res-menu', function () { toMenu(); buildLevelGrid(); UI.show('screen-levels'); });
  bind('pausebtn', pause);
  bind('btn-mute', toggleMute);
  bind('btn-full', toggleFS);
  document.getElementById('btn-mute').textContent = save.muted ? '🔇' : '🔊';

  // contrôles tactiles
  var tb = document.querySelectorAll('#touch button');
  Array.prototype.forEach.call(tb, function (b) {
    var k = b.getAttribute('data-k');
    function on(e) { e.preventDefault(); touch[k] = true; b.classList.add('down'); SND.init(); }
    function off(e) { e.preventDefault(); touch[k] = false; b.classList.remove('down'); }
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  UI.show('screen-menu'); UI.hud(false);
  requestAnimationFrame(frame);

  // accès pour les tests automatisés
  window.MV8_DEBUG = {
    start: function (i) { startLevel(i); },
    state: function () { return S; },
    sim: function (sec, fn) {
      var n = Math.round(sec * 60);
      for (var i = 0; i < n; i++) { if (fn) override = fn(S, i / 60); update(1 / 60); if (state !== 'play') break; }
      override = null;
    },
    mode: function () { return state; }
  };
})();
