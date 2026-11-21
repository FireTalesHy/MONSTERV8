/* MONSTER V8 — les 4 véhicules : paramètres physiques + dessin réaliste (vue de côté, origine = centre du châssis) */
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
  function mix(hex, hex2, k) {
    var a = [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)];
    var b = [parseInt(hex2.substr(1, 2), 16), parseInt(hex2.substr(3, 2), 16), parseInt(hex2.substr(5, 2), 16)];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * k) + ',' + Math.round(a[1] + (b[1] - a[1]) * k) + ',' + Math.round(a[2] + (b[2] - a[2]) * k) + ')';
  }

  // WR rayon roue · WB demi-empattement · R longueur de suspension · K/C ressort/amortisseur · INV_I 1/inertie
  // P poussée par roue · VMAX vitesse de pointe au sol · AIR_ROT contrôle en l'air · zoom : cadrage caméra
  // pts : points de collision de la carrosserie ; roof : ceux qui font exploser le véhicule au contact du sol
  var VEH = {
    moto: {
      key: 'moto', name: 'MOTO', WR: 24, WB: 56, R: 50, K: 85, C: 9, KH: 500, INV_I: 1 / 1050,
      P: 1000, BRAKE: 1300, VMAX: 2100, RMAX: 600, MU: 2.8, BOOST: 1700, DQ: 0.00024, WHEELIE: 2.4, AIR_ROT: 22, WMAX: 14,
      zoom: 1.35, engine: 'bike', paint: { a: '#d8336f', b: '#5e0a2a' },
      pts: [[48, -52], [30, -46], [-72, -42], [6, -92], [-24, -72], [68, -34]], roof: { 3: 1, 4: 1 },
      exhaust: [-80, -26], far: false
    },
    monster: {
      key: 'monster', name: 'MONSTER TRUCK', WR: 38, WB: 68, R: 78, K: 46, C: 10, KH: 420, INV_I: 1 / 2800,
      P: 820, BRAKE: 1100, VMAX: 1800, RMAX: 520, MU: 2.6, BOOST: 1500, DQ: 0.00026, WHEELIE: 1.0, AIR_ROT: 19, WMAX: 13,
      zoom: 1.0, engine: 'v8', paint: { a: '#e8741c', b: '#6a2c06' },
      pts: [[112, -18], [112, -34], [34, -68], [-40, -68], [-110, -34], [-108, -14], [66, -50], [-70, -46]], roof: { 2: 1, 3: 1 },
      exhaust: [-114, -12], far: true
    },
    civic: {
      key: 'civic', name: 'CIVIC TYPE R', WR: 24, WB: 70, R: 54, K: 78, C: 13, KH: 520, INV_I: 1 / 2300,
      P: 900, BRAKE: 1500, VMAX: 1950, RMAX: 520, MU: 3.2, BOOST: 1550, DQ: 0.00023, WHEELIE: 0.5, AIR_ROT: 18, WMAX: 12.5,
      zoom: 1.12, engine: 'vtec', paint: { a: '#2f9a52', b: '#0b3a1c' },
      pts: [[95, 14], [88, 0], [18, -26], [-58, -28], [-90, -6], [-92, 14], [56, -8], [-76, -22]], roof: { 2: 1, 3: 1 },
      exhaust: [-98, 26], far: true
    },
    truck: {
      key: 'truck', name: 'CAMION', WR: 34, WB: 128, R: 84, K: 58, C: 12, KH: 480, INV_I: 1 / 9500,
      P: 760, BRAKE: 950, VMAX: 1550, RMAX: 440, MU: 2.8, BOOST: 1250, DQ: 0.00029, WHEELIE: 0.15, AIR_ROT: 8, WMAX: 7.5,
      zoom: 0.78, engine: 'diesel', paint: { a: '#c0141c', b: '#4a050a' },
      pts: [[172, -26], [150, -78], [112, -104], [40, -112], [-150, -112], [-176, -60], [-176, -24]], roof: { 2: 1, 3: 1, 4: 1 },
      exhaust: [70, -112], far: true
    }
  };

  // ------------------------------------------------------------------ matériaux
  // peinture métallisée : reflet du ciel en haut, ligne d'horizon sombre, sol réfléchi en bas
  function paint(gx, y0, y1, col) {
    var gr = gx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, mix(col, '#ffffff', 0.38));
    gr.addColorStop(0.18, mix(col, '#ffffff', 0.12));
    gr.addColorStop(0.46, col);
    gr.addColorStop(0.53, shade(col, 0.55));
    gr.addColorStop(0.6, shade(col, 0.92));
    gr.addColorStop(1, shade(col, 0.42));
    return gr;
  }
  function chrome(gx, y0, y1) {
    var gr = gx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#b9c0ca'); gr.addColorStop(0.5, '#4d535d'); gr.addColorStop(0.62, '#dfe4ea'); gr.addColorStop(1, '#7a818c');
    return gr;
  }
  function glass(gx, y0, y1) {
    var gr = gx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#c9d8ea'); gr.addColorStop(0.35, '#5a6c84'); gr.addColorStop(1, '#10161f');
    return gr;
  }
  function glow(gx, x, y, r, rgb, a) {
    var gr = gx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    var op = gx.globalCompositeOperation; gx.globalCompositeOperation = 'lighter';
    gx.fillStyle = gr; gx.fillRect(x - r, y - r, r * 2, r * 2);
    gx.globalCompositeOperation = op;
  }
  function specular(gx, pts, a) {
    gx.fillStyle = 'rgba(255,255,255,' + (a || 0.32) + ')';
    gx.beginPath(); gx.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) gx.lineTo(pts[i], pts[i + 1]); gx.closePath(); gx.fill();
  }

  // ------------------------------------------------------------------ roue réaliste
  // o : lugs (crampons), rimR (rayon jante), rim (couleur jante), spokes, caliper, offroad
  function tire(gx, r, spin, o) {
    o = o || {};
    gx.save(); gx.rotate(spin);
    var tg = gx.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.4, 0, 0, r);
    tg.addColorStop(0, '#2c2e33'); tg.addColorStop(0.8, '#18191c'); tg.addColorStop(1, '#0b0b0d');
    gx.fillStyle = tg; gx.beginPath(); gx.arc(0, 0, r, 0, TAU); gx.fill();
    var n = o.lugs || 0;
    if (n) {
      for (var l = 0; l < n; l++) {
        gx.save(); gx.rotate(l * TAU / n);
        gx.fillStyle = '#111214'; gx.fillRect(r - r * 0.2, -r * 0.11, r * 0.24, r * 0.22);
        gx.fillStyle = 'rgba(255,255,255,0.08)'; gx.fillRect(r - r * 0.2, -r * 0.11, r * 0.24, r * 0.04);
        gx.restore();
      }
    }
    // flanc : léger relief + inscriptions
    gx.strokeStyle = 'rgba(255,255,255,0.07)'; gx.lineWidth = Math.max(1, r * 0.04);
    gx.beginPath(); gx.arc(0, 0, r * 0.84, 0, TAU); gx.stroke();
    gx.strokeStyle = 'rgba(255,255,255,0.12)'; gx.lineWidth = Math.max(1, r * 0.025);
    gx.beginPath(); gx.arc(0, 0, r * 0.77, -2.6, -1.6); gx.stroke();
    gx.beginPath(); gx.arc(0, 0, r * 0.77, 0.5, 1.5); gx.stroke();
    // disque de frein
    var rr = r * (o.rimR || 0.6);
    gx.fillStyle = '#2a2d33'; gx.beginPath(); gx.arc(0, 0, rr, 0, TAU); gx.fill();
    var dg = gx.createRadialGradient(0, 0, rr * 0.2, 0, 0, rr * 0.8);
    dg.addColorStop(0, '#5f646c'); dg.addColorStop(1, '#9aa0a8');
    gx.fillStyle = dg; gx.beginPath(); gx.arc(0, 0, rr * 0.82, 0, TAU); gx.fill();
    gx.restore();
    if (o.caliper) {           // étrier fixe (ne tourne pas)
      gx.fillStyle = o.caliper; gx.beginPath(); gx.arc(0, 0, rr * 0.78, -0.75, -0.05); gx.arc(0, 0, rr * 0.5, -0.05, -0.75, true); gx.closePath(); gx.fill();
    }
    gx.save(); gx.rotate(spin);
    // jante alliage
    var rim = o.rim || '#c8ced6';
    var rg = gx.createRadialGradient(-rr * 0.35, -rr * 0.35, 1, 0, 0, rr);
    rg.addColorStop(0, mix(rim, '#ffffff', 0.5)); rg.addColorStop(0.7, rim); rg.addColorStop(1, shade(rim, 0.45));
    gx.strokeStyle = rg; gx.lineWidth = Math.max(2, rr * 0.16);
    gx.beginPath(); gx.arc(0, 0, rr * 0.92, 0, TAU); gx.stroke();
    var sp = o.spokes || 5;
    gx.lineCap = 'round';
    for (var s = 0; s < sp; s++) {
      var a = s * TAU / sp, ca = Math.cos(a), sa = Math.sin(a);
      gx.strokeStyle = rg; gx.lineWidth = Math.max(2, rr * (sp > 8 ? 0.1 : 0.2));
      gx.beginPath(); gx.moveTo(ca * rr * 0.22, sa * rr * 0.22); gx.lineTo(ca * rr * 0.88, sa * rr * 0.88); gx.stroke();
      gx.strokeStyle = 'rgba(0,0,0,0.35)'; gx.lineWidth = Math.max(1, rr * 0.05);
      gx.beginPath(); gx.moveTo(ca * rr * 0.22 + sa * 1.5, sa * rr * 0.22 - ca * 1.5); gx.lineTo(ca * rr * 0.86 + sa * 1.5, sa * rr * 0.86 - ca * 1.5); gx.stroke();
    }
    gx.lineCap = 'butt';
    var hg = gx.createRadialGradient(-rr * 0.08, -rr * 0.08, 0, 0, 0, rr * 0.24);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, shade(rim, 0.6));
    gx.fillStyle = hg; gx.beginPath(); gx.arc(0, 0, rr * 0.24, 0, TAU); gx.fill();
    gx.fillStyle = '#2a2d33';
    for (var b = 0; b < 5; b++) { var ba = b * TAU / 5; gx.beginPath(); gx.arc(Math.cos(ba) * rr * 0.14, Math.sin(ba) * rr * 0.14, Math.max(0.8, rr * 0.03), 0, TAU); gx.fill(); }
    gx.restore();
    if (o.ring) { gx.strokeStyle = o.ring; gx.lineWidth = Math.max(1.5, r * 0.06); gx.beginPath(); gx.arc(0, 0, rr * 1.02, 0, TAU); gx.stroke(); }
  }
  function farWheel(gx, x, y, r, spin) {
    gx.save(); gx.translate(x, y); gx.scale(0.93, 0.93);
    tire(gx, r, spin * 0.97, { lugs: 0, rimR: 0.58 });
    gx.fillStyle = 'rgba(0,0,0,0.55)'; gx.beginPath(); gx.arc(0, 0, r + 1, 0, TAU); gx.fill();
    gx.restore();
  }
  function flame(gx, x, y, dirx, len, big) {
    var fl = len + Math.random() * len;
    var op = gx.globalCompositeOperation; gx.globalCompositeOperation = 'lighter';
    var fg = gx.createLinearGradient(x, y, x + dirx * fl * 2, y);
    fg.addColorStop(0, 'rgba(200,225,255,0.95)'); fg.addColorStop(0.25, 'rgba(120,170,255,0.7)'); fg.addColorStop(0.55, 'rgba(255,150,60,0.55)'); fg.addColorStop(1, 'rgba(255,80,20,0)');
    gx.fillStyle = fg; gx.beginPath(); gx.moveTo(x, y - big); gx.quadraticCurveTo(x + dirx * fl, y - big * 0.8, x + dirx * fl * 2, y - big * 0.3 + Math.random() * big * 0.6); gx.quadraticCurveTo(x + dirx * fl, y + big * 0.8, x, y + big); gx.fill();
    gx.globalCompositeOperation = op;
  }
  function shock(gx, lx, top, bottom, springCol) {
    var cg = chrome(gx, 0, 1);
    var sg = gx.createLinearGradient(lx - 5, 0, lx + 5, 0); sg.addColorStop(0, '#6a717b'); sg.addColorStop(0.5, '#f2f4f7'); sg.addColorStop(1, '#5a606a');
    gx.fillStyle = sg; gx.fillRect(lx - 4, top, 8, (bottom - top) * 0.55);
    gx.fillStyle = '#2b2e34'; gx.fillRect(lx - 2.5, top + (bottom - top) * 0.5, 5, (bottom - top) * 0.5);
    gx.strokeStyle = springCol || '#c41e24'; gx.lineWidth = 3.5; gx.lineJoin = 'round';
    gx.beginPath(); gx.moveTo(lx, top + 3);
    for (var c = 1; c <= 7; c++) gx.lineTo(lx + (c % 2 ? 9 : -9), top + 3 + (bottom - top - 8) * c / 8);
    gx.stroke();
  }

  // ------------------------------------------------------------------ MONSTER TRUCK (coupé V8 années 70 surélevé)
  function drawMonster(gx, car, col, boosting) {
    var V = VEH.monster, WB = V.WB, WR = V.WR, i;
    for (i = 0; i < 2; i++) farWheel(gx, (i ? WB : -WB) - 14, car.wheels[i].dist - WR - 17, WR, car.wheels[i].spin);
    // châssis, pont, amortisseurs
    gx.fillStyle = '#1d1f24'; gx.fillRect(-92, -14, 184, 9);
    for (i = 0; i < 2; i++) {
      var lx = i ? WB : -WB, wy = car.wheels[i].dist - WR;
      gx.fillStyle = '#2b2e34'; gx.fillRect(lx - 30, wy - 5, 60, 10);
      shock(gx, lx - 14, -12, wy - 2, '#c41e24'); shock(gx, lx + 14, -12, wy - 2, '#c41e24');
    }
    if (boosting) flame(gx, -114, -12, -1, 36, 7);
    var body = new Path2D();
    body.moveTo(-106, -8); body.lineTo(-112, -24); body.quadraticCurveTo(-111, -38, -100, -41);
    body.lineTo(-64, -45); body.quadraticCurveTo(-48, -52, -37, -62); body.quadraticCurveTo(-30, -69, -18, -69);
    body.lineTo(14, -69); body.quadraticCurveTo(26, -68, 34, -61); body.lineTo(54, -47);
    body.lineTo(98, -43); body.quadraticCurveTo(111, -42, 114, -31); body.lineTo(115, -16); body.quadraticCurveTo(114, -8, 106, -8);
    body.closePath();
    for (var ex = 6; ex >= 1; ex--) { gx.save(); gx.translate(-ex * 1.0, -ex * 1.3); gx.fillStyle = shade(col.b, ex > 3 ? 0.6 : 0.9); gx.fill(body); gx.restore(); }
    gx.fillStyle = paint(gx, -70, -8, col.a); gx.fill(body);
    // toit vinyle noir
    gx.fillStyle = 'rgba(18,18,20,0.92)'; gx.beginPath(); gx.moveTo(-36, -63); gx.quadraticCurveTo(-30, -69, -18, -69); gx.lineTo(14, -69); gx.quadraticCurveTo(24, -68, 30, -63); gx.closePath(); gx.fill();
    // vitres
    var win = new Path2D(); win.moveTo(-56, -47); win.lineTo(-33, -62); win.lineTo(-18, -65); win.lineTo(13, -65); win.lineTo(25, -61); win.lineTo(44, -47); win.closePath();
    gx.fillStyle = glass(gx, -65, -47); gx.fill(win);
    specular(gx, [-30, -61, -18, -64, -8, -64, -26, -48, -40, -48], 0.22);
    gx.fillStyle = 'rgba(20,20,22,0.95)'; gx.fillRect(-6, -66, 5, 20);
    gx.fillStyle = '#0a0a0c'; gx.beginPath(); gx.arc(-22, -54, 5.5, 0, TAU); gx.fill(); gx.fillRect(-28, -49, 13, 4);
    // lignes de carrosserie, bandes, reflet
    gx.strokeStyle = 'rgba(0,0,0,0.35)'; gx.lineWidth = 1;
    gx.beginPath(); gx.moveTo(-58, -46); gx.lineTo(-58, -10); gx.moveTo(30, -46); gx.lineTo(30, -10); gx.moveTo(56, -46); gx.lineTo(98, -42); gx.stroke();
    gx.fillStyle = 'rgba(245,245,240,0.88)'; gx.fillRect(-104, -24, 212, 3); gx.fillRect(-104, -19, 212, 1.5);
    specular(gx, [-96, -40, -62, -44, 96, -42, 96, -40, -96, -38], 0.28);
    // compresseur chromé sur le capot
    gx.fillStyle = chrome(gx, -62, -45); gx.beginPath(); gx.moveTo(62, -45); gx.lineTo(65, -59); gx.lineTo(91, -59); gx.lineTo(94, -45); gx.fill();
    gx.fillStyle = '#1b1c20'; gx.fillRect(66, -66, 24, 7);
    gx.fillStyle = chrome(gx, -70, -64); gx.fillRect(68, -70, 6, 5); gx.fillRect(76, -70, 6, 5); gx.fillRect(84, -70, 6, 5);
    gx.strokeStyle = 'rgba(0,0,0,0.45)'; gx.lineWidth = 1; gx.beginPath(); for (var s = 0; s < 5; s++) { gx.moveTo(67 + s * 6, -57); gx.lineTo(67 + s * 6, -46); } gx.stroke();
    // feux et pare-chocs chromés
    gx.fillStyle = '#fff6d0'; gx.beginPath(); gx.arc(109, -31, 5, 0, TAU); gx.fill(); glow(gx, 112, -31, 26, '255,236,190', 0.55);
    gx.fillStyle = '#b3121c'; gx.fillRect(-113, -35, 5, 10); glow(gx, -114, -30, 14, '255,40,40', 0.4);
    gx.fillStyle = chrome(gx, -24, -10); gx.fillRect(110, -24, 9, 14); gx.fillRect(-118, -22, 8, 12);
    // échappements latéraux
    gx.fillStyle = chrome(gx, -14, -8); gx.fillRect(-46, -14, 56, 6);
    gx.strokeStyle = 'rgba(0,0,0,0.5)'; gx.lineWidth = 1; gx.stroke(body);
    for (var w = 0; w < 2; w++) {
      gx.save(); gx.translate(w ? WB : -WB, car.wheels[w].dist - WR);
      tire(gx, WR, car.wheels[w].spin, { lugs: 16, rimR: 0.5, rim: '#c9cfd8', spokes: 8 });
      gx.restore();
    }
  }

  // ------------------------------------------------------------------ HONDA CIVIC TYPE R : hatchback bas, tuning vert + LED
  function ledLine(gx, x1, y1, x2, y2, rgb, w) {
    var op = gx.globalCompositeOperation; gx.globalCompositeOperation = 'lighter';
    gx.lineCap = 'round';
    gx.strokeStyle = 'rgba(' + rgb + ',0.25)'; gx.lineWidth = w * 4; gx.beginPath(); gx.moveTo(x1, y1); gx.lineTo(x2, y2); gx.stroke();
    gx.strokeStyle = 'rgba(' + rgb + ',0.9)'; gx.lineWidth = w; gx.beginPath(); gx.moveTo(x1, y1); gx.lineTo(x2, y2); gx.stroke();
    gx.lineCap = 'butt'; gx.globalCompositeOperation = op;
  }
  function drawCivic(gx, car, col, boosting, t) {
    var V = VEH.civic, WB = V.WB, WR = V.WR, SH = 40, i, LED = '70,255,120';
    // néons sous la caisse (lumière réfléchie au sol)
    var op = gx.globalCompositeOperation; gx.globalCompositeOperation = 'lighter';
    var ug = gx.createRadialGradient(0, 46, 4, 0, 46, 130);
    ug.addColorStop(0, 'rgba(70,255,120,0.55)'); ug.addColorStop(1, 'rgba(70,255,120,0)');
    gx.fillStyle = ug; gx.save(); gx.translate(0, 46); gx.scale(1, 0.2); gx.beginPath(); gx.arc(0, 0, 130, 0, TAU); gx.fill(); gx.restore();
    gx.globalCompositeOperation = op;
    for (i = 0; i < 2; i++) farWheel(gx, (i ? WB : -WB) - 9, car.wheels[i].dist - WR - 11, WR, car.wheels[i].spin);
    for (i = 0; i < 2; i++) { var lx = i ? WB : -WB, wy = car.wheels[i].dist - WR; shock(gx, lx, 8, wy, '#d9d9d9'); }
    if (boosting) { flame(gx, -98, 22, -1, 34, 4); flame(gx, -98, 28, -1, 26, 3); }

    gx.save(); gx.translate(0, SH);
    var body = new Path2D();
    body.moveTo(-90, -8); body.lineTo(-93, -26); body.quadraticCurveTo(-93, -34, -88, -40); body.lineTo(-80, -52);
    body.quadraticCurveTo(-76, -57, -66, -58); body.lineTo(-6, -62); body.quadraticCurveTo(10, -62, 20, -56);
    body.lineTo(46, -40); body.lineTo(84, -31); body.quadraticCurveTo(95, -29, 96, -18); body.lineTo(96, -8); body.closePath();
    for (var ex = 4; ex >= 1; ex--) { gx.save(); gx.translate(-ex * 0.9, -ex * 1.2); gx.fillStyle = shade(col.b, ex > 2 ? 0.6 : 0.9); gx.fill(body); gx.restore(); }
    gx.fillStyle = paint(gx, -62, -6, col.a); gx.fill(body);
    specular(gx, [-70, -55, -6, -60, 16, -55, -4, -56, -68, -52], 0.35);
    specular(gx, [48, -40, 84, -31, 84, -33, 50, -42], 0.22);
    // passages de roue
    gx.save(); gx.clip(body);
    for (i = 0; i < 2; i++) {
      var ax = i ? WB : -WB, ay = car.wheels[i].dist - WR - SH;
      gx.fillStyle = '#060608'; gx.beginPath(); gx.arc(ax, ay, WR + 4, 0, TAU); gx.fill();
      gx.strokeStyle = 'rgba(255,255,255,0.15)'; gx.lineWidth = 1.5; gx.beginPath(); gx.arc(ax, ay, WR + 5, Math.PI * 1.05, Math.PI * 1.95); gx.stroke();
    }
    gx.restore();
    // bas de caisse carbone + LED
    var cb = gx.createLinearGradient(0, -14, 0, -8); cb.addColorStop(0, '#2a2c31'); cb.addColorStop(1, '#0c0d0f');
    gx.fillStyle = cb; gx.fillRect(-56, -14, 112, 6);
    ledLine(gx, -50, -9, 50, -9, LED, 1.6);
    gx.fillStyle = '#c8102e'; gx.fillRect(-56, -15, 112, 1.2);
    // vitres teintées
    var win = new Path2D(); win.moveTo(-76, -49); win.lineTo(-67, -56); win.lineTo(-8, -59); win.quadraticCurveTo(8, -59, 17, -53); win.lineTo(40, -42); win.lineTo(-74, -42); win.closePath();
    var wg = gx.createLinearGradient(0, -59, 0, -42); wg.addColorStop(0, '#6f8299'); wg.addColorStop(0.4, '#1f2733'); wg.addColorStop(1, '#07090c');
    gx.fillStyle = wg; gx.fill(win);
    specular(gx, [-40, -58, -24, -58.5, -46, -43, -60, -43], 0.16);
    gx.fillStyle = '#0c0d10'; gx.fillRect(-24, -60, 5, 18); gx.fillRect(-79, -52, 5, 10);
    // lignes de portes
    gx.strokeStyle = 'rgba(0,0,0,0.4)'; gx.lineWidth = 1; gx.beginPath(); gx.moveTo(-22, -42); gx.lineTo(-22, -12); gx.moveTo(40, -42); gx.lineTo(42, -12); gx.stroke();
    // aileron carbone + haubans
    gx.strokeStyle = '#18191d'; gx.lineWidth = 3; gx.beginPath(); gx.moveTo(-100, -58); gx.lineTo(-86, -44); gx.moveTo(-84, -62); gx.lineTo(-80, -53); gx.stroke();
    var wgr = gx.createLinearGradient(0, -67, 0, -59); wgr.addColorStop(0, '#4a4d55'); wgr.addColorStop(1, '#0d0e11');
    gx.fillStyle = wgr; gx.beginPath(); gx.moveTo(-110, -64); gx.lineTo(-70, -67); gx.lineTo(-70, -62); gx.lineTo(-110, -59); gx.closePath(); gx.fill();
    // lame avant / diffuseur
    gx.fillStyle = '#121316'; gx.beginPath(); gx.moveTo(78, -8); gx.lineTo(102, -6); gx.lineTo(100, -3); gx.lineTo(76, -5); gx.fill();
    gx.fillStyle = '#121316'; gx.fillRect(-92, -9, 22, 4);
    // phares LED, antibrouillard, feux arrière
    gx.fillStyle = '#f4fbff'; gx.beginPath(); gx.moveTo(82, -34); gx.lineTo(96, -30); gx.lineTo(95, -25); gx.lineTo(78, -29); gx.closePath(); gx.fill();
    ledLine(gx, 79, -30.5, 95, -26.5, '200,230,255', 1.3); glow(gx, 98, -29, 34, '220,240,255', 0.55);
    gx.fillStyle = '#0a0b0d'; gx.fillRect(88, -22, 8, 8); ledLine(gx, 89, -18, 95, -18, LED, 1);
    ledLine(gx, -93, -33, -90, -22, '255,30,50', 2); glow(gx, -93, -28, 18, '255,40,50', 0.5);
    // triple échappement
    gx.fillStyle = chrome(gx, -26, -8);
    gx.beginPath(); gx.arc(-94, -10, 3.4, 0, TAU); gx.arc(-94, -16, 3.4, 0, TAU); gx.arc(-94, -22, 3.4, 0, TAU); gx.fill();
    // stickers discrets
    gx.fillStyle = '#c8102e'; gx.fillRect(12, -33, 24, 8);
    gx.fillStyle = '#fff'; gx.font = '800 italic 7px "Barlow Condensed", Arial, sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.fillText('TYPE R', 24, -28.6);
    gx.fillStyle = col.b; gx.fillRect(30, -46, 8, 5);
    gx.strokeStyle = 'rgba(0,0,0,0.5)'; gx.lineWidth = 1; gx.stroke(body);
    gx.restore();

    for (var w = 0; w < 2; w++) {
      gx.save(); gx.translate(w ? WB : -WB, car.wheels[w].dist - WR);
      tire(gx, WR, car.wheels[w].spin, { lugs: 0, rimR: 0.7, rim: '#2b2e34', spokes: 10, caliper: '#d11a2a', ring: 'rgba(70,255,120,0.75)' });
      gx.restore();
    }
  }

  // ------------------------------------------------------------------ MOTO sportive + pilote
  function drawMoto(gx, car, col, boosting) {
    var V = VEH.moto, WB = V.WB, WR = V.WR;
    var fy = car.wheels[1].dist - WR, ry = car.wheels[0].dist - WR;
    if (boosting) flame(gx, -82, -26, -1, 36, 4);
    var w;
    for (w = 0; w < 2; w++) {
      gx.save(); gx.translate(w ? WB : -WB, w ? fy : ry);
      tire(gx, WR, car.wheels[w].spin, { lugs: 0, rimR: 0.72, rim: '#c9cfd8', spokes: 5, caliper: '#d4a017' });
      gx.restore();
    }
    gx.lineCap = 'round';
    // bras oscillant, fourche inversée dorée
    var swg = gx.createLinearGradient(0, -20, 0, 0); swg.addColorStop(0, '#c9ced6'); swg.addColorStop(1, '#5f656f');
    gx.strokeStyle = swg; gx.lineWidth = 7; gx.beginPath(); gx.moveTo(-WB, ry); gx.lineTo(-24, -14); gx.stroke();
    gx.strokeStyle = '#c9a227'; gx.lineWidth = 6; gx.beginPath(); gx.moveTo(WB, fy); gx.lineTo(46, -28); gx.stroke();
    gx.strokeStyle = chrome(gx, -46, -28); gx.lineWidth = 5; gx.beginPath(); gx.moveTo(46, -28); gx.lineTo(40, -46); gx.stroke();
    gx.strokeStyle = '#c41e24'; gx.lineWidth = 3; gx.beginPath(); gx.moveTo(-22, -34); gx.lineTo(-36, ry * 0.35 - 2); gx.stroke();
    // moteur + échappement
    var eg = gx.createLinearGradient(0, -38, 0, -8); eg.addColorStop(0, '#3a3e46'); eg.addColorStop(1, '#121317');
    gx.fillStyle = eg; gx.beginPath(); gx.moveTo(-30, -36); gx.lineTo(26, -38); gx.lineTo(30, -10); gx.lineTo(-24, -8); gx.closePath(); gx.fill();
    gx.strokeStyle = 'rgba(255,255,255,0.12)'; gx.lineWidth = 1; gx.beginPath(); for (var f = 0; f < 5; f++) { gx.moveTo(-20 + f * 9, -34); gx.lineTo(-20 + f * 9, -12); } gx.stroke();
    gx.fillStyle = chrome(gx, -28, -8); gx.beginPath(); gx.moveTo(-26, -16); gx.lineTo(-82, -28); gx.lineTo(-84, -21); gx.lineTo(-24, -8); gx.fill();
    gx.fillStyle = '#1b1c20'; gx.beginPath(); gx.ellipse(-83, -24.5, 3, 4, 0, 0, TAU); gx.fill();
    // jambe du pilote
    gx.strokeStyle = '#17181c'; gx.lineJoin = 'round';
    gx.lineWidth = 11; gx.beginPath(); gx.moveTo(-20, -50); gx.lineTo(16, -34); gx.lineTo(6, -16); gx.stroke();
    gx.fillStyle = '#0c0c0e'; gx.fillRect(0, -20, 14, 7);
    // carénage + réservoir + coque arrière
    var fair = new Path2D(); fair.moveTo(26, -46); fair.quadraticCurveTo(52, -64, 80, -40); fair.lineTo(74, -26); fair.lineTo(30, -24); fair.closePath();
    var tank = new Path2D(); tank.moveTo(-26, -50); tank.quadraticCurveTo(2, -64, 32, -48); tank.lineTo(28, -30); tank.lineTo(-26, -30); tank.closePath();
    var tail = new Path2D(); tail.moveTo(-24, -48); tail.lineTo(-66, -46); tail.quadraticCurveTo(-82, -42, -78, -32); tail.lineTo(-24, -30); tail.closePath();
    var pg = paint(gx, -64, -24, col.a);
    gx.fillStyle = pg; gx.fill(fair); gx.fill(tank); gx.fill(tail);
    gx.strokeStyle = 'rgba(0,0,0,0.45)'; gx.lineWidth = 1; gx.stroke(fair); gx.stroke(tank); gx.stroke(tail);
    specular(gx, [-20, -52, 4, -61, 28, -50, 4, -56], 0.4);
    specular(gx, [32, -48, 52, -60, 70, -46, 52, -54], 0.3);
    gx.fillStyle = 'rgba(255,255,255,0.85)'; gx.fillRect(-62, -38, 38, 2);
    // bulle, phare, feu
    gx.fillStyle = 'rgba(150,180,210,0.55)'; gx.beginPath(); gx.moveTo(46, -58); gx.quadraticCurveTo(58, -66, 66, -56); gx.lineTo(56, -52); gx.closePath(); gx.fill();
    gx.fillStyle = '#f4fbff'; gx.beginPath(); gx.moveTo(70, -40); gx.lineTo(79, -38); gx.lineTo(76, -33); gx.lineTo(68, -35); gx.fill(); glow(gx, 80, -37, 26, '230,240,255', 0.5);
    gx.fillStyle = '#b3121c'; gx.fillRect(-82, -40, 5, 6); glow(gx, -82, -37, 12, '255,40,40', 0.45);
    // pilote : combinaison cuir, bras, casque
    gx.strokeStyle = '#17181c'; gx.lineWidth = 20; gx.beginPath(); gx.moveTo(-14, -54); gx.lineTo(14, -74); gx.stroke();
    gx.strokeStyle = mix(col.a, '#ffffff', 0.15); gx.lineWidth = 4; gx.beginPath(); gx.moveTo(-12, -61); gx.lineTo(10, -77); gx.stroke();
    gx.strokeStyle = 'rgba(255,255,255,0.12)'; gx.lineWidth = 5; gx.beginPath(); gx.moveTo(-8, -66); gx.lineTo(12, -80); gx.stroke();
    gx.strokeStyle = '#17181c'; gx.lineWidth = 8; gx.beginPath(); gx.moveTo(12, -70); gx.lineTo(30, -62); gx.lineTo(50, -54); gx.stroke();
    var hg = gx.createRadialGradient(15, -94, 2, 20, -88, 14); hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.5, '#e4e7ec'); hg.addColorStop(1, '#8d939c');
    gx.fillStyle = hg; gx.beginPath(); gx.arc(20, -88, 13, 0, TAU); gx.fill();
    var vg = gx.createLinearGradient(20, -94, 33, -82); vg.addColorStop(0, '#2a3a52'); vg.addColorStop(0.5, '#ff9a5a'); vg.addColorStop(1, '#1a2230');
    gx.fillStyle = vg; gx.beginPath(); gx.moveTo(22, -94); gx.lineTo(33, -90); gx.lineTo(31, -83); gx.lineTo(21, -84); gx.fill();
    gx.fillStyle = col.a; gx.fillRect(9, -93, 7, 2.5);
    gx.lineCap = 'butt';
  }

  // ------------------------------------------------------------------ CAMION : tracteur américain + remorque alu
  function drawTruck(gx, car, col, boosting, t) {
    var V = VEH.truck, WB = V.WB, WR = V.WR;
    var fy = car.wheels[1].dist - WR, ry = car.wheels[0].dist - WR;
    farWheel(gx, WB - 14, fy - 14, WR, car.wheels[1].spin);
    farWheel(gx, -WB - 14, ry - 14, WR, car.wheels[0].spin);
    farWheel(gx, -WB - 62, ry - 14, WR, car.wheels[0].spin);
    // châssis
    gx.fillStyle = '#1b1c20'; gx.fillRect(-176, -22, 346, 10);
    shock(gx, WB, -14, fy - 2, '#3a3d44'); shock(gx, -WB, -14, ry - 2, '#3a3d44');
    // remorque aluminium
    for (var ex = 3; ex >= 1; ex--) { gx.save(); gx.translate(-ex * 1.4, -ex * 1.6); gx.fillStyle = shade('#c7ccd4', 0.55); gx.fillRect(-176, -112, 236, 92); gx.restore(); }
    var tg = gx.createLinearGradient(0, -112, 0, -20);
    tg.addColorStop(0, '#f6f7f9'); tg.addColorStop(0.45, '#d8dce2'); tg.addColorStop(0.5, '#b7bdc6'); tg.addColorStop(1, '#9aa1ab');
    gx.fillStyle = tg; gx.fillRect(-176, -112, 236, 92);
    gx.strokeStyle = 'rgba(0,0,0,0.12)'; gx.lineWidth = 1;
    gx.beginPath(); for (var r = 0; r < 23; r++) { gx.moveTo(-170 + r * 10, -110); gx.lineTo(-170 + r * 10, -22); } gx.stroke();
    gx.fillStyle = 'rgba(0,0,0,0.25)'; gx.fillRect(-176, -112, 236, 3); gx.fillRect(-176, -24, 236, 4);
    gx.fillStyle = mix(col.a, '#000000', 0.1); gx.fillRect(-150, -76, 180, 10);
    gx.fillStyle = '#1b1d22'; gx.font = '800 italic 26px "Barlow Condensed", Arial, sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle';
    gx.fillText('V8 FREIGHT', -60, -94);
    gx.fillStyle = '#ff8a2b'; gx.fillRect(-176, -30, 5, 6); gx.fillRect(55, -30, 5, 6);
    // garde-boue
    gx.fillStyle = '#111215'; gx.fillRect(-WB - 92, ry - 22, 8, 30); gx.fillRect(WB - 48, fy - 22, 6, 26);
    // cabine
    var cab = new Path2D();
    cab.moveTo(64, -16); cab.lineTo(64, -104); cab.quadraticCurveTo(66, -112, 76, -112); cab.lineTo(124, -112);
    cab.quadraticCurveTo(134, -112, 140, -100); cab.lineTo(158, -66); cab.lineTo(172, -60); cab.lineTo(174, -16); cab.closePath();
    for (var e2 = 3; e2 >= 1; e2--) { gx.save(); gx.translate(-e2 * 1.2, -e2 * 1.5); gx.fillStyle = shade(col.b, 0.8); gx.fill(cab); gx.restore(); }
    gx.fillStyle = paint(gx, -112, -16, col.a); gx.fill(cab);
    specular(gx, [70, -108, 122, -108, 130, -104, 72, -102], 0.35);
    gx.strokeStyle = 'rgba(0,0,0,0.45)'; gx.lineWidth = 1; gx.stroke(cab);
    gx.beginPath(); gx.moveTo(98, -66); gx.lineTo(98, -18); gx.moveTo(140, -66); gx.lineTo(140, -18); gx.stroke();
    var win = new Path2D(); win.moveTo(100, -102); win.lineTo(126, -102); win.lineTo(148, -66); win.lineTo(100, -66); win.closePath();
    gx.fillStyle = glass(gx, -102, -66); gx.fill(win);
    specular(gx, [104, -100, 116, -100, 110, -70, 104, -70], 0.2);
    // feux de gabarit, rétro, calandre chromée, phare
    gx.fillStyle = '#ff9a2a'; for (var l = 0; l < 4; l++) { gx.fillRect(86 + l * 12, -116, 7, 4); glow(gx, 89 + l * 12, -114, 8, '255,170,60', 0.4); }
    gx.fillStyle = chrome(gx, -90, -60); gx.fillRect(150, -92, 4, 30); gx.fillRect(146, -94, 10, 4);
    gx.fillStyle = chrome(gx, -52, -20); gx.fillRect(162, -52, 12, 32);
    gx.strokeStyle = 'rgba(0,0,0,0.35)'; gx.lineWidth = 1; gx.beginPath(); for (var g2 = 0; g2 < 6; g2++) { gx.moveTo(162, -50 + g2 * 5); gx.lineTo(174, -50 + g2 * 5); } gx.stroke();
    gx.fillStyle = '#fff8e0'; gx.fillRect(164, -62, 9, 8); glow(gx, 176, -58, 32, '255,240,200', 0.5);
    gx.fillStyle = chrome(gx, -22, -14); gx.fillRect(160, -22, 18, 8);
    gx.fillStyle = chrome(gx, -40, -30); gx.fillRect(68, -40, 30, 8);
    // cheminées chromées
    var sg = gx.createLinearGradient(66, 0, 74, 0); sg.addColorStop(0, '#7a818c'); sg.addColorStop(0.45, '#ffffff'); sg.addColorStop(1, '#5a606a');
    gx.fillStyle = sg; gx.fillRect(66, -140, 7, 34); gx.fillRect(78, -136, 7, 30);
    if (boosting) {
      var op = gx.globalCompositeOperation; gx.globalCompositeOperation = 'lighter';
      for (var k = 0; k < 2; k++) {
        var fx = 69.5 + k * 12, fyy = k ? -136 : -140, fl = 26 + Math.random() * 30;
        var fg = gx.createLinearGradient(fx, fyy, fx - fl * 0.6, fyy - fl * 1.6);
        fg.addColorStop(0, 'rgba(200,225,255,0.9)'); fg.addColorStop(0.4, 'rgba(255,150,60,0.6)'); fg.addColorStop(1, 'rgba(255,60,0,0)');
        gx.fillStyle = fg; gx.beginPath(); gx.moveTo(fx - 4, fyy); gx.lineTo(fx - fl * 0.7, fyy - fl * 1.6); gx.lineTo(fx + 4, fyy); gx.fill();
      }
      gx.globalCompositeOperation = op;
    }
    var T = { lugs: 14, rimR: 0.55, rim: '#d4d9e0', spokes: 10 };
    gx.save(); gx.translate(WB, fy); tire(gx, WR, car.wheels[1].spin, T); gx.restore();
    gx.save(); gx.translate(-WB, ry); tire(gx, WR, car.wheels[0].spin, T); gx.restore();
    gx.save(); gx.translate(-WB - 62, ry); tire(gx, WR, car.wheels[0].spin, T); gx.restore();
  }

  function drawVehicle(gx, car, ci, boosting, t, colors) {
    var k = car.vk;
    var col = ci === 0 ? (VEH[k] || VEH.monster).paint : (colors[ci - 1] || colors[0]);
    gx.save(); gx.translate(car.x, car.y); gx.rotate(car.a);
    if (k === 'moto') drawMoto(gx, car, col, boosting, t);
    else if (k === 'civic') drawCivic(gx, car, col, boosting, t);
    else if (k === 'truck') drawTruck(gx, car, col, boosting, t);
    else drawMonster(gx, car, col, boosting, t);
    gx.restore();
  }

  window.MV8_VEH = { VEH: VEH, drawVehicle: drawVehicle, tire: tire, shade: shade };
})();
