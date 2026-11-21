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
  var LAND_TOL = 0.35, BOOST_DUR = 2, MAX_CHARGES = 2;
  function setVehicle(key) {
    V = VEH[key] || VEH.monster;
    R = V.R; WR = V.WR; WB = V.WB; K = V.K; C = V.C; KH = V.KH; MAXC = R - WR - 8; INV_I = V.INV_I;
    P_DRIVE = V.P; BRAKE = V.BRAKE; VMAX = V.VMAX; RMAX = V.RMAX; MU = V.MU; BOOST = V.BOOST; DQ = V.DQ;
    WHEELIE = V.WHEELIE; AIR_ROT = V.AIR_ROT; WMAX = V.WMAX; BODY_PTS = V.pts; ROOF = V.roof;
    // améliorations achetées au garage
    var u = (typeof save === 'object' && save) ? upgOf(V.key) : { eng: 0, sus: 0, grip: 0, nit: 0 };
    P_DRIVE *= 1 + 0.07 * u.eng; VMAX *= 1 + 0.05 * u.eng;
    C *= 1 + 0.12 * u.sus; LAND_TOL = 0.35 - 0.06 * u.sus;
    MU *= 1 + 0.08 * u.grip; BRAKE *= 1 + 0.08 * u.grip; AIR_ROT *= 1 + 0.06 * u.grip;
    BOOST *= 1 + 0.06 * u.nit; BOOST_DUR = 2 + 0.15 * u.nit; MAX_CHARGES = 2 + (u.nit >= 2 ? 1 : 0) + (u.nit >= 4 ? 1 : 0);
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
  var save = { unlocked: 1, stars: {}, best: {}, time: {}, color: 0, muted: false, credits: 0, upg: {}, tot: {}, troph: {}, daily: {}, skip: {}, v3: false };
  try { var raw = localStorage.getItem(SAVE_KEY); if (raw) Object.assign(save, JSON.parse(raw)); } catch (e) { /* ok */ }
  ['stars', 'best', 'time', 'upg', 'tot', 'troph', 'daily', 'skip'].forEach(function (k) { if (!save[k] || typeof save[k] !== 'object') save[k] = {}; });
  if (!save.v3) {      // anciens identifiants (5 parcours par monde) → nouveaux (10 par monde)
    var remap = function (o) { var n = {}; Object.keys(o).forEach(function (k) { var id = +k; if (id >= 1 && id <= 20) n[Math.floor((id - 1) / 5) * 10 + (id - 1) % 5 + 1] = o[k]; }); return n; };
    save.stars = remap(save.stars); save.best = remap(save.best); save.skip = remap(save.skip); save.v3 = true;
  }
  ['flips', 'crush', 'rings', 'booms', 'coins', 'daily', 'maxMult', 'bestAir'].forEach(function (k) { save.tot[k] = save.tot[k] || 0; });
  function upgOf(vk) { if (!save.upg[vk]) save.upg[vk] = { eng: 0, sus: 0, grip: 0, nit: 0 }; return save.upg[vk]; }
  var UPG = [
    { k: 'eng', n: 'MOTEUR', d: 'Accélération et vitesse de pointe' },
    { k: 'sus', n: 'SUSPENSION', d: 'Réceptions plus tolérantes, amortis plus fermes' },
    { k: 'grip', n: 'ADHÉRENCE', d: 'Grip, freinage et contrôle en l\'air' },
    { k: 'nit', n: 'NITRO', d: 'Boost plus long et plus puissant, plus de bidons' }
  ];
  var UPG_COST = [150, 350, 700, 1200, 2000];
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
    if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && state === 'play' && S) S.boostReq = true;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') pause(); else if (state === 'pause') resume(); }
    else if (e.code === 'KeyR' && (state === 'play' || state === 'defeat')) restart();
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
  function onSpring(x) { var p = S.T.springs; for (var i = 0; i < p.length; i++) if (x > p[i].x0 && x < p[i].x1) return true; return false; }
  function onPad(x) { var p = S.T.pads; for (var i = 0; i < p.length; i++) if (x > p[i].x0 && x < p[i].x1) return true; return false; }

  // ---------------------------------------------------------------- véhicule
  function newCar(x, y) {
    return {
      vk: V.key, x: x, y: y, a: 0, vx: 0, vy: 0, w: 0, charges: 1, boostT: 0, rpm: 1000, boosting: false,
      wheels: [{ dist: R, spin: 0, gr: false, vt: 0 }, { dist: R, spin: 0, gr: false, vt: 0 }],
      grounded: 0, bodyHit: false, roofHit: false, impact: 0, gspeed: 0
    };
  }

  function physStep(h, inp) {
    var car = S.car, ca = Math.cos(car.a), sa = Math.sin(car.a);
    var ax = 0, ay = G, aw = 0;
    var drive = (inp.gas ? 1 : 0) - (inp.brake ? 1 : 0);
    var grounded = 0, gsum = 0;
    var boosting = car.boostT > 0 && !S.finished;
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
      if (!S.finished && S.springCd <= 0 && onSpring(cx)) { car.vy = Math.min(car.vy, -1050); S.springCd = 0.45; S.springHit = cx; }
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
    if (boosting) { ax += ca * BOOST; ay += sa * BOOST; }
    car.boosting = boosting;

    aw = clamp(aw, -45, 45);                 // chocs : rotation plafonnée (arcade)
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
    if (!noCombo) { S.combo++; S.comboT = 4; if (mult() > S.maxMult) S.maxMult = mult(); }
    popup(label ? label + ' +' + v : '+' + v, wx, wy, col || '#fff', 1);
  }
  function popup(txt, x, y, col, size) { S.pops.push({ txt: txt, x: x, y: y, t: 0, life: 1.3, col: col, size: size || 1 }); }
  function banner(txt, col) { S.banner = { txt: txt, t: 0, col: col || '#ffe14d' }; }
  function tntBlast(o) {
    var car = S.car, gy = S.T.base(o.x);
    car.vy = Math.min(car.vy, -760); car.vx += 120; car.w += rnd(-1.2, 1.2);
    addScore(150, 'TNT', o.x, gy - 80, '#ff5a2e');
    S.shake = Math.max(S.shake, 24); S.flash = Math.max(S.flash, 0.35);
    for (var i = 0; i < 50; i++) { var an = rnd(Math.PI, TAU), sp = rnd(150, 800); spawn(o.x + rnd(-20, 20), gy - 20, Math.cos(an) * sp, Math.sin(an) * sp, rnd(0.4, 1), rnd(8, 24), i % 2 ? '#ffe14d' : '#ff5a2e', 0.15, true); }
    for (var j = 0; j < 14; j++) spawn(o.x, gy - 30, rnd(-160, 160), rnd(-300, -60), rnd(0.8, 1.6), rnd(14, 30), 'rgba(40,26,60,0.5)', -0.06);
    SND.tnt();
  }
  function crush(o) {
    o.crushed = true; S.stats.crushed++;
    if (o.k === 'tnt') { tntBlast(o); return; }
    var big = o.h > 80;
    addScore(big ? 200 : o.h < 46 ? 60 : 100, 'CRUSH', o.x, S.T.base(o.x) - o.h - 20, '#ffe14d');
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
  function ghostKey(id) { return 'monsterv8.ghost.' + id; }
  function startLevel(i, defOverride) {
    var def = defOverride || LV.levels[i], T = LV.buildDef(def);
    setVehicle(def.veh);
    var sx = T.startX, ghost = null;
    if (typeof def.id === 'number') { try { var gr = localStorage.getItem(ghostKey(def.id)); if (gr) ghost = JSON.parse(gr); } catch (e) { ghost = null; } }
    S = {
      idx: i, def: def, daily: !!def.daily, T: T, car: newCar(sx, T.base(sx) - 80),
      parts: [], pops: [], banner: null, t: 0, score: 0, combo: 0, comboT: 0, shake: 0, maxMult: 1,
      finished: false, finishT: 0, done: false, dead: false, deadT: 0, flash: 0, pieces: [], ring: null, reason: '',
      air: { t: 0, rot: 0, pending: null, prevA: 0, active: false },
      wheelie: 0, upsideT: 0, grace: 0.9, springCd: 0, springHit: 0, stats: { crushed: 0, coins: 0, flips: 0, bestAir: 0, rings: 0 },
      cam: { x: sx + 200, y: T.base(sx) - 100, s: camBase() }, dustT: 0, smokeT: 0, hint: 4,
      rec: [], recT: 0, ghost: ghost
    };
    state = 'play';
    SND.silence();
    UI.show(null);
    UI.hud(true);
  }
  function restart() { startLevel(S.idx, S.daily ? S.def : null); }

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
    car.boosting = false; car.boostT = 0;
    SND.boom();
    SND.silence();
  }

  function tryBoost() {
    var car = S.car;
    if (car.boostT > 0) return;
    if (car.charges <= 0) {
      if (!(S.noNitroT > 0)) { popup('PAS DE NITRO', car.x, car.y - 130, '#ff3b30', 0.9); S.noNitroT = 1; }
      return;
    }
    car.charges--; car.boostT = BOOST_DUR;
    S.shake = Math.max(S.shake, 7);
    SND.nitroGo();
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
    S.springCd = Math.max(0, S.springCd - dt);
    if (!S.dead && !S.finished) {
      if ((inp.boost && !S.prevBoost) || S.boostReq) tryBoost();
      S.boostReq = false;
      if (S.car.boostT > 0) S.car.boostT = Math.max(0, S.car.boostT - dt);
    }
    S.prevBoost = inp.boost;
    if (S.noNitroT > 0) S.noNitroT -= dt;
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
          co.got = true; S.stats.coins++; S.score += 50;
          popup('+50', co.x, co.y - 10, '#ffe14d', 0.8); SND.coin();
          for (var z = 0; z < 6; z++) spawn(co.x, co.y, rnd(-200, 200), rnd(-200, 200), 0.5, 4, '#ffe14d', 0, true);
        }
      }

      // bidons de nitro
      var nis = T.nitros;
      for (var ni = 0; ni < nis.length; ni++) {
        var nt = nis[ni];
        if (nt.got) continue;
        var ndx = nt.x - car.x, ndy = nt.y - (car.y - 20);
        if (ndx * ndx + ndy * ndy < 95 * 95) {
          nt.got = true; S.stats.nitros = (S.stats.nitros || 0) + 1;
          if (car.charges < MAX_CHARGES) { car.charges++; popup('+ NITRO', nt.x, nt.y - 30, '#00e5ff', 1); S.score += 25; }
          else { popup('NITRO MAX +100', nt.x, nt.y - 30, '#00e5ff', 0.9); S.score += 100; }
          SND.nitroPick();
          for (var nz = 0; nz < 14; nz++) spawn(nt.x, nt.y, rnd(-220, 220), rnd(-260, 120), rnd(0.4, 0.8), rnd(4, 8), nz % 2 ? '#00e5ff' : '#ff2e97', 0, true);
        }
      }
      // anneaux de feu
      var rgs = T.rings;
      for (var ri = 0; ri < rgs.length; ri++) {
        var rg = rgs[ri];
        if (rg.got) continue;
        var rdx = car.x - rg.x, rdy = (car.y - 20) - rg.y, rr = rg.r * 0.85;
        if (rdx * rdx + rdy * rdy < rr * rr) {
          rg.got = true; S.stats.rings++;
          addScore(200, 'ANNEAU', rg.x, rg.y - rg.r - 20, '#ff9a3c'); SND.ring();
          for (var rz = 0; rz < 24; rz++) { var ra = rnd(0, TAU); spawn(rg.x + Math.cos(ra) * rg.r * 0.3, rg.y + Math.sin(ra) * rg.r, Math.cos(ra) * 160, Math.sin(ra) * 260, rnd(0.4, 0.8), rnd(5, 10), rz % 2 ? '#ffe14d' : '#ff5a2e', 0, true); }
        }
      }
      // tremplin à ressort déclenché
      if (S.springHit) {
        var shx = S.springHit; S.springHit = 0; SND.spring(); popup('BOING !', shx, T.base(shx) - 60, '#7dffd4', 1);
        for (var sz2 = 0; sz2 < 16; sz2++) spawn(shx + rnd(-60, 60), T.base(shx) - 6, rnd(-120, 120), rnd(-500, -150), rnd(0.3, 0.7), rnd(4, 9), sz2 % 2 ? '#7dffd4' : '#ff2e97', 0.4, true);
      }
      // enregistrement du fantôme (30 images/s)
      if (!S.finished) {
        S.recT += dt;
        while (S.recT >= 1 / 30) { S.recT -= 1 / 30; S.rec.push(Math.round(car.x), Math.round(car.y), Math.round(car.a * 100)); }
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

  function awardStunt(P) {
    var car = S.car, pts = Math.round(P.air * 90), label = 'AIR ' + P.air.toFixed(1) + 's';
    if (P.flips > 0) {
      pts += P.flips * 600 + (P.flips - 1) * 400;
      S.stats.flips += P.flips;
      label = (P.dir < 0 ? 'BACKFLIP' : 'FRONTFLIP') + (P.flips > 1 ? ' x' + P.flips : '');
    }
    if (P.air > 0.9 || P.flips) { addScore(pts, label, car.x, car.y - 140, '#ff9a3c'); banner(label, '#ffe14d'); SND.stunt(); }
    else { S.score += pts; }
  }

  function updateStunts(dt, inp) {
    var car = S.car, A = S.air;
    var inAir = car.grounded === 0 && !car.bodyHit;
    if (inAir) {
      if (!A.active) { A.active = true; A.t = 0; A.rot = 0; A.prevA = car.a; }
      A.t += dt;
      A.rot += car.a - A.prevA; A.prevA = car.a;
      // rebond juste après une réception : on valide la figure si le véhicule était sur ses roues
      if (A.pending) { var P0 = A.pending; A.pending = null; if (Math.cos(car.a) > LAND_TOL) awardStunt(P0); }
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
        if (Math.cos(car.a) <= LAND_TOL) { explode('Réception ratée'); return; }
        awardStunt(P);
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

  function drawNitros(T, vl, vr, t) {
    for (var i = 0; i < T.nitros.length; i++) {
      var n = T.nitros[i]; if (n.got || n.x < vl - 60 || n.x > vr + 60) continue;
      var y = n.y + Math.sin(t * 3 + i) * 6;
      g.save(); g.translate(n.x, y); g.rotate(Math.sin(t * 2 + i) * 0.15);
      var gl = g.createRadialGradient(0, 0, 4, 0, 0, 52); gl.addColorStop(0, 'rgba(0,229,255,0.55)'); gl.addColorStop(1, 'rgba(0,229,255,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 52, 0, TAU); g.fill();
      var bg = g.createLinearGradient(-14, 0, 14, 0); bg.addColorStop(0, '#0b5d9c'); bg.addColorStop(0.45, '#19e6ff'); bg.addColorStop(1, '#0b5d9c');
      g.fillStyle = bg; g.strokeStyle = '#12052e'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-14, -18); g.quadraticCurveTo(-14, -26, -6, -28); g.lineTo(6, -28); g.quadraticCurveTo(14, -26, 14, -18); g.lineTo(14, 22); g.quadraticCurveTo(14, 28, 8, 28); g.lineTo(-8, 28); g.quadraticCurveTo(-14, 28, -14, 22); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#d6e4ff'; g.fillRect(-5, -36, 10, 9); g.fillStyle = '#ff2e97'; g.fillRect(-14, -6, 28, 12);
      g.fillStyle = '#fff'; g.font = '900 9px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N2O', 0, 0.5);
      g.restore();
    }
  }
  function drawSprings(T, vl, vr, t) {
    for (var i = 0; i < T.springs.length; i++) {
      var p = T.springs[i]; if (p.x1 < vl || p.x0 > vr) continue;
      var w = p.x1 - p.x0, cx = (p.x0 + p.x1) / 2, y = p.y;
      var squash = S.springCd > 0 && Math.abs(S.car.x - cx) < 400 ? 0.5 + 0.5 * (1 - S.springCd / 0.45) : 1;
      var ch = 26 * squash;
      g.strokeStyle = '#d6e4ff'; g.lineWidth = 4; g.beginPath();
      for (var k = 0; k <= 8; k++) g.lineTo(p.x0 + 14 + (w - 28) * k / 8, y - 4 - (k % 2 ? ch : 0));
      g.stroke();
      g.fillStyle = '#12052e'; g.fillRect(p.x0, y - 6, w, 8);
      for (var s2 = 0; s2 < w; s2 += 24) { g.fillStyle = (s2 / 24) % 2 ? '#ff2e97' : '#ffe14d'; g.fillRect(p.x0 + s2, y - ch - 14, Math.min(24, w - s2), 10); }
      var a = 0.5 + 0.5 * Math.abs(Math.sin(t * 5));
      g.fillStyle = 'rgba(125,255,212,' + a + ')'; g.font = '900 16px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('▲ ▲ ▲', cx, y - ch - 34);
    }
  }
  // anneau de feu en 2.5D : moitié arrière derrière le véhicule, moitié avant devant
  function drawRings(T, vl, vr, t, front) {
    for (var i = 0; i < T.rings.length; i++) {
      var r = T.rings[i]; if (r.x + r.r < vl || r.x - r.r > vr) continue;
      var rx = r.r * 0.34, ry = r.r;
      g.save(); g.translate(r.x, r.y);
      if (r.got) g.globalAlpha = 0.18;
      var fl = 1 + 0.08 * Math.sin(t * 14 + i);
      g.lineWidth = 14 * fl; g.strokeStyle = front ? '#ffb020' : '#b4410f';
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, front ? -Math.PI / 2 : Math.PI / 2, front ? Math.PI / 2 : Math.PI * 1.5); g.stroke();
      g.lineWidth = 5; g.strokeStyle = front ? '#fff3b0' : '#ff7a2d';
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, front ? -Math.PI / 2 : Math.PI / 2, front ? Math.PI / 2 : Math.PI * 1.5); g.stroke();
      if (front && !r.got && Math.random() < 0.5) { var an = rnd(-Math.PI / 2, Math.PI / 2); spawn(r.x + Math.cos(an) * rx, r.y + Math.sin(an) * ry, rnd(-30, 30), rnd(-90, -30), rnd(0.2, 0.45), rnd(4, 9), '#ff9a3c', -0.05, true); }
      g.restore();
    }
  }
  function drawGhost(t) {
    var gh = S.ghost; if (!gh || S.dead) return;
    var f = S.t * 30, i = Math.floor(f), k = f - i;
    if ((i + 1) * 3 + 2 >= gh.length) return;
    var x = gh[i * 3] + (gh[i * 3 + 3] - gh[i * 3]) * k, y = gh[i * 3 + 1] + (gh[i * 3 + 4] - gh[i * 3 + 1]) * k, a = (gh[i * 3 + 2] + (gh[i * 3 + 5] - gh[i * 3 + 2]) * k) / 100;
    g.save(); g.globalAlpha = 0.32;
    VX.drawVehicle(g, { vk: V.key, x: x, y: y, a: a, wheels: [{ dist: R - 10, spin: S.t * 20 }, { dist: R - 10, spin: S.t * 20 }] }, save.color, false, t, CAR_COLORS);
    g.globalAlpha = 0.7; g.fillStyle = '#c4b5fd'; g.font = '900 14px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('RECORD', x, y - (V.key === 'truck' ? 150 : 110));
    g.restore();
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
      } else if (k === 'tnt') {
        g.fillStyle = F('#d1123f'); g.fillRect(-w / 2 + 8, -o.h, w - 16, o.h - 2);
        g.fillStyle = F('#12052e'); g.fillRect(-w / 2 + 8, -o.h, w - 16, 4); g.fillRect(-w / 2 + 8, -6, w - 16, 4);
        g.fillStyle = F('#ffe14d'); g.fillRect(-w / 2 + 8, -o.h * 0.66, w - 16, 12);
        g.fillStyle = F('#12052e'); g.font = '900 11px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TNT', 0, -o.h * 0.66 + 6);
        if (!back) { g.strokeStyle = '#ffe14d'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -o.h); g.quadraticCurveTo(8, -o.h - 10, 4, -o.h - 16); g.stroke(); g.fillStyle = Math.random() < 0.5 ? '#fff' : '#ff9a3c'; g.beginPath(); g.arc(4, -o.h - 17, 3, 0, TAU); g.fill(); }
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
    drawSprings(T, vl, vr, t);
    drawFlags(T, vl, vr, t);
    for (var i = 0; i < T.cars.length; i++) { var o = T.cars[i]; if (o.x + o.w > vl && o.x - o.w < vr) drawObstacle(o, T); }
    drawCoins(T, vl, vr, t);
    drawNitros(T, vl, vr, t);
    drawRings(T, vl, vr, t, false);
    drawParts(false);
    drawGhost(t);
    if (!S.dead) {
      var cgh = getH(S.car.x), calt = Math.max(0, cgh - S.car.y);
      g.save(); g.translate(S.car.x, cgh + 12); g.rotate(Math.atan2(getH(S.car.x + 30) - getH(S.car.x - 30), 60));
      g.globalAlpha = clamp(0.38 - calt / 900, 0.06, 0.38); g.fillStyle = '#000';
      g.beginPath(); g.ellipse(0, 0, V.WB + 62, 14, 0, 0, TAU); g.fill(); g.restore();
      VX.drawVehicle(g, S.car, save.color, S.car.boosting, t, CAR_COLORS);
    } else drawPieces();
    drawRings(T, vl, vr, t, true);
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
    var ny = m + (S.combo > 1 ? 96 : 62) * u, sw = 22 * u, shh = 32 * u;
    for (var ci = 0; ci < MAX_CHARGES; ci++) {
      var cx0 = m + ci * (sw + 8 * u), full = ci < car.charges;
      g.fillStyle = 'rgba(18,5,46,0.7)'; g.fillRect(cx0, ny, sw, shh);
      if (full) { var cg = g.createLinearGradient(0, ny, 0, ny + shh); cg.addColorStop(0, '#7dffff'); cg.addColorStop(1, '#ff2e97'); g.fillStyle = cg; g.fillRect(cx0 + 3, ny + 3, sw - 6, shh - 6); }
      g.strokeStyle = full ? '#00e5ff' : 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.strokeRect(cx0, ny, sw, shh);
      g.fillStyle = full ? '#00e5ff' : 'rgba(255,255,255,0.35)'; g.fillRect(cx0 + sw * 0.3, ny - 5 * u, sw * 0.4, 5 * u);
    }
    var nlx = m + MAX_CHARGES * (sw + 8 * u) + 4 * u;
    txt('NITRO', nlx, ny + 10 * u, 13 * u, '#00e5ff');
    if (car.boostT > 0) {
      g.fillStyle = 'rgba(18,5,46,0.7)'; g.fillRect(nlx, ny + 20 * u, 110 * u, 8 * u);
      g.fillStyle = '#ffe14d'; g.fillRect(nlx, ny + 20 * u, 110 * u * car.boostT / BOOST_DUR, 8 * u);
    } else txt(car.charges > 0 ? 'ESPACE / CLIC' : 'trouve un bidon', nlx, ny + 25 * u, 10 * u, car.charges > 0 ? '#c4b5fd' : '#ff7a9c');
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
      txt('↑ gaz   ↓ frein   ← → rotation en l\'air   ESPACE / clic boost nitro   R recommencer', W / 2, H - 28 * u, 15 * u, '#fff', 'center');
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
  function worldStars(w) { var n = 0, P = LV.PER_WORLD; for (var i = 0; i < P; i++) n += save.stars[w * P + i + 1] || 0; return n; }
  function totalStars() { var n = 0; Object.keys(save.stars).forEach(function (k) { n += save.stars[k] || 0; }); return n; }

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
        '<span class="bl">' + w.blurb + '</span><span class="stc">' + (locked ? 'VERROUILLÉ' : '★ ' + st + ' / ' + (LV.PER_WORLD * 3)) + '</span></span>';
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
        (save.best[lv.id] ? '<span class="b">' + save.best[lv.id] + ' pts' + (save.time[lv.id] ? ' · ' + save.time[lv.id].toFixed(1) + ' s' : '') + '</span>' : '');
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

  function bankRun(finished) {
    var st = S.stats, T = save.tot;
    T.flips += st.flips; T.crush += st.crushed; T.rings += st.rings; T.coins += st.coins;
    T.maxMult = Math.max(T.maxMult, S.maxMult); T.bestAir = Math.max(T.bestAir, st.bestAir);
    var earned = st.coins * 10 + (finished ? Math.floor(S.score / 20) : 0);
    return earned;
  }

  function showResult() {
    state = 'result'; SND.silence(); UI.hud(false);
    var def = S.def, earned = bankRun(true), title, kick;
    if (S.daily) {
      var first = !save.daily[def.daily];
      save.daily[def.daily] = Math.max(save.daily[def.daily] || 0, S.score);
      if (first) { earned += 300; save.tot.daily++; }
      title = 'DÉFI RELEVÉ !'; kick = 'DÉFI DU JOUR · ' + def.daily;
    } else {
      var id = def.id, prev = save.stars[id] || 0;
      save.stars[id] = Math.max(prev, S.starsEarned);
      earned += Math.max(0, S.starsEarned - prev) * 100;
      save.best[id] = Math.max(save.best[id] || 0, S.score);
      if (!save.time[id] || S.t < save.time[id]) {
        save.time[id] = Math.round(S.t * 10) / 10;
        try { localStorage.setItem(ghostKey(id), JSON.stringify(S.rec)); } catch (e) { /* stockage plein : pas de fantôme */ }
      }
      var lastLvl0 = S.idx >= LV.levels.length - 1, endWorld0 = def.li === LV.PER_WORLD - 1;
      title = lastLvl0 ? 'CHAMPION DU MONSTER V8 !' : endWorld0 ? 'MONDE TERMINÉ' : 'PARCOURS RÉUSSI';
      kick = 'MONDE ' + LV.worlds[def.world].id + ' · ' + def.name;
    }
    save.credits += earned;
    persist();
    var lastLvl = S.daily || S.idx >= LV.levels.length - 1, endWorld = !S.daily && def.li === LV.PER_WORLD - 1;
    document.getElementById('res-kick').textContent = kick;
    document.getElementById('res-title').textContent = title;
    document.getElementById('res-stars').textContent = starStr(S.starsEarned);
    document.getElementById('res-score').textContent = S.score;
    document.getElementById('res-goal').textContent = '★★ ' + def.stars[0] + '   ·   ★★★ ' + def.stars[1] + (!S.daily && save.time[def.id] ? '   ·   record ' + save.time[def.id].toFixed(1) + ' s' : '');
    document.getElementById('res-credits').textContent = '+' + earned + ' crédits';
    document.getElementById('res-stats').innerHTML =
      '<li><b>' + S.t.toFixed(1) + ' s</b>temps (bonus +' + S.timeBonus + ')</li>' +
      '<li><b>' + S.stats.crushed + '</b>écrasés</li>' +
      '<li><b>' + S.stats.flips + '</b>flips · <b class="inl">' + S.stats.rings + '</b> anneaux</li>' +
      '<li><b>' + S.stats.bestAir.toFixed(1) + ' s</b>plus long saut</li>';
    var nb = document.getElementById('btn-next');
    nb.style.display = lastLvl ? 'none' : '';
    nb.textContent = endWorld ? 'Monde suivant ▶' : 'Parcours suivant ▶';
    UI.show('screen-result');
    checkTrophies();
  }

  function showDefeat() {
    state = 'defeat'; SND.silence(); UI.hud(false);
    var earned = bankRun(false);
    save.tot.booms++; save.credits += earned; persist();
    var pc = Math.round(clamp(S.car.x / S.T.finish, 0, 1) * 100);
    document.getElementById('def-reason').textContent = S.reason + ' · ' + pc + '% du parcours';
    document.getElementById('def-credits').textContent = earned ? '+' + earned + ' crédits (pièces ramassées)' : '';
    var fk = S.daily ? 'daily' : S.idx;
    fails[fk] = (fails[fk] || 0) + 1;
    var skip = document.getElementById('btn-def-skip');
    skip.classList.toggle('hidden', !(!S.daily && fails[fk] >= 3 && S.idx < LV.levels.length - 1));
    UI.show('screen-defeat');
    checkTrophies();
  }

  // ---------------------------------------------------------------- trophées
  function worldDone(w) { for (var i = 0; i < LV.PER_WORLD; i++) if (!save.stars[w * LV.PER_WORLD + i + 1]) return false; return true; }
  function anyUpg(max) { return Object.keys(save.upg).some(function (k) { var u = save.upg[k]; return max ? UPG.every(function (x) { return u[x.k] >= UPG_COST.length; }) : UPG.some(function (x) { return u[x.k] > 0; }); }); }
  var TROPHIES = [
    { k: 'flip1', n: 'Premier flip', d: 'Réussir un flip et retomber sur les roues', r: 100, ok: function () { return save.tot.flips >= 1; } },
    { k: 'flip25', n: 'Acrobate', d: '25 flips au total', r: 500, ok: function () { return save.tot.flips >= 25; } },
    { k: 'crush50', n: 'Écraseur', d: 'Écraser 50 obstacles', r: 300, ok: function () { return save.tot.crush >= 50; } },
    { k: 'crush300', n: 'Compacteur', d: 'Écraser 300 obstacles', r: 900, ok: function () { return save.tot.crush >= 300; } },
    { k: 'rings10', n: 'Cerceaux de feu', d: 'Traverser 10 anneaux', r: 300, ok: function () { return save.tot.rings >= 10; } },
    { k: 'rings50', n: 'Cascadeur', d: 'Traverser 50 anneaux', r: 900, ok: function () { return save.tot.rings >= 50; } },
    { k: 'air3', n: 'Envol', d: 'Rester 3 s en l\'air', r: 400, ok: function () { return save.tot.bestAir >= 3; } },
    { k: 'combo5', n: 'Show maximal', d: 'Atteindre le combo x5', r: 400, ok: function () { return save.tot.maxMult >= 5; } },
    { k: 'coins500', n: 'Tirelire', d: 'Ramasser 500 pièces V8', r: 500, ok: function () { return save.tot.coins >= 500; } },
    { k: 'w1', n: 'Roi d\'Ocean Drive', d: 'Terminer les 10 parcours à moto', r: 800, ok: function () { return worldDone(0); } },
    { k: 'w2', n: 'Roi de la casse', d: 'Terminer les 10 parcours en monster truck', r: 800, ok: function () { return worldDone(1); } },
    { k: 'w3', n: 'Roi du touge', d: 'Terminer les 10 parcours en Civic', r: 800, ok: function () { return worldDone(2); } },
    { k: 'w4', n: 'Roi de la route', d: 'Terminer les 10 parcours en camion', r: 800, ok: function () { return worldDone(3); } },
    { k: 'stars60', n: 'Collectionneur', d: '60 étoiles', r: 1000, ok: function () { return totalStars() >= 60; } },
    { k: 'stars120', n: 'Perfection', d: 'Les 120 étoiles', r: 3000, ok: function () { return totalStars() >= 120; } },
    { k: 'daily', n: 'Défi relevé', d: 'Terminer un défi du jour', r: 300, ok: function () { return save.tot.daily >= 1; } },
    { k: 'daily7', n: 'Habitué', d: 'Terminer 7 défis du jour', r: 1200, ok: function () { return save.tot.daily >= 7; } },
    { k: 'boom10', n: 'Pyrotechnicien', d: 'Exploser 10 fois (ça arrive)', r: 150, ok: function () { return save.tot.booms >= 10; } },
    { k: 'upg1', n: 'Mécano', d: 'Acheter une amélioration', r: 100, ok: function () { return anyUpg(false); } },
    { k: 'upgmax', n: 'Préparation ultime', d: 'Améliorer un véhicule au maximum', r: 1500, ok: function () { return anyUpg(true); } }
  ];
  var toastQ = [], toastOn = false;
  function toast(html) {
    toastQ.push(html);
    if (toastOn) return;
    var el = document.getElementById('toast');
    (function next() {
      if (!toastQ.length) { toastOn = false; el.classList.remove('on'); return; }
      toastOn = true; el.innerHTML = toastQ.shift(); el.classList.add('on');
      setTimeout(function () { el.classList.remove('on'); setTimeout(next, 350); }, 2600);
    })();
  }
  function checkTrophies() {
    var got = false;
    TROPHIES.forEach(function (tr) {
      if (save.troph[tr.k] || !tr.ok()) return;
      save.troph[tr.k] = 1; save.credits += tr.r; got = true;
      toast('<b>🏆 TROPHÉE</b> ' + tr.n + '<span>+' + tr.r + ' crédits</span>');
    });
    if (got) { SND.trophy(); persist(); }
    refreshCredits();
  }
  function buildTrophies() {
    var list = document.getElementById('troph-list'); list.innerHTML = '';
    var n = 0;
    TROPHIES.forEach(function (tr) {
      var ok = !!save.troph[tr.k]; if (ok) n++;
      var d = document.createElement('div'); d.className = 'troph' + (ok ? ' ok' : '');
      d.innerHTML = '<span class="ic">' + (ok ? '🏆' : '🔒') + '</span><span class="tx"><b>' + tr.n + '</b><span>' + tr.d + '</span></span><span class="rw">+' + tr.r + '</span>';
      list.appendChild(d);
    });
    document.getElementById('troph-count').textContent = n + ' / ' + TROPHIES.length;
  }

  // ---------------------------------------------------------------- garage
  var garVeh = 'monster', garFrom = 'menu';
  function refreshCredits() {
    var els = document.querySelectorAll('.credits-val');
    for (var i = 0; i < els.length; i++) els[i].textContent = save.credits;
  }
  function buildGarage() {
    refreshCredits();
    var tabs = document.getElementById('gar-tabs'); tabs.innerHTML = '';
    LV.worlds.forEach(function (w) {
      var b = document.createElement('button'); b.className = 'gtab' + (w.veh === garVeh ? ' sel' : ''); b.textContent = w.vehName;
      b.addEventListener('click', function () { SND.click(); garVeh = w.veh; buildGarage(); });
      tabs.appendChild(b);
    });
    var pv = document.getElementById('gar-prev'); pv.innerHTML = ''; pv.appendChild(previewCanvas(garVeh));
    var list = document.getElementById('gar-list'); list.innerHTML = '';
    var u = upgOf(garVeh);
    UPG.forEach(function (up) {
      var lvl = u[up.k], max = lvl >= UPG_COST.length, cost = max ? 0 : UPG_COST[lvl];
      var row = document.createElement('div'); row.className = 'gupg';
      var pips = ''; for (var i = 0; i < UPG_COST.length; i++) pips += '<i class="' + (i < lvl ? 'on' : '') + '"></i>';
      row.innerHTML = '<span class="gn"><b>' + up.n + '</b><span>' + up.d + '</span></span><span class="pips">' + pips + '</span>';
      var btn = document.createElement('button');
      btn.className = 'btn ' + (max ? 'ghost' : 'primary') + ' buy';
      btn.textContent = max ? 'MAX' : cost + ' cr';
      btn.disabled = max || save.credits < cost;
      btn.addEventListener('click', function () {
        if (max || save.credits < cost) return;
        save.credits -= cost; u[up.k] = lvl + 1; persist(); SND.buy();
        buildGarage(); checkTrophies();
      });
      row.appendChild(btn);
      list.appendChild(row);
    });
  }
  function openGarage(from, vk) { garFrom = from; if (vk) garVeh = vk; buildGarage(); UI.show('screen-garage'); }
  function refreshTitle() {
    refreshCredits();
    var dd = LV.daily(), best = save.daily[dd.daily];
    document.getElementById('btn-daily').innerHTML = '★ Défi du jour <small>' + VEH[dd.veh].name + (best ? ' · record ' + best : '') + '</small>';
  }

  function bind(id, fn) { document.getElementById(id).addEventListener('click', function () { SND.init(); SND.click(); fn(); }); }
  bind('btn-play', function () { buildWorlds(); UI.show('screen-worlds'); });
  bind('btn-daily', function () { startLevel(-1, LV.daily()); });
  bind('btn-garage', function () { openGarage('menu'); });
  bind('btn-lv-garage', function () { openGarage('levels', LV.worlds[curWorld].veh); });
  bind('btn-garage-back', function () { if (garFrom === 'levels') { buildLevels(); UI.show('screen-levels'); } else { refreshTitle(); UI.show('screen-menu'); } });
  bind('btn-troph', function () { buildTrophies(); UI.show('screen-trophies'); });
  bind('btn-troph-back', function () { UI.show('screen-menu'); });
  bind('btn-help', function () { UI.show('screen-help'); });
  bind('btn-help-back', function () { refreshTitle(); UI.show('screen-menu'); });
  bind('btn-worlds-back', function () { refreshTitle(); UI.show('screen-menu'); });
  bind('btn-levels-back', function () { buildWorlds(); UI.show('screen-worlds'); });
  bind('btn-resume', resume);
  bind('btn-restart', restart);
  bind('btn-quit', function () { if (S.daily) { toMenu('menu'); refreshTitle(); } else { curWorld = S.def.world; toMenu('levels'); } });
  bind('btn-retry', restart);
  bind('btn-next', function () { startLevel(Math.min(S.idx + 1, LV.levels.length - 1)); });
  bind('btn-res-menu', function () { if (S.daily) { toMenu('menu'); refreshTitle(); } else { curWorld = S.def.world; toMenu('levels'); } });
  bind('btn-def-retry', restart);
  bind('btn-def-garage', function () { var vk = V.key; var w = S.daily ? -1 : S.def.world; if (w >= 0) curWorld = w; toMenu('menu'); openGarage(w >= 0 ? 'levels' : 'menu', vk); });
  bind('btn-def-menu', function () { if (S.daily) { toMenu('menu'); refreshTitle(); } else { curWorld = S.def.world; toMenu('levels'); } });
  bind('btn-def-skip', function () { var id = S.def.id; if (!save.skip) save.skip = {}; save.skip[id] = 1; persist(); startLevel(Math.min(S.idx + 1, LV.levels.length - 1)); });
  bind('pausebtn', pause);
  bind('btn-mute', toggleMute);
  bind('btn-full', toggleFS);
  document.getElementById('btn-mute').textContent = save.muted ? '🔇' : '🔊';

  // un clic / une touche sur l'écran de jeu déclenche le boost
  cv.addEventListener('pointerdown', function () { if (state === 'play' && S && !S.dead) S.boostReq = true; });
  var tb = document.querySelectorAll('#touch button');
  Array.prototype.forEach.call(tb, function (b) {
    var k = b.getAttribute('data-k');
    function on(e) { e.preventDefault(); touch[k] = true; b.classList.add('down'); SND.init(); if (k === 'boost' && state === 'play' && S) S.boostReq = true; }
    function off(e) { e.preventDefault(); touch[k] = false; b.classList.remove('down'); }
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  UI.show('screen-menu'); UI.hud(false);
  refreshTitle();
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
    unlockAll: function () { for (var i = 1; i <= LV.levels.length; i++) save.stars[i] = save.stars[i] || 1; },
    startDaily: function (key) { startLevel(-1, LV.daily(key)); },
    credits: function (n) { save.credits = n; refreshCredits(); }
  };
})();
