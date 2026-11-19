/* MONSTER V8 — moteur : physique arcade multi-véhicules, rendu 2.5D vaporwave, HUD, menus */
(function () {
  'use strict';
  var LV = window.MV8_LEVELS, SND = window.MV8_SND, VX = window.MV8_VEH;
  var VEH = VX.VEH, shade = VX.shade;
  var STEP = LV.STEP, TAU = Math.PI * 2;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
  var FONT = '"Orbitron", Impact, "Arial Black", sans-serif';

  // ---------------------------------------------------------------- physique (paramètres du véhicule courant)
  var G = 1250;
  var V = VEH.monster, R, WR, WB, K, C, KH, MAXC, INV_I, P_DRIVE, BRAKE, VMAX, RMAX, MU, BOOST, DQ, WHEELIE, AIR_ROT, WMAX, BODY_PTS, ROOF;
  function setVehicle(key) {
    V = VEH[key] || VEH.monster;
    R = V.R; WR = V.WR; WB = V.WB; K = V.K; C = V.C; KH = V.KH; MAXC = R - WR - 8; INV_I = V.INV_I;
    P_DRIVE = V.P; BRAKE = V.BRAKE; VMAX = V.VMAX; RMAX = V.RMAX; MU = V.MU; BOOST = V.BOOST; DQ = V.DQ;
    WHEELIE = V.WHEELIE; AIR_ROT = V.AIR_ROT; WMAX = V.WMAX; BODY_PTS = V.pts; ROOF = V.roof;
  }
  setVehicle('monster');

  var CAR_COLORS = [
    { n: 'Rose néon', a: '#ff4fae', b: '#a3125f' },
    { n: 'Cyan', a: '#19e6ff', b: '#0b5d9c' },
    { n: 'Soleil', a: '#ffd23f', b: '#c2410c' },
    { n: 'Violet', a: '#a78bfa', b: '#4c1d95' },
    { n: 'Menthe', a: '#6dffcf', b: '#0f766e' },
    { n: 'Blanc', a: '#f8fafc', b: '#94a3b8' }
  ];

  // ---------------------------------------------------------------- canvas / état global
  var cv = document.getElementById('c'), g = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1, DPR_CAP = 2, slowFrames = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  window.addEventListener('resize', resize); resize();

  var SAVE_KEY = 'monsterv8.save.v2';
  var save = { unlocked: 1, stars: {}, best: {}, color: 0, muted: false };
  try { var raw = localStorage.getItem(SAVE_KEY); if (raw) Object.assign(save, JSON.parse(raw)); } catch (e) { /* ok */ }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ok */ } }
  SND.setMuted(!!save.muted);

  var state = 'menu';       // menu | play | pause | result | defeat
  var S = null;
  var menuT = 0, curWorld = 0, fails = {};

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
    else if (e.code === 'KeyR' && (state === 'play' || state === 'defeat')) startLevel(S.idx);
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
  function onPad(x) { var p = S.T.pads; for (var i = 0; i < p.length; i++) if (x > p[i].x0 && x < p[i].x1) return true; return false; }

  // ---------------------------------------------------------------- véhicule
  function newCar(x, y) {
    return {
      vk: V.key, x: x, y: y, a: 0, vx: 0, vy: 0, w: 0, nitro: 100, rpm: 1000, boosting: false,
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
      if (f < 0) f = 0; else if (f > 4500) f = 4500;
      if (!wh.gr && vn < -380 && -vn > car.impact) car.impact = -vn;
      if (!wh.gr) wh.gr = true;
      grounded++;
      ax += nx * f; ay += ny * f;
      aw += (rx * ny * f - ry * nx * f) * INV_I;

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
      if (onPad(cx) && !S.finished) ft += 1700 * clamp(1 - vt / 2600, 0, 1);     // pad de boost
      var lim = MU * f + 120;
      ft = clamp(ft, -lim, lim);
      ax += tx * ft; ay += ty * ft;
      aw += (rx * ty * ft - ry * tx * ft) * INV_I;
      wh.spin += (vt / WR) * h;

      if (!S.finished) crushAt(cx);
    }

    car.bodyHit = false; car.roofHit = false;
    for (var k = 0; k < BODY_PTS.length; k++) {
      var bp = BODY_PTS[k];
      var wx = car.x + bp[0] * ca - bp[1] * sa, wy = car.y + bp[0] * sa + bp[1] * ca;
      // la carrosserie écrase les obstacles au lieu de les percuter : seul le vrai terrain la bloque
      if (!S.finished && wy > getH(wx)) crushAt(wx);
      var pen = wy - S.T.base(wx);
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
      }
    }

    car.grounded = grounded;
    car.gspeed = grounded ? gsum / grounded : car.gspeed;
    // assistance aux bords : une seule roue au sol → on compense la bascule due à la gravité
    if (grounded === 1) {
      var dyb = S.T.base(car.x + WB) - S.T.base(car.x - WB);
      var gs1 = Math.abs(dyb) < 1.2 * WB ? Math.atan2(dyb, 2 * WB) : 0;       // bord / falaise : on vise l'horizontale
      var e1 = clamp(Math.atan2(Math.sin(car.a - gs1), Math.cos(car.a - gs1)), -0.9, 0.9);
      aw += -e1 * 22 - car.w * 2.5;
    }

    var rot = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (grounded) {
      if (drive > 0) aw -= WHEELIE;
      aw += rot * 3.2 * (V.key === 'truck' ? 0.5 : 1);
    }

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
      else {
        car.w *= Math.exp(-1.1 * h);
        // redressement automatique doux (désactivé pendant un flip volontaire)
        var gsl = Math.atan2(getH(car.x + 60) - getH(car.x - 60), 120);
        var e = Math.atan2(Math.sin(car.a - gsl), Math.cos(car.a - gsl));
        if (Math.abs(e) < 1.3) car.w -= e * 4.0 * h;
      }
    } else {
      car.w *= Math.exp(-2.2 * h);
    }
    car.w = clamp(car.w, -WMAX, WMAX);
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
  function banner(txt, col) { S.banner = { txt: txt, t: 0, col: col || '#ffe14d' }; }
  function crush(o) {
    o.crushed = true; S.stats.crushed++;
    var big = o.h > 80;
    addScore(big ? 200 : o.h < 46 ? 60 : 100, 'CRUSH', o.x, S.T.base(o.x) - o.h - 20, '#ffe14d');
    S.car.nitro = Math.min(100, S.car.nitro + 6);
    S.shake = Math.max(S.shake, big ? 16 : 9);
    var gy = S.T.base(o.x);
    for (var i = 0; i < 18; i++) spawn(o.x + rnd(-o.w / 2, o.w / 2), gy - rnd(5, o.h), rnd(-260, 260), rnd(-520, -80), rnd(0.5, 1), rnd(3, 7), i % 3 ? '#d6e4ff' : '#ff9a3c', 1);
    SND.crush();
  }

  // ---------------------------------------------------------------- particules
  function spawn(x, y, vx, vy, life, size, col, grav, add) {
    if (S.parts.length > 600) S.parts.shift();
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
  function startLevel(i) {
    var def = LV.levels[i], T = LV.build(i);
    setVehicle(def.veh);
    var sx = T.startX;
    S = {
      idx: i, def: def, T: T, car: newCar(sx, T.base(sx) - 80),
      parts: [], pops: [], banner: null, t: 0, score: 0, combo: 0, comboT: 0, shake: 0,
      finished: false, finishT: 0, done: false, dead: false, deadT: 0, flash: 0, pieces: [], ring: null, reason: '',
      air: { t: 0, rot: 0, pending: null, prevA: 0, active: false },
      wheelie: 0, upsideT: 0, grace: 0.9, stats: { crushed: 0, coins: 0, flips: 0, bestAir: 0 },
      cam: { x: sx + 200, y: T.base(sx) - 100, s: camBase() }, dustT: 0, smokeT: 0, hint: 4
    };
    state = 'play';
    SND.silence();
    UI.show(null);
    UI.hud(true);
  }

  function explode(reason) {
    if (!S || S.dead || S.finished) return;
    var car = S.car, ca = Math.cos(car.a), sa = Math.sin(car.a), col = save.color === 0 ? V.paint : (CAR_COLORS[save.color - 1] || V.paint);
    S.dead = true; S.deadT = 0; S.reason = reason; S.flash = 1; S.shake = 36;
    banner('BOOM !', '#ff2e97');
    for (var w = 0; w < 2; w++) {
      var lx = w ? WB : -WB, wy = car.wheels[w].dist - WR;
      S.pieces.push({ t: 'wheel', x: car.x + lx * ca - wy * sa, y: car.y + lx * sa + wy * ca, vx: car.vx * 0.5 + rnd(-380, 380), vy: car.vy * 0.4 - rnd(380, 820), a: 0, w: rnd(-14, 14), r: WR });
    }
    if (V.key === 'truck') S.pieces.push({ t: 'wheel', x: car.x - (WB + 62) * ca, y: car.y - (WB + 62) * sa + (car.wheels[0].dist - WR), vx: rnd(-400, 400), vy: -rnd(300, 700), a: 0, w: rnd(-12, 12), r: WR });
    var n = V.key === 'truck' ? 11 : 8;
    for (var k = 0; k < n; k++) {
      var sz = rnd(16, 44), lx2 = rnd(-WB, WB), ly2 = rnd(-70, -10);
      S.pieces.push({
        t: 'shard', x: car.x + lx2 * ca - ly2 * sa, y: car.y + lx2 * sa + ly2 * ca,
        vx: car.vx * 0.4 + rnd(-520, 520), vy: car.vy * 0.3 - rnd(200, 900), a: rnd(0, TAU), w: rnd(-12, 12), s: sz,
        col: k % 3 === 0 ? col.b : k % 3 === 1 ? col.a : '#1b1038', n: 3 + (k % 2)
      });
    }
    for (var f = 0; f < 90; f++) {
      var an = rnd(0, TAU), sp = rnd(80, 900);
      spawn(car.x + rnd(-40, 40), car.y + rnd(-60, 0), Math.cos(an) * sp, Math.sin(an) * sp - 160, rnd(0.4, 1.3), rnd(10, 34), f % 3 === 0 ? '#fff' : f % 3 === 1 ? '#ffe14d' : '#ff5a2e', 0.1, true);
    }
    for (var s2 = 0; s2 < 36; s2++) spawn(car.x + rnd(-60, 60), car.y + rnd(-80, 0), rnd(-200, 200), rnd(-420, -40), rnd(0.9, 2.1), rnd(14, 38), 'rgba(40,26,60,0.55)', -0.08);
    S.ring = { x: car.x, y: car.y - 30, t: 0 };
    car.boosting = false;
    SND.boom();
    SND.silence();
  }

  function finishLevel() {
    S.finished = true; S.finishT = 0;
    var def = S.def;
    var bonus = Math.max(0, Math.round((def.par - S.t) * 25));
    S.timeBonus = bonus; S.score += bonus;
    S.starsEarned = S.score >= def.stars[1] ? 3 : S.score >= def.stars[0] ? 2 : 1;
    banner('ARRIVÉE !', '#7dffd4');
    SND.fanfare();
    S.shake = 10;
    for (var i = 0; i < 80; i++) spawn(S.car.x + rnd(-300, 300), S.car.y - rnd(100, 500), rnd(-200, 200), rnd(-100, 300), rnd(1, 2), rnd(4, 8), ['#ff2e97', '#ffe14d', '#00e5ff', '#7dffd4', '#fff'][i % 5], 0.2);
  }

  // ---------------------------------------------------------------- mise à jour
  function update(dt) {
    var inp = readInput();
    if (S.finished) inp = { gas: false, brake: true, left: false, right: false, boost: false };
    if (S.dead) inp = { gas: false, brake: false, left: false, right: false, boost: false };
    var timeScale = S.finished ? clamp(1 - S.finishT * 0.3, 0.45, 1) : S.dead ? (S.deadT < 0.8 ? 0.45 : 1) : 1;
    dt *= timeScale;
    if (!S.finished && !S.dead) S.t += dt;
    S.grace = Math.max(0, S.grace - dt);
    var car = S.car, T = S.T;

    if (!S.dead) {
      var steps = Math.max(1, Math.ceil(dt / (1 / 180))), h = dt / steps;
      car.impact = 0;
      for (var i = 0; i < steps; i++) physStep(h, inp);
      car = S.car;
    }

    var cs = T.cars;
    for (var c = 0; c < cs.length; c++) if (cs[c].crushed) cs[c].sq += (0.26 - cs[c].sq) * Math.min(1, dt * 14);

    if (!S.dead) {
      if (car.impact > 0) {
        S.shake = Math.max(S.shake, Math.min(18, car.impact / 70));
        SND.land(car.impact);
        for (var d = 0; d < 10; d++) spawn(car.x + (d % 2 ? WB : -WB) * Math.cos(car.a), car.y + R, rnd(-300, 300), rnd(-300, -40), rnd(0.4, 0.9), rnd(4, 9), S.def.c.edge, 0.3);
      }
      updateStunts(dt, inp);

      var coins = T.coins;
      for (var q = 0; q < coins.length; q++) {
        var co = coins[q];
        if (co.got) continue;
        var ddx = co.x - car.x, ddy = co.y - (car.y - 20);
        if (ddx * ddx + ddy * ddy < 85 * 85) {
          co.got = true; S.stats.coins++; S.score += 50; car.nitro = Math.min(100, car.nitro + 8);
          popup('+50', co.x, co.y - 10, '#ffe14d', 0.8); SND.coin();
          for (var z = 0; z < 6; z++) spawn(co.x, co.y, rnd(-200, 200), rnd(-200, 200), 0.5, 4, '#ffe14d', 0, true);
        }
      }

      // chutes dans le vide / la lave / l'eau
      for (var p = 0; p < T.pits.length; p++) {
        var pit = T.pits[p];
        if (car.x > pit.x0 && car.x < pit.x1 && car.y > pit.rim + 360) {
          explode(pit.kind === 'water' ? 'Tombé à l\'eau' : pit.kind === 'void' ? 'Tombé dans le vide' : 'Tombé dans la lave');
          break;
        }
      }
      if (!S.dead && (car.y > T.maxY + 1400 || car.y > 3000)) explode('Tombé dans le vide');

      // crash : toit au sol, réception ratée, retournement
      if (!S.dead && car.roofHit && Math.cos(car.a) < 0.5 && S.grace <= 0) explode('Écrasé sur le toit');
      if (Math.cos(car.a) < 0.15 && (car.grounded || car.bodyHit) && Math.hypot(car.vx, car.vy) < 260) S.upsideT += dt; else S.upsideT = 0;
      if (!S.dead && S.upsideT > 0.9) explode('Véhicule retourné');

      if (!S.dead && !S.finished && car.x >= T.finish) finishLevel();
    }

    if (S.finished) {
      S.finishT += dt / timeScale;
      if (S.finishT > 2.6 && !S.done) { S.done = true; showResult(); }
    }
    if (S.dead) {
      S.deadT += dt / timeScale;
      updatePieces(dt);
      if (S.ring) { S.ring.t += dt; if (S.ring.t > 0.8) S.ring = null; }
      if (S.deadT > 2.0 && !S.done) { S.done = true; showDefeat(); }
    }

    if (S.combo > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
    if (S.banner) { S.banner.t += dt; if (S.banner.t > 1.6) S.banner = null; }
    if (S.hint > 0) S.hint -= dt;
    S.flash = Math.max(0, S.flash - dt * 1.6);

    if (!S.dead) effects(dt, inp);
    updateParts(dt);
    updateCamera(dt);
    S.shake *= Math.exp(-dt * 6);
    if (!S.dead) updateEngine(inp);
  }

  function updatePieces(dt) {
    for (var i = 0; i < S.pieces.length; i++) {
      var p = S.pieces[i];
      p.vy += G * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.w * dt;
      var rad = p.t === 'wheel' ? p.r : p.s * 0.5, gh = getH(p.x);
      if (p.y + rad > gh) {
        p.y = gh - rad; if (p.vy > 0) p.vy *= -0.42; p.vx *= 0.82; p.w *= 0.85;
        if (Math.abs(p.vy) < 60) p.vy = 0;
      }
      if (Math.random() < dt * 14) spawn(p.x, p.y, rnd(-30, 30), rnd(-60, -10), rnd(0.5, 1.1), rnd(6, 14), Math.random() < 0.5 ? 'rgba(40,26,60,0.5)' : '#ff8a2e', -0.05, false);
    }
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
      if (P.t <= 0) {
        A.pending = null;
        if (Math.cos(car.a) <= 0.35) { explode('Réception ratée'); return; }
        var pts = Math.round(P.air * 90), label = 'AIR ' + P.air.toFixed(1) + 's';
        if (P.flips > 0) {
          pts += P.flips * 600 + (P.flips - 1) * 400;
          S.stats.flips += P.flips;
          label = (P.dir < 0 ? 'BACKFLIP' : 'FRONTFLIP') + (P.flips > 1 ? ' x' + P.flips : '');
          car.nitro = Math.min(100, car.nitro + 12 * P.flips);
        }
        if (P.air > 0.9 || P.flips) { addScore(pts, label, car.x, car.y - 140, '#ff9a3c'); banner(label, '#ffe14d'); SND.stunt(); }
        else { S.score += pts; }
      }
    }
    var rearOnly = car.wheels[0].gr && !car.wheels[1].gr;
    if (rearOnly && car.a < -0.3) S.wheelie += dt; else {
      if (S.wheelie > 1.0) addScore(Math.round(S.wheelie * 120), 'WHEELIE', car.x, car.y - 140, '#00e5ff');
      S.wheelie = 0;
    }
  }

  function updateEngine(inp) {
    var car = S.car;
    var thr = inp.gas ? 1 : 0;
    var sp = car.grounded ? Math.abs(car.gspeed) : Math.abs(car.vx) * 0.6;
    var gears = [0, 0.2 * VMAX, 0.4 * VMAX, 0.6 * VMAX, 0.8 * VMAX, 1.05 * VMAX], gi = 0;
    while (gi < 4 && sp > gears[gi + 1]) gi++;
    var frac = clamp((sp - gears[gi]) / (gears[gi + 1] - gears[gi]), 0, 1);
    var top = V.engine === 'bike' ? 9500 : V.engine === 'vtec' ? 8400 : V.engine === 'diesel' ? 2600 : 6000;
    var idle = V.engine === 'diesel' ? 700 : 1100;
    var target = car.grounded ? idle + frac * (top - idle - 900) + thr * 400 : (thr ? top : idle + 400);
    if (car.boosting) target += 600;
    car.rpm += (target - car.rpm) * 0.12;
    if (state === 'play') SND.engine(car.rpm, thr, car.boosting, V.engine);
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
        spawn(car.x + lx * ca - sa * wh.dist, car.y + lx * sa + ca * wh.dist - 4, -car.vx * 0.15 + rnd(-60, 60), rnd(-220, -40), rnd(0.35, 0.8), rnd(4, 11), S.def.c.edge, 0.15);
      }
    }
    var ex = car.x + V.exhaust[0] * ca - V.exhaust[1] * sa, ey = car.y + V.exhaust[0] * sa + V.exhaust[1] * ca;
    if (car.boosting) {
      for (var f = 0; f < 3; f++) {
        spawn(ex, ey, -ca * rnd(500, 900) + car.vx * 0.5, -sa * rnd(500, 900) + car.vy * 0.5 + rnd(-60, 60), rnd(0.15, 0.3), rnd(7, 15), f ? '#ffb020' : '#7ad1ff', 0, true);
      }
    } else if (S.smokeT <= 0) {
      S.smokeT = inp.gas ? 0.04 : 0.12;
      spawn(ex, ey, -ca * 80 + rnd(-20, 20), -40 + rnd(-20, 10), rnd(0.5, 1), rnd(5, 10), V.engine === 'diesel' ? 'rgba(60,60,70,0.6)' : 'rgba(220,220,235,0.45)', -0.05);
    }
  }

  function camBase() { return Math.min(H / 700, W / 900) * V.zoom; }
  function updateCamera(dt) {
    var car = S.car, cam = S.cam, T = S.T;
    var sp = Math.hypot(car.vx, car.vy);
    var gh = T.base(car.x);
    var alt = clamp(gh - car.y - 60, 0, 700);
    var ts = camBase() * (1 - clamp(sp / 4200, 0, 0.2)) * (1 - alt / 2400);
    if (S.dead) ts *= 1.08;
    cam.s += (ts - cam.s) * Math.min(1, dt * 2.5);
    var tx = car.x + clamp(car.vx, -300, 2200) * 0.26;
    var ty = car.y - 30 - clamp(alt * 0.15, 0, 80);
    if (S.dead) { tx = car.x; ty = car.y - 30; }
    cam.x += (tx - cam.x) * Math.min(1, dt * (S.dead ? 2 : 5));
    cam.y += (ty - cam.y) * Math.min(1, dt * 3.5);
  }

  // ---------------------------------------------------------------- décors vaporwave
  function noise(x) { return Math.sin(x * 0.0041) * 0.5 + Math.sin(x * 0.0113 + 1.3) * 0.3 + Math.sin(x * 0.0271 + 4) * 0.2; }
  function ridge(cam, par, yFrac, amp, col, freq, mesa) {
    var ox = cam.x * par * cam.s;
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    var yb = H * yFrac;
    for (var sx = 0; sx <= W + 24; sx += 24) {
      var wx = (sx + ox) / (freq || 1);
      var nv = noise(wx) * 0.5 + 0.5;
      if (mesa) nv = nv > 0.55 ? 0.95 : nv > 0.4 ? 0.45 + (nv - 0.4) * 0.6 : 0.3;
      g.lineTo(sx, yb - amp * nv * H);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  // soleil rétro rayé
  function stripedSun(cx, cy, r, c1, c2) {
    g.save();
    g.beginPath();
    g.rect(cx - r, cy - r, 2 * r, r);
    var bands = [0.0, 0.18, 0.34, 0.48, 0.6, 0.7, 0.8, 0.9, 1.0];
    for (var i = 0; i < bands.length - 1; i++) {
      var ya = cy + bands[i] * r, th = (0.04 + i * 0.018) * r;
      g.rect(cx - r, ya + th, 2 * r, (bands[i + 1] - bands[i]) * r - th);
    }
    g.clip();
    var gr = g.createLinearGradient(0, cy - r, 0, cy + r);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    g.restore();
  }
  function stars(n, t, alpha) {
    for (var i = 0; i < n; i++) { g.fillStyle = 'rgba(255,255,255,' + (alpha * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i)))) + ')'; g.fillRect(hash(i + 3) * W, hash(i + 9) * H * 0.55, 2, 2); }
  }
  function drawPalm(x, y, s, col) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.strokeStyle = col; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(14, -80, 32, -150); g.stroke();
    g.fillStyle = col;
    var fr = [[-70, 8], [-55, -34], [-10, -58], [48, -48], [76, -6], [30, 12]];
    for (var i = 0; i < fr.length; i++) { g.beginPath(); g.moveTo(32, -150); g.quadraticCurveTo(32 + fr[i][0] * 0.6, -150 + fr[i][1] - 40, 32 + fr[i][0], -150 + fr[i][1] + 14); g.quadraticCurveTo(32 + fr[i][0] * 0.55, -150 + fr[i][1] - 14, 32, -150); g.fill(); }
    g.restore();
  }
  function skyline(cam, par, col, neon, yFrac) {
    var ox = cam.x * par * cam.s, base = H * yFrac;
    for (var sx = -((ox % 70) + 70); sx < W + 70; sx += 70) {
      var idx = Math.floor((sx + ox) / 70), bh = (0.1 + hash(idx) * 0.28) * H;
      g.fillStyle = col; g.fillRect(sx, base - bh, 58, bh + H);
      if (neon) { g.fillStyle = neon; g.fillRect(sx, base - bh, 58, 2); }
      for (var wy = base - bh + 10; wy < base - 8; wy += 18) for (var wx = sx + 8; wx < sx + 50; wx += 14) if (hash(idx * 7 + wx + wy) > 0.6) { g.fillStyle = hash(wx + wy) > 0.5 ? 'rgba(255,46,151,0.7)' : 'rgba(0,229,255,0.7)'; g.fillRect(wx, wy, 6, 8); }
    }
  }
  function scrapPiles(cam, par, col, neon, yFrac) {
    var ox = cam.x * par * cam.s, base = H * yFrac;
    for (var sx = -((ox % 120) + 120); sx < W + 120; sx += 120) {
      var idx = Math.floor((sx + ox) / 120), bh = (0.07 + hash(idx) * 0.15) * H;
      g.fillStyle = col; g.beginPath(); g.moveTo(sx - 20, H); g.lineTo(sx, base - bh * 0.6); g.lineTo(sx + 40, base - bh); g.lineTo(sx + 90, base - bh * 0.5); g.lineTo(sx + 130, H); g.fill();
      g.strokeStyle = neon; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, base - bh * 0.6); g.lineTo(sx + 40, base - bh); g.lineTo(sx + 90, base - bh * 0.5); g.stroke();
      if (hash(idx + 5) > 0.7) { g.fillStyle = col; g.fillRect(sx + 50, base - bh - 130, 8, 130); g.fillRect(sx + 50, base - bh - 130, 90, 7); g.fillStyle = neon; g.fillRect(sx + 136, base - bh - 128, 3, 40); }
    }
    g.fillStyle = col; g.fillRect(0, base, W, H);
  }

  function drawBackdrop(def, cam, t) {
    var c = def.c, th = def.theme;
    var gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, c.skyTop); gr.addColorStop(0.7, c.skyBot); gr.addColorStop(1, c.skyBot);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    var ox = cam.x * 0.02 * cam.s, r = Math.min(W, H);

    if (th === 'beach') {
      stripedSun(W * 0.68 - ox * 0.6, H * 0.5, r * 0.24, '#ffe14d', '#ff2e97');
      ridge(cam, 0.03, 0.6, 0.05, '#a23ea0', 1, false);
      var sea = g.createLinearGradient(0, H * 0.56, 0, H);
      sea.addColorStop(0, '#ff6fb0'); sea.addColorStop(0.35, '#7a2fa8'); sea.addColorStop(1, '#1f0a4e');
      g.fillStyle = sea; g.fillRect(0, H * 0.56, W, H);
      g.fillStyle = 'rgba(255,225,77,0.55)';
      for (var i = 0; i < 9; i++) g.fillRect(W * 0.68 - ox * 0.6 - (120 - i * 12) * (1 + i * 0.1), H * 0.57 + i * 14, (240 - i * 24) * (1 + i * 0.1), 3 + i * 0.4);
      skyline(cam, 0.06, '#5a1f86', '#ff9ad0', 0.62);
      var pox = cam.x * 0.22 * cam.s;
      for (var p = -1; p < W / 260 + 2; p++) { var idx = Math.floor((p * 260 + pox) / 260); drawPalm(p * 260 - (pox % 260) + hash(idx) * 80, H * 0.78, 0.9 + hash(idx + 4) * 0.5, '#2a0a52'); }
    } else if (th === 'junk') {
      stars(60, t, 0.9);
      stripedSun(W * 0.3 - ox * 0.4, H * 0.42, r * 0.2, '#ff7ad1', '#7a1fd1');
      ridge(cam, 0.05, 0.6, 0.12, c.far, 1, false);
      scrapPiles(cam, 0.12, c.mid, '#00e5ff', 0.74);
    } else if (th === 'touge') {
      stars(90, t, 1);
      g.fillStyle = 'rgba(240,235,255,0.92)'; g.beginPath(); g.arc(W * 0.78 - ox * 0.4, H * 0.2, r * 0.07, 0, TAU); g.fill();
      var mg = g.createRadialGradient(W * 0.78 - ox * 0.4, H * 0.2, r * 0.06, W * 0.78 - ox * 0.4, H * 0.2, r * 0.3);
      mg.addColorStop(0, 'rgba(180,150,255,0.45)'); mg.addColorStop(1, 'rgba(180,150,255,0)'); g.fillStyle = mg; g.fillRect(0, 0, W, H);
      ridge(cam, 0.04, 0.62, 0.2, c.far, 1, false);
      skyline(cam, 0.09, c.mid, '#00e5ff', 0.74);
    } else {
      stripedSun(W * 0.5 - ox * 0.3, H * 0.5, r * 0.3, '#fff0a0', '#ff4e88');
      ridge(cam, 0.04, 0.66, 0.25, c.far, 1, true);
      ridge(cam, 0.1, 0.72, 0.16, c.mid, 1, true);
    }
    ridge(cam, 0.26, 0.82, 0.05, shade(c.mid, 0.7), 1.7, false);
  }

  // ---------------------------------------------------------------- rendu : monde
  var DB = 38, DF = 16;
  function drawTerrain(def, T, vl, vr, vb) {
    var c = def.c, i, j, k;
    var i0 = Math.max(0, Math.floor(vl / STEP) - 1), i1 = Math.min(T.H.length - 1, Math.ceil(vr / STEP) + 1);
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
    g.beginPath();
    for (i = i0; i <= i1; i++) g.lineTo(i * STEP, T.H[i] - DB);
    for (i = i1; i >= i0; i--) g.lineTo(i * STEP, T.H[i]);
    g.closePath(); g.fillStyle = shade(c.edge, 0.55); g.fill();
    g.strokeStyle = shade(c.edge, 0.4); g.lineWidth = 4; g.lineJoin = 'round';
    g.beginPath();
    for (i = i0; i <= i1; i++) { if (i === i0) g.moveTo(i * STEP, T.H[i] - DB); else g.lineTo(i * STEP, T.H[i] - DB); }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 10;
    g.beginPath();
    for (i = i0; i <= i1; i++) { if (i === i0) g.moveTo(i * STEP, T.H[i] - 6); else g.lineTo(i * STEP, T.H[i] - 6); }
    g.stroke();
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
  function tireProp(x, y, r, neon) {
    g.fillStyle = '#16181c'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.strokeStyle = neon; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r * 0.5, 0, TAU); g.stroke();
  }

  function drawProps(def, T, vl, vr, front, t) {
    var th = def.theme, step = 240;
    for (var i = Math.floor(vl / step); i <= Math.ceil(vr / step); i++) {
      var hv = hash(i * 3.3 + (front ? 977 : 0));
      if (hv < (front ? 0.78 : 0.35)) continue;
      var x = i * step + hv * 120;
      if (x < 120 || inPit(x) || onCar(x)) continue;
      if (Math.abs(T.base(x + 30) - T.base(x - 30)) > 40) continue;
      var y = front ? T.base(x) + DF + 14 : T.base(x) - DB * 0.5;
      g.save(); g.translate(x, y);
      if (front) g.scale(1.3, 1.3); else g.scale(0.85, 0.85);
      var k = Math.floor(hv * 10) % 3;
      if (th === 'beach') {
        if (k === 0) drawPalm(0, 0, 0.7, '#3a0f66');
        else if (k === 1) { g.fillStyle = '#fff'; g.fillRect(-2, -80, 4, 80); g.fillStyle = '#ff2e97'; g.beginPath(); g.arc(0, -80, 40, Math.PI, 0); g.fill(); g.fillStyle = '#00e5ff'; g.beginPath(); g.arc(0, -80, 40, Math.PI * 1.34, Math.PI * 1.67); g.lineTo(0, -80); g.fill(); }
        else { g.fillStyle = '#ff9a3c'; g.beginPath(); g.moveTo(-12, 0); g.lineTo(0, -44); g.lineTo(12, 0); g.fill(); g.fillStyle = '#fff'; g.fillRect(-7, -22, 14, 6); }
      } else if (th === 'junk') {
        if (k === 0) { tireProp(0, -26, 26, '#00e5ff'); tireProp(8, -78, 26, '#ff2e97'); }
        else if (k === 1) { g.strokeStyle = '#ff2e97'; g.lineWidth = 5; g.strokeRect(-46, -110, 92, 40); g.fillStyle = '#ff2e97'; g.font = '900 20px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SCRAP', 0, -90); g.fillStyle = '#2d1b4e'; g.fillRect(-4, -70, 8, 70); }
        else { g.fillStyle = '#3a2562'; g.fillRect(-40, -40, 80, 40); g.strokeStyle = '#00e5ff'; g.lineWidth = 3; g.strokeRect(-40, -40, 80, 40); }
      } else if (th === 'touge') {
        if (k === 0) { g.fillStyle = '#2a2250'; g.fillRect(-3, -150, 6, 150); g.fillRect(-3, -150, 34, 6); g.fillStyle = '#00e5ff'; g.beginPath(); g.arc(31, -142, 9, 0, TAU); g.fill(); var lg = g.createRadialGradient(31, -142, 2, 31, -142, 60); lg.addColorStop(0, 'rgba(0,229,255,0.5)'); lg.addColorStop(1, 'rgba(0,229,255,0)'); g.fillStyle = lg; g.fillRect(-30, -200, 120, 120); }
        else if (k === 1) { g.fillStyle = '#ff2e97'; g.fillRect(-60, -26, 120, 6); g.fillStyle = '#2a2250'; for (var q = -50; q <= 50; q += 25) g.fillRect(q - 2, -26, 4, 26); }
        else { g.fillStyle = '#ff7a2d'; g.beginPath(); g.moveTo(-12, 0); g.lineTo(0, -44); g.lineTo(12, 0); g.fill(); g.fillStyle = '#fff'; g.fillRect(-7, -22, 14, 6); }
      } else {
        if (k === 0) { g.fillStyle = '#4a1d5a'; g.fillRect(-9, -90, 18, 90); g.fillRect(-34, -64, 14, 8); g.fillRect(-34, -64, 6, 36); g.fillRect(20, -76, 14, 8); g.fillRect(28, -76, 6, 36); g.beginPath(); g.arc(0, -90, 9, 0, TAU); g.fill(); }
        else if (k === 1) { g.fillStyle = '#4a1d5a'; g.fillRect(-3, -130, 6, 130); g.fillRect(-26, -122, 52, 5); g.fillRect(-26, -104, 52, 4); }
        else { g.fillStyle = '#7a3b2a'; g.beginPath(); g.moveTo(-34, 0); g.lineTo(-14, -42); g.lineTo(18, -34); g.lineTo(34, 0); g.fill(); }
      }
      g.restore();
    }
  }

  function drawPads(T, vl, vr, t) {
    for (var i = 0; i < T.pads.length; i++) {
      var p = T.pads[i]; if (p.x1 < vl || p.x0 > vr) continue;
      var y = T.base((p.x0 + p.x1) / 2);
      var pg = g.createLinearGradient(p.x0, 0, p.x1, 0);
      pg.addColorStop(0, 'rgba(0,229,255,0.15)'); pg.addColorStop(1, 'rgba(255,46,151,0.55)');
      g.fillStyle = pg; g.fillRect(p.x0, y - 7, p.x1 - p.x0, 9);
      for (var x = p.x0 + 20; x < p.x1 - 30; x += 54) {
        var a = 0.4 + 0.6 * Math.abs(Math.sin(t * 6 - x * 0.02));
        g.fillStyle = 'rgba(255,225,77,' + a + ')';
        g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 26, y - 22); g.lineTo(x + 26, y - 14); g.lineTo(x + 10, y - 6); g.fill();
      }
    }
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
        if (!back) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(-hw * 0.3, oy - 48); g.lineTo(hw * 0.35, oy - 48); g.lineTo(hw * 0.35 - 6, oy - 54); g.lineTo(-hw * 0.3 - 6, oy - 54); g.fill(); }
      };
      if (k === 'car' || k === 'wreck') { car(0, k === 'wreck' ? '#7a4e8e' : col, w - 14); wheel(-w * 0.3); wheel(w * 0.3); }
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
      } else if (k === 'barrel') {
        g.fillStyle = F('#ff5a8a'); g.fillRect(-w / 2 + 8, -o.h, w - 16, o.h - 2);
        g.fillStyle = F('#12052e'); g.fillRect(-w / 2 + 8, -o.h * 0.7, w - 16, 4); g.fillRect(-w / 2 + 8, -o.h * 0.28, w - 16, 4);
      } else if (k === 'crate') {
        g.fillStyle = F('#c98f4a'); g.fillRect(-w / 2 + 6, -o.h, w - 12, o.h - 2);
        g.strokeStyle = F('#6b4420'); g.lineWidth = 4; g.strokeRect(-w / 2 + 6, -o.h, w - 12, o.h - 2);
        g.beginPath(); g.moveTo(-w / 2 + 6, -o.h); g.lineTo(w / 2 - 6, -2); g.moveTo(w / 2 - 6, -o.h); g.lineTo(-w / 2 + 6, -2); g.stroke();
      } else if (k === 'cones') {
        for (var cn = -1; cn <= 1; cn++) { g.fillStyle = F('#ff7a2d'); g.beginPath(); g.moveTo(cn * 28 - 12, 0); g.lineTo(cn * 28, -o.h); g.lineTo(cn * 28 + 12, 0); g.fill(); g.fillStyle = F('#fff'); g.fillRect(cn * 28 - 7, -o.h * 0.5, 14, 5); }
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
      g.fillStyle = '#ffe14d'; g.strokeStyle = '#ff2e97'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 0, 18 * (0.25 + sc * 0.75), 18, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#c2410c'; g.font = 'bold 14px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (sc > 0.5) g.fillText('V8', 0, 1);
      g.restore();
    }
  }

  function drawFlags(T, vl, vr, t) {
    var sx = T.startX - 160;
    if (sx > vl - 200 && sx < vr + 200) {
      var sy = T.base(sx); g.fillStyle = '#fff'; g.fillRect(sx, sy - 160, 8, 160); g.fillStyle = '#ff2e97'; g.fillRect(sx, sy - 160, 100, 36);
      g.fillStyle = '#fff'; g.font = '900 20px ' + FONT; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('START', sx + 10, sy - 142);
    }
    var f = T.finish;
    if (f > vl - 200 && f < vr + 200) {
      var fy = T.base(f), top = fy - 260;
      g.fillStyle = '#d1d5db'; g.fillRect(f - 140, top, 14, 260); g.fillRect(f + 126, top, 14, 260);
      for (var cx = 0; cx < 14; cx++) for (var cy = 0; cy < 3; cy++) { g.fillStyle = (cx + cy) % 2 ? '#12052e' : '#fff'; g.fillRect(f - 140 + cx * 20, top + cy * 20, 20, 20); }
      g.fillStyle = '#ff2e97'; g.fillRect(f - 140, top + 60, 280, 30);
      g.fillStyle = '#fff'; g.font = '900 24px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINISH', f, top + 76);
    }
  }

  function drawPieces() {
    for (var i = 0; i < S.pieces.length; i++) {
      var p = S.pieces[i];
      g.save(); g.translate(p.x, p.y); g.rotate(p.a);
      if (p.t === 'wheel') VX.tire(g, p.r, 0, { lugs: 12, rimR: 0.5, neon: '#ff2e97' });
      else {
        g.fillStyle = p.col; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3;
        g.beginPath();
        for (var k = 0; k < p.n; k++) { var an = k * TAU / p.n, rr = p.s * (k % 2 ? 0.45 : 0.6); g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
        g.closePath(); g.fill(); g.stroke();
      }
      g.restore();
    }
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
    }
    g.globalAlpha = 1;
    var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,0,30,0.42)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
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
    drawProps(def, T, vl, vr, false, t);
    drawPads(T, vl, vr, t);
    drawFlags(T, vl, vr, t);
    for (var i = 0; i < T.cars.length; i++) { var o = T.cars[i]; if (o.x + o.w > vl && o.x - o.w < vr) drawObstacle(o, T); }
    drawCoins(T, vl, vr, t);
    drawParts(false);
    if (!S.dead) {
      var cgh = getH(S.car.x), calt = Math.max(0, cgh - S.car.y);
      g.save(); g.translate(S.car.x, cgh + 12); g.rotate(Math.atan2(getH(S.car.x + 30) - getH(S.car.x - 30), 60));
      g.globalAlpha = clamp(0.38 - calt / 900, 0.06, 0.38); g.fillStyle = '#000';
      g.beginPath(); g.ellipse(0, 0, V.WB + 62, 14, 0, 0, TAU); g.fill(); g.restore();
      VX.drawVehicle(g, S.car, save.color, S.car.boosting, t, CAR_COLORS);
    } else drawPieces();
    drawProps(def, T, vl, vr, true, t);
    drawParts(true);
    if (S.ring) {
      var rr = S.ring.t * 900;
      g.strokeStyle = 'rgba(255,225,77,' + (1 - S.ring.t / 0.8) + ')'; g.lineWidth = 16 * (1 - S.ring.t / 0.8) + 2;
      g.beginPath(); g.arc(S.ring.x, S.ring.y, rr, 0, TAU); g.stroke();
    }
    g.restore();
    drawForeground(def, cam);
    drawHud(t);
    if (S.flash > 0) { g.fillStyle = 'rgba(255,240,220,' + S.flash * 0.9 + ')'; g.fillRect(0, 0, W, H); }
  }

  // ---------------------------------------------------------------- HUD
  function txt(str, x, y, size, col, align, stroke) {
    g.font = '900 ' + size + 'px ' + FONT;
    g.textAlign = align || 'left'; g.textBaseline = 'middle';
    g.lineWidth = Math.max(3, size / 6); g.strokeStyle = stroke || 'rgba(18,5,46,0.85)'; g.lineJoin = 'round';
    g.strokeText(str, x, y); g.fillStyle = col || '#fff'; g.fillText(str, x, y);
  }
  function drawHud(t) {
    var car = S.car, cam = S.cam, m = Math.max(10, Math.min(W, H) * 0.02), u = Math.max(0.7, Math.min(1.25, Math.min(W, H) / 700));
    for (var i = 0; i < S.pops.length; i++) {
      var p = S.pops[i], px = (p.x - cam.x) * cam.s + W * 0.36, py = (p.y - cam.y) * cam.s + H * 0.62;
      g.globalAlpha = Math.max(0, 1 - p.t / p.life);
      txt(p.txt, px, py, 22 * u * p.size, p.col, 'center');
    }
    g.globalAlpha = 1;
    txt(String(S.score), m, m + 22 * u, 40 * u, '#fff');
    if (S.combo > 1) {
      txt('COMBO x' + mult().toFixed(1), m, m + 58 * u, 20 * u, '#ffe14d');
      g.fillStyle = 'rgba(18,5,46,0.6)'; g.fillRect(m, m + 74 * u, 150 * u, 7 * u);
      g.fillStyle = '#ff2e97'; g.fillRect(m, m + 74 * u, 150 * u * clamp(S.comboT / 4, 0, 1), 7 * u);
    }
    var ny = m + (S.combo > 1 ? 100 : 66) * u, nw = 190 * u, nh = 14 * u;
    g.fillStyle = 'rgba(18,5,46,0.65)'; g.fillRect(m, ny, nw, nh);
    var ng = g.createLinearGradient(m, 0, m + nw, 0); ng.addColorStop(0, '#ff2e97'); ng.addColorStop(1, '#ffe14d');
    g.fillStyle = car.nitro < 15 ? '#ff3b30' : ng; g.fillRect(m, ny, nw * car.nitro / 100, nh);
    g.strokeStyle = '#00e5ff'; g.lineWidth = 2; g.strokeRect(m, ny, nw, nh);
    txt('NITRO', m + nw + 8, ny + nh / 2, 13 * u, '#00e5ff');
    var pw = Math.min(W * 0.34, 420), px0 = W / 2 - pw / 2, py0 = m + 14 * u;
    var prog = clamp(car.x / S.T.finish, 0, 1);
    g.fillStyle = 'rgba(18,5,46,0.65)'; g.fillRect(px0, py0, pw, 10 * u);
    var pg = g.createLinearGradient(px0, 0, px0 + pw, 0); pg.addColorStop(0, '#00e5ff'); pg.addColorStop(1, '#ff2e97');
    g.fillStyle = pg; g.fillRect(px0, py0, pw * prog, 10 * u);
    g.fillStyle = '#fff'; g.fillRect(px0 + pw * prog - 3, py0 - 4 * u, 6, 18 * u);
    txt(S.def.name, W / 2, py0 + 32 * u, 14 * u, '#fff', 'center');
    var kmh = Math.round(Math.hypot(car.vx, car.vy) * 0.12);
    var sy0 = Math.max(78, 22 * u + m + 50);
    txt(kmh + ' km/h', W - m, sy0, 22 * u, '#fff', 'right');
    txt(S.t.toFixed(1) + ' s', W - m, sy0 + 28 * u, 16 * u, '#c4b5fd', 'right');
    if (S.banner) {
      var b = S.banner, k = Math.min(1, b.t * 6), a = b.t > 1.2 ? 1 - (b.t - 1.2) / 0.4 : 1;
      g.globalAlpha = Math.max(0, a);
      txt(b.txt, W / 2, H * 0.27, (46 + 14 * (1 - k)) * u, b.col, 'center');
      g.globalAlpha = 1;
    }
    if (S.air.active && S.air.t > 0.5 && !S.dead) {
      var fl = Math.floor(Math.abs(S.air.rot) / (TAU * 0.86));
      txt('AIR ' + S.air.t.toFixed(1) + 's' + (fl ? '  ·  ' + fl + ' FLIP' + (fl > 1 ? 'S' : '') : ''), W / 2, H * 0.36, 24 * u, '#ff9a3c', 'center');
    }
    if (S.hint > 0 && !isTouch && !S.dead) {
      g.globalAlpha = Math.min(1, S.hint);
      txt('↑ gaz   ↓ frein   ← → rotation en l\'air   ESPACE nitro   R recommencer', W / 2, H - 28 * u, 15 * u, '#fff', 'center');
      g.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- menu : décor Miami vaporwave animé
  var menuVeh = 'monster', menuCycle = 0;
  function drawMenuScene(t) {
    var hy = H * 0.62, r = Math.min(W, H);
    var gr = g.createLinearGradient(0, 0, 0, hy);
    gr.addColorStop(0, '#12052e'); gr.addColorStop(0.45, '#4a0f8a'); gr.addColorStop(0.8, '#e0457b'); gr.addColorStop(1, '#ffb15c');
    g.fillStyle = gr; g.fillRect(0, 0, W, hy);
    stars(70, t, 0.9);
    stripedSun(W * 0.66, hy - r * 0.02, r * 0.3, '#ffe14d', '#ff2e97');
    var cam = { x: t * 40, y: 0, s: 1 };
    skyline(cam, 1, '#1a0838', '#00e5ff', 0.62);
    g.fillStyle = '#12052e'; g.fillRect(0, hy, W, H - hy);
    g.save(); g.beginPath(); g.rect(0, hy, W, H - hy); g.clip();
    g.strokeStyle = 'rgba(255,46,151,0.85)'; g.lineWidth = 2;
    for (var i = -24; i <= 24; i++) { g.beginPath(); g.moveTo(W / 2 + i * 14, hy); g.lineTo(W / 2 + i * 150, H); g.stroke(); }
    g.strokeStyle = 'rgba(0,229,255,0.85)';
    for (var j = 0; j < 14; j++) { var k = ((j + (t * 0.6) % 1) / 14), y = hy + (H - hy) * k * k; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.restore();
    var hg = g.createLinearGradient(0, hy - 6, 0, hy + 40); hg.addColorStop(0, 'rgba(255,46,151,0.7)'); hg.addColorStop(1, 'rgba(255,46,151,0)');
    g.fillStyle = hg; g.fillRect(0, hy - 6, W, 46);
    var vk = menuVeh, vv = VEH[vk], sc = (W < H ? W / 520 : r / 520) * 1.1 * (vk === 'truck' ? 0.62 : vk === 'moto' ? 1.4 : vk === 'civic' ? 1.05 : 0.95);
    var px = W < H ? W * 0.5 : W * 0.7, py = (W < H ? H * 0.9 : H * 0.84) - (vv.R - 18) * sc;
    var car = { vk: vk, x: 0, y: 0, a: -0.04 + Math.sin(t * 2) * 0.012, wheels: [{ dist: vv.R - 14 + Math.sin(t * 2.3) * 3, spin: t * 6 }, { dist: vv.R - 14 + Math.cos(t * 2.1) * 3, spin: t * 6 }] };
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(px, py + (vv.R - 14) * sc + 6 * sc, (vv.WB + 70) * sc, 12 * sc, 0, 0, TAU); g.fill();
    g.save(); g.translate(px, py); g.scale(sc, sc);
    VX.drawVehicle(g, car, save.color, false, t, CAR_COLORS);
    g.restore();
  }

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
    else if ((state === 'pause' || state === 'result' || state === 'defeat') && S) {
      if (state === 'defeat') { updateParts(dt); updatePieces(dt); }
      drawWorld(performance.now() / 1000);
    } else {
      menuT += dt;
      var cyc = ((menuT / 6) | 0) % 4;
      if (cyc !== menuCycle) { menuCycle = cyc; menuVeh = ['monster', 'moto', 'civic', 'truck'][cyc]; }
      drawMenuScene(menuT);
    }
  }

  // ---------------------------------------------------------------- interface (DOM)
  var isTouch = !!((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints > 0));
  var UI = {
    show: function (id) {
      var all = document.querySelectorAll('.screen');
      for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i].id === id);
    },
    hud: function (on) {
      document.getElementById('pausebtn').classList.toggle('hidden', !on);
      document.getElementById('touch').classList.toggle('hidden', !(on && isTouch));
    }
  };
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

  function pause() { if (state !== 'play' || S.dead) return; state = 'pause'; SND.silence(); UI.show('screen-pause'); }
  function resume() { if (state !== 'pause') return; state = 'play'; last = performance.now(); UI.show(null); }
  function toMenu(screen) { state = 'menu'; S = null; SND.silence(); UI.hud(false); if (screen === 'levels') buildLevels(); if (screen === 'worlds') buildWorlds(); UI.show('screen-' + screen); }
  // le 1er parcours de chaque monde est libre ; les suivants s'ouvrent en terminant (ou en passant) le précédent
  function levelUnlocked(lv) {
    if (lv.li === 0) return true;
    var prev = lv.id - 1;
    return (save.stars[prev] || 0) > 0 || !!(save.skip && save.skip[prev]);
  }
  function starStr(n) { var s = ''; for (var i = 0; i < 3; i++) s += i < n ? '★' : '☆'; return s; }
  function worldStars(w) { var n = 0; for (var i = 0; i < 5; i++) n += save.stars[w * 5 + i + 1] || 0; return n; }

  function previewCanvas(vk) {
    var cvp = document.createElement('canvas'); cvp.width = 520; cvp.height = 300;
    var c2 = cvp.getContext('2d'), vv = VEH[vk];
    var half = { moto: 100, monster: 150, civic: 130, truck: 230 }[vk];
    var vh = { moto: 125, monster: 150, civic: 100, truck: 175 }[vk];
    var sc = Math.min(239 / half, 215 / vh);
    var car = { vk: vk, x: 0, y: 0, a: -0.03, wheels: [{ dist: vv.R - 14, spin: 0.4 }, { dist: vv.R - 14, spin: 0.9 }] };
    c2.save(); c2.translate(260, 238 - (vv.R - 14) * sc); c2.scale(sc, sc);
    VX.drawVehicle(c2, car, save.color, false, 0, CAR_COLORS);
    c2.restore();
    return cvp;
  }

  function buildWorlds() {
    var grid = document.getElementById('world-grid'); grid.innerHTML = '';
    LV.worlds.forEach(function (w, wi) {
      var locked = false;
      var d = document.createElement('button');
      d.className = 'world w' + (wi + 1) + (locked ? ' locked' : '');
      var st = worldStars(wi);
      d.innerHTML = '<span class="num">' + w.id + '</span><span class="prev"></span>' +
        '<span class="info"><span class="kick">MONDE ' + w.id + ' · ' + w.vehName + '</span><span class="nm">' + w.name + '</span>' +
        '<span class="bl">' + w.blurb + '</span><span class="stc">' + (locked ? 'VERROUILLÉ' : '★ ' + st + ' / 15') + '</span></span>';
      d.querySelector('.prev').appendChild(previewCanvas(w.veh));
      if (!locked) d.addEventListener('click', function () { SND.init(); SND.click(); curWorld = wi; menuVeh = w.veh; buildLevels(); UI.show('screen-levels'); });
      grid.appendChild(d);
    });
  }

  function buildLevels() {
    var w = LV.worlds[curWorld];
    document.getElementById('lv-kick').textContent = 'MONDE ' + w.id + ' · ' + w.vehName;
    document.getElementById('lv-title').textContent = w.name;
    var grid = document.getElementById('level-grid'); grid.innerHTML = '';
    document.getElementById('screen-levels').setAttribute('data-world', String(curWorld + 1));
    w.levels.forEach(function (lv) {
      var locked = !levelUnlocked(lv);
      var d = document.createElement('button');
      d.className = 'lvl' + (locked ? ' locked' : '');
      d.innerHTML = '<span class="n">' + (lv.li + 1) + '</span><span class="t">' + lv.name + '</span><span class="s">' + lv.sub + '</span>' +
        '<span class="st">' + (locked ? 'VERROUILLÉ' : starStr(save.stars[lv.id] || 0)) + '</span>' +
        (save.best[lv.id] ? '<span class="b">RECORD ' + save.best[lv.id] + '</span>' : '');
      if (!locked) d.addEventListener('click', function () { SND.init(); SND.click(); startLevel(lv.id - 1); });
      grid.appendChild(d);
    });
    var sw = document.getElementById('swatches'); sw.innerHTML = '';
    var opts = [{ n: 'Origine', a: VEH[w.veh].paint.a, b: VEH[w.veh].paint.b }].concat(CAR_COLORS);
    opts.forEach(function (c, i) {
      var b = document.createElement('button'); b.className = 'sw' + (i === save.color ? ' sel' : ''); b.title = c.n; b.setAttribute('aria-label', c.n);
      b.style.background = 'linear-gradient(135deg,' + c.a + ',' + c.b + ')';
      b.addEventListener('click', function () { save.color = i; persist(); buildLevels(); });
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
    var lastLvl = S.idx >= LV.levels.length - 1, endWorld = S.def.li === 4;
    document.getElementById('res-kick').textContent = 'MONDE ' + LV.worlds[S.def.world].id + ' · ' + S.def.name;
    document.getElementById('res-title').textContent = lastLvl ? 'CHAMPION DU MONSTER V8 !' : endWorld ? 'MONDE TERMINÉ' : 'PARCOURS RÉUSSI';
    document.getElementById('res-stars').textContent = starStr(S.starsEarned);
    document.getElementById('res-score').textContent = S.score;
    document.getElementById('res-goal').textContent = '★★ ' + S.def.stars[0] + '   ·   ★★★ ' + S.def.stars[1];
    document.getElementById('res-stats').innerHTML =
      '<li><b>' + S.t.toFixed(1) + ' s</b>temps (bonus +' + S.timeBonus + ')</li>' +
      '<li><b>' + S.stats.crushed + '</b>écrasés</li>' +
      '<li><b>' + S.stats.flips + '</b>flips</li>' +
      '<li><b>' + S.stats.bestAir.toFixed(1) + ' s</b>plus long saut</li>';
    var nb = document.getElementById('btn-next');
    nb.style.display = lastLvl ? 'none' : '';
    nb.textContent = endWorld ? 'Monde suivant ▶' : 'Parcours suivant ▶';
    UI.show('screen-result');
  }

  function showDefeat() {
    state = 'defeat'; SND.silence(); UI.hud(false);
    var pc = Math.round(clamp(S.car.x / S.T.finish, 0, 1) * 100);
    document.getElementById('def-reason').textContent = S.reason + ' · ' + pc + '% du parcours';
    fails[S.idx] = (fails[S.idx] || 0) + 1;
    var skip = document.getElementById('btn-def-skip');
    skip.classList.toggle('hidden', !(fails[S.idx] >= 3 && S.idx < LV.levels.length - 1));
    UI.show('screen-defeat');
  }

  function bind(id, fn) { document.getElementById(id).addEventListener('click', function () { SND.init(); SND.click(); fn(); }); }
  bind('btn-play', function () { buildWorlds(); UI.show('screen-worlds'); });
  bind('btn-help', function () { UI.show('screen-help'); });
  bind('btn-help-back', function () { UI.show('screen-menu'); });
  bind('btn-worlds-back', function () { UI.show('screen-menu'); });
  bind('btn-levels-back', function () { buildWorlds(); UI.show('screen-worlds'); });
  bind('btn-resume', resume);
  bind('btn-restart', function () { startLevel(S.idx); });
  bind('btn-quit', function () { curWorld = S.def.world; toMenu('levels'); });
  bind('btn-retry', function () { startLevel(S.idx); });
  bind('btn-next', function () { startLevel(Math.min(S.idx + 1, LV.levels.length - 1)); });
  bind('btn-res-menu', function () { curWorld = S.def.world; toMenu('levels'); });
  bind('btn-def-retry', function () { startLevel(S.idx); });
  bind('btn-def-menu', function () { curWorld = S.def.world; toMenu('levels'); });
  bind('btn-def-skip', function () { var id = S.def.id; if (!save.skip) save.skip = {}; save.skip[id] = 1; persist(); startLevel(Math.min(S.idx + 1, LV.levels.length - 1)); });
  bind('pausebtn', pause);
  bind('btn-mute', toggleMute);
  bind('btn-full', toggleFS);
  document.getElementById('btn-mute').textContent = save.muted ? '🔇' : '🔊';

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

  window.MV8_DEBUG = {
    start: function (i) { startLevel(i); },
    state: function () { return S; },
    sim: function (sec, fn) {
      var n = Math.round(sec * 60);
      for (var i = 0; i < n; i++) { if (fn) override = fn(S, i / 60); update(1 / 60); if (state !== 'play') break; }
      override = null;
    },
    mode: function () { return state; },
    save: function () { return save; },
    unlockAll: function () { for (var i = 1; i <= 20; i++) save.stars[i] = save.stars[i] || 1; }
  };
})();
