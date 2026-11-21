/* MONSTER V8 — moteur : physique arcade multi-véhicules, rendu 2.5D vaporwave, HUD, menus */
(function () {
  'use strict';
  var LV = window.MV8_LEVELS, SND = window.MV8_SND, VX = window.MV8_VEH;
  var VEH = VX.VEH, shade = VX.shade;
  var STEP = LV.STEP, TAU = Math.PI * 2;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
  var FONT = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';

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
    { n: 'Rouge course', a: '#c8102e', b: '#5e0714' },
    { n: 'Bleu Miami', a: '#1f86d6', b: '#0b2f5a' },
    { n: 'Jaune', a: '#f0b21a', b: '#7a4a05' },
    { n: 'Noir', a: '#2a2d33', b: '#08090b' },
    { n: 'Blanc nacré', a: '#eef0f3', b: '#8e96a3' },
    { n: 'Vert', a: '#2f8f4e', b: '#0b3a1c' }
  ]

  // ---------------------------------------------------------------- canvas / état global
  var cv = document.getElementById('c'), g = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1, DPR_CAP = 1.5, slowFrames = 0, perfAcc = 0, perfN = 0;
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
  if (save.q > 0) DPR_CAP = Math.max(0.75, Math.min(1.5, save.q)); resize();
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
  function banner(txt, col) { S.banner = { txt: txt, t: 0, col: col || '#ffd28a' }; }
  function tntBlast(o) {
    var car = S.car, gy = S.T.base(o.x);
    car.vy = Math.min(car.vy, -760); car.vx += 120; car.w += rnd(-1.2, 1.2);
    addScore(150, 'TNT', o.x, gy - 80, '#ff5a2e');
    S.shake = Math.max(S.shake, 24); S.flash = Math.max(S.flash, 0.35);
    for (var i = 0; i < 50; i++) { var an = rnd(Math.PI, TAU), sp = rnd(150, 800); spawn(o.x + rnd(-20, 20), gy - 20, Math.cos(an) * sp, Math.sin(an) * sp, rnd(0.4, 1), rnd(8, 24), i % 2 ? '#ffd28a' : '#ff5a2e', 0.15, true); }
    for (var j = 0; j < 14; j++) spawn(o.x, gy - 30, rnd(-160, 160), rnd(-300, -60), rnd(0.8, 1.6), rnd(14, 30), 'rgba(42,40,42,0.5)', -0.06);
    SND.tnt();
  }
  function crush(o) {
    o.crushed = true; S.stats.crushed++;
    if (o.k === 'tnt') { tntBlast(o); return; }
    var big = o.h > 80;
    addScore(big ? 200 : o.h < 46 ? 60 : 100, 'CRUSH', o.x, S.T.base(o.x) - o.h - 20, '#ffd28a');
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
    banner('BOOM !', '#e8403a');
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
        col: k % 3 === 0 ? col.b : k % 3 === 1 ? col.a : '#1d1f24', n: 3 + (k % 2)
      });
    }
    for (var f = 0; f < 90; f++) {
      var an = rnd(0, TAU), sp = rnd(80, 900);
      spawn(car.x + rnd(-40, 40), car.y + rnd(-60, 0), Math.cos(an) * sp, Math.sin(an) * sp - 160, rnd(0.4, 1.3), rnd(10, 34), f % 3 === 0 ? '#fff' : f % 3 === 1 ? '#ffd28a' : '#ff5a2e', 0.1, true);
    }
    for (var s2 = 0; s2 < 36; s2++) spawn(car.x + rnd(-60, 60), car.y + rnd(-80, 0), rnd(-200, 200), rnd(-420, -40), rnd(0.9, 2.1), rnd(14, 38), 'rgba(42,40,42,0.6)', -0.08);
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
    banner('ARRIVÉE !', '#c8ecd0');
    SND.fanfare();
    S.shake = 10;
    for (var i = 0; i < 80; i++) spawn(S.car.x + rnd(-300, 300), S.car.y - rnd(100, 500), rnd(-200, 200), rnd(-100, 300), rnd(1, 2), rnd(4, 8), ['#ff8a2b', '#ffd28a', '#8cc4ff', '#c8ecd0', '#fff'][i % 5], 0.2);
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
          popup('+50', co.x, co.y - 10, '#ffd28a', 0.8); SND.coin();
          for (var z = 0; z < 6; z++) spawn(co.x, co.y, rnd(-200, 200), rnd(-200, 200), 0.5, 4, '#ffd28a', 0, true);
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
          if (car.charges < MAX_CHARGES) { car.charges++; popup('+ NITRO', nt.x, nt.y - 30, '#8cc4ff', 1); S.score += 25; }
          else { popup('NITRO MAX +100', nt.x, nt.y - 30, '#8cc4ff', 0.9); S.score += 100; }
          SND.nitroPick();
          for (var nz = 0; nz < 14; nz++) spawn(nt.x, nt.y, rnd(-220, 220), rnd(-260, 120), rnd(0.4, 0.8), rnd(4, 8), nz % 2 ? '#8cc4ff' : '#ffffff', 0, true);
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
          for (var rz = 0; rz < 24; rz++) { var ra = rnd(0, TAU); spawn(rg.x + Math.cos(ra) * rg.r * 0.3, rg.y + Math.sin(ra) * rg.r, Math.cos(ra) * 160, Math.sin(ra) * 260, rnd(0.4, 0.8), rnd(5, 10), rz % 2 ? '#ffd28a' : '#ff5a2e', 0, true); }
        }
      }
      // tremplin à ressort déclenché
      if (S.springHit) {
        var shx = S.springHit; S.springHit = 0; SND.spring(); popup('BOING !', shx, T.base(shx) - 60, '#c8ecd0', 1);
        for (var sz2 = 0; sz2 < 16; sz2++) spawn(shx + rnd(-60, 60), T.base(shx) - 6, rnd(-120, 120), rnd(-500, -150), rnd(0.3, 0.7), rnd(4, 9), sz2 % 2 ? '#d8d2c4' : '#b8ae9a', 0.4, true);
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
          explode(pit.kind === 'water' ? 'Tombé à l\'eau' : pit.kind === 'void' ? 'Tombé dans le vide' : pit.kind === 'canyon' ? 'Tombé dans le canyon' : 'Tombé dans le brasier');
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
    if (!S.dead) updateEngine(inp, dt);
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
      if (Math.random() < dt * 14) spawn(p.x, p.y, rnd(-30, 30), rnd(-60, -10), rnd(0.5, 1.1), rnd(6, 14), Math.random() < 0.5 ? 'rgba(42,40,42,0.5)' : '#ff8a2e', -0.05, false);
    }
  }

  function awardStunt(P) {
    var car = S.car, pts = Math.round(P.air * 90), label = 'AIR ' + P.air.toFixed(1) + 's';
    if (P.flips > 0) {
      pts += P.flips * 600 + (P.flips - 1) * 400;
      S.stats.flips += P.flips;
      label = (P.dir < 0 ? 'BACKFLIP' : 'FRONTFLIP') + (P.flips > 1 ? ' x' + P.flips : '');
    }
    if (P.air > 0.9 || P.flips) { addScore(pts, label, car.x, car.y - 140, '#ff9a3c'); banner(label, '#ffd28a'); SND.stunt(); }
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
      if (S.wheelie > 1.0) addScore(Math.round(S.wheelie * 120), 'WHEELIE', car.x, car.y - 140, '#8cc4ff');
      S.wheelie = 0;
    }
  }

  // ---- moteur : boîte de vitesses + rupteur, par véhicule
  // idle/red/lim : ralenti, zone rouge, rupteur (tr/min) · dial : graduation max du compte-tours (×1000)
  // k : vivacité de la montée en régime · hold : temps passé sur le rupteur avant de passer le rapport · cut : durée de coupure
  var ENG = {
    v8:     { idle: 900,  red: 6000, lim: 6500, dial: 8,  gears: 5, k: 8,  hold: 0.06, cut: 0.06,  drop: 350 },
    vtec:   { idle: 1000, red: 9000, lim: 9600, dial: 11, gears: 6, k: 17, hold: 0.34, cut: 0.045, drop: 520, vtec: 5800 },
    bike:   { idle: 1400, red: 13000, lim: 13800, dial: 16, gears: 6, k: 20, hold: 0.14, cut: 0.04, drop: 700 },
    diesel: { idle: 650,  red: 2100, lim: 2300, dial: 3,  gears: 8, k: 3.5, hold: 0.05, cut: 0.09, drop: 160 }
  };
  function updateEngine(inp, dt) {
    var car = S.car, E = ENG[V.engine] || ENG.v8;
    var thr = inp.gas ? 1 : 0, n = E.gears;
    if (car.gear == null) { car.gear = 0; car.cutT = 0; car.holdT = 0; car.limT = 9; }
    var sp = car.grounded ? Math.abs(car.gspeed) : Math.abs(car.vx) * 0.6;
    var gTop = function (gi) { return VMAX * 1.08 * Math.pow((gi + 1) / n, 0.8); };
    var wheelRpm = E.idle * 0.6 + (E.lim - E.idle * 0.6) * sp / gTop(car.gear);
    var target;
    if (car.grounded) {
      var slip = thr ? (car.gear === 0 ? 0.5 : 0.12) * (E.lim - E.idle) : 0;          // embrayage qui patine au départ
      target = Math.max(wheelRpm, E.idle + slip) + (thr ? E.lim * 0.06 : 0);
      if (wheelRpm >= E.lim * 0.985 && thr) {                                          // sur le rupteur : on tient avant de passer
        car.holdT += dt;
        if (car.holdT > E.hold && car.gear < n - 1) { car.gear++; car.holdT = 0; car.rpm *= gTop(car.gear - 1) / gTop(car.gear); car.cutT = 0; }
      } else car.holdT = 0;
      if (car.gear > 0 && wheelRpm * gTop(car.gear) / gTop(car.gear - 1) < E.red * 0.72) car.gear--;   // rétrograde
    } else target = thr ? E.lim * 1.08 : E.idle + 300;                                // en l'air : les roues tournent dans le vide
    if (car.cutT > 0) {                                                                // coupure d'injection : le régime chute
      car.cutT -= dt;
      car.rpm += (E.lim - E.drop - car.rpm) * (1 - Math.exp(-dt * 45));
    } else {
      car.rpm += (target - car.rpm) * (1 - Math.exp(-dt * (thr ? E.k : E.k * 0.6)));
      if (car.rpm >= E.lim) {
        car.rpm = E.lim;
        if (thr) { car.cutT = E.cut; car.limT = 0; limiterPop(E); }
      }
    }
    car.rpm = Math.max(E.idle * 0.8, car.rpm);
    car.limT += dt;
    if (state === 'play') SND.engine(car.rpm, thr, car.boosting, V.engine, car.cutT > 0);
  }
  // pétarade à l'échappement sur le rupteur
  function limiterPop(E) {
    var car = S.car;
    if (V.engine === 'diesel' || Math.random() > (V.engine === 'vtec' ? 0.75 : 0.45)) return;
    var ca = Math.cos(car.a), sa = Math.sin(car.a);
    var ex = car.x + V.exhaust[0] * ca - V.exhaust[1] * sa, ey = car.y + V.exhaust[0] * sa + V.exhaust[1] * ca;
    for (var f = 0; f < 3; f++) spawn(ex, ey, -ca * rnd(250, 520) + car.vx * 0.6, -sa * rnd(250, 520) + car.vy * 0.6 + rnd(-40, 40), rnd(0.06, 0.14), rnd(5, 10), f ? '#ffb020' : '#ffe2a0', 0, true);
    SND.pop();
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

  // ---------------------------------------------------------------- rendu réaliste : ressources pré-calculées
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgba(h, a) { var c = hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  // ambiances : ciel, astre, brume, matériaux du sol
  var SCN = {
    beach: { sky: [[0, '#16294f'], [0.42, '#5d5488'], [0.7, '#df8a60'], [0.88, '#f6c38c'], [1, '#fbdcae']], sun: { x: 0.7, y: 0.6, r: 0.06, c: '#fff4d6', glow: [255, 170, 100] }, haze: [246, 196, 150], far: '#7a6390', mid: '#4d3f66', body: 'sand', top: 'sandTop', grade: 'rgba(255,140,80,0.07)', stars: 0.15, cloud: ['#ffd2ae', '#8c6c96'] },
    junk: { sky: [[0, '#0b1229'], [0.45, '#262a52'], [0.78, '#94536b'], [1, '#d9875f']], sun: { x: 0.24, y: 0.66, r: 0.045, c: '#ffd7ad', glow: [255, 120, 80] }, haze: [170, 110, 130], far: '#2c2a46', mid: '#1b1a2c', body: 'dirt', top: 'dirtTop', grade: 'rgba(70,40,100,0.10)', stars: 0.5, cloud: ['#d08a86', '#3a3456'] },
    touge: { sky: [[0, '#02050d'], [0.55, '#0a1430'], [1, '#1b2a4c']], moon: { x: 0.78, y: 0.18, r: 0.032 }, haze: [60, 80, 130], far: '#141d35', mid: '#0b1222', body: 'rock', top: 'asphalt', grade: 'rgba(20,40,90,0.12)', stars: 1, cloud: ['#4a5878', '#121a30'] },
    desert: { sky: [[0, '#26406e'], [0.42, '#8478a0'], [0.72, '#ee9e62'], [1, '#ffd9a2']], sun: { x: 0.5, y: 0.6, r: 0.075, c: '#fff1cf', glow: [255, 150, 70] }, haze: [255, 196, 146], far: '#a26f70', mid: '#7c4a3f', body: 'earth', top: 'earthTop', grade: 'rgba(255,120,40,0.07)', stars: 0.1, cloud: ['#ffcf9e', '#9a6a80'] }
  };
  function scn(def) { return SCN[def.theme] || SCN.beach; }

  var TEX = {}, PAT = {};
  function makeTex(kind) {
    var N = 256, c = mkCanvas(N, N), x = c.getContext('2d'), r = rng(kind.length * 977 + 13);
    var base = { sand: '#c7a06c', sandTop: '#e0c596', dirt: '#5a4836', dirtTop: '#6d5842', rock: '#3a3a40', asphalt: '#45464c', earth: '#b0603a', earthTop: '#cf8f5f' }[kind];
    x.fillStyle = base; x.fillRect(0, 0, N, N);
    var i, n;
    function speck(cnt, sz, light, alpha) {
      for (i = 0; i < cnt; i++) {
        var v = light ? 255 : 0;
        x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (alpha * r()) + ')';
        var s = sz * (0.5 + r());
        x.fillRect(r() * N, r() * N, s, s);
      }
    }
    if (kind === 'sand' || kind === 'sandTop') {
      speck(5000, 1.3, true, 0.22); speck(5000, 1.3, false, 0.18);
      for (n = 0; n < 7; n++) { x.strokeStyle = 'rgba(120,80,40,0.07)'; x.lineWidth = 3; x.beginPath(); var y0 = r() * N; for (var xx = -10; xx <= N + 10; xx += 8) x.lineTo(xx, y0 + Math.sin(xx * 0.05 + n) * 4); x.stroke(); }
    } else if (kind === 'dirt' || kind === 'dirtTop') {
      speck(4000, 1.6, false, 0.3); speck(2500, 1.4, true, 0.12);
      for (n = 0; n < 90; n++) { var px = r() * N, py = r() * N, pr = 1.5 + r() * 4; x.fillStyle = 'rgba(30,22,15,0.45)'; x.beginPath(); x.ellipse(px, py + 1, pr, pr * 0.7, 0, 0, TAU); x.fill(); x.fillStyle = 'rgba(160,140,120,' + (0.25 + r() * 0.3) + ')'; x.beginPath(); x.ellipse(px - 0.5, py - 0.5, pr * 0.8, pr * 0.55, 0, 0, TAU); x.fill(); }
    } else if (kind === 'rock') {
      speck(3500, 1.8, false, 0.35); speck(2000, 1.2, true, 0.12);
      for (n = 0; n < 14; n++) { x.strokeStyle = 'rgba(0,0,0,' + (0.12 + r() * 0.15) + ')'; x.lineWidth = 1 + r() * 2; x.beginPath(); var yy = r() * N; for (var x2 = -10; x2 <= N + 10; x2 += 16) x.lineTo(x2, yy + (r() - 0.5) * 6); x.stroke(); }
    } else if (kind === 'asphalt') {
      speck(9000, 1.1, true, 0.16); speck(9000, 1.1, false, 0.22);
      for (n = 0; n < 6; n++) { x.strokeStyle = 'rgba(0,0,0,0.2)'; x.lineWidth = 1; x.beginPath(); var cx0 = r() * N, cy0 = r() * N; x.moveTo(cx0, cy0); for (var k = 0; k < 5; k++) { cx0 += (r() - 0.5) * 30; cy0 += (r() - 0.5) * 20; x.lineTo(cx0, cy0); } x.stroke(); }
    } else {
      speck(4500, 1.4, true, 0.16); speck(4500, 1.4, false, 0.2);
      for (n = 0; n < 24; n++) { x.strokeStyle = 'rgba(60,25,12,0.35)'; x.lineWidth = 1; x.beginPath(); var ex = r() * N, ey = r() * N; x.moveTo(ex, ey); for (var q = 0; q < 4; q++) { ex += (r() - 0.5) * 34; ey += (r() - 0.5) * 34; x.lineTo(ex, ey); } x.stroke(); }
    }
    // raccord des bords (léger flou de mosaïque)
    return c;
  }
  function pat(kind) {
    if (!PAT[kind]) { TEX[kind] = TEX[kind] || makeTex(kind); PAT[kind] = g.createPattern(TEX[kind], 'repeat'); }
    return PAT[kind];
  }

  // sprites doux (poussière, fumée, feu) mis en cache par couleur
  var SOFT = {};
  function soft(col) {
    var s = SOFT[col];
    if (s) return s;
    s = mkCanvas(64, 64); var x = s.getContext('2d');
    x.fillStyle = col; x.fillRect(0, 0, 64, 64);
    x.globalCompositeOperation = 'destination-in';
    var gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    SOFT[col] = s;
    return s;
  }
  // nuages : amas de bouffées douces, éclairés par dessous
  var CLOUDS = {};
  function cloudSprite(key, lit, shadow) {
    if (CLOUDS[key]) return CLOUDS[key];
    var w = 520, h = 170, c = mkCanvas(w, h), x = c.getContext('2d'), r = rng(key.length * 31 + 7);
    for (var i = 0; i < 46; i++) {
      var px = 60 + r() * (w - 120), py = 70 + Math.sin((px / w) * Math.PI) * -30 + r() * 40, pr = 26 + r() * 46;
      x.save(); x.translate(px, py); x.scale(2.4, 0.55);
      var gr = x.createRadialGradient(0, -pr * 0.25, pr * 0.1, 0, 0, pr);
      gr.addColorStop(0, rgba(lit, 0.32)); gr.addColorStop(0.55, rgba(shadow, 0.18)); gr.addColorStop(1, rgba(shadow, 0));
      x.fillStyle = gr; x.beginPath(); x.arc(0, 0, pr, 0, TAU); x.fill(); x.restore();
    }
    CLOUDS[key] = c;
    return c;
  }

  // ---------------------------------------------------------------- décors
  function noise(x) { return Math.sin(x * 0.0041) * 0.5 + Math.sin(x * 0.0113 + 1.3) * 0.3 + Math.sin(x * 0.0271 + 4) * 0.2; }
  // relief lointain avec perspective atmosphérique (brume en bas)
  function ridge(cam, par, yFrac, amp, col, freq, mesa, hz, hzA) {
    var ox = cam.x * par * cam.s, yb = H * yFrac;
    g.beginPath(); g.moveTo(0, H);
    var top = H;
    for (var sx = 0; sx <= W + 24; sx += 24) {
      var wx = (sx + ox) / (freq || 1);
      var nv = noise(wx) * 0.5 + 0.5;
      if (mesa) nv = nv > 0.55 ? 0.95 : nv > 0.4 ? 0.45 + (nv - 0.4) * 0.6 : 0.3;
      var y = yb - amp * nv * H; if (y < top) top = y;
      g.lineTo(sx, y);
    }
    g.lineTo(W, H); g.closePath();
    var gr = g.createLinearGradient(0, top, 0, yb + H * 0.05);
    gr.addColorStop(0, col); gr.addColorStop(1, hz ? 'rgba(' + hz[0] + ',' + hz[1] + ',' + hz[2] + ',' + (hzA || 0.55) + ')' : col);
    g.fillStyle = col; g.fill();
    g.fillStyle = gr; g.fill();
  }
  function stars(n, t, alpha) {
    if (alpha <= 0) return;
    for (var i = 0; i < n; i++) { var a = alpha * (0.3 + 0.7 * Math.abs(Math.sin(t * 0.5 + i * 1.7))) * (1 - hash(i + 9) * 0.6); g.fillStyle = 'rgba(255,255,255,' + a + ')'; var s = hash(i * 3.1) > 0.92 ? 2 : 1.2; g.fillRect(hash(i + 3) * W, hash(i + 9) * H * 0.55, s, s); }
  }
  function drawPalm(x, y, s, col, seed) {
    seed = seed || 1;
    g.save(); g.translate(x, y); g.scale(s, s);
    var lean = (hash(seed) - 0.3) * 40;
    g.strokeStyle = col; g.lineCap = 'round';
    for (var k = 0; k < 9; k++) { var t0 = k / 9, t1 = (k + 1) / 9; g.lineWidth = 11 - k * 0.6; g.beginPath(); g.moveTo(lean * t0 * t0, -160 * t0); g.lineTo(lean * t1 * t1, -160 * t1); g.stroke(); }
    var tx = lean, ty = -160;
    g.fillStyle = col; g.strokeStyle = col;
    for (var f = 0; f < 9; f++) {
      var an = -Math.PI + (f / 8) * Math.PI + (hash(seed + f) - 0.5) * 0.4, len = 70 + hash(seed * 3 + f) * 35;
      var ex = tx + Math.cos(an) * len, ey = ty + Math.sin(an) * len * 0.55 + len * 0.35;
      var mx = tx + Math.cos(an) * len * 0.5, my = ty + Math.sin(an) * len * 0.5 - 12;
      g.lineWidth = 3; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      for (var l = 1; l < 9; l++) {
        var u = l / 9, bx = (1 - u) * (1 - u) * tx + 2 * (1 - u) * u * mx + u * u * ex, by = (1 - u) * (1 - u) * ty + 2 * (1 - u) * u * my + u * u * ey;
        g.lineWidth = 2; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(an + 1.2) * 14 * (1 - u * 0.5), by + 10); g.moveTo(bx, by); g.lineTo(bx + Math.cos(an - 1.2) * 14 * (1 - u * 0.5), by + 12); g.stroke();
      }
    }
    g.beginPath(); g.arc(tx, ty + 4, 7, 0, TAU); g.fill();
    g.restore();
  }
  function decoSkyline(cam, par, yFrac, night) {
    var ox = cam.x * par * cam.s, base = H * yFrac;
    for (var sx = -((ox % 64) + 64); sx < W + 64; sx += 64) {
      var idx = Math.floor((sx + ox) / 64), bh = (0.05 + hash(idx) * 0.16) * H, bw = 44 + hash(idx + 2) * 16;
      var col = ['#f2c7b6', '#cfe2e0', '#f7e1b7', '#e7b9c8', '#d9d2ea'][Math.floor(hash(idx + 5) * 5)];
      var gr = g.createLinearGradient(sx, 0, sx + bw, 0);
      gr.addColorStop(0, rgba(col, night ? 0.25 : 0.55)); gr.addColorStop(1, rgba('#6b567e', 0.8));
      g.fillStyle = gr; g.fillRect(sx, base - bh, bw, bh + 4);
      g.fillStyle = 'rgba(80,60,100,0.35)'; g.fillRect(sx, base - bh, bw, 3);
      if (hash(idx + 8) > 0.5) { g.fillStyle = rgba(col, 0.5); g.fillRect(sx + bw * 0.35, base - bh - 10, bw * 0.3, 10); }
      for (var wy = base - bh + 8; wy < base - 6; wy += 9) for (var wx = sx + 5; wx < sx + bw - 5; wx += 8) if (hash(idx * 13 + wx * 0.7 + wy) > 0.72) { g.fillStyle = 'rgba(255,214,150,' + (0.35 + hash(wx + wy) * 0.4) + ')'; g.fillRect(wx, wy, 3, 4); }
    }
  }
  function junkPiles(cam, par, yFrac, col, rim) {
    var ox = cam.x * par * cam.s, base = H * yFrac;
    for (var sx = -((ox % 140) + 140); sx < W + 140; sx += 140) {
      var idx = Math.floor((sx + ox) / 140), bh = (0.05 + hash(idx) * 0.12) * H;
      g.fillStyle = col;
      g.beginPath(); g.moveTo(sx - 30, base + 4);
      for (var k = 0; k <= 10; k++) { var xx = sx - 30 + k * 20, yy = base - bh * Math.sin(Math.PI * k / 10) - (hash(idx * 7 + k) - 0.5) * 18; g.lineTo(xx, yy); }
      g.lineTo(sx + 170, base + 4); g.fill();
      g.strokeStyle = rim; g.lineWidth = 1.5; g.beginPath();
      for (var k2 = 1; k2 < 10; k2++) { var x3 = sx - 30 + k2 * 20, y3 = base - bh * Math.sin(Math.PI * k2 / 10) - (hash(idx * 7 + k2) - 0.5) * 18; if (k2 === 1) g.moveTo(x3, y3); else g.lineTo(x3, y3); }
      g.stroke();
      if (hash(idx + 5) > 0.72) {     // grue en treillis
        g.strokeStyle = col; g.lineWidth = 3; var cx = sx + 60, ty = base - bh - 150;
        g.beginPath(); g.moveTo(cx, base); g.lineTo(cx, ty); g.lineTo(cx + 120, ty + 10); g.moveTo(cx - 30, ty + 6); g.lineTo(cx, ty); g.stroke();
        g.lineWidth = 1; g.beginPath(); for (var yy2 = base; yy2 > ty; yy2 -= 14) { g.moveTo(cx - 5, yy2); g.lineTo(cx + 5, yy2 - 14); } g.stroke();
        g.beginPath(); g.moveTo(cx + 110, ty + 9); g.lineTo(cx + 110, ty + 60); g.stroke();
      }
      if (hash(idx + 9) > 0.8) {      // projecteur
        var lx = sx + 110, ly = base - 170;
        g.fillStyle = col; g.fillRect(lx - 2, ly, 4, 170);
        var lg = g.createRadialGradient(lx, ly, 1, lx, ly, 26); lg.addColorStop(0, 'rgba(255,244,215,0.85)'); lg.addColorStop(1, 'rgba(255,240,200,0)');
        g.fillStyle = lg; g.fillRect(lx - 26, ly - 26, 52, 52);
      }
    }
  }
  function valleyLights(cam, par, yFrac, t) {
    var ox = cam.x * par * cam.s, base = H * yFrac;
    var P = 2600;   // motif répété en coordonnées monde (stable quand la couche est redessinée)
    for (var i = 0; i < 160; i++) {
      var x0 = ((hash(i) * P - ox) % P + P) % P - 20;
      var y = base - hash(i + 40) * H * 0.05;
      var a = 0.35 + 0.5 * Math.abs(Math.sin(t * 0.7 + i));
      for (var x = x0; x < W + 20; x += P) {
        g.drawImage(soft(hash(i + 3) > 0.5 ? '#ffd28a' : '#cfe0ff'), x - 4, y - 4, 8, 8);
        g.fillStyle = 'rgba(255,240,210,' + a + ')'; g.fillRect(x - 0.6, y - 0.6, 1.4, 1.4);
      }
    }
  }
  function pines(cam, par, yFrac, col) {
    var ox = cam.x * par * cam.s, base = H * yFrac;
    g.fillStyle = col;
    for (var sx = -((ox % 38) + 38); sx < W + 38; sx += 38) {
      var idx = Math.floor((sx + ox) / 38), h = (0.04 + hash(idx) * 0.06) * H, x = sx + hash(idx + 1) * 20;
      g.beginPath(); g.moveTo(x - h * 0.22, base); g.lineTo(x, base - h); g.lineTo(x + h * 0.22, base); g.fill();
    }
    g.fillRect(0, base, W, H);
  }
  function saguaros(cam, par, yFrac, col) {
    var ox = cam.x * par * cam.s, base = H * yFrac;
    g.fillStyle = col;
    for (var sx = -((ox % 170) + 170); sx < W + 170; sx += 170) {
      var idx = Math.floor((sx + ox) / 170); if (hash(idx * 2.3) < 0.45) continue;
      var h = (0.05 + hash(idx) * 0.05) * H, x = sx + hash(idx + 4) * 80, w = h * 0.12;
      g.beginPath(); g.moveTo(x - w, base); g.lineTo(x - w, base - h + w); g.arc(x, base - h + w, w, Math.PI, 0); g.lineTo(x + w, base); g.fill();
      g.fillRect(x - w * 3, base - h * 0.55, w * 3, w * 0.9); g.fillRect(x - w * 3, base - h * 0.85, w * 0.9, h * 0.32);
      g.fillRect(x + w, base - h * 0.45, w * 2.6, w * 0.9); g.fillRect(x + w * 2.7, base - h * 0.72, w * 0.9, h * 0.28);
    }
  }

  function drawSky(sc, cam, t) {
    var gr = g.createLinearGradient(0, 0, 0, H);
    sc.sky.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    stars(120, t, sc.stars);
    var r = Math.min(W, H), ox = cam.x * 0.02 * cam.s;
    if (sc.sun) {
      var sx = W * sc.sun.x - ox * 0.5, sy = H * sc.sun.y, sr = r * sc.sun.r, gl = sc.sun.glow;
      var halo = g.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 9);
      halo.addColorStop(0, 'rgba(' + gl + ',0.55)'); halo.addColorStop(0.25, 'rgba(' + gl + ',0.18)'); halo.addColorStop(1, 'rgba(' + gl + ',0)');
      g.fillStyle = halo; g.fillRect(0, 0, W, H);
      var disc = g.createRadialGradient(sx, sy - sr * 0.2, sr * 0.1, sx, sy, sr);
      disc.addColorStop(0, '#ffffff'); disc.addColorStop(0.6, sc.sun.c); disc.addColorStop(1, 'rgba(' + gl + ',0.9)');
      g.fillStyle = disc; g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
    }
    if (sc.moon) {
      var mx = W * sc.moon.x - ox * 0.3, my = H * sc.moon.y, mr = r * sc.moon.r;
      var mh = g.createRadialGradient(mx, my, mr, mx, my, mr * 7); mh.addColorStop(0, 'rgba(190,205,255,0.32)'); mh.addColorStop(1, 'rgba(190,205,255,0)');
      g.fillStyle = mh; g.fillRect(0, 0, W, H);
      var md = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      md.addColorStop(0, '#fbfbf5'); md.addColorStop(1, '#c9ccd6');
      g.fillStyle = md; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.fillStyle = 'rgba(120,125,140,0.25)';
      [[0.3, -0.2, 0.22], [-0.25, 0.25, 0.16], [0.1, 0.4, 0.12]].forEach(function (c) { g.beginPath(); g.arc(mx + c[0] * mr, my + c[1] * mr, c[2] * mr, 0, TAU); g.fill(); });
    }
    // nuages
    var cs = cloudSprite(sc.cloud[0] + sc.cloud[1], sc.cloud[0], sc.cloud[1]);
    for (var i = 0; i < 5; i++) {
      var cw = W * (0.35 + hash(i + 2) * 0.3), chh = cw * 0.32;
      var cx = ((hash(i) * W * 1.6 - cam.x * 0.012 * cam.s - t * (3 + i)) % (W * 1.6) + W * 1.6) % (W * 1.6) - cw * 0.5;
      g.globalAlpha = 0.75; g.drawImage(cs, cx, H * (0.08 + hash(i + 7) * 0.28), cw, chh); g.globalAlpha = 1;
    }
  }

  // ---- caches de décor : les couches lointaines sont rendues une fois dans des canevas hors écran,
  // puis simplement décalées (parallaxe) ; on ne les redessine que lorsqu'elles ont trop glissé.
  var BG = { key: '', layers: {} }, BG_M = 320;
  function bgRes() { return Math.min(DPR, 1.25); }
  function withCtx(ctx, w, fn) {     // exécute fn en dessinant dans ctx, avec une largeur logique w
    var og = g, oW = W; g = ctx; W = w;
    try { fn(); } finally { g = og; W = oW; }
  }
  function staticLayer(name, key, fn, op) {   // couche fixe à l'écran (ciel, mer, voiles)
    var L = BG.layers[name];
    if (!L || L.key !== key) {
      var r = bgRes(), c = (L && L.c) || mkCanvas(1, 1);
      c.width = Math.ceil(W * r); c.height = Math.ceil(H * r);
      var x = c.getContext('2d'); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, W, H);
      withCtx(x, W, fn);
      L = BG.layers[name] = { c: c, key: key };
    }
    if (op) g.globalCompositeOperation = op;
    g.drawImage(L.c, 0, 0, W, H);
    if (op) g.globalCompositeOperation = 'source-over';
  }
  function parLayer(name, key, par, cam, fn) {   // couche en parallaxe : fn(fakeCam) dessine pour un décalage donné
    var ox = cam.x * par * cam.s, L = BG.layers[name];
    if (!L || L.key !== key || Math.abs(ox - L.ox) > BG_M * 0.85) {
      var r = bgRes(), c = (L && L.c) || mkCanvas(1, 1), w = W + BG_M * 2;
      c.width = Math.ceil(w * r); c.height = Math.ceil(H * r);
      var x = c.getContext('2d'); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, H);
      var ox0 = ox - BG_M;
      withCtx(x, w, function () { fn({ x: ox0 / par, s: 1 }); });
      L = BG.layers[name] = { c: c, key: key, ox: ox };
    }
    var rr = L.c.width / (W + BG_M * 2);   // on ne copie que la partie visible
    g.drawImage(L.c, (BG_M - (L.ox - ox)) * rr, 0, W * rr, L.c.height, 0, 0, W, H);
  }

  function hazeVeil(hz) {   // voile de brume à l'horizon (uniforme horizontalement : on peut le cuire dans une couche)
    var hzG = g.createLinearGradient(0, H * 0.5, 0, H * 0.9);
    hzG.addColorStop(0, 'rgba(' + hz + ',0)'); hzG.addColorStop(0.6, 'rgba(' + hz + ',0.12)'); hzG.addColorStop(1, 'rgba(' + hz + ',0)');
    g.fillStyle = hzG; g.fillRect(0, H * 0.5, W, H * 0.4);
  }
  function drawBackdrop(def, cam, t) {
    var sc = scn(def), th = def.theme, hz = sc.haze;
    var key = th + '|' + W + 'x' + H + '|' + bgRes();
    staticLayer('sky', key, function () {
      var gr = g.createLinearGradient(0, 0, 0, H);
      sc.sky.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      stars(120, 0.6, sc.stars);
      var r = Math.min(W, H);
      if (sc.sun) {
        var sx = W * sc.sun.x, sy = H * sc.sun.y, sr = r * sc.sun.r, gl = sc.sun.glow;
        var halo = g.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 9);
        halo.addColorStop(0, 'rgba(' + gl + ',0.55)'); halo.addColorStop(0.25, 'rgba(' + gl + ',0.18)'); halo.addColorStop(1, 'rgba(' + gl + ',0)');
        g.fillStyle = halo; g.fillRect(0, 0, W, H);
        var disc = g.createRadialGradient(sx, sy - sr * 0.2, sr * 0.1, sx, sy, sr);
        disc.addColorStop(0, '#ffffff'); disc.addColorStop(0.6, sc.sun.c); disc.addColorStop(1, 'rgba(' + gl + ',0.9)');
        g.fillStyle = disc; g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
      }
      if (sc.moon) {
        var mx = W * sc.moon.x, my = H * sc.moon.y, mr = r * sc.moon.r;
        var mh = g.createRadialGradient(mx, my, mr, mx, my, mr * 7); mh.addColorStop(0, 'rgba(190,205,255,0.32)'); mh.addColorStop(1, 'rgba(190,205,255,0)');
        g.fillStyle = mh; g.fillRect(0, 0, W, H);
        var md = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
        md.addColorStop(0, '#fbfbf5'); md.addColorStop(1, '#c9ccd6');
        g.fillStyle = md; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
        g.fillStyle = 'rgba(120,125,140,0.25)';
        [[0.3, -0.2, 0.22], [-0.25, 0.25, 0.16], [0.1, 0.4, 0.12]].forEach(function (c) { g.beginPath(); g.arc(mx + c[0] * mr, my + c[1] * mr, c[2] * mr, 0, TAU); g.fill(); });
      }
      if (th === 'beach') {          // mer (fixe à l'écran)
        var hy = H * 0.6, sea = g.createLinearGradient(0, hy, 0, H);
        sea.addColorStop(0, '#8a7aa0'); sea.addColorStop(0.12, '#3f5d87'); sea.addColorStop(1, '#10284a');
        g.fillStyle = sea; g.fillRect(0, hy, W, H - hy);
      }
    });
    // nuages (5 images, animés)
    var cs = cloudSprite(sc.cloud[0] + sc.cloud[1], sc.cloud[0], sc.cloud[1]);
    g.globalAlpha = 0.75;
    for (var i = 0; i < 5; i++) {
      var cw = W * (0.35 + hash(i + 2) * 0.3), chh = cw * 0.32;
      var cx = ((hash(i) * W * 1.6 - cam.x * 0.012 * cam.s - t * (3 + i)) % (W * 1.6) + W * 1.6) % (W * 1.6) - cw * 0.5;
      g.drawImage(cs, cx, H * (0.08 + hash(i + 7) * 0.28), cw, chh);
    }
    g.globalAlpha = 1;
    if (th === 'beach') {
      parLayer('b1', key, 0.04, cam, function (fc) { ridge(fc, 0.04, 0.6, 0.035, sc.far, 1, false, hz, 0.7); decoSkyline(fc, 0.04, 0.6, false); });
      var hy = H * 0.6, sxr = W * sc.sun.x;
      for (var k = 0; k < 40; k++) {    // reflet du soleil qui scintille
        var yy = hy + 3 + Math.pow(k / 40, 1.6) * (H - hy) * 0.8, ww = (8 + k * 2.4) * (0.5 + hash(k + Math.floor(t * 3)) * 0.8);
        g.fillStyle = 'rgba(255,214,160,' + (0.5 * (1 - k / 40)) + ')';
        g.fillRect(sxr - ww / 2 + (hash(k * 7 + Math.floor(t * 4)) - 0.5) * 30, yy, ww, 1.6);
      }
      parLayer('b2', key, 0.22, cam, function (fc) {
        var pox = fc.x * 0.22;
        for (var p = -1; p < W / 230 + 2; p++) { var idx = Math.floor((p * 230 + pox) / 230); if (hash(idx * 1.9) < 0.35) continue; drawPalm(p * 230 - (pox % 230) + hash(idx) * 90, H * 0.8, 0.85 + hash(idx + 4) * 0.5, '#1d1830', idx); }
        hazeVeil(hz);
      });
    } else if (th === 'junk') {
      parLayer('j1', key, 0.05, cam, function (fc) { ridge(fc, 0.05, 0.62, 0.1, sc.far, 1, false, hz, 0.6); junkPiles(fc, 0.05, 0.7, '#221f33', 'rgba(255,170,130,0.35)'); });
      parLayer('j2', key, 0.16, cam, function (fc) { junkPiles(fc, 0.16, 0.8, '#141320', 'rgba(255,150,110,0.25)'); hazeVeil(hz); });
    } else if (th === 'touge') {
      parLayer('t1', key, 0.04, cam, function (fc) { ridge(fc, 0.03, 0.6, 0.22, sc.far, 1, false, hz, 0.45); valleyLights(fc, 0.04, 0.68, 0); ridge(fc, 0.05, 0.72, 0.16, '#0d1426', 1.3, false, hz, 0.35); });
      parLayer('t3', key, 0.16, cam, function (fc) { pines(fc, 0.16, 0.8, '#070b16'); hazeVeil(hz); });
    } else {
      parLayer('d1', key, 0.05, cam, function (fc) { ridge(fc, 0.03, 0.64, 0.24, sc.far, 1, true, hz, 0.75); ridge(fc, 0.06, 0.72, 0.16, sc.mid, 1.2, true, hz, 0.45); });
      parLayer('d3', key, 0.2, cam, function (fc) { saguaros(fc, 0.2, 0.82, '#3a2420'); g.fillStyle = '#3a2420'; g.fillRect(0, H * 0.82, W, H); hazeVeil(hz); });
    }
  }

  // ---------------------------------------------------------------- rendu : monde
  var DB = 38, DF = 16;
  function terrainPath(T, i0, i1, off) {
    for (var i = i0; i <= i1; i++) { if (i === i0) g.moveTo(i * STEP, T.H[i] + off); else g.lineTo(i * STEP, T.H[i] + off); }
  }
  function drawHazard(pit, c, sc, vl, vr) {
    var ly = pit.rim + 330, x0 = pit.x0, x1 = pit.x1;
    var deep = g.createLinearGradient(0, pit.rim, 0, ly + 600);
    if (pit.kind === 'water') {
      deep.addColorStop(0, '#0f2b44'); deep.addColorStop(1, '#03101c');
      g.fillStyle = deep; g.fillRect(x0, pit.rim, x1 - x0, 1400);
      var wv = g.createLinearGradient(0, ly - 10, 0, ly + 120); wv.addColorStop(0, '#5fa6c2'); wv.addColorStop(0.2, '#1d5f7e'); wv.addColorStop(1, '#0a2a40');
      g.fillStyle = wv; g.beginPath(); g.moveTo(x0, ly + 6);
      for (var x = x0; x <= x1; x += 16) g.lineTo(x, ly + Math.sin(x * 0.025 + S.t * 2.4) * 5 + Math.sin(x * 0.07 + S.t * 3.3) * 2);
      g.lineTo(x1, ly + 900); g.lineTo(x0, ly + 900); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.beginPath();
      for (var x2 = x0; x2 <= x1; x2 += 16) g.lineTo(x2, ly + Math.sin(x2 * 0.025 + S.t * 2.4) * 5 + Math.sin(x2 * 0.07 + S.t * 3.3) * 2 - 1);
      g.stroke();
    } else if (pit.kind === 'fire' || pit.kind === 'lava') {
      deep.addColorStop(0, '#1a0f0b'); deep.addColorStop(1, '#4a1406');
      g.fillStyle = deep; g.fillRect(x0, pit.rim, x1 - x0, 1400);
      var glow = g.createLinearGradient(0, ly - 200, 0, ly + 20); glow.addColorStop(0, 'rgba(255,110,30,0)'); glow.addColorStop(1, 'rgba(255,120,30,0.55)');
      g.fillStyle = glow; g.fillRect(x0, ly - 200, x1 - x0, 220);
      g.fillStyle = '#2a0f06'; g.fillRect(x0, ly, x1 - x0, 900);
      g.globalCompositeOperation = 'lighter';
      for (var f = x0 + 10; f < x1; f += 22) {
        var fh = 40 + 50 * Math.abs(Math.sin(S.t * 6 + f * 0.13)) + hash(f) * 30;
        g.drawImage(soft('#ff7a1a'), f - 22, ly - fh, 44, fh + 20);
        g.drawImage(soft('#ffd24a'), f - 10, ly - fh * 0.6, 20, fh * 0.6 + 10);
      }
      g.globalCompositeOperation = 'source-over';
    } else {
      deep.addColorStop(0, pit.kind === 'canyon' ? '#3a2219' : '#0c1220'); deep.addColorStop(1, '#000');
      g.fillStyle = deep; g.fillRect(x0, pit.rim, x1 - x0, 1400);
      var fog = g.createLinearGradient(0, pit.rim + 120, 0, ly + 60);
      fog.addColorStop(0, 'rgba(' + sc.haze + ',0)'); fog.addColorStop(1, 'rgba(' + sc.haze + ',0.25)');
      g.fillStyle = fog; g.fillRect(x0, pit.rim + 120, x1 - x0, ly - pit.rim);
    }
  }
  function drawTerrain(def, T, vl, vr, vb) {
    var c = def.c, sc = scn(def);
    var i0 = Math.max(0, Math.floor(vl / STEP) - 1), i1 = Math.min(T.H.length - 1, Math.ceil(vr / STEP) + 1);
    for (var p = 0; p < T.pits.length; p++) { var pit = T.pits[p]; if (pit.x1 < vl || pit.x0 > vr) continue; drawHazard(pit, c, sc, vl, vr); }
    // voie arrière (dessus du sol, vu en profondeur)
    g.beginPath();
    for (var i = i0; i <= i1; i++) g.lineTo(i * STEP, T.H[i] - DB);
    for (i = i1; i >= i0; i--) g.lineTo(i * STEP, T.H[i]);
    g.closePath();
    g.fillStyle = pat(sc.top); g.fill();
    g.fillStyle = 'rgba(' + Math.round(sc.haze[0] * 0.26) + ',' + Math.round(sc.haze[1] * 0.26) + ',' + Math.round(sc.haze[2] * 0.26) + ',0.3)'; g.fill();
    if (def.theme === 'touge') {     // marquage routier
      g.strokeStyle = 'rgba(240,240,230,0.75)'; g.lineWidth = 2.5; g.setLineDash([34, 30]);
      g.beginPath(); terrainPath(T, i0, i1, -DB * 0.5); g.stroke(); g.setLineDash([]);
      g.strokeStyle = 'rgba(240,240,230,0.85)'; g.lineWidth = 2; g.beginPath(); terrainPath(T, i0, i1, -3); g.stroke();
    }
    // face avant (coupe du terrain)
    g.beginPath();
    g.moveTo(i0 * STEP, vb + 400);
    for (i = i0; i <= i1; i++) g.lineTo(i * STEP, T.H[i] + DF);
    g.lineTo(i1 * STEP, vb + 400); g.closePath();
    g.fillStyle = pat(sc.body); g.fill();
    var gr = g.createLinearGradient(0, vb - 900, 0, vb + 400);
    gr.addColorStop(0, 'rgba(0,0,0,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = gr; g.fill();
    // ombre portée sous la lèvre (occlusion) ; la moitié haute est recouverte par la bande avant
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 26; g.beginPath(); terrainPath(T, i0, i1, DF + 6); g.stroke();
    // dessus de la piste (bande avant)
    g.beginPath();
    for (i = i0; i <= i1; i++) g.lineTo(i * STEP, T.H[i]);
    for (i = i1; i >= i0; i--) g.lineTo(i * STEP, T.H[i] + DF);
    g.closePath(); g.fillStyle = pat(sc.top); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
    // arête éclairée
    g.strokeStyle = 'rgba(255,240,220,0.35)'; g.lineWidth = 1.6; g.beginPath(); terrainPath(T, i0, i1, 0.5); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.beginPath(); terrainPath(T, i0, i1, DF + 1); g.stroke();
  }

  function inPit(x) { var ps = S.T.pits; for (var i = 0; i < ps.length; i++) if (x > ps[i].x0 - 30 && x < ps[i].x1 + 30) return true; return false; }
  function onCar(x) { var cs = S.T.cars; for (var i = 0; i < cs.length; i++) if (Math.abs(x - cs[i].x) < cs[i].w / 2 + 40) return true; return false; }

  // ---------------------------------------------------------------- objets de décor réalistes
  function cone(x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s);
    var cg = g.createLinearGradient(-12, 0, 12, 0); cg.addColorStop(0, '#c2410c'); cg.addColorStop(0.45, '#ff7a2d'); cg.addColorStop(1, '#9a3412');
    g.fillStyle = '#26282d'; g.fillRect(-16, -4, 32, 5);
    g.fillStyle = cg; g.beginPath(); g.moveTo(-12, -4); g.lineTo(-3, -44); g.lineTo(3, -44); g.lineTo(12, -4); g.fill();
    g.fillStyle = 'rgba(245,245,240,0.92)'; g.beginPath(); g.moveTo(-8.4, -18); g.lineTo(-5.5, -30); g.lineTo(5.5, -30); g.lineTo(8.4, -18); g.fill();
    g.restore();
  }
  function tireStack(x, y, n) {
    for (var i = 0; i < n; i++) {
      var ty = y - 13 - i * 24;
      var tg = g.createLinearGradient(0, ty - 12, 0, ty + 12); tg.addColorStop(0, '#3a3b40'); tg.addColorStop(0.5, '#18191c'); tg.addColorStop(1, '#0c0d0f');
      g.fillStyle = tg; g.beginPath(); g.ellipse(x, ty, 34, 12, 0, 0, TAU); g.fill();
      g.fillStyle = '#060607'; g.beginPath(); g.ellipse(x, ty - 2, 16, 5, 0, 0, TAU); g.fill();
    }
  }
  function drum(x, y, col, rust) {
    var dg = g.createLinearGradient(x - 18, 0, x + 18, 0);
    dg.addColorStop(0, shade(col, 0.55)); dg.addColorStop(0.4, shade(col, 1.15)); dg.addColorStop(1, shade(col, 0.45));
    g.fillStyle = dg; g.fillRect(x - 18, y - 52, 36, 52);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 18, y - 38, 36, 3); g.fillRect(x - 18, y - 18, 36, 3);
    if (rust) { g.fillStyle = 'rgba(120,60,20,0.45)'; g.fillRect(x - 10, y - 30, 14, 20); }
    g.fillStyle = shade(col, 0.7); g.beginPath(); g.ellipse(x, y - 52, 18, 4, 0, 0, TAU); g.fill();
  }
  function streetLamp(x, y, t) {
    var pg = g.createLinearGradient(x - 3, 0, x + 3, 0); pg.addColorStop(0, '#3a3e48'); pg.addColorStop(0.5, '#8a909c'); pg.addColorStop(1, '#2a2d34');
    g.fillStyle = pg; g.fillRect(x - 3, y - 170, 6, 170);
    g.fillRect(x - 3, y - 170, 40, 5);
    g.fillStyle = '#ffd38a'; g.fillRect(x + 26, y - 166, 14, 4);
    g.globalCompositeOperation = 'lighter';
    var cone2 = g.createLinearGradient(0, y - 165, 0, y);
    cone2.addColorStop(0, 'rgba(255,190,110,0.35)'); cone2.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = cone2; g.beginPath(); g.moveTo(x + 28, y - 164); g.lineTo(x + 38, y - 164); g.lineTo(x + 90, y); g.lineTo(x - 22, y); g.fill();
    g.drawImage(soft('#ffcf88'), x + 2, y - 190, 60, 50);
    g.globalCompositeOperation = 'source-over';
  }
  function guardRail(x, y) {
    var rg = g.createLinearGradient(0, y - 34, 0, y - 20); rg.addColorStop(0, '#d7dbe2'); rg.addColorStop(0.5, '#8d939d'); rg.addColorStop(1, '#5a606a');
    g.fillStyle = '#4a4f58'; g.fillRect(x - 60, y - 26, 4, 26); g.fillRect(x + 56, y - 26, 4, 26);
    g.fillStyle = rg; g.fillRect(x - 70, y - 34, 140, 13);
    g.fillStyle = 'rgba(255,90,60,0.9)'; g.fillRect(x - 2, y - 30, 4, 5);
  }
  function saguaro(x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s);
    var sg = g.createLinearGradient(-10, 0, 10, 0); sg.addColorStop(0, '#2f4a2a'); sg.addColorStop(0.45, '#5f8a4a'); sg.addColorStop(1, '#22381f');
    g.fillStyle = sg;
    g.beginPath(); g.moveTo(-10, 0); g.lineTo(-10, -100); g.arc(0, -100, 10, Math.PI, 0); g.lineTo(10, 0); g.fill();
    g.beginPath(); g.moveTo(-10, -50); g.lineTo(-30, -50); g.lineTo(-30, -78); g.arc(-24, -78, 6, Math.PI, 0); g.lineTo(-18, -58); g.lineTo(-10, -58); g.fill();
    g.beginPath(); g.moveTo(10, -40); g.lineTo(26, -40); g.lineTo(26, -70); g.arc(32, -70, 6, Math.PI, 0); g.lineTo(38, -34); g.lineTo(10, -34); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-4, -2); g.lineTo(-4, -104); g.moveTo(4, -2); g.lineTo(4, -104); g.stroke();
    g.restore();
  }
  function rock(x, y, s, col) {
    g.save(); g.translate(x, y); g.scale(s, s);
    var rg2 = g.createLinearGradient(-30, -40, 30, 0); rg2.addColorStop(0, shade(col, 1.35)); rg2.addColorStop(1, shade(col, 0.55));
    g.fillStyle = rg2; g.beginPath(); g.moveTo(-34, 0); g.lineTo(-24, -26); g.lineTo(-4, -40); g.lineTo(18, -30); g.lineTo(34, 0); g.fill();
    g.restore();
  }
  function parasol(x, y) {
    g.fillStyle = '#e8e2d6'; g.fillRect(x - 2, y - 86, 4, 86);
    var cols = ['#e2553f', '#f2ead8', '#e2553f', '#f2ead8', '#e2553f', '#f2ead8'];
    for (var i = 0; i < 6; i++) { var a0 = Math.PI + i * Math.PI / 6, a1 = a0 + Math.PI / 6; g.fillStyle = cols[i]; g.beginPath(); g.moveTo(x, y - 92); g.lineTo(x + Math.cos(a0) * 50, y - 86 + Math.sin(a0) * 14 + 10); g.lineTo(x + Math.cos(a1) * 50, y - 86 + Math.sin(a1) * 14 + 10); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.moveTo(x, y - 92); g.lineTo(x + 50, y - 76); g.lineTo(x, y - 78); g.fill();
  }
  function duneGrass(x, y) {
    g.strokeStyle = '#6d7a3a'; g.lineWidth = 1.5;
    for (var r = -6; r <= 6; r++) { g.beginPath(); g.moveTo(x + r * 3, y); g.quadraticCurveTo(x + r * 4, y - 20, x + r * 7, y - 30 - Math.abs(r) * 2); g.stroke(); }
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
        if (k === 0) drawPalm(0, 0, 0.75, '#2d2a1f', i);
        else if (k === 1) parasol(0, 0);
        else duneGrass(0, 0);
      } else if (th === 'junk') {
        if (k === 0) tireStack(0, 0, 3);
        else if (k === 1) { drum(-20, 0, '#2f5f8a', true); drum(20, 0, '#8a2f2f', true); }
        else cone(0, 0, 1);
      } else if (th === 'touge') {
        if (k === 0) streetLamp(0, 0, t);
        else if (k === 1) guardRail(0, 0);
        else cone(0, 0, 0.9);
      } else {
        if (k === 0) saguaro(0, 0, 1);
        else if (k === 1) rock(0, 0, 1.1, '#9a5a3c');
        else { g.fillStyle = '#5a4030'; g.fillRect(-3, -130, 6, 130); g.fillRect(-28, -122, 56, 5); g.strokeStyle = 'rgba(40,30,25,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-28, -120); g.quadraticCurveTo(-140, -90, -260, -120); g.moveTo(28, -120); g.quadraticCurveTo(140, -90, 260, -120); g.stroke(); }
      }
      g.restore();
    }
  }

  function drawPads(T, vl, vr, t) {
    for (var i = 0; i < T.pads.length; i++) {
      var p = T.pads[i]; if (p.x1 < vl || p.x0 > vr) continue;
      var y = T.base((p.x0 + p.x1) / 2), w = p.x1 - p.x0;
      var mg = g.createLinearGradient(0, y - 6, 0, y + 3); mg.addColorStop(0, '#9aa1ab'); mg.addColorStop(1, '#4a4f58');
      g.fillStyle = mg; g.fillRect(p.x0, y - 5, w, 7);
      for (var x = p.x0 + 14; x < p.x1 - 26; x += 40) {
        var a = 0.55 + 0.45 * Math.abs(Math.sin(t * 6 - x * 0.03));
        g.fillStyle = 'rgba(255,196,40,' + a + ')';
        g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 14, y - 4); g.lineTo(x + 26, y - 1); g.lineTo(x + 14, y + 2); g.lineTo(x, y + 2); g.lineTo(x + 10, y - 1); g.fill();
      }
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35;
      g.drawImage(soft('#ffb020'), p.x0, y - 26, w, 34); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
  }
  function drawNitros(T, vl, vr, t) {
    for (var i = 0; i < T.nitros.length; i++) {
      var n = T.nitros[i]; if (n.got || n.x < vl - 60 || n.x > vr + 60) continue;
      var y = n.y + Math.sin(t * 3 + i) * 5;
      g.save(); g.translate(n.x, y); g.rotate(-0.25 + Math.sin(t * 2 + i) * 0.08);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; g.drawImage(soft('#3aa0ff'), -46, -46, 92, 92); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      var bg = g.createLinearGradient(-13, 0, 13, 0); bg.addColorStop(0, '#0c2f63'); bg.addColorStop(0.35, '#3c86e0'); bg.addColorStop(0.55, '#a9d2ff'); bg.addColorStop(1, '#0a2552');
      g.fillStyle = bg;
      g.beginPath(); g.moveTo(-13, -20); g.quadraticCurveTo(-13, -30, -4, -32); g.lineTo(4, -32); g.quadraticCurveTo(13, -30, 13, -20); g.lineTo(13, 26); g.quadraticCurveTo(13, 30, 9, 30); g.lineTo(-9, 30); g.quadraticCurveTo(-13, 30, -13, 26); g.closePath(); g.fill();
      var vg = g.createLinearGradient(-5, 0, 5, 0); vg.addColorStop(0, '#8a8f98'); vg.addColorStop(0.5, '#f2f4f7'); vg.addColorStop(1, '#6a6f78');
      g.fillStyle = vg; g.fillRect(-4, -40, 8, 9); g.fillRect(-8, -43, 16, 4);
      g.fillStyle = '#f4f6fa'; g.fillRect(-13, -6, 26, 14);
      g.fillStyle = '#d8232a'; g.font = '800 italic 10px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NOS', 0, 1.5);
      g.restore();
    }
  }
  function drawSprings(T, vl, vr, t) {
    for (var i = 0; i < T.springs.length; i++) {
      var p = T.springs[i]; if (p.x1 < vl || p.x0 > vr) continue;
      var w = p.x1 - p.x0, cx = (p.x0 + p.x1) / 2, y = p.y;
      var squash = S.springCd > 0 && Math.abs(S.car.x - cx) < 400 ? 0.5 + 0.5 * (1 - S.springCd / 0.45) : 1;
      var ch = 30 * squash;
      g.fillStyle = '#2b2e35'; g.fillRect(p.x0, y - 5, w, 6);
      for (var c = 0; c < 3; c++) {
        var sx = p.x0 + w * (0.2 + c * 0.3);
        var sg = g.createLinearGradient(sx - 9, 0, sx + 9, 0); sg.addColorStop(0, '#5f646e'); sg.addColorStop(0.5, '#e8ebf0'); sg.addColorStop(1, '#4a4f58');
        g.strokeStyle = sg; g.lineWidth = 3.5; g.beginPath();
        for (var k = 0; k <= 6; k++) g.lineTo(sx + (k % 2 ? 9 : -9), y - 4 - ch * k / 6);
        g.stroke();
      }
      var top = y - ch - 12;
      g.fillStyle = '#1d1f24'; g.fillRect(p.x0, top, w, 9);
      for (var s2 = 0; s2 < w; s2 += 20) { g.fillStyle = '#f2b705'; g.beginPath(); g.moveTo(p.x0 + s2, top + 9); g.lineTo(p.x0 + s2 + 10, top); g.lineTo(p.x0 + s2 + 18, top); g.lineTo(p.x0 + s2 + 8, top + 9); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(p.x0, top, w, 2);
    }
  }
  // anneau de feu : cerceau d'acier + flammes ; moitié arrière derrière le véhicule, moitié avant devant
  function drawRings(T, vl, vr, t, front) {
    for (var i = 0; i < T.rings.length; i++) {
      var r = T.rings[i]; if (r.x + r.r < vl || r.x - r.r > vr) continue;
      var rx = r.r * 0.34, ry = r.r;
      var a0 = front ? -Math.PI / 2 : Math.PI / 2, a1 = front ? Math.PI / 2 : Math.PI * 1.5;
      g.save(); g.translate(r.x, r.y);
      g.lineWidth = 7; g.strokeStyle = front ? '#6b6f78' : '#3a3d44';
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, a0, a1); g.stroke();
      g.lineWidth = 2; g.strokeStyle = front ? '#c9ced6' : '#5a5e66';
      g.beginPath(); g.ellipse(-1, 0, rx, ry, 0, a0, a1); g.stroke();
      if (!r.got) {
        g.globalCompositeOperation = 'lighter';
        for (var k = 0; k < 14; k++) {
          var an = a0 + (a1 - a0) * (k + 0.5) / 14, px = Math.cos(an) * rx, py = Math.sin(an) * ry;
          var fl = 18 + 14 * Math.abs(Math.sin(t * 9 + k * 1.7 + i));
          g.drawImage(soft('#ff6a1a'), px - fl * 0.6, py - fl * 1.3, fl * 1.2, fl * 1.6);
          g.drawImage(soft('#ffd36a'), px - fl * 0.3, py - fl * 0.8, fl * 0.6, fl * 0.9);
        }
        g.globalCompositeOperation = 'source-over';
      }
      g.restore();
    }
  }
  function drawGhost(t) {
    var gh = S.ghost; if (!gh || S.dead) return;
    var f = S.t * 30, i = Math.floor(f), k = f - i;
    if ((i + 1) * 3 + 2 >= gh.length) return;
    var x = gh[i * 3] + (gh[i * 3 + 3] - gh[i * 3]) * k, y = gh[i * 3 + 1] + (gh[i * 3 + 4] - gh[i * 3 + 1]) * k, a = (gh[i * 3 + 2] + (gh[i * 3 + 5] - gh[i * 3 + 2]) * k) / 100;
    g.save(); g.globalAlpha = 0.3;
    VX.drawVehicle(g, { vk: V.key, x: x, y: y, a: a, wheels: [{ dist: R - 10, spin: S.t * 20 }, { dist: R - 10, spin: S.t * 20 }] }, save.color, false, t, CAR_COLORS);
    g.globalAlpha = 0.75; g.fillStyle = '#e8ecf4'; g.font = '700 14px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('RECORD', x, y - (V.key === 'truck' ? 150 : 110));
    g.restore();
  }

  // obstacles écrasables : carrosseries peintes, vitres, jantes
  function paintGrad(y0, y1, col) {
    var gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, shade(col, 1.35)); gr.addColorStop(0.35, col); gr.addColorStop(0.55, shade(col, 0.72)); gr.addColorStop(0.62, shade(col, 0.95)); gr.addColorStop(1, shade(col, 0.5));
    return gr;
  }
  function drawObstacle(o, T) {
    var gy = T.base(o.x);
    var col = ['#b8202c', '#1f5fa8', '#d9a21b', '#5b6470', '#e8e6e1', '#2f6b45', '#7a2a6b', '#25262b'][o.seed % 8];
    var sh = g.createRadialGradient(o.x, gy + 6, 4, o.x, gy + 6, o.w * 0.6);
    sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.beginPath(); g.ellipse(o.x, gy + 6, o.w * 0.6, 12, 0, 0, TAU); g.fill();
    paint(true); paint(false);
    function paint(back) {
      g.save(); g.translate(o.x + (back ? -12 : 0), gy + (back ? -18 : 0));
      var sx = 1 + (1 - o.sq) * 0.18;
      g.scale(sx, o.sq);
      var w = o.w, k = o.k, dim = back ? 0.55 : 1;
      var C = function (c) { return back ? shade(c, 0.55) : c; };
      var wheel = function (x) {
        var tg = g.createRadialGradient(x, -15, 4, x, -15, 16); tg.addColorStop(0, '#2a2b2f'); tg.addColorStop(1, '#0d0e10');
        g.fillStyle = tg; g.beginPath(); g.arc(x, -15, 16, 0, TAU); g.fill();
        var rg = g.createRadialGradient(x - 2, -17, 1, x, -15, 8); rg.addColorStop(0, C('#e9edf2')); rg.addColorStop(1, C('#7d848e'));
        g.fillStyle = rg; g.beginPath(); g.arc(x, -15, 8, 0, TAU); g.fill();
      };
      var glass = function (path) {
        var gl = g.createLinearGradient(0, -48, 0, -28); gl.addColorStop(0, C('#9fb6cf')); gl.addColorStop(0.5, C('#3c4c60')); gl.addColorStop(1, C('#1c2430'));
        g.fillStyle = gl; g.fill(path);
      };
      var car = function (oy, c, ww) {
        var hw = ww / 2, p = new Path2D();
        p.moveTo(-hw, oy - 9); p.lineTo(-hw, oy - 24); p.quadraticCurveTo(-hw, oy - 29, -hw * 0.82, oy - 30); p.lineTo(-hw * 0.52, oy - 31);
        p.quadraticCurveTo(-hw * 0.38, oy - 47, -hw * 0.22, oy - 48); p.lineTo(hw * 0.28, oy - 48); p.quadraticCurveTo(hw * 0.45, oy - 46, hw * 0.6, oy - 31);
        p.lineTo(hw * 0.92, oy - 28); p.quadraticCurveTo(hw, oy - 26, hw, oy - 20); p.lineTo(hw, oy - 9); p.closePath();
        g.fillStyle = paintGrad(oy - 48, oy - 8, C(c)); g.fill(p);
        var w2 = new Path2D(); w2.moveTo(-hw * 0.47, oy - 32); w2.lineTo(-hw * 0.33, oy - 45); w2.lineTo(hw * 0.26, oy - 45); w2.lineTo(hw * 0.52, oy - 32); w2.closePath();
        glass(w2);
        g.fillStyle = C('#1a1b1f'); g.fillRect(-1, oy - 45, 3, 14);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-hw, oy - 13, ww, 4);
        g.fillStyle = C('#c9ced6'); g.fillRect(hw - 4, oy - 22, 4, 6); g.fillRect(-hw, oy - 22, 3, 6);
        g.fillStyle = C('#ffdf9a'); g.fillRect(hw - 3, oy - 27, 3, 4);
        g.fillStyle = C('#b0151d'); g.fillRect(-hw, oy - 27, 3, 4);
      };
      if (k === 'car' || k === 'wreck') { car(0, k === 'wreck' ? '#6b4a34' : col, w - 14); wheel(-w * 0.3); wheel(w * 0.3); if (k === 'wreck') { g.fillStyle = 'rgba(80,40,20,0.5)'; g.fillRect(-w * 0.3, -28, w * 0.25, 10); } }
      else if (k === 'limo') { car(0, '#141519', w - 14); wheel(-w * 0.34); wheel(w * 0.34); }
      else if (k === 'stack') { car(0, col, w - 14); wheel(-w * 0.3); wheel(w * 0.3); car(-46, ['#3a7ac0', '#c0392b', '#d9c7a0'][o.seed % 3], w - 40); }
      else if (k === 'suv' || k === 'van' || k === 'truck') {
        var hh = o.h, p2 = new Path2D();
        p2.moveTo(-w / 2 + 4, -8); p2.lineTo(-w / 2 + 4, -hh + 6); p2.quadraticCurveTo(-w / 2 + 4, -hh, -w / 2 + 12, -hh); p2.lineTo(w / 2 - 26, -hh); p2.quadraticCurveTo(w / 2 - 8, -hh + 6, w / 2 - 4, -hh * 0.55); p2.lineTo(w / 2 - 4, -8); p2.closePath();
        g.fillStyle = paintGrad(-hh, -8, C(col)); g.fill(p2);
        var w3 = new Path2D(); w3.rect(-w / 2 + 14, -hh + 8, w - 52, Math.min(22, hh * 0.32)); glass(w3);
        var w4 = new Path2D(); w4.moveTo(w / 2 - 30, -hh + 8); w4.lineTo(w / 2 - 14, -hh + 8); w4.lineTo(w / 2 - 8, -hh * 0.58); w4.lineTo(w / 2 - 30, -hh * 0.58); w4.closePath(); glass(w4);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-w / 2 + 4, -16, w - 8, 4);
        wheel(-w * 0.3); wheel(w * 0.3);
      } else if (k === 'bus') {
        g.fillStyle = paintGrad(-o.h, -8, C('#f2b705')); g.fillRect(-w / 2 + 4, -o.h, w - 8, o.h - 8);
        g.fillStyle = C('#1d1e22'); g.fillRect(-w / 2 + 4, -o.h * 0.42, w - 8, 4); g.fillRect(-w / 2 + 4, -o.h * 0.28, w - 8, 3);
        for (var i = 0; i < 8; i++) { var wb = new Path2D(); wb.rect(-w / 2 + 14 + i * ((w - 28) / 8), -o.h + 12, (w - 28) / 8 - 6, 26); glass(wb); }
        g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(-w / 2 + 4, -o.h, w - 8, 3);
        wheel(-w * 0.32); wheel(w * 0.32);
      } else if (k === 'barrel' || k === 'tnt') {
        var bc = k === 'tnt' ? '#c0161f' : (o.seed % 2 ? '#2b6ca8' : '#7a7f88');
        var bg2 = g.createLinearGradient(-w / 2 + 8, 0, w / 2 - 8, 0);
        bg2.addColorStop(0, C(shade(bc, 0.5))); bg2.addColorStop(0.38, C(shade(bc, 1.25))); bg2.addColorStop(1, C(shade(bc, 0.45)));
        g.fillStyle = bg2; g.fillRect(-w / 2 + 8, -o.h, w - 16, o.h - 2);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-w / 2 + 8, -o.h * 0.7, w - 16, 3); g.fillRect(-w / 2 + 8, -o.h * 0.3, w - 16, 3);
        if (k === 'tnt') {
          g.fillStyle = C('#f2b705'); g.fillRect(-w / 2 + 12, -o.h * 0.64, w - 24, 13);
          g.fillStyle = C('#111'); g.font = '800 11px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TNT', 0, -o.h * 0.64 + 7);
          if (!back) { g.strokeStyle = '#d6c8a0'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -o.h); g.quadraticCurveTo(8, -o.h - 10, 4, -o.h - 16); g.stroke(); g.globalCompositeOperation = 'lighter'; g.drawImage(soft('#ffb020'), -6, -o.h - 28, 20, 20); g.globalCompositeOperation = 'source-over'; }
        }
      } else if (k === 'crate') {
        var cg = g.createLinearGradient(0, -o.h, 0, 0); cg.addColorStop(0, C('#c89a5c')); cg.addColorStop(1, C('#8a6232'));
        g.fillStyle = cg; g.fillRect(-w / 2 + 6, -o.h, w - 12, o.h - 2);
        g.strokeStyle = C('#5a3c1c'); g.lineWidth = 3; g.strokeRect(-w / 2 + 6, -o.h, w - 12, o.h - 2);
        g.lineWidth = 2; for (var pl = 1; pl < 4; pl++) { g.beginPath(); g.moveTo(-w / 2 + 6, -o.h + pl * (o.h - 2) / 4); g.lineTo(w / 2 - 6, -o.h + pl * (o.h - 2) / 4); g.stroke(); }
        g.lineWidth = 4; g.beginPath(); g.moveTo(-w / 2 + 8, -o.h + 2); g.lineTo(w / 2 - 8, -4); g.stroke();
      } else if (k === 'cones') {
        for (var cn = -1; cn <= 1; cn++) { g.save(); if (back) g.globalAlpha = 0.6; cone(cn * 28, 0, 0.72); g.restore(); }
      }
      if (o.crushed && !back) {
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(-w * 0.3, -o.h * 0.9); g.lineTo(w * 0.1, -4); g.moveTo(w * 0.3, -o.h * 0.8); g.lineTo(-w * 0.1, -6); g.stroke();
      }
      if (back) { g.fillStyle = 'rgba(0,0,0,0.15)'; }
      g.restore();
    }
  }

  function drawCoins(T, vl, vr, t) {
    var cs = T.coins;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c.got || c.x < vl - 40 || c.x > vr + 40) continue;
      var sc = Math.cos(t * 3 + i * 0.5), w = 17 * Math.max(0.12, Math.abs(sc));
      g.save(); g.translate(c.x, c.y + Math.sin(t * 4 + i) * 3);
      var edge = g.createLinearGradient(-w, 0, w, 0); edge.addColorStop(0, '#7a5306'); edge.addColorStop(0.5, '#e2b23c'); edge.addColorStop(1, '#6b4805');
      g.fillStyle = edge; g.beginPath(); g.ellipse(0, 0, w + 1.5, 18, 0, 0, TAU); g.fill();
      var face = g.createRadialGradient(-w * 0.3, -6, 1, 0, 0, 18);
      face.addColorStop(0, '#fff3c0'); face.addColorStop(0.45, '#f2c34a'); face.addColorStop(1, '#a87410');
      g.fillStyle = face; g.beginPath(); g.ellipse(0, 0, w, 16.5, 0, 0, TAU); g.fill();
      if (Math.abs(sc) > 0.5) { g.fillStyle = 'rgba(120,80,10,0.75)'; g.font = '800 13px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('V8', 0, 1); }
      g.restore();
    }
  }

  function drawFlags(T, vl, vr, t) {
    var sx = T.startX - 160;
    if (sx > vl - 200 && sx < vr + 200) {
      var sy = T.base(sx);
      g.fillStyle = '#8a909c'; g.fillRect(sx, sy - 170, 6, 170);
      g.fillStyle = '#1b1d22'; g.fillRect(sx + 6, sy - 168, 104, 34);
      g.fillStyle = '#f2b705'; g.fillRect(sx + 6, sy - 136, 104, 3);
      g.fillStyle = '#fff'; g.font = '800 italic 20px ' + FONT; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('START', sx + 16, sy - 151);
    }
    var f = T.finish;
    if (f > vl - 240 && f < vr + 240) {
      var fy = T.base(f), top = fy - 270;
      for (var side = -1; side <= 1; side += 2) {      // pylônes en treillis
        var px = f + side * 140 - (side > 0 ? 14 : 0);
        var pg = g.createLinearGradient(px, 0, px + 14, 0); pg.addColorStop(0, '#5a606a'); pg.addColorStop(0.5, '#c9ced6'); pg.addColorStop(1, '#4a4f58');
        g.fillStyle = pg; g.fillRect(px, top, 14, 270);
        g.strokeStyle = 'rgba(40,44,52,0.8)'; g.lineWidth = 1; g.beginPath(); for (var yy = top; yy < fy; yy += 18) { g.moveTo(px, yy); g.lineTo(px + 14, yy + 18); } g.stroke();
      }
      for (var cx = 0; cx < 14; cx++) for (var cy = 0; cy < 3; cy++) { g.fillStyle = (cx + cy) % 2 ? '#15161a' : '#f4f4f2'; g.fillRect(f - 140 + cx * 20, top + cy * 18, 20, 18); }
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(f - 140, top + 46, 280, 8);
      g.fillStyle = '#1b1d22'; g.fillRect(f - 120, top + 62, 240, 30);
      g.fillStyle = '#f2b705'; g.fillRect(f - 120, top + 89, 240, 3);
      g.fillStyle = '#fff'; g.font = '800 italic 24px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINISH', f, top + 77);
    }
  }

  function drawPieces() {
    for (var i = 0; i < S.pieces.length; i++) {
      var p = S.pieces[i];
      g.save(); g.translate(p.x, p.y); g.rotate(p.a);
      if (p.t === 'wheel') VX.tire(g, p.r, 0, { lugs: 12, rimR: 0.5 });
      else {
        var pg = g.createLinearGradient(-p.s, -p.s, p.s, p.s); pg.addColorStop(0, shade(p.col.charAt(0) === '#' ? p.col : '#555555', 1.4)); pg.addColorStop(1, shade(p.col.charAt(0) === '#' ? p.col : '#555555', 0.5));
        g.fillStyle = pg; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
        g.beginPath();
        for (var k = 0; k < p.n; k++) { var an = k * TAU / p.n, rr = p.s * (k % 2 ? 0.45 : 0.6); g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
        g.closePath(); g.fill(); g.stroke();
      }
      g.restore();
    }
  }

  // particules douces (sprites) ; « add » = lumière (feu, étincelles) en mode additif
  function drawParts(add) {
    var p = S.parts;
    if (add) g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < p.length; i++) {
      var q = p[i]; if (q.add !== add) continue;
      var k = 1 - q.t / q.life;
      var a = Math.max(0, Math.min(1, k * (q.add ? 1 : 0.85)));
      if (a <= 0.01) continue;
      var sz = q.size * (q.add ? 0.6 + k * 0.8 : 1.2 + (1 - k) * 2.2);
      g.globalAlpha = a;
      g.drawImage(soft(q.col), q.x - sz, q.y - sz, sz * 2, sz * 2);
    }
    g.globalAlpha = 1;
    if (add) g.globalCompositeOperation = 'source-over';
  }

  function drawForeground(def, cam) {
    var sc = scn(def), ox = cam.x * 1.45 * cam.s;
    g.fillStyle = 'rgba(8,8,12,0.85)';
    for (var sx = -((ox % 190) + 190); sx < W + 190; sx += 190) {
      var idx = Math.floor((sx + ox) / 190);
      if (hash(idx * 5.1) < 0.55) continue;
      var hh = (0.03 + hash(idx) * 0.05) * H, w = 70 + hash(idx + 2) * 90;
      g.beginPath(); g.moveTo(sx, H + 4);
      g.quadraticCurveTo(sx + w * 0.15, H - hh * 1.2, sx + w * 0.45, H - hh);
      g.quadraticCurveTo(sx + w * 0.85, H - hh * 0.5, sx + w, H + 4); g.fill();
    }
    // étalonnage couleur + halo du soleil + vignettage, pré-calculés
    var key = def.theme + '|' + W + 'x' + H + '|' + bgRes();
    staticLayer('grade', key, function () {
      if (sc.sun) {
        var sxp = W * sc.sun.x, syp = H * sc.sun.y, gl = sc.sun.glow;
        var fl = g.createRadialGradient(sxp, syp, 0, sxp, syp, Math.max(W, H) * 0.7);
        fl.addColorStop(0, 'rgba(' + gl + ',0.13)'); fl.addColorStop(1, 'rgba(' + gl + ',0)');
        g.fillStyle = fl; g.fillRect(0, 0, W, H);
      }
      g.fillStyle = sc.grade; g.fillRect(0, 0, W, H);
      var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    });
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
      var cgh = getH(S.car.x), calt = Math.max(0, cgh - S.car.y), sw = V.WB + 70;
      g.save(); g.translate(S.car.x, cgh + 10); g.rotate(Math.atan2(getH(S.car.x + 30) - getH(S.car.x - 30), 60));
      var sh = g.createRadialGradient(0, 0, 4, 0, 0, sw);
      sh.addColorStop(0, 'rgba(0,0,0,' + clamp(0.6 - calt / 700, 0.08, 0.6) + ')'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.scale(1, 0.14); g.fillStyle = sh; g.beginPath(); g.arc(0, 0, sw, 0, TAU); g.fill(); g.restore();
      VX.drawVehicle(g, S.car, save.color, S.car.boosting, t, CAR_COLORS);
    } else drawPieces();
   
    drawRings(T, vl, vr, t, true);
    drawProps(def, T, vl, vr, true, t);
    drawParts(true);
   
    if (S.ring) {
      var rr = S.ring.t * 900, ra = 1 - S.ring.t / 0.8;
      g.strokeStyle = 'rgba(255,230,190,' + ra * 0.6 + ')'; g.lineWidth = 10 * ra + 2;
      g.beginPath(); g.arc(S.ring.x, S.ring.y, rr, 0, TAU); g.stroke();
    }
    g.restore();
    drawForeground(def, cam);
   
    drawHud(t);
   
    if (S.flash > 0) { g.fillStyle = 'rgba(255,236,210,' + S.flash * 0.85 + ')'; g.fillRect(0, 0, W, H); }
  }

  // ---------------------------------------------------------------- HUD sobre
  function txt(str, x, y, size, col, align, weight) {
    g.font = (weight || '700') + ' ' + size + 'px ' + FONT;
    g.textAlign = align || 'left'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(str, x + 0.5, y + 1.5);   // ombre portée simple (pas de flou : coûteux)
    g.fillStyle = col || '#fff'; g.fillText(str, x, y);
  }
  function panel(x, y, w, h, r) {
    g.fillStyle = 'rgba(10,12,18,0.55)';
    g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r || 8); else g.rect(x, y, w, h); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.stroke();
  }
  var ACC = '#ff8a2b';
  function drawHud(t) {
    var car = S.car, cam = S.cam, m = Math.max(10, Math.min(W, H) * 0.02), u = Math.max(0.7, Math.min(1.25, Math.min(W, H) / 700));
    for (var i = 0; i < S.pops.length; i++) {
      var p = S.pops[i], px = (p.x - cam.x) * cam.s + W * 0.36, py = (p.y - cam.y) * cam.s + H * 0.62;
      g.globalAlpha = Math.max(0, 1 - p.t / p.life);
      txt(p.txt, px, py, 20 * u * p.size, p.col, 'center', '800 italic');
    }
    g.globalAlpha = 1;
    // score + combo
    panel(m, m, 178 * u, (S.combo > 1 ? 74 : 50) * u, 8);
    txt('SCORE', m + 12 * u, m + 14 * u, 11 * u, 'rgba(255,255,255,0.6)', 'left', '700');
    txt(String(S.score), m + 12 * u, m + 34 * u, 28 * u, '#fff', 'left', '800 italic');
    if (S.combo > 1) {
      txt('COMBO ×' + mult().toFixed(1), m + 12 * u, m + 56 * u, 14 * u, ACC, 'left', '800 italic');
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(m + 12 * u, m + 64 * u, 150 * u, 3 * u);
      g.fillStyle = ACC; g.fillRect(m + 12 * u, m + 64 * u, 150 * u * clamp(S.comboT / 4, 0, 1), 3 * u);
    }
    // bidons de nitro
    var ny = m + (S.combo > 1 ? 84 : 60) * u, sw = 16 * u, shh = 30 * u, bw = MAX_CHARGES * (sw + 7 * u) + 112 * u;
    panel(m, ny, bw, 44 * u, 8);
    for (var ci = 0; ci < MAX_CHARGES; ci++) {
      var cx0 = m + 10 * u + ci * (sw + 7 * u), cy0 = ny + 9 * u, full = ci < car.charges;
      var bg = g.createLinearGradient(cx0, 0, cx0 + sw, 0);
      if (full) { bg.addColorStop(0, '#0c2f63'); bg.addColorStop(0.4, '#3c86e0'); bg.addColorStop(0.6, '#a9d2ff'); bg.addColorStop(1, '#0a2552'); } else { bg.addColorStop(0, 'rgba(255,255,255,0.08)'); bg.addColorStop(1, 'rgba(255,255,255,0.08)'); }
      g.fillStyle = bg; g.beginPath(); if (g.roundRect) g.roundRect(cx0, cy0 + 4 * u, sw, shh - 4 * u, 3 * u); else g.rect(cx0, cy0 + 4 * u, sw, shh - 4 * u); g.fill();
      g.fillStyle = full ? '#d6dbe3' : 'rgba(255,255,255,0.2)'; g.fillRect(cx0 + sw * 0.3, cy0, sw * 0.4, 4 * u);
      if (full) { g.fillStyle = '#f4f6fa'; g.fillRect(cx0, cy0 + 13 * u, sw, 6 * u); }
    }
    var nlx = m + 14 * u + MAX_CHARGES * (sw + 7 * u);
    txt('NITRO', nlx, ny + 15 * u, 12 * u, '#cfe3ff', 'left', '800 italic');
    if (car.boostT > 0) {
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(nlx, ny + 27 * u, 90 * u, 4 * u);
      g.fillStyle = '#5aa8ff'; g.fillRect(nlx, ny + 27 * u, 90 * u * car.boostT / BOOST_DUR, 4 * u);
    } else txt(car.charges > 0 ? 'ESPACE · CLIC' : 'TROUVE UN BIDON', nlx, ny + 30 * u, 9.5 * u, car.charges > 0 ? 'rgba(255,255,255,0.55)' : '#ff9a8a', 'left', '700');
    // progression
    var pw = Math.min(W * 0.34, 420), px0 = W / 2 - pw / 2, py0 = m + 12 * u;
    var prog = clamp(car.x / S.T.finish, 0, 1);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(px0, py0, pw, 4 * u);
    g.fillStyle = ACC; g.fillRect(px0, py0, pw * prog, 4 * u);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(px0 + pw * prog, py0 + 2 * u, 6 * u, 0, TAU); g.fill();
    txt(S.def.name, W / 2, py0 + 22 * u, 14 * u, 'rgba(255,255,255,0.85)', 'center', '700 italic');
    // compte-tours + vitesse + rapport + temps
    var sy0 = Math.max(70, m + 62);
    drawTacho(W - m - 196 * u, sy0 - 4 * u, u, car, t);
    if (S.banner) {
      var b = S.banner, k = Math.min(1, b.t * 6), a = b.t > 1.2 ? 1 - (b.t - 1.2) / 0.4 : 1;
      g.globalAlpha = Math.max(0, a);
      var bs = (42 + 12 * (1 - k)) * u;
      txt(b.txt, W / 2, H * 0.27, bs, '#fff', 'center', '800 italic');
      g.fillStyle = b.col === '#e8403a' ? '#e8403a' : ACC; g.fillRect(W / 2 - 60 * u, H * 0.27 + bs * 0.62, 120 * u, 3 * u);
      g.globalAlpha = 1;
    }
    if (S.air.active && S.air.t > 0.5 && !S.dead) {
      var fl = Math.floor(Math.abs(S.air.rot) / (TAU * 0.86));
      txt('AIR ' + S.air.t.toFixed(1) + ' s' + (fl ? '   ·   ' + fl + ' FLIP' + (fl > 1 ? 'S' : '') : ''), W / 2, H * 0.36, 22 * u, '#ffd9b0', 'center', '800 italic');
    }
    if (S.hint > 0 && !isTouch && !S.dead) {
      g.globalAlpha = Math.min(1, S.hint);
      txt('↑ GAZ    ↓ FREIN    ← → ROTATION EN L\'AIR    ESPACE / CLIC : NITRO    R : RECOMMENCER', W / 2, H - 26 * u, 13 * u, 'rgba(255,255,255,0.85)', 'center', '700');
      g.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- menu : scène réaliste animée
  var menuVeh = 'monster', menuCycle = 0;
  var MENU_DEF = { monster: 'junk', moto: 'beach', civic: 'touge', truck: 'desert' };
  function drawMenuScene(t) {
    var theme = MENU_DEF[menuVeh] || 'beach', w = LV.worlds.filter(function (x) { return x.scene === theme; })[0];
    var def = { theme: theme, c: w ? w.c : LV.worlds[0].c };
    var cam = { x: t * 60, y: 0, s: 1 };
    drawBackdrop(def, cam, t);
    var sc = scn(def), gy = H * (W < H ? 0.9 : 0.84);
    // sol : bande de piste texturée
    g.save(); g.translate(-t * 60 % 256, 0);
    g.fillStyle = pat(sc.top); g.fillRect(0, gy - 34, W + 512, 34);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, gy - 34, W + 512, 34);
    g.fillStyle = pat(sc.body); g.fillRect(0, gy, W + 512, H - gy);
    g.restore();
    var dg = g.createLinearGradient(0, gy, 0, H); dg.addColorStop(0, 'rgba(0,0,0,0.1)'); dg.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = dg; g.fillRect(0, gy, W, H - gy);
    if (theme === 'touge') { g.strokeStyle = 'rgba(240,240,230,0.8)'; g.lineWidth = 3; g.setLineDash([40, 34]); g.lineDashOffset = t * 60; g.beginPath(); g.moveTo(0, gy - 17); g.lineTo(W, gy - 17); g.stroke(); g.setLineDash([]); }
    var vk = menuVeh, vv = VEH[vk], r = Math.min(W, H), scl = (W < H ? W / 520 : r / 520) * 1.1 * (vk === 'truck' ? 0.62 : vk === 'moto' ? 1.4 : vk === 'civic' ? 1.05 : 0.95);
    var px = W < H ? W * 0.5 : W * 0.7, py = gy - (vv.R - 14) * scl - 6 * scl;
    var car = { vk: vk, x: 0, y: 0, a: -0.03 + Math.sin(t * 2) * 0.01, wheels: [{ dist: vv.R - 14 + Math.sin(t * 2.3) * 2, spin: t * 6 }, { dist: vv.R - 14 + Math.cos(t * 2.1) * 2, spin: t * 6 }] };
    var sh = g.createRadialGradient(px, gy - 8, 4, px, gy - 8, (vv.WB + 80) * scl);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(0, gy - 8); g.scale(1, 0.14); g.translate(0, -(gy - 8)); g.fillStyle = sh; g.beginPath(); g.arc(px, gy - 8, (vv.WB + 80) * scl, 0, TAU); g.fill(); g.restore();
    g.save(); g.translate(px, py); g.scale(scl, scl);
    VX.drawVehicle(g, car, save.color, false, t, CAR_COLORS);
    g.restore();
    staticLayer('menuveil', theme + '|' + W + 'x' + H + '|' + bgRes(), function () {
      g.fillStyle = sc.grade; g.fillRect(0, 0, W, H);
      // assombrit la gauche pour la lisibilité des menus
      var lg = g.createLinearGradient(0, 0, W * 0.6, 0); lg.addColorStop(0, 'rgba(6,8,14,0.78)'); lg.addColorStop(1, 'rgba(6,8,14,0)');
      g.fillStyle = lg; g.fillRect(0, 0, W, H);
      var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    });
  }

  // ---- compte-tours : cadran statique pré-rendu + aiguille, diodes de passage, rupteur
  var TACH = { key: '', c: null };
  var T_A0 = Math.PI * 0.75, T_SW = Math.PI * 1.5;
  function tachAng(rpm, E) { return T_A0 + T_SW * clamp(rpm / (E.dial * 1000), 0, 1); }
  function tachFace(E, u, R) {
    var key = V.engine + '|' + u + '|' + DPR;
    if (TACH.key === key) return TACH.c;
    var sz = Math.ceil((R * 2 + 8) * DPR), c = TACH.c || mkCanvas(1, 1); c.width = sz; c.height = sz;
    var x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, (R + 4) * DPR, (R + 4) * DPR);
    var fg = x.createRadialGradient(0, -R * 0.3, R * 0.1, 0, 0, R);
    fg.addColorStop(0, '#22262e'); fg.addColorStop(1, '#0a0b0e');
    x.fillStyle = fg; x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, R - 0.75, 0, TAU); x.stroke();
    // zone rouge
    x.strokeStyle = '#e8403a'; x.lineWidth = R * 0.1;
    x.beginPath(); x.arc(0, 0, R * 0.86, tachAng(E.red, E), tachAng(E.dial * 1000, E)); x.stroke();
    // graduations
    var step = E.dial > 12 ? 2 : 1, major = E.dial * 1000, sub = E.dial <= 3 ? 250 : 500;
    for (var r = 0; r <= major + 1; r += sub) {
      var an = tachAng(r, E), isMaj = r % 1000 === 0, ca = Math.cos(an), sa = Math.sin(an);
      var r0 = R * (isMaj ? 0.72 : 0.8), r1 = R * 0.92;
      x.strokeStyle = r >= E.red ? '#ff7a6a' : 'rgba(255,255,255,0.85)'; x.lineWidth = isMaj ? 2 : 1;
      x.beginPath(); x.moveTo(ca * r0, sa * r0); x.lineTo(ca * r1, sa * r1); x.stroke();
      if (isMaj && (r / 1000) % step === 0) {
        x.fillStyle = r >= E.red ? '#ff8a7a' : '#e9ecf1';
        x.font = '700 italic ' + Math.round(R * 0.2) + 'px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(r / 1000), ca * R * 0.56, sa * R * 0.56);
      }
    }
    x.fillStyle = 'rgba(255,255,255,0.45)'; x.font = '700 ' + Math.round(R * 0.11) + 'px ' + FONT; x.textAlign = 'center';
    x.fillText('×1000 TR/MIN', 0, R * 0.86);
    TACH.key = key; TACH.c = c;
    return c;
  }
  function drawTacho(x0, y0, u, car, t) {
    var E = ENG[V.engine] || ENG.v8, R = Math.round(56 * u), PW = 196 * u;
    var cx = x0 + PW - R - 10 * u, cy = y0 + 22 * u + R;
    panel(x0, y0, PW, R * 2 + 30 * u, 10);
    // diodes de passage de rapport (clignotent en bleu sur le rupteur)
    var rpm = car.rpm, onLim = car.limT < 0.14, nL = 11, lw = (PW - 24 * u) / nL;
    for (var i = 0; i < nL; i++) {
      var th = E.red * (0.68 + 0.32 * i / (nL - 1)), lit = rpm >= th;
      var col = i < 5 ? '#3ddc6a' : i < 8 ? '#ffc23a' : '#ff3b30';
      if (onLim) { lit = Math.floor(t * 24) % 2 === 0; col = '#5aa8ff'; }
      g.fillStyle = lit ? col : 'rgba(255,255,255,0.1)';
      g.beginPath(); g.arc(x0 + 12 * u + lw * (i + 0.5), y0 + 10 * u, 2.8 * u, 0, TAU); g.fill();
    }
    g.drawImage(tachFace(E, u, R), cx - R - 4, cy - R - 4, R * 2 + 8, R * 2 + 8);
    // arc lumineux jusqu'au régime
    g.strokeStyle = rpm >= E.red ? 'rgba(255,80,60,0.95)' : 'rgba(255,138,43,0.9)'; g.lineWidth = 2.5 * u;
    g.beginPath(); g.arc(cx, cy, R * 0.97, T_A0, tachAng(rpm, E)); g.stroke();
    // aiguille
    g.save(); g.translate(cx, cy); g.rotate(tachAng(rpm, E));
    g.fillStyle = '#ff5a2e'; g.beginPath(); g.moveTo(-R * 0.14, -2.2 * u); g.lineTo(R * 0.9, -0.8 * u); g.lineTo(R * 0.9, 0.8 * u); g.lineTo(-R * 0.14, 2.2 * u); g.fill();
    g.restore();
    g.fillStyle = '#2a2d33'; g.beginPath(); g.arc(cx, cy, R * 0.1, 0, TAU); g.fill();
    // rapport engagé
    txt(String((car.gear || 0) + 1), cx, cy + R * 0.34, R * 0.32, onLim ? '#ff5a4a' : '#fff', 'center', '800 italic');
    if (car.limT < 0.3) {
      g.globalAlpha = Math.floor(t * 16) % 2 ? 1 : 0.35;
      txt('RUPTEUR', cx, cy + R * 0.62, 10 * u, '#ff5a4a', 'center', '800 italic');
      g.globalAlpha = 1;
    }
    // colonne de gauche : vitesse, VTEC, chrono
    var lx = x0 + 12 * u, kmh = Math.round(Math.hypot(car.vx, car.vy) * 0.12);
    txt(String(kmh), lx, cy - R * 0.42, 26 * u, '#fff', 'left', '800 italic');
    txt('KM/H', lx + 1, cy - R * 0.42 + 18 * u, 10 * u, 'rgba(255,255,255,0.6)', 'left', '700');
    if (E.vtec) {
      var vOn = rpm >= E.vtec;
      g.fillStyle = vOn ? 'rgba(235,40,40,0.95)' : 'rgba(255,255,255,0.08)';
      g.fillRect(lx, cy + R * 0.12, 34 * u, 14 * u);
      txt('VTEC', lx + 17 * u, cy + R * 0.12 + 7.2 * u, 10 * u, vOn ? '#fff' : 'rgba(255,255,255,0.35)', 'center', '800 italic');
    }
    txt(S.t.toFixed(1) + ' s', lx, cy + R * 0.82, 12 * u, 'rgba(255,255,255,0.75)', 'left', '700');
  }

  // ---------------------------------------------------------------- boucle
  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;
    if (!document.hidden) {
      // qualité adaptative : si la moyenne sur 45 images dépasse ~45 i/s, on baisse la résolution interne
      if (rawDt < 0.25) { perfAcc += rawDt; perfN++; }
      if (perfN >= 45) {
        var avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
        if (avg > 0.022 && DPR > 0.75) { DPR_CAP = Math.max(0.75, DPR - 0.25); save.q = DPR_CAP; persist(); resize(); }
      }
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
