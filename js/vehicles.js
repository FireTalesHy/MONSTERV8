/* MONSTER V8 — les 4 véhicules : paramètres physiques + dessin (côté du véhicule, origine = centre du châssis) */
(function () {
  'use strict';
  var TAU = Math.PI * 2;

  function shade(hex, f) {
    if (hex.charAt(0) !== '#' || hex.length !== 7) return hex;
    var r = Math.min(255, Math.round(parseInt(hex.substr(1, 2), 16) * f));
    var g = Math.min(255, Math.round(parseInt(hex.substr(3, 2), 16) * f));
    var b = Math.min(255, Math.round(parseInt(hex.substr(5, 2), 16) * f));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // WR rayon roue · WB demi-empattement · R longueur de suspension · K/C ressort/amortisseur · INV_I 1/inertie
  // P poussée par roue · VMAX vitesse de pointe au sol · AIR_ROT contrôle en l'air · zoom : cadrage caméra
  // pts : points de collision de la carrosserie ; roof : ceux qui font exploser le véhicule au contact du sol
  var VEH = {
    moto: {
      key: 'moto', name: 'MOTO', WR: 24, WB: 56, R: 50, K: 85, C: 9, KH: 500, INV_I: 1 / 1050,
      P: 1000, BRAKE: 1300, VMAX: 2100, RMAX: 600, MU: 2.8, BOOST: 1700, DQ: 0.00024, WHEELIE: 2.4, AIR_ROT: 13, WMAX: 10,
      zoom: 1.35, engine: 'bike', glow: '#00e5ff',
      pts: [[48, -52], [30, -46], [-72, -42], [6, -92], [-24, -72], [68, -34]], roof: { 3: 1, 4: 1 },
      exhaust: [-80, -26], far: false
    },
    monster: {
      key: 'monster', name: 'MONSTER TRUCK', WR: 38, WB: 68, R: 78, K: 46, C: 10, KH: 420, INV_I: 1 / 2800,
      P: 820, BRAKE: 1100, VMAX: 1800, RMAX: 520, MU: 2.6, BOOST: 1500, DQ: 0.00026, WHEELIE: 1.0, AIR_ROT: 9.5, WMAX: 8.5,
      zoom: 1.0, engine: 'v8', glow: '#ff2e97',
      pts: [[112, -18], [112, -34], [34, -68], [-40, -68], [-110, -34], [-108, -14], [66, -50], [-70, -46]], roof: { 2: 1, 3: 1 },
      exhaust: [-114, -12], far: true
    },
    civic: {
      key: 'civic', name: 'CIVIC TYPE R', WR: 27, WB: 74, R: 58, K: 78, C: 13, KH: 520, INV_I: 1 / 2300,
      P: 900, BRAKE: 1500, VMAX: 1950, RMAX: 520, MU: 3.2, BOOST: 1550, DQ: 0.00023, WHEELIE: 0.5, AIR_ROT: 8.5, WMAX: 8,
      zoom: 1.12, engine: 'vtec', glow: '#00e5ff',
      pts: [[94, -16], [92, -32], [14, -60], [-34, -60], [-92, -34], [-94, -14], [58, -40], [-74, -46]], roof: { 2: 1, 3: 1 },
      exhaust: [-98, -14], far: true
    },
    truck: {
      key: 'truck', name: 'CAMION', WR: 34, WB: 128, R: 84, K: 58, C: 12, KH: 480, INV_I: 1 / 9500,
      P: 760, BRAKE: 950, VMAX: 1550, RMAX: 440, MU: 2.8, BOOST: 1250, DQ: 0.00029, WHEELIE: 0.15, AIR_ROT: 3.6, WMAX: 4.5,
      zoom: 0.78, engine: 'diesel', glow: '#ffe14d',
      pts: [[172, -26], [150, -78], [112, -104], [40, -112], [-150, -112], [-176, -60], [-176, -24]], roof: { 2: 1, 3: 1, 4: 1 },
      exhaust: [70, -112], far: true
    }
  };

  // ------------------------------------------------------------------ pièces communes
  function tire(gx, r, spin, o) {
    gx.save(); gx.rotate(spin);
    gx.fillStyle = o.tire || '#121418'; gx.beginPath(); gx.arc(0, 0, r, 0, TAU); gx.fill();
    if (o.lugs) {
      gx.fillStyle = o.lugCol || '#272b33';
      for (var l = 0; l < o.lugs; l++) { gx.save(); gx.rotate(l * TAU / o.lugs); gx.fillRect(r - r * 0.24, -r * 0.13, r * 0.28, r * 0.26); gx.restore(); }
    }
    gx.fillStyle = o.side || '#2d323b'; gx.beginPath(); gx.arc(0, 0, r * 0.74, 0, TAU); gx.fill();
    if (o.neon) { gx.strokeStyle = o.neon; gx.lineWidth = 2.5; gx.beginPath(); gx.arc(0, 0, r * 0.8, 0, TAU); gx.stroke(); }
    var rr = r * (o.rimR || 0.5);
    var rg = gx.createRadialGradient(-rr * 0.2, -rr * 0.2, 1, 0, 0, rr);
    rg.addColorStop(0, o.rim1 || '#f1f5f9'); rg.addColorStop(1, o.rim2 || '#8b95a3');
    gx.fillStyle = rg; gx.beginPath(); gx.arc(0, 0, rr, 0, TAU); gx.fill();
    gx.strokeStyle = o.spoke || '#475569'; gx.lineWidth = Math.max(2, r * 0.08);
    var sp = o.spokes || 5;
    for (var s = 0; s < sp; s++) { gx.beginPath(); gx.moveTo(0, 0); gx.lineTo(Math.cos(s * TAU / sp) * rr * 0.95, Math.sin(s * TAU / sp) * rr * 0.95); gx.stroke(); }
    gx.fillStyle = o.hub || '#ffd21f'; gx.beginPath(); gx.arc(0, 0, Math.max(3, r * 0.13), 0, TAU); gx.fill();
    gx.restore();
  }
  function farWheel(gx, x, y, r, spin) {
    gx.save(); gx.translate(x, y); gx.scale(0.93, 0.93); gx.rotate(spin * 0.97);
    gx.fillStyle = '#0c0d10'; gx.beginPath(); gx.arc(0, 0, r, 0, TAU); gx.fill();
    gx.fillStyle = '#3b4250'; gx.beginPath(); gx.arc(0, 0, r * 0.45, 0, TAU); gx.fill();
    gx.restore();
  }
  function flame(gx, x, y, dirx, len, big) {
    var fl = len + Math.random() * len;
    var fg = gx.createLinearGradient(x, y, x + dirx * fl * 2, y);
    fg.addColorStop(0, '#fff'); fg.addColorStop(0.3, '#ffb020'); fg.addColorStop(1, 'rgba(255,60,0,0)');
    gx.fillStyle = fg; gx.beginPath(); gx.moveTo(x, y - big); gx.lineTo(x + dirx * fl * 2, y - big * 0.4 + Math.random() * big); gx.lineTo(x, y + big); gx.fill();
  }
  function spring(gx, lx, top, bottom, col) {
    gx.strokeStyle = col || '#ffd21f'; gx.lineWidth = 6; gx.lineJoin = 'round';
    gx.beginPath(); gx.moveTo(lx, top);
    for (var c = 1; c <= 6; c++) gx.lineTo(lx + (c % 2 ? 10 : -10), top + (bottom - top) * c / 7);
    gx.lineTo(lx, bottom); gx.stroke();
  }

  // ------------------------------------------------------------------ MONSTER TRUCK (coupé V8)
  function drawMonster(gx, car, col, boosting) {
    var V = VEH.monster, WB = V.WB, WR = V.WR, i;
    for (i = 0; i < 2; i++) farWheel(gx, (i ? WB : -WB) - 14, car.wheels[i].dist - WR - 17, WR, car.wheels[i].spin);
    for (i = 0; i < 2; i++) {
      var lx = i ? WB : -WB, wy = car.wheels[i].dist - WR;
      spring(gx, lx, -14, wy);
      gx.strokeStyle = '#444'; gx.lineWidth = 8; gx.globalAlpha = 0.5; gx.beginPath(); gx.moveTo(lx, -14); gx.lineTo(lx, wy); gx.stroke(); gx.globalAlpha = 1;
    }
    if (boosting) flame(gx, -112, -12, -1, 40, 8);
    var body = new Path2D();
    body.moveTo(-106, -8); body.lineTo(-112, -24); body.quadraticCurveTo(-111, -38, -100, -41);
    body.lineTo(-64, -45); body.quadraticCurveTo(-48, -52, -37, -62); body.quadraticCurveTo(-30, -69, -18, -69);
    body.lineTo(14, -69); body.quadraticCurveTo(26, -68, 34, -61); body.lineTo(54, -47);
    body.lineTo(98, -43); body.quadraticCurveTo(111, -42, 114, -31); body.lineTo(115, -16); body.quadraticCurveTo(114, -8, 106, -8);
    body.closePath();
    var bg = gx.createLinearGradient(0, -70, 0, -6);
    bg.addColorStop(0, col.a); bg.addColorStop(0.55, col.a); bg.addColorStop(1, col.b);
    for (var ex = 7; ex >= 1; ex--) {
      gx.save(); gx.translate(-ex * 1.0, -ex * 1.35);
      gx.fillStyle = ex > 4 ? shade(col.b, 0.55) : shade(col.b, 0.8); gx.fill(body); gx.restore();
    }
    gx.fillStyle = bg; gx.fill(body);
    gx.lineWidth = 3; gx.strokeStyle = 'rgba(0,0,0,0.55)'; gx.stroke(body);
    gx.fillStyle = 'rgba(255,255,255,0.28)'; gx.beginPath(); gx.moveTo(-96, -39); gx.lineTo(-60, -43); gx.lineTo(96, -42); gx.lineTo(96, -38); gx.lineTo(-96, -36); gx.fill();
    gx.fillStyle = 'rgba(255,255,255,0.85)'; gx.fillRect(-104, -22, 214, 5);
    gx.fillStyle = '#16222e'; gx.beginPath(); gx.moveTo(-56, -47); gx.lineTo(-33, -62); gx.lineTo(-18, -65); gx.lineTo(13, -65); gx.lineTo(25, -61); gx.lineTo(44, -47); gx.closePath(); gx.fill();
    gx.fillStyle = 'rgba(120,180,230,0.35)'; gx.beginPath(); gx.moveTo(-30, -61); gx.lineTo(-18, -64); gx.lineTo(-4, -64); gx.lineTo(-24, -48); gx.lineTo(-40, -48); gx.fill();
    gx.fillStyle = col.b; gx.fillRect(-6, -66, 5, 20);
    gx.fillStyle = '#0a0f14'; gx.beginPath(); gx.arc(-22, -54, 6, 0, TAU); gx.fill(); gx.fillRect(-28, -49, 13, 4);
    gx.fillStyle = '#9aa4ae'; gx.beginPath(); gx.moveTo(62, -45); gx.lineTo(66, -60); gx.lineTo(90, -60); gx.lineTo(94, -45); gx.fill();
    gx.fillStyle = '#e5e7eb'; gx.fillRect(66, -63, 24, 5);
    gx.fillStyle = '#111'; gx.fillRect(70, -59, 16, 4);
    gx.strokeStyle = '#555'; gx.lineWidth = 2; gx.beginPath(); for (var s = 0; s < 4; s++) { gx.moveTo(69 + s * 6, -58); gx.lineTo(69 + s * 6, -46); } gx.stroke();
    gx.fillStyle = '#fff6b0'; gx.beginPath(); gx.arc(109, -31, 6, 0, TAU); gx.fill();
    gx.fillStyle = '#ff2d2d'; gx.fillRect(-113, -35, 5, 10);
    gx.fillStyle = '#e5e7eb'; gx.fillRect(111, -24, 8, 14); gx.fillRect(-117, -22, 7, 12);
    gx.fillStyle = '#cbd5e1'; gx.fillRect(-46, -13, 54, 5);
    gx.fillStyle = '#111'; gx.beginPath(); gx.arc(-12, -31, 11, 0, TAU); gx.fill();
    gx.fillStyle = '#fff'; gx.font = 'bold 12px Orbitron, Impact, sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.fillText('V8', -12, -30);
    for (var w = 0; w < 2; w++) {
      gx.save(); gx.translate(w ? WB : -WB, car.wheels[w].dist - WR);
      tire(gx, WR, car.wheels[w].spin, { lugs: 14, rimR: 0.47, neon: '#ff2e97' });
      gx.restore();
    }
  }

  // ------------------------------------------------------------------ HONDA CIVIC TYPE R « tuning »
  function drawCivic(gx, car, col, boosting, t) {
    var V = VEH.civic, WB = V.WB, WR = V.WR, i;
    // néons sous la caisse
    var ug = gx.createRadialGradient(0, 4, 4, 0, 4, 120);
    ug.addColorStop(0, 'rgba(0,229,255,0.85)'); ug.addColorStop(0.5, 'rgba(255,46,151,0.35)'); ug.addColorStop(1, 'rgba(255,46,151,0)');
    gx.fillStyle = ug; gx.beginPath(); gx.ellipse(0, 4, 118, 26, 0, 0, TAU); gx.fill();
    for (i = 0; i < 2; i++) farWheel(gx, (i ? WB : -WB) - 10, car.wheels[i].dist - WR - 12, WR, car.wheels[i].spin);
    for (i = 0; i < 2; i++) {
      var lx = i ? WB : -WB, wy = car.wheels[i].dist - WR;
      gx.strokeStyle = '#d4a017'; gx.lineWidth = 5; gx.beginPath(); gx.moveTo(lx, -10); gx.lineTo(lx, wy); gx.stroke();
      gx.strokeStyle = '#111'; gx.lineWidth = 9; gx.globalAlpha = 0.45; gx.beginPath(); gx.moveTo(lx, -10); gx.lineTo(lx, wy); gx.stroke(); gx.globalAlpha = 1;
    }
    if (boosting) { flame(gx, -98, -14, -1, 40, 5); flame(gx, -98, -9, -1, 30, 3); }
    var body = new Path2D();
    body.moveTo(-92, -7); body.lineTo(-95, -26); body.quadraticCurveTo(-94, -34, -86, -37);
    body.lineTo(-62, -45); body.quadraticCurveTo(-46, -56, -30, -60); body.lineTo(12, -60);
    body.quadraticCurveTo(24, -60, 32, -53); body.lineTo(54, -39); body.lineTo(84, -33);
    body.quadraticCurveTo(95, -31, 96, -20); body.lineTo(96, -8); body.quadraticCurveTo(95, -6, 90, -6);
    body.closePath();
    for (var ex = 5; ex >= 1; ex--) {
      gx.save(); gx.translate(-ex * 0.9, -ex * 1.2);
      gx.fillStyle = ex > 3 ? shade(col.b, 0.5) : shade(col.b, 0.75); gx.fill(body); gx.restore();
    }
    var bg = gx.createLinearGradient(0, -60, 0, -6);
    bg.addColorStop(0, col.a); bg.addColorStop(0.6, col.a); bg.addColorStop(1, col.b);
    gx.fillStyle = bg; gx.fill(body);
    gx.lineWidth = 3; gx.strokeStyle = 'rgba(0,0,0,0.6)'; gx.stroke(body);
    // bas de caisse noir + liseré rouge Type R
    gx.fillStyle = '#14101e'; gx.fillRect(-88, -14, 180, 8);
    gx.fillStyle = '#ff2030'; gx.fillRect(-88, -16, 180, 2.5);
    // vitres teintées
    gx.fillStyle = '#0d1424'; gx.beginPath(); gx.moveTo(-58, -43); gx.lineTo(-30, -57); gx.lineTo(10, -57); gx.lineTo(22, -52); gx.lineTo(44, -40); gx.closePath(); gx.fill();
    gx.fillStyle = 'rgba(0,229,255,0.28)'; gx.beginPath(); gx.moveTo(-28, -56); gx.lineTo(-8, -56); gx.lineTo(-30, -42); gx.lineTo(-48, -42); gx.fill();
    gx.fillStyle = shade(col.b, 0.7); gx.fillRect(-12, -57, 4, 16);
    // aileron fixe « tuning » + aileron avant
    gx.fillStyle = '#14101e'; gx.fillRect(-104, -56, 38, 5);
    gx.fillStyle = '#ff2e97'; gx.fillRect(-104, -56, 38, 2);
    gx.strokeStyle = '#14101e'; gx.lineWidth = 4; gx.beginPath(); gx.moveTo(-96, -51); gx.lineTo(-92, -36); gx.moveTo(-74, -51); gx.lineTo(-74, -42); gx.stroke();
    gx.fillStyle = '#14101e'; gx.fillRect(80, -8, 22, 4);
    // phare LED, feu arrière, triple sortie d'échappement
    gx.fillStyle = '#f0fbff'; gx.beginPath(); gx.moveTo(84, -33); gx.lineTo(95, -30); gx.lineTo(94, -25); gx.lineTo(80, -28); gx.fill();
    gx.fillStyle = '#ff2030'; gx.fillRect(-96, -32, 5, 8);
    gx.fillStyle = '#9aa4ae';
    gx.beginPath(); gx.arc(-97, -15, 3.2, 0, TAU); gx.arc(-97, -10, 3.2, 0, TAU); gx.arc(-97, -20, 3.2, 0, TAU); gx.fill();
    // stickers
    gx.fillStyle = '#ff2e97'; gx.fillRect(-60, -30, 26, 5);
    gx.fillStyle = '#00e5ff'; gx.fillRect(-56, -24, 18, 3);
    gx.fillStyle = '#ff2030'; gx.fillRect(2, -31, 30, 11);
    gx.fillStyle = '#fff'; gx.font = '900 9px Orbitron, Arial Black, sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.fillText('TYPE R', 17, -25);
    for (var w = 0; w < 2; w++) {
      gx.save(); gx.translate(w ? WB : -WB, car.wheels[w].dist - WR);
      tire(gx, WR, car.wheels[w].spin, { tire: '#101114', side: '#1a1c22', rimR: 0.66, rim1: '#ffe9a8', rim2: '#c98f12', spoke: '#5a3d05', spokes: 10, hub: '#ff2030', neon: '#00e5ff' });
      gx.restore();
    }
  }

  // ------------------------------------------------------------------ MOTO sportive + pilote
  function drawMoto(gx, car, col, boosting) {
    var V = VEH.moto, WB = V.WB, WR = V.WR;
    var fy = car.wheels[1].dist - WR, ry = car.wheels[0].dist - WR;
    if (boosting) flame(gx, -80, -26, -1, 42, 5);
    // roues
    var w;
    for (w = 0; w < 2; w++) {
      gx.save(); gx.translate(w ? WB : -WB, w ? fy : ry);
      tire(gx, WR, car.wheels[w].spin, { tire: '#0e0f13', side: '#161821', rimR: 0.62, rim1: '#e8fbff', rim2: '#7fb7c9', spoke: '#1b6678', spokes: 6, hub: '#ff2e97', neon: '#00e5ff' });
      gx.restore();
    }
    // bras oscillant + fourche
    gx.lineCap = 'round';
    gx.strokeStyle = '#b8c2cc'; gx.lineWidth = 7; gx.beginPath(); gx.moveTo(-WB, ry); gx.lineTo(-24, -14); gx.stroke();
    gx.strokeStyle = '#e5e7eb'; gx.lineWidth = 6; gx.beginPath(); gx.moveTo(WB, fy); gx.lineTo(40, -44); gx.stroke();
    gx.strokeStyle = '#ffd21f'; gx.lineWidth = 4; gx.beginPath(); gx.moveTo(-22, -34); gx.lineTo(-36, ry * 0.35 - 2); gx.stroke();
    // bloc moteur
    gx.fillStyle = '#1b1530'; gx.beginPath(); gx.moveTo(-30, -36); gx.lineTo(26, -38); gx.lineTo(30, -10); gx.lineTo(-24, -8); gx.closePath(); gx.fill();
    gx.strokeStyle = '#00e5ff'; gx.lineWidth = 2; gx.beginPath(); for (var f = 0; f < 4; f++) { gx.moveTo(-18 + f * 11, -34); gx.lineTo(-18 + f * 11, -12); } gx.stroke();
    // échappement
    gx.fillStyle = '#cbd5e1'; gx.beginPath(); gx.moveTo(-26, -16); gx.lineTo(-80, -28); gx.lineTo(-82, -22); gx.lineTo(-24, -8); gx.fill();
    // pilote : jambe, torse, bras, casque
    gx.strokeStyle = '#1b1038'; gx.lineCap = 'round'; gx.lineJoin = 'round';
    gx.lineWidth = 11; gx.beginPath(); gx.moveTo(-20, -50); gx.lineTo(16, -34); gx.lineTo(6, -16); gx.stroke();
    // carénage + réservoir + selle
    var fair = new Path2D();
    fair.moveTo(26, -46); fair.quadraticCurveTo(52, -64, 80, -40); fair.lineTo(74, -26); fair.lineTo(30, -24); fair.closePath();
    var tank = new Path2D();
    tank.moveTo(-26, -50); tank.quadraticCurveTo(2, -64, 32, -48); tank.lineTo(28, -30); tank.lineTo(-26, -30); tank.closePath();
    var tail = new Path2D();
    tail.moveTo(-24, -48); tail.lineTo(-66, -46); tail.quadraticCurveTo(-82, -42, -78, -32); tail.lineTo(-24, -30); tail.closePath();
    var bg = gx.createLinearGradient(0, -64, 0, -24); bg.addColorStop(0, col.a); bg.addColorStop(1, col.b);
    gx.fillStyle = bg; gx.strokeStyle = 'rgba(0,0,0,0.6)'; gx.lineWidth = 3;
    gx.fill(fair); gx.stroke(fair); gx.fill(tank); gx.stroke(tank); gx.fill(tail); gx.stroke(tail);
    gx.fillStyle = '#fff'; gx.fillRect(-60, -38, 40, 3); gx.fillStyle = '#00e5ff'; gx.fillRect(-60, -34, 30, 2);
    gx.fillStyle = '#fff6b0'; gx.beginPath(); gx.arc(76, -36, 5, 0, TAU); gx.fill();
    gx.fillStyle = '#ff2030'; gx.fillRect(-82, -40, 5, 7);
    // torse + bras + casque
    gx.strokeStyle = '#1b1038'; gx.lineWidth = 20; gx.beginPath(); gx.moveTo(-14, -54); gx.lineTo(14, -74); gx.stroke();
    gx.strokeStyle = col.a; gx.lineWidth = 5; gx.beginPath(); gx.moveTo(-12, -60); gx.lineTo(10, -76); gx.stroke();
    gx.strokeStyle = '#1b1038'; gx.lineWidth = 8; gx.beginPath(); gx.moveTo(12, -70); gx.lineTo(30, -62); gx.lineTo(50, -54); gx.stroke();
    gx.fillStyle = '#f8fafc'; gx.beginPath(); gx.arc(20, -88, 13, 0, TAU); gx.fill();
    gx.strokeStyle = 'rgba(0,0,0,0.6)'; gx.lineWidth = 2.5; gx.stroke();
    gx.fillStyle = '#00e5ff'; gx.beginPath(); gx.moveTo(22, -94); gx.lineTo(33, -90); gx.lineTo(31, -83); gx.lineTo(21, -84); gx.fill();
    gx.fillStyle = '#ff2e97'; gx.fillRect(8, -92, 8, 3);
    gx.lineCap = 'butt';
  }

  // ------------------------------------------------------------------ CAMION : tracteur + remorque
  function drawTruck(gx, car, col, boosting, t) {
    var V = VEH.truck, WB = V.WB, WR = V.WR, i;
    var fy = car.wheels[1].dist - WR, ry = car.wheels[0].dist - WR;
    var ug = gx.createRadialGradient(0, 2, 4, 0, 2, 190);
    ug.addColorStop(0, 'rgba(255,225,77,0.55)'); ug.addColorStop(1, 'rgba(255,46,151,0)');
    gx.fillStyle = ug; gx.beginPath(); gx.ellipse(0, 4, 190, 22, 0, 0, TAU); gx.fill();
    farWheel(gx, WB - 14, fy - 14, WR, car.wheels[1].spin);
    farWheel(gx, -WB - 14, ry - 14, WR, car.wheels[0].spin);
    farWheel(gx, -WB - 62, ry - 14, WR, car.wheels[0].spin);
    // châssis
    gx.fillStyle = '#1b1530'; gx.fillRect(-176, -22, 346, 10);
    gx.strokeStyle = '#ffd21f'; gx.lineWidth = 5;
    gx.beginPath(); gx.moveTo(WB, -14); gx.lineTo(WB, fy); gx.moveTo(-WB, -14); gx.lineTo(-WB, ry); gx.stroke();
    // remorque
    for (var ex = 4; ex >= 1; ex--) { gx.save(); gx.translate(-ex * 1.4, -ex * 1.6); gx.fillStyle = shade('#c7cbd6', ex > 2 ? 0.4 : 0.6); gx.fillRect(-176, -112, 236, 92); gx.restore(); }
    var tg = gx.createLinearGradient(0, -112, 0, -20); tg.addColorStop(0, '#f4f6fb'); tg.addColorStop(1, '#b6bccb');
    gx.fillStyle = tg; gx.fillRect(-176, -112, 236, 92);
    gx.strokeStyle = 'rgba(0,0,0,0.55)'; gx.lineWidth = 3; gx.strokeRect(-176, -112, 236, 92);
    gx.strokeStyle = 'rgba(0,0,0,0.12)'; gx.lineWidth = 2;
    gx.beginPath(); for (var r = 0; r < 11; r++) { gx.moveTo(-160 + r * 21, -110); gx.lineTo(-160 + r * 21, -22); } gx.stroke();
    gx.fillStyle = col.a; gx.fillRect(-176, -70, 236, 16);
    gx.fillStyle = col.b; gx.fillRect(-176, -54, 236, 4);
    gx.fillStyle = '#12052e'; gx.font = '900 26px Orbitron, Arial Black, sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle';
    gx.fillText('V8 FREIGHT', -58, -92);
    gx.fillStyle = '#00e5ff'; gx.fillRect(-176, -24, 236, 3);
    // cabine
    var cab = new Path2D();
    cab.moveTo(64, -16); cab.lineTo(64, -104); cab.quadraticCurveTo(66, -112, 76, -112); cab.lineTo(124, -112);
    cab.quadraticCurveTo(134, -112, 140, -100); cab.lineTo(158, -66); cab.lineTo(172, -60); cab.lineTo(174, -16); cab.closePath();
    for (var ex2 = 4; ex2 >= 1; ex2--) { gx.save(); gx.translate(-ex2 * 1.2, -ex2 * 1.5); gx.fillStyle = shade(col.b, 0.55); gx.fill(cab); gx.restore(); }
    var cg = gx.createLinearGradient(0, -112, 0, -16); cg.addColorStop(0, col.a); cg.addColorStop(1, col.b);
    gx.fillStyle = cg; gx.fill(cab); gx.lineWidth = 3; gx.strokeStyle = 'rgba(0,0,0,0.6)'; gx.stroke(cab);
    gx.fillStyle = '#0d1424'; gx.beginPath(); gx.moveTo(100, -102); gx.lineTo(126, -102); gx.lineTo(148, -66); gx.lineTo(100, -66); gx.closePath(); gx.fill();
    gx.fillStyle = 'rgba(0,229,255,0.3)'; gx.beginPath(); gx.moveTo(104, -100); gx.lineTo(118, -100); gx.lineTo(112, -68); gx.lineTo(104, -68); gx.fill();
    gx.fillStyle = '#ffb020'; for (var l = 0; l < 4; l++) gx.fillRect(86 + l * 12, -118, 8, 5);
    gx.fillStyle = '#cbd5e1'; gx.fillRect(166, -48, 9, 26);
    gx.fillStyle = '#f0fbff'; gx.fillRect(164, -62, 9, 9);
    gx.fillStyle = '#e5e7eb'; for (var g = 0; g < 5; g++) gx.fillRect(150, -50 + g * 6, 18, 3);
    gx.fillStyle = '#fff'; gx.fillRect(68, -44, 52, 5);
    // cheminées chromées
    gx.fillStyle = '#d8dde6'; gx.fillRect(66, -138, 7, 30); gx.fillRect(78, -134, 7, 26);
    if (boosting) flame(gx, 70, -138, 0.0001, 0, 0);
    // roues (essieu avant + tandem arrière)
    var T = { lugs: 12, rimR: 0.52, neon: '#ffe14d', lugCol: '#232730', hub: '#ff2e97' };
    gx.save(); gx.translate(WB, fy); tire(gx, WR, car.wheels[1].spin, T); gx.restore();
    gx.save(); gx.translate(-WB, ry); tire(gx, WR, car.wheels[0].spin, T); gx.restore();
    gx.save(); gx.translate(-WB - 62, ry); tire(gx, WR, car.wheels[0].spin, T); gx.restore();
    if (boosting) { // flammes des cheminées
      for (var k = 0; k < 2; k++) {
        var fx = 69.5 + k * 12, fyy = k ? -134 : -138, fl = 30 + Math.random() * 30;
        var fg = gx.createLinearGradient(fx, fyy, fx - fl * 0.6, fyy - fl * 1.6);
        fg.addColorStop(0, '#fff'); fg.addColorStop(0.4, '#ffb020'); fg.addColorStop(1, 'rgba(255,60,0,0)');
        gx.fillStyle = fg; gx.beginPath(); gx.moveTo(fx - 5, fyy); gx.lineTo(fx - fl * 0.7, fyy - fl * 1.6); gx.lineTo(fx + 5, fyy); gx.fill();
      }
    }
  }

  function drawVehicle(gx, car, ci, boosting, t, colors) {
    var col = colors[ci] || colors[0];
    gx.save(); gx.translate(car.x, car.y); gx.rotate(car.a);
    var k = car.vk;
    if (k === 'moto') drawMoto(gx, car, col, boosting, t);
    else if (k === 'civic') drawCivic(gx, car, col, boosting, t);
    else if (k === 'truck') drawTruck(gx, car, col, boosting, t);
    else drawMonster(gx, car, col, boosting, t);
    gx.restore();
  }

  window.MV8_VEH = { VEH: VEH, drawVehicle: drawVehicle, tire: tire, shade: shade };
})();
