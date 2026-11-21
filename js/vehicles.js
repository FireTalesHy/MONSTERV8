/* MONSTER V8 — les 4 véhicules : paramètres physiques + dessin réaliste (vue de côté, origine = centre du châssis, avant vers +x) */
(function () {
  'use strict';
  var TAU = Math.PI * 2;

  function rgbOf(hex) {
    if (hex.charAt(0) === '#' && hex.length === 7) return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)];
    var m = hex.match(/\d+/g); return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
  }
  function shade(hex, f) {
    var c = rgbOf(hex);
    return 'rgb(' + Math.min(255, Math.round(c[0] * f)) + ',' + Math.min(255, Math.round(c[1] * f)) + ',' + Math.min(255, Math.round(c[2] * f)) + ')';
  }
  function mix(hex, hex2, k) {
    var a = rgbOf(hex), b = rgbOf(hex2);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * k) + ',' + Math.round(a[1] + (b[1] - a[1]) * k) + ',' + Math.round(a[2] + (b[2] - a[2]) * k) + ')';
  }
  function rgba(hex, a) { var c = rgbOf(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  // WR rayon roue · WB demi-empattement · R longueur de suspension · K/C ressort/amortisseur · INV_I 1/inertie
  // P poussée par roue · VMAX vitesse de pointe au sol · AIR_ROT contrôle en l'air · zoom : cadrage caméra
  // pts : points de collision de la carrosserie ; roof : ceux qui font exploser le véhicule au contact du sol
  var VEH = {
    moto: {
      key: 'moto', name: 'MOTO', WR: 24, WB: 56, R: 50, K: 85, C: 9, KH: 500, INV_I: 1 / 1050,
      P: 1000, BRAKE: 1300, VMAX: 2100, RMAX: 600, MU: 2.8, BOOST: 1700, DQ: 0.00024, WHEELIE: 2.4, AIR_ROT: 22, WMAX: 14,
      zoom: 1.35, engine: 'bike', paint: { a: '#d8336f', b: '#5e0a2a' },
      pts: [[48, -52], [30, -46], [-72, -42], [6, -92], [-24, -72], [68, -34]], roof: { 3: 1, 4: 1 },
      exhaust: [-66, -6], far: false
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
      pts: [[110, 16], [104, 2], [16, -40], [-52, -42], [-100, -10], [-106, 14], [52, -8], [-80, -28]], roof: { 2: 1, 3: 1 },
      exhaust: [-110, 27], far: true
    },
    truck: {
      key: 'truck', name: 'CAMION', WR: 34, WB: 128, R: 84, K: 58, C: 12, KH: 480, INV_I: 1 / 9500,
      P: 760, BRAKE: 950, VMAX: 1550, RMAX: 440, MU: 2.8, BOOST: 1250, DQ: 0.00029, WHEELIE: 0.15, AIR_ROT: 8, WMAX: 7.5,
      zoom: 0.78, engine: 'diesel', paint: { a: '#c0141c', b: '#4a050a' },
      pts: [[186, 20], [180, -42], [100, -98], [30, -112], [-150, -112], [-210, -60], [-210, -14]], roof: { 2: 1, 3: 1, 4: 1 },
      exhaust: [36, -150], far: true
    }
  };

  // ------------------------------------------------------------------ matériaux
  // peinture automobile : ciel reflété en haut, arête d'épaule brillante, ligne d'horizon sombre, sol reflété, occlusion en bas
  function carPaint(gx, path, c, y0, yb, y1, x0, x1) {
    var k = Math.max(0.08, Math.min(0.9, (yb - y0) / (y1 - y0)));
    var g = gx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, mix(c, '#ffffff', 0.42));
    g.addColorStop(k * 0.55, mix(c, '#d9e4f2', 0.16));
    g.addColorStop(k - 0.035, c);
    g.addColorStop(k, mix(c, '#ffffff', 0.55));
    g.addColorStop(Math.min(0.97, k + 0.035), shade(c, 0.6));
    g.addColorStop(Math.min(0.98, k + 0.16), shade(c, 0.95));
    g.addColorStop(Math.min(0.99, k + 0.4), shade(c, 0.78));
    g.addColorStop(1, shade(c, 0.36));
    gx.fillStyle = g; gx.fill(path);
    gx.save(); gx.clip(path);
    // reflet de studio allongé sur le flanc
    var cx = x0 + (x1 - x0) * 0.62, cy = yb + (y1 - yb) * 0.28, w = (x1 - x0) * 0.42;
    gx.save(); gx.translate(cx, cy); gx.scale(1, 0.07);
    var rg = gx.createRadialGradient(0, 0, 0, 0, 0, w);
    rg.addColorStop(0, 'rgba(255,255,255,0.34)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    gx.fillStyle = rg; gx.beginPath(); gx.arc(0, 0, w, 0, TAU); gx.fill(); gx.restore();
    // les extrémités tournent : plus sombres
    var hg = gx.createLinearGradient(x0, 0, x1, 0);
    hg.addColorStop(0, 'rgba(0,0,0,0.38)'); hg.addColorStop(0.07, 'rgba(0,0,0,0)'); hg.addColorStop(0.93, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(0,0,0,0.34)');
    gx.fillStyle = hg; gx.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
    gx.restore();
  }
  function edge(gx, path, a) { gx.strokeStyle = 'rgba(0,0,0,' + (a || 0.55) + ')'; gx.lineWidth = 1; gx.stroke(path); }
  // jointure de panneau : trait sombre + liseré clair
  function gap(gx, d, a) {
    var p = new Path2D(d);
    gx.lineWidth = 1; gx.strokeStyle = 'rgba(0,0,0,' + (a || 0.5) + ')'; gx.stroke(p);
    gx.save(); gx.translate(0.8, 0.8); gx.strokeStyle = 'rgba(255,255,255,0.13)'; gx.stroke(p); gx.restore();
  }
  function crease(gx, d, a) {   // arête de tôle : liseré clair + ombre dessous
    var p = new Path2D(d);
    gx.lineWidth = 1.2; gx.strokeStyle = 'rgba(255,255,255,' + (a || 0.32) + ')'; gx.stroke(p);
    gx.save(); gx.translate(0, 1.4); gx.strokeStyle = 'rgba(0,0,0,0.28)'; gx.stroke(p); gx.restore();
  }
  function chrome(gx, y0, y1) {
    var gr = gx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#c3c9d2'); gr.addColorStop(0.48, '#565c66'); gr.addColorStop(0.56, '#2f333a'); gr.addColorStop(0.64, '#e6eaef'); gr.addColorStop(1, '#8a919c');
    return gr;
  }
  function chromeV(gx, x0, x1) {
    var gr = gx.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, '#5f6670'); gr.addColorStop(0.35, '#ffffff'); gr.addColorStop(0.55, '#aab1bb'); gr.addColorStop(0.8, '#3c4149'); gr.addColorStop(1, '#8a919c');
    return gr;
  }
  function metal(gx, y0, y1, base) {
    var gr = gx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, mix(base, '#ffffff', 0.35)); gr.addColorStop(0.5, base); gr.addColorStop(1, shade(base, 0.45));
    return gr;
  }
  function carbon(gx, y0, y1) {
    var gr = gx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#53565e'); gr.addColorStop(0.3, '#23252a'); gr.addColorStop(1, '#0a0b0d');
    return gr;
  }
  // vitrage teinté : reflet du ciel + intérieur sombre + bandes de reflets
  function glassFill(gx, path, y0, y1, interior, tint) {
    var g = gx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, tint ? '#58708a' : '#8296ad'); g.addColorStop(0.3, '#2b3644'); g.addColorStop(1, '#090c11');
    gx.fillStyle = g; gx.fill(path);
    gx.save(); gx.clip(path);
    if (interior) { gx.globalAlpha = 0.85; interior(); gx.globalAlpha = 1; }
    gx.fillStyle = 'rgba(215,230,245,0.16)';
    gx.beginPath(); gx.moveTo(-400, y1); gx.lineTo(-380, y0 - 40); gx.lineTo(-372, y0 - 40); gx.lineTo(-392, y1); gx.fill();
    for (var x = -300; x < 300; x += 46) {
      gx.fillStyle = 'rgba(215,230,245,' + (0.06 + ((x / 46) & 1) * 0.07) + ')';
      gx.beginPath(); gx.moveTo(x, y1 + 2); gx.lineTo(x + 16, y0 - 2); gx.lineTo(x + 26, y0 - 2); gx.lineTo(x + 10, y1 + 2); gx.fill();
    }
    var tg = gx.createLinearGradient(0, y0, 0, y0 + (y1 - y0) * 0.35);
    tg.addColorStop(0, 'rgba(230,240,255,0.22)'); tg.addColorStop(1, 'rgba(230,240,255,0)');
    gx.fillStyle = tg; gx.fillRect(-400, y0 - 2, 800, y1 - y0);
    gx.restore();
  }
  function glow(gx, x, y, r, rgb, a) {
    var gr = gx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    var op = gx.globalCompositeOperation; gx.globalCompositeOperation = 'lighter';
    gx.fillStyle = gr; gx.fillRect(x - r, y - r, r * 2, r * 2);
    gx.globalCompositeOperation = op;
  }
  function lens(gx, d, y0, y1, kind) {   // optique : 'head' blanc, 'tail' rouge, 'amber'
    var p = new Path2D(d), g = gx.createLinearGradient(0, y0, 0, y1);
    if (kind === 'tail') { g.addColorStop(0, '#ff6a6a'); g.addColorStop(0.5, '#c4101c'); g.addColorStop(1, '#5a0408'); }
    else if (kind === 'amber') { g.addColorStop(0, '#ffd27a'); g.addColorStop(1, '#c86a08'); }
    else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#dfe9f2'); g.addColorStop(1, '#8b9aaa'); }
    gx.fillStyle = g; gx.fill(p);
    gx.strokeStyle = 'rgba(0,0,0,0.6)'; gx.lineWidth = 0.8; gx.stroke(p);
  }
  function ledLine(gx, x1, y1, x2, y2, rgb, w) {
    var op = gx.globalCompositeOperation; gx.globalCompositeOperation = 'lighter';
    gx.lineCap = 'round';
    gx.strokeStyle = 'rgba(' + rgb + ',0.22)'; gx.lineWidth = w * 4.5; gx.beginPath(); gx.moveTo(x1, y1); gx.lineTo(x2, y2); gx.stroke();
    gx.strokeStyle = 'rgba(' + rgb + ',0.95)'; gx.lineWidth = w; gx.beginPath(); gx.moveTo(x1, y1); gx.lineTo(x2, y2); gx.stroke();
    gx.lineCap = 'butt'; gx.globalCompositeOperation = op;
  }
  function fillP(gx, d, style) { var p = new Path2D(d); gx.fillStyle = style; gx.fill(p); return p; }

  // ------------------------------------------------------------------ roue réaliste
  // o : rimR (rayon jante / rayon pneu), rim (couleur), spokes, style ('multi' | 'beadlock' | 'budd' | 'moto'),
  //     lugs (pavés de crampons), disc (disque de frein), caliper, ring (liseré LED), letters (inscriptions flanc)
  function tire(gx, r, spin, o) {
    o = o || {};
    var rr = r * (o.rimR || 0.6), i, a;
    // gomme : flanc bombé
    var tg = gx.createRadialGradient(0, 0, rr * 0.98, 0, 0, r);
    tg.addColorStop(0, '#08080a'); tg.addColorStop(0.12, '#2c2e33'); tg.addColorStop(0.45, '#202125'); tg.addColorStop(0.85, '#161719'); tg.addColorStop(1, '#0a0a0c');
    gx.fillStyle = tg; gx.beginPath(); gx.arc(0, 0, r, 0, TAU); gx.fill();
    gx.save(); gx.rotate(spin);
    var n = o.lugs || 0;
    if (n) {
      gx.fillStyle = '#060607'; gx.beginPath(); gx.arc(0, 0, r, 0, TAU); gx.arc(0, 0, r * 0.86, 0, TAU, true); gx.fill();
      for (i = 0; i < n; i++) {
        a = i * TAU / n; var w = TAU / n * 0.36, off = (i & 1) ? 0.06 : -0.06;
        gx.fillStyle = '#25272b';
        gx.beginPath(); gx.arc(0, 0, r * 0.995, a - w + off, a + w + off); gx.arc(0, 0, r * 0.86, a + w * 0.8, a - w * 0.8, true); gx.closePath(); gx.fill();
        gx.strokeStyle = 'rgba(255,255,255,0.09)'; gx.lineWidth = 1;
        gx.beginPath(); gx.arc(0, 0, r * 0.97, a - w + off, a + w + off); gx.stroke();
      }
    } else {
      gx.strokeStyle = 'rgba(255,255,255,0.05)'; gx.lineWidth = 1; gx.beginPath(); gx.arc(0, 0, r * 0.96, 0, TAU); gx.stroke();
    }
    if (o.letters !== false) {   // inscriptions en relief sur le flanc
      var lr = rr + (r * (n ? 0.86 : 0.97) - rr) * 0.5;
      gx.strokeStyle = 'rgba(255,255,255,0.13)'; gx.lineWidth = Math.max(1, (r - rr) * 0.12);
      gx.setLineDash([2, 1.5, 4, 1.5, 1, 1.5]);
      gx.beginPath(); gx.arc(0, 0, lr, -2.5, -1.3); gx.stroke();
      gx.beginPath(); gx.arc(0, 0, lr, 0.6, 1.8); gx.stroke();
      gx.setLineDash([]);
    }
    gx.restore();
    // fût de jante (profondeur)
    var bg = gx.createRadialGradient(0, 0, rr * 0.2, 0, 0, rr);
    bg.addColorStop(0, '#2a2c31'); bg.addColorStop(0.8, '#0b0c0e'); bg.addColorStop(1, '#1d1f23');
    gx.fillStyle = bg; gx.beginPath(); gx.arc(0, 0, rr, 0, TAU); gx.fill();
    // disque de frein
    if (o.disc !== false) {
      gx.save(); gx.rotate(spin * 1);
      var dr = rr * 0.8, dg = gx.createRadialGradient(-dr * 0.3, -dr * 0.3, 1, 0, 0, dr);
      dg.addColorStop(0, '#b8bec6'); dg.addColorStop(1, '#5d636b');
      gx.fillStyle = dg; gx.beginPath(); gx.arc(0, 0, dr, 0, TAU); gx.fill();
      gx.fillStyle = 'rgba(20,20,24,0.7)';
      for (i = 0; i < 14; i++) { a = i * TAU / 14; gx.beginPath(); gx.arc(Math.cos(a) * dr * 0.72, Math.sin(a) * dr * 0.72, Math.max(0.6, dr * 0.045), 0, TAU); gx.fill(); }
      gx.fillStyle = '#3a3e45'; gx.beginPath(); gx.arc(0, 0, dr * 0.42, 0, TAU); gx.fill();
      gx.restore();
    }
    if (o.caliper) {
      var cg = gx.createLinearGradient(0, -rr, 0, -rr * 0.3); cg.addColorStop(0, mix(o.caliper, '#ffffff', 0.35)); cg.addColorStop(1, shade(o.caliper, 0.6));
      gx.fillStyle = cg; gx.beginPath(); gx.arc(0, 0, rr * 0.84, -2.25, -1.45); gx.arc(0, 0, rr * 0.52, -1.45, -2.25, true); gx.closePath(); gx.fill();
    }
    var rim = o.rim || '#c8ced6', st = o.style || 'multi';
    gx.save(); gx.rotate(spin);
    if (st === 'beadlock' || st === 'budd') {
      // voile plein percé
      var fg = gx.createRadialGradient(-rr * 0.3, -rr * 0.3, 1, 0, 0, rr);
      fg.addColorStop(0, mix(rim, '#ffffff', 0.6)); fg.addColorStop(0.75, rim); fg.addColorStop(1, shade(rim, 0.5));
      gx.fillStyle = fg; gx.beginPath(); gx.arc(0, 0, rr * 0.94, 0, TAU); gx.fill();
      var nh = st === 'budd' ? 5 : 8;
      for (i = 0; i < nh; i++) {
        a = i * TAU / nh + 0.3;
        gx.save(); gx.rotate(a); gx.translate(rr * 0.58, 0);
        gx.fillStyle = '#121316'; gx.beginPath(); gx.ellipse(0, 0, rr * (st === 'budd' ? 0.16 : 0.13), rr * (st === 'budd' ? 0.1 : 0.13), 0, 0, TAU); gx.fill();
        gx.strokeStyle = 'rgba(255,255,255,0.35)'; gx.lineWidth = 0.8; gx.beginPath(); gx.ellipse(0, 0, rr * (st === 'budd' ? 0.16 : 0.13), rr * (st === 'budd' ? 0.1 : 0.13), 0, 0.6, 2.4); gx.stroke();
        gx.restore();
      }
      if (st === 'beadlock') {   // anneau beadlock boulonné
        gx.strokeStyle = shade(rim, 0.7); gx.lineWidth = rr * 0.12; gx.beginPath(); gx.arc(0, 0, rr * 0.86, 0, TAU); gx.stroke();
        gx.fillStyle = '#3a3e45';
        for (i = 0; i < 18; i++) { a = i * TAU / 18; gx.beginPath(); gx.arc(Math.cos(a) * rr * 0.86, Math.sin(a) * rr * 0.86, Math.max(0.8, rr * 0.035), 0, TAU); gx.fill(); }
      }
    } else {
      var sp = o.spokes || 5, w1 = st === 'moto' ? 0.06 : (sp > 8 ? 0.07 : 0.12), w2 = st === 'moto' ? 0.05 : (sp > 8 ? 0.05 : 0.1);
      for (i = 0; i < sp; i++) {
        a = i * TAU / sp;
        gx.save(); gx.rotate(a);
        var tw = st === 'moto' ? 0.25 : 0;   // bâtons courbes des jantes moto
        gx.fillStyle = 'rgba(0,0,0,0.55)';
        gx.beginPath(); gx.moveTo(rr * 0.2, -rr * w1 + 1.2); gx.lineTo(rr * 0.92, -rr * w2 + rr * tw + 1.2); gx.lineTo(rr * 0.92, rr * w2 + rr * tw + 1.2); gx.lineTo(rr * 0.2, rr * w1 + 1.2); gx.fill();
        gx.fillStyle = rim;
        gx.beginPath(); gx.moveTo(rr * 0.2, -rr * w1); gx.quadraticCurveTo(rr * 0.6, -rr * w1 + rr * tw * 0.3, rr * 0.92, -rr * w2 + rr * tw); gx.lineTo(rr * 0.92, rr * w2 + rr * tw); gx.quadraticCurveTo(rr * 0.6, rr * w1 + rr * tw * 0.3, rr * 0.2, rr * w1); gx.fill();
        gx.strokeStyle = 'rgba(255,255,255,0.35)'; gx.lineWidth = 0.7;
        gx.beginPath(); gx.moveTo(rr * 0.22, -rr * w1); gx.lineTo(rr * 0.9, -rr * w2 + rr * tw); gx.stroke();
        gx.restore();
      }
    }
    // lèvre de jante
    var lg = gx.createRadialGradient(-rr * 0.4, -rr * 0.4, 1, 0, 0, rr * 1.1);
    lg.addColorStop(0, mix(rim, '#ffffff', 0.65)); lg.addColorStop(0.7, rim); lg.addColorStop(1, shade(rim, 0.4));
    gx.strokeStyle = lg; gx.lineWidth = Math.max(1.5, rr * 0.1); gx.beginPath(); gx.arc(0, 0, rr * 0.95, 0, TAU); gx.stroke();
    // moyeu + écrous
    var hg = gx.createRadialGradient(-rr * 0.06, -rr * 0.06, 0, 0, 0, rr * 0.22);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.6, mix(rim, '#ffffff', 0.2)); hg.addColorStop(1, shade(rim, 0.45));
    gx.fillStyle = hg; gx.beginPath(); gx.arc(0, 0, rr * (st === 'budd' ? 0.3 : 0.22), 0, TAU); gx.fill();
    gx.fillStyle = '#2a2d33';
    var nl = st === 'budd' ? 10 : 5;
    for (i = 0; i < nl; i++) { a = i * TAU / nl; gx.beginPath(); gx.arc(Math.cos(a) * rr * (st === 'budd' ? 0.24 : 0.14), Math.sin(a) * rr * (st === 'budd' ? 0.24 : 0.14), Math.max(0.7, rr * 0.03), 0, TAU); gx.fill(); }
    gx.restore();
    // lumière fixe (haut-gauche) sur l'ensemble
    var L = gx.createLinearGradient(-r, -r, r, r);
    L.addColorStop(0, 'rgba(255,255,255,0.12)'); L.addColorStop(0.45, 'rgba(255,255,255,0)'); L.addColorStop(1, 'rgba(0,0,0,0.3)');
    gx.fillStyle = L; gx.beginPath(); gx.arc(0, 0, r, 0, TAU); gx.fill();
    if (o.ring) ledRing(gx, rr * 1.0, o.ring);
  }
  function ledRing(gx, rad, rgb) {
    var op = gx.globalCompositeOperation; gx.globalCompositeOperation = 'lighter';
    gx.strokeStyle = 'rgba(' + rgb + ',0.25)'; gx.lineWidth = 4; gx.beginPath(); gx.arc(0, 0, rad, 0, TAU); gx.stroke();
    gx.strokeStyle = 'rgba(' + rgb + ',0.9)'; gx.lineWidth = 1.2; gx.beginPath(); gx.arc(0, 0, rad, 0, TAU); gx.stroke();
    gx.globalCompositeOperation = op;
  }
  function farWheel(gx, x, y, r, spin, o) {
    gx.save(); gx.translate(x, y); gx.scale(0.94, 0.94);
    tire(gx, r, spin * 0.97, o || { rimR: 0.58, letters: false });
    gx.fillStyle = 'rgba(4,5,8,0.6)'; gx.beginPath(); gx.arc(0, 0, r + 1, 0, TAU); gx.fill();
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
  // combiné ressort-amortisseur (coilover) avec réservoir
  function shock(gx, x0, y0, x1, y1, springCol, wide) {
    var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx), w = wide || 4.5;
    gx.save(); gx.translate(x0, y0); gx.rotate(ang);
    gx.fillStyle = chrome(gx, -w, w); gx.fillRect(0, -w * 0.45, L, w * 0.9);                 // tige
    var bg = gx.createLinearGradient(0, -w, 0, w); bg.addColorStop(0, '#6b717b'); bg.addColorStop(0.4, '#e8ebef'); bg.addColorStop(1, '#3d424a');
    gx.fillStyle = bg; gx.fillRect(0, -w, L * 0.58, w * 2);                                     // corps
    gx.fillStyle = '#1b1d21'; gx.fillRect(-2, -w * 0.7, 4, w * 1.4); gx.fillRect(L - 2, -w * 0.7, 4, w * 1.4);
    gx.strokeStyle = springCol || '#c41e24'; gx.lineWidth = Math.max(2, w * 0.6); gx.lineJoin = 'round';
    gx.beginPath(); gx.moveTo(L * 0.08, 0);
    for (var c = 1; c <= 9; c++) gx.lineTo(L * 0.08 + (L * 0.8) * c / 9, (c % 2 ? 1 : -1) * w * 1.8);
    gx.stroke();
    gx.strokeStyle = 'rgba(255,255,255,0.3)'; gx.lineWidth = 1; gx.stroke();
    gx.restore();
  }
  function bar(gx, x0, y0, x1, y1, w, col) {
    gx.lineCap = 'round';
    gx.strokeStyle = col || '#2a2d33'; gx.lineWidth = w; gx.beginPath(); gx.moveTo(x0, y0); gx.lineTo(x1, y1); gx.stroke();
    gx.strokeStyle = 'rgba(255,255,255,0.18)'; gx.lineWidth = Math.max(1, w * 0.25); gx.beginPath(); gx.moveTo(x0, y0 - w * 0.25); gx.lineTo(x1, y1 - w * 0.25); gx.stroke();
    gx.lineCap = 'butt';
  }
  function shadowUnder(gx, x0, x1, y, h) {   // ombre portée de la caisse sur ce qui est dessous
    var g = gx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    gx.fillStyle = g; gx.fillRect(x0, y, x1 - x0, h);
  }

  // ------------------------------------------------------------------ MONSTER TRUCK (coupé V8 années 70 sur châssis tubulaire)
  var M_BODY = new Path2D('M -108 -10 L -112 -22 Q -113 -41 -104 -44 L -74 -47 Q -56 -50 -40 -62 Q -32 -68.5 -20 -68.5 L 10 -68.5 Q 20 -68 26 -63 L 46 -47 L 104 -43 Q 114 -42 115 -34 L 116 -16 Q 116 -10 110 -10 L 97 -10 A 46 46 0 0 0 39 -10 L -39 -10 A 46 46 0 0 0 -97 -10 Z');
  var M_WIN = new Path2D('M -50 -48 L -38 -60 Q -30 -65 -20 -65 L 10 -65 Q 18 -64.5 23 -60.5 L 40 -47.5 Z');
  function drawMonster(gx, car, col, boosting) {
    var V = VEH.monster, WB = V.WB, WR = V.WR, i, c = col.a;
    var wy0 = car.wheels[0].dist - WR, wy1 = car.wheels[1].dist - WR;
    for (i = 0; i < 2; i++) farWheel(gx, (i ? WB : -WB) - 12, (i ? wy1 : wy0) - 15, WR, car.wheels[i].spin, { rimR: 0.52, lugs: 18, style: 'beadlock', rim: '#9aa1ab', letters: false, disc: false });
    // châssis tubulaire, bras de liaison, différentiels
    bar(gx, -100, -4, 100, -4, 7, '#1f2125');
    bar(gx, -40, -10, -40, 4, 4, '#1f2125'); bar(gx, 40, -10, 40, 4, 4, '#1f2125');
    for (i = 0; i < 2; i++) {
      var lx = i ? WB : -WB, wy = i ? wy1 : wy0, sg = i ? -1 : 1;
      bar(gx, lx + sg * 48, -2, lx, wy - 4, 5, '#2d3036');
      bar(gx, lx + sg * 44, 4, lx, wy + 6, 4, '#2d3036');
      gx.fillStyle = metal(gx, wy - 10, wy + 10, '#5a5f68'); gx.beginPath(); gx.arc(lx, wy, 11, 0, TAU); gx.fill();
      shock(gx, lx - 20, -12, lx - 8, wy - 6, '#c41e24', 4.5); shock(gx, lx + 20, -12, lx + 8, wy - 6, '#c41e24', 4.5);
    }
    bar(gx, -WB, wy0, WB, wy1, 4, '#3a3e45');   // arbre de transmission
    if (boosting) flame(gx, -114, -12, -1, 36, 7);
    // échappements latéraux sous la porte
    gx.fillStyle = chrome(gx, -10, -2); gx.fillRect(-36, -10, 70, 7);
    gx.fillStyle = 'rgba(0,0,0,0.35)'; for (i = 0; i < 9; i++) { gx.beginPath(); gx.arc(-30 + i * 7.5, -6.5, 1.3, 0, TAU); gx.fill(); }
    // côté opposé (2.5D)
    gx.save(); gx.translate(-2, -2); gx.fillStyle = shade(c, 0.42); gx.fill(M_BODY); gx.restore();
    carPaint(gx, M_BODY, c, -69, -45, -10, -113, 116);
    gx.save(); gx.clip(M_BODY);
    // toit vinyle noir grainé
    var vg = gx.createLinearGradient(0, -69, 0, -63); vg.addColorStop(0, '#3a3b40'); vg.addColorStop(1, '#141416');
    gx.fillStyle = vg; gx.fillRect(-40, -70, 68, 6.5);
    // bandes « hockey stick » blanches
    gx.fillStyle = 'rgba(245,244,238,0.92)'; gx.fillRect(-106, -27, 220, 3.2); gx.fillRect(-106, -22, 220, 1.4);
    // occlusion basse + arches
    shadowUnder(gx, -120, 120, -20, 12);
    gx.restore();
    crease(gx, 'M -104 -36 L 112 -34', 0.3);
    gap(gx, 'M 42 -46 Q 45 -30 41 -11'); gap(gx, 'M -18 -47 L -19 -11'); gap(gx, 'M 46 -45 L 104 -42', 0.35);
    gap(gx, 'M -70 -46.5 L -104 -43.5', 0.35);
    // vitres + arceau + pilote
    glassFill(gx, M_WIN, -65, -47, function () {
      bar(gx, -42, -48, -24, -66, 3, '#5b6068'); bar(gx, -2, -66, -2, -46, 3, '#5b6068'); bar(gx, -42, -52, 30, -52, 2, '#5b6068');
      var hg = gx.createRadialGradient(-12, -58, 1, -10, -55, 8); hg.addColorStop(0, '#f2f2f2'); hg.addColorStop(1, '#6d737c');
      gx.fillStyle = hg; gx.beginPath(); gx.arc(-10, -55, 7, 0, TAU); gx.fill();
      gx.fillStyle = '#1b1d22'; gx.fillRect(-6, -58, 5, 4);
      gx.fillStyle = '#16171a'; gx.beginPath(); gx.moveTo(-18, -48); gx.lineTo(-14, -49); gx.lineTo(-4, -49); gx.lineTo(0, -47); gx.fill();
    });
    gx.strokeStyle = chrome(gx, -66, -46); gx.lineWidth = 1.6; gx.stroke(M_WIN);
    gx.fillStyle = chrome(gx, -66, -46); gx.fillRect(-15, -65, 2, 18);
    // poignée, bouchon, feux de position
    gx.fillStyle = chrome(gx, -41, -37); gx.fillRect(-12, -41, 10, 3);
    gx.strokeStyle = 'rgba(0,0,0,0.45)'; gx.lineWidth = 1; gx.beginPath(); gx.arc(-84, -34, 3.5, 0, TAU); gx.stroke();
    lens(gx, 'M 98 -24 L 106 -24 L 106 -19 L 98 -19 Z', -24, -19, 'amber');
    lens(gx, 'M -100 -24 L -92 -24 L -92 -19 L -100 -19 Z', -24, -19, 'tail');
    // jonc chromé de bas de caisse
    gx.fillStyle = chrome(gx, -14, -11); gx.fillRect(-38, -14, 76, 2.5);
    // compresseur sur le capot, prise d'air papillons
    var bl = new Path2D('M 60 -44 L 63 -58 L 92 -58 L 95 -44 Z');
    gx.fillStyle = chrome(gx, -58, -44); gx.fill(bl);
    gx.strokeStyle = 'rgba(0,0,0,0.4)'; gx.lineWidth = 1; gx.beginPath(); for (var s = 0; s < 8; s++) { gx.moveTo(65 + s * 3.8, -56); gx.lineTo(65 + s * 3.8, -46); } gx.stroke();
    gx.fillStyle = '#1b1c20'; gx.fillRect(64, -64, 27, 6);
    gx.fillStyle = metal(gx, -72, -64, '#c9ced6');
    gx.fillRect(66, -71, 7, 7); gx.fillRect(75, -71, 7, 7); gx.fillRect(84, -71, 6, 7);
    gx.fillStyle = '#0b0b0d'; gx.fillRect(67, -70, 1.5, 5); gx.fillRect(76, -70, 1.5, 5); gx.fillRect(85, -70, 1.5, 5);
    gx.fillStyle = metal(gx, -56, -46, '#7c828c'); gx.beginPath(); gx.arc(96, -50, 5, 0, TAU); gx.fill();
    // optiques et pare-chocs chromés
    lens(gx, 'M 112 -39 L 116 -38 L 116 -30 L 112 -30 Z', -39, -30, 'head'); glow(gx, 118, -34, 30, '255,236,190', 0.5);
    lens(gx, 'M -112 -42 L -109 -42 L -109 -29 L -112 -29 Z', -42, -29, 'tail'); glow(gx, -114, -35, 14, '255,40,40', 0.35);
    fillP(gx, 'M 106 -23 L 118 -23 Q 122 -22 122 -17 L 122 -12 Q 122 -9 118 -9 L 106 -9 Z', chrome(gx, -23, -9));
    fillP(gx, 'M -106 -21 L -115 -21 Q -119 -20 -119 -16 L -119 -12 Q -119 -9 -115 -9 L -106 -9 Z', chrome(gx, -21, -9));
    edge(gx, M_BODY);
    for (var w = 0; w < 2; w++) {
      gx.save(); gx.translate(w ? WB : -WB, w ? wy1 : wy0);
      tire(gx, WR, car.wheels[w].spin, { lugs: 18, rimR: 0.52, rim: '#d4d9e0', style: 'beadlock', disc: false });
      gx.restore();
    }
  }

  // ------------------------------------------------------------------ HONDA CIVIC TYPE R : hatchback bas, tuning vert + LED
  var C_BODY = new Path2D('M -104 30 L -106 10 Q -107 0 -103 -5 L -97 -13 Q -86 -30 -66 -40 Q -60 -43 -50 -43.5 L 4 -43.5 Q 12 -43.5 18 -39 L 50 -9 L 64 -6 Q 96 -2 107 4 Q 113 6 113 12 L 112 26 Q 111 31 106 32 L 93 32 A 28 28 0 0 0 47 32 L -47 32 A 28 28 0 0 0 -93 32 L -100 32 Q -104 32 -104 30 Z');
  var C_WIN = new Path2D('M 44 -10 L 17 -37 Q 13 -40 6 -40 L -46 -40 Q -55 -39.5 -61 -34 L -67 -26 Q -64 -21 -58 -20 Z');
  function drawCivic(gx, car, col, boosting, t) {
    var V = VEH.civic, WB = V.WB, WR = V.WR, i, LED = '70,255,120', c = col.a;
    var wy0 = car.wheels[0].dist - WR, wy1 = car.wheels[1].dist - WR;
    // néons sous la caisse (lumière réfléchie au sol)
    var op = gx.globalCompositeOperation; gx.globalCompositeOperation = 'lighter';
    var ug = gx.createRadialGradient(0, 44, 4, 0, 44, 130);
    ug.addColorStop(0, 'rgba(70,255,120,0.5)'); ug.addColorStop(1, 'rgba(70,255,120,0)');
    gx.fillStyle = ug; gx.save(); gx.translate(0, 44); gx.scale(1, 0.18); gx.beginPath(); gx.arc(0, 0, 130, 0, TAU); gx.fill(); gx.restore();
    gx.globalCompositeOperation = op;
    var RO = { rimR: 0.74, rim: '#26292f', spokes: 10, caliper: '#d11a2a', letters: false };
    for (i = 0; i < 2; i++) farWheel(gx, (i ? WB : -WB) - 5, (i ? wy1 : wy0) - 5, WR, car.wheels[i].spin, RO);
    if (boosting) { flame(gx, -110, 27, -1, 34, 4); }
    // côté opposé (2.5D)
    gx.save(); gx.translate(-1.6, -1.6); gx.fillStyle = shade(c, 0.42); gx.fill(C_BODY); gx.restore();
    carPaint(gx, C_BODY, c, -44, -9, 32, -107, 113);
    gx.save(); gx.clip(C_BODY);
    // toit noir brillant (bi-ton)
    var rg = gx.createLinearGradient(0, -44, 0, -38); rg.addColorStop(0, '#5a5e66'); rg.addColorStop(0.4, '#17181b'); rg.addColorStop(1, '#0a0a0c');
    gx.fillStyle = rg; gx.fillRect(-70, -46, 92, 7);
    // passages de roue sombres + élargisseurs
    for (i = 0; i < 2; i++) {
      var ax = i ? WB : -WB, ay = i ? wy1 : wy0;
      var ag = gx.createRadialGradient(ax, ay, WR, ax, ay, WR + 7); ag.addColorStop(0, '#020203'); ag.addColorStop(1, '#141518');
      gx.fillStyle = ag; gx.beginPath(); gx.arc(ax, ay, WR + 6, 0, TAU); gx.fill();
    }
    // creux de flanc (ombre sous la nervure basse)
    var lg = gx.createLinearGradient(0, 6, 0, 22); lg.addColorStop(0, 'rgba(0,0,0,0.32)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    gx.fillStyle = lg; gx.beginPath(); gx.moveTo(44, 8); gx.quadraticCurveTo(0, 4, -46, 4); gx.lineTo(-46, 22); gx.lineTo(44, 22); gx.fill();
    gx.restore();
    // arches de roue soulignées
    for (i = 0; i < 2; i++) {
      gx.strokeStyle = 'rgba(255,255,255,0.22)'; gx.lineWidth = 1.2;
      gx.beginPath(); gx.arc(i ? WB : -WB, 16, 29.5, Math.PI * 1.13, Math.PI * 1.87); gx.stroke();
    }
    crease(gx, 'M 104 3 Q 40 -6 -98 -9', 0.4);
    crease(gx, 'M 44 8 Q 0 4 -46 4', 0.22);
    gap(gx, 'M 46 -9 Q 47 10 44 28'); gap(gx, 'M -6 -40 L -7 29'); gap(gx, 'M -58 -20 Q -52 4 -50 28');
    gap(gx, 'M 62 -5.5 Q 84 -3 100 2', 0.3);
    // vitres teintées + intérieur
    glassFill(gx, C_WIN, -40, -10, function () {
      gx.fillStyle = 'rgba(8,10,14,0.7)';
      gx.beginPath(); gx.ellipse(-20, -28, 3.5, 4.5, -0.25, 0, TAU); gx.fill();
      gx.fillRect(-23, -24, 5, 14);
      gx.strokeStyle = 'rgba(8,10,14,0.7)'; gx.lineWidth = 2; gx.beginPath(); gx.moveTo(8, -24); gx.lineTo(4, -17); gx.stroke();
    }, true);
    gx.fillStyle = '#0b0c0f'; gx.fillRect(-8, -41, 4, 31);
    gx.strokeStyle = '#0b0c0f'; gx.lineWidth = 1.6; gx.stroke(C_WIN);
    // vitre de hayon (sur la pente)
    glassFill(gx, new Path2D('M -94 -15 Q -84 -28 -69 -37 L -70 -30 Q -80 -22 -90 -12 Z'), -37, -12);
    // rétroviseur, poignées, aérations
    fillP(gx, 'M 38 -13 L 46 -15 Q 49 -15 48 -11 L 46 -8 L 39 -8 Z', '#0d0e11');
    gx.fillStyle = '#121317'; gx.fillRect(28, -6, 9, 2.2); gx.fillRect(-26, -9, 9, 2.2);
    fillP(gx, 'M 41 2 L 46 0 L 45 12 L 40 13 Z', '#08090b');
    fillP(gx, 'M -96 2 L -102 10 L -101 22 L -96 22 Z', '#08090b');
    fillP(gx, 'M 72 -4 L 86 -2.5 L 85 -1 L 72 -2.5 Z', '#060607');
    gx.strokeStyle = 'rgba(0,0,0,0.45)'; gx.lineWidth = 1; gx.beginPath(); gx.arc(-78, -6, 3.5, 0, TAU); gx.stroke();
    // jupes latérales carbone + LED
    fillP(gx, 'M -47 25 L 47 25 L 46 32 L -46 32 Z', carbon(gx, 25, 32));
    ledLine(gx, -44, 31.5, 44, 31.5, LED, 1.3);
    gx.fillStyle = '#c8102e'; gx.fillRect(-46, 25, 92, 1);
    // lame avant, diffuseur, triple sortie centrale
    fillP(gx, 'M 86 31 L 117 33 L 117 35.5 L 88 34.5 Z', carbon(gx, 31, 36));
    fillP(gx, 'M -106 28 L -90 30 L -90 35 L -108 33 Z', carbon(gx, 28, 35));
    gx.fillStyle = chrome(gx, 23, 31); gx.fillRect(-113, 23, 8, 3); gx.fillRect(-113, 27, 8, 3);
    gx.fillStyle = '#060607'; gx.fillRect(-114, 23.5, 1.5, 2); gx.fillRect(-114, 27.5, 1.5, 2);
    // optiques LED, antibrouillards, feux arrière boomerang
    fillP(gx, 'M 112 9 L 96 3 L 88 4 L 108 13 Z', '#0b0c0f');
    ledLine(gx, 92, 4.5, 110, 10.5, '210,235,255', 1.2); glow(gx, 114, 10, 34, '220,240,255', 0.5);
    fillP(gx, 'M 104 17 L 112 18 L 111 26 L 106 26 Z', '#08090b'); ledLine(gx, 105.5, 19, 110, 19.5, LED, 1);
    lens(gx, 'M -105 -4 L -90 -9 L -93 -2 L -104 3 Z', -9, 3, 'tail'); glow(gx, -106, -2, 18, '255,40,50', 0.45);
    // aileron carbone sur montants, flancs LED
    bar(gx, -96, -13, -102, -28, 2.6, '#16171b'); bar(gx, -84, -24, -88, -32, 2.6, '#16171b');
    fillP(gx, 'M -120 -31 L -80 -35 L -80 -31 L -120 -27 Z', carbon(gx, -35, -27));
    fillP(gx, 'M -121 -36 L -116 -36 L -116 -24 L -121 -24 Z', '#0d0e11');
    ledLine(gx, -120, -33, -80, -37, LED, 0.9);
    // badges
    gx.fillStyle = '#c8102e'; gx.fillRect(-40, 14, 22, 6.5);
    gx.fillStyle = '#fff'; gx.font = '800 italic 6px "Barlow Condensed", Arial, sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.fillText('TYPE R', -29, 17.4);
    gx.fillStyle = 'rgba(255,255,255,0.8)'; gx.font = '700 italic 7px "Barlow Condensed", Arial, sans-serif'; gx.fillText('VTEC', 72, 10);
    edge(gx, C_BODY, 0.6);
    for (var w = 0; w < 2; w++) {
      gx.save(); gx.translate(w ? WB : -WB, w ? wy1 : wy0);
      tire(gx, WR, car.wheels[w].spin, { rimR: 0.74, rim: '#2b2e35', spokes: 10, caliper: '#d11a2a', ring: LED });
      gx.restore();
    }
  }

  // ------------------------------------------------------------------ MOTO sportive + pilote
  function drawMoto(gx, car, col, boosting) {
    var V = VEH.moto, WB = V.WB, WR = V.WR, c = col.a;
    var fy = car.wheels[1].dist - WR, ry = car.wheels[0].dist - WR;
    if (boosting) flame(gx, -68, -6, -1, 36, 4);
    var WO = { rimR: 0.74, rim: '#c9a227', spokes: 3, style: 'moto', letters: true };
    gx.save(); gx.translate(-WB, ry); tire(gx, WR, car.wheels[0].spin, WO); gx.restore();
    gx.save(); gx.translate(WB, fy); tire(gx, WR, car.wheels[1].spin, { rimR: 0.74, rim: '#c9a227', spokes: 3, style: 'moto', caliper: '#d4a017' }); gx.restore();
    gx.lineCap = 'round'; gx.lineJoin = 'round';
    // bras oscillant alu + chaîne + amortisseur
    gx.strokeStyle = '#1b1c20'; gx.lineWidth = 1.5;
    gx.beginPath(); gx.moveTo(-12, -4); gx.lineTo(-WB, ry - 9); gx.moveTo(-12, 8); gx.lineTo(-WB, ry + 9); gx.stroke();
    fillP(gx, 'M -18 -9 L ' + (-WB) + ' ' + (ry - 4) + ' L ' + (-WB) + ' ' + (ry + 4) + ' L -16 5 Z', metal(gx, -10, 6, '#b9bfc8'));
    shock(gx, -22, -32, -28, -4, '#d4a017', 3.2);
    // moteur 4 cylindres
    var eg = gx.createLinearGradient(0, -34, 0, 10); eg.addColorStop(0, '#4a4f58'); eg.addColorStop(0.5, '#23262c'); eg.addColorStop(1, '#0f1013');
    fillP(gx, 'M -16 -28 L 20 -34 L 28 -8 L 14 8 L -14 6 Z', eg);
    gx.strokeStyle = 'rgba(255,255,255,0.12)'; gx.lineWidth = 1; gx.beginPath(); for (var f = 0; f < 5; f++) { gx.moveTo(2 + f * 4, -32); gx.lineTo(7 + f * 4, -14); } gx.stroke();
    gx.fillStyle = metal(gx, -8, 8, '#9aa0a8'); gx.beginPath(); gx.arc(-4, -1, 7.5, 0, TAU); gx.fill();
    gx.strokeStyle = 'rgba(0,0,0,0.4)'; gx.beginPath(); gx.arc(-4, -1, 7.5, 0, TAU); gx.stroke();
    // collecteurs + silencieux titane
    gx.strokeStyle = '#8a7a6a'; gx.lineWidth = 3; gx.beginPath(); gx.moveTo(24, -16); gx.quadraticCurveTo(30, 8, 10, 12); gx.lineTo(-10, 12); gx.stroke();
    var tg = gx.createLinearGradient(0, -14, 0, 10); tg.addColorStop(0, '#e9ecf0'); tg.addColorStop(0.4, '#8d96a3'); tg.addColorStop(0.7, '#4a5260'); tg.addColorStop(1, '#a6aebb');
    fillP(gx, 'M -12 6 L -52 -14 L -56 -7 L -16 14 Z', tg);
    fillP(gx, 'M -52 -14 L -59 -16 L -62 -8 L -56 -7 Z', carbon(gx, -16, -7));
    // cadre périmétrique alu
    fillP(gx, 'M 30 -48 L 38 -40 L -6 -6 L -20 -8 L -18 -16 Z', metal(gx, -48, -6, '#c3c9d2'));
    // fourche inversée : fourreaux dorés, tubes noirs, garde-boue
    gx.strokeStyle = '#d4a52a'; gx.lineWidth = 7; gx.beginPath(); gx.moveTo(36, -48); gx.lineTo(47, -16); gx.stroke();
    gx.strokeStyle = 'rgba(255,255,255,0.4)'; gx.lineWidth = 1.5; gx.beginPath(); gx.moveTo(34, -47); gx.lineTo(45, -17); gx.stroke();
    gx.strokeStyle = '#1d1f24'; gx.lineWidth = 4.5; gx.beginPath(); gx.moveTo(47, -16); gx.lineTo(WB, fy); gx.stroke();
    fillP(gx, 'M 40 ' + (fy - 22) + ' Q 56 ' + (fy - 34) + ' 72 ' + (fy - 22) + ' L 70 ' + (fy - 18) + ' Q 56 ' + (fy - 28) + ' 42 ' + (fy - 18) + ' Z', paintSolid(gx, c, fy - 34, fy - 18));
    // jambe du pilote (côté opposé, dans l'ombre)
    limb(gx, [[-22, -42], [12, -34], [-6, -6]], [13, 10, 8], '#0c0d10');
    // carénage, réservoir, coque arrière
    var fair = new Path2D('M 30 -52 Q 52 -62 70 -50 Q 84 -40 86 -30 L 80 -22 L 60 -20 L 50 -8 L 36 6 Q 18 12 -2 10 L 0 2 L 22 -6 L 26 -28 Z');
    var tank = new Path2D('M -14 -50 Q 4 -62 30 -54 L 31 -42 L 24 -36 L -14 -36 Z');
    var tail = new Path2D('M -14 -44 L -48 -48 Q -64 -51 -78 -54 L -76 -47 Q -62 -40 -46 -36 L -16 -34 Z');
    [fair, tank, tail].forEach(function (p) { carPaint(gx, p, c, -62, -46, 10, -86, 86); edge(gx, p, 0.5); });
    // livrée blanche + numéro
    gx.save(); gx.clip(fair);
    gx.fillStyle = 'rgba(248,248,250,0.92)'; gx.beginPath(); gx.moveTo(34, -18); gx.lineTo(82, -30); gx.lineTo(84, -24); gx.lineTo(40, -10); gx.fill();
    gx.fillStyle = '#0d0e11'; gx.beginPath(); gx.moveTo(46, -42); gx.lineTo(60, -44); gx.lineTo(56, -34); gx.lineTo(44, -32); gx.fill();
    gx.restore();
    gx.save(); gx.clip(tail); gx.fillStyle = 'rgba(248,248,250,0.92)'; gx.beginPath(); gx.moveTo(-20, -38); gx.lineTo(-74, -50); gx.lineTo(-74, -47); gx.lineTo(-20, -35); gx.fill(); gx.restore();
    gx.fillStyle = '#0c0c0e'; gx.beginPath(); gx.moveTo(-48, -49); gx.quadraticCurveTo(-30, -49, -14, -47); gx.lineTo(-14, -43); gx.lineTo(-46, -45); gx.fill();
    // bulle, phare, feu, support de plaque
    var ws = new Path2D('M 38 -56 Q 52 -70 68 -60 L 63 -52 Q 52 -60 41 -52 Z');
    gx.fillStyle = 'rgba(40,50,64,0.75)'; gx.fill(ws); gx.strokeStyle = 'rgba(200,220,240,0.5)'; gx.lineWidth = 1; gx.beginPath(); gx.moveTo(40, -55); gx.quadraticCurveTo(52, -67, 66, -59); gx.stroke();
    lens(gx, 'M 85 -32 L 76 -39 L 70 -35 L 81 -28 Z', -39, -28, 'head'); glow(gx, 86, -33, 28, '230,240,255', 0.5);
    lens(gx, 'M -78 -54 L -73 -53 L -74 -49 L -77 -50 Z', -54, -49, 'tail'); glow(gx, -78, -51, 12, '255,40,40', 0.45);
    bar(gx, -60, -40, -68, -26, 2, '#16171b'); gx.fillStyle = '#d8d8d2'; gx.fillRect(-73, -28, 10, 7);
    // pilote : combinaison cuir, bosse dorsale, bras, casque
    var suit = new Path2D('M -32 -46 Q -24 -74 4 -80 Q 16 -82 22 -74 Q 14 -62 2 -56 Q -10 -46 -14 -40 Z');
    var sg = gx.createLinearGradient(0, -82, 0, -40); sg.addColorStop(0, '#3a3d44'); sg.addColorStop(0.5, '#17181c'); sg.addColorStop(1, '#0b0b0d');
    gx.fillStyle = sg; gx.fill(suit);
    gx.save(); gx.clip(suit);
    gx.fillStyle = c; gx.beginPath(); gx.moveTo(-30, -50); gx.quadraticCurveTo(-20, -72, 4, -78); gx.lineTo(6, -74); gx.quadraticCurveTo(-16, -66, -24, -46); gx.fill();
    gx.fillStyle = 'rgba(255,255,255,0.85)'; gx.beginPath(); gx.moveTo(-26, -48); gx.quadraticCurveTo(-18, -66, 2, -72); gx.lineTo(3, -70); gx.quadraticCurveTo(-16, -64, -22, -46); gx.fill();
    gx.restore();
    edge(gx, suit, 0.6);
    limb(gx, [[-22, -42], [16, -32], [-2, -4]], [15, 11, 9], '#1a1b1f', c);                   // jambe
    fillP(gx, 'M -8 -8 L 6 -8 L 8 -2 L -10 -1 Z', '#0b0b0d');                                     // botte
    limb(gx, [[8, -74], [22, -58], [40, -50]], [11, 8, 7], '#1a1b1f', c);                          // bras
    gx.fillStyle = '#0d0e11'; gx.beginPath(); gx.arc(40, -50, 3.5, 0, TAU); gx.fill();           // gant
    // casque
    var hg = gx.createRadialGradient(16, -92, 2, 22, -84, 14); hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.5, '#e6e8ec'); hg.addColorStop(1, '#878d96');
    var helm = new Path2D('M 10 -82 Q 10 -97 24 -97 Q 36 -96 36 -84 L 34 -76 Q 26 -72 16 -74 Z');
    gx.fillStyle = hg; gx.fill(helm); edge(gx, helm, 0.5);
    gx.save(); gx.clip(helm); gx.fillStyle = c; gx.fillRect(8, -88, 30, 3); gx.restore();
    var vg = gx.createLinearGradient(26, -92, 36, -80); vg.addColorStop(0, '#1a2a44'); vg.addColorStop(0.5, '#ff9a5a'); vg.addColorStop(1, '#141a26');
    fillP(gx, 'M 25 -91 Q 33 -91 36 -85 L 35 -80 L 26 -81 Z', vg);
    gx.lineCap = 'butt'; gx.lineJoin = 'miter';
  }
  function paintSolid(gx, c, y0, y1) { var g = gx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, mix(c, '#ffffff', 0.35)); g.addColorStop(1, shade(c, 0.6)); return g; }
  // membre articulé (épaisseurs dégressives) avec liseré de couleur
  function limb(gx, pts, ws, base, accent) {
    gx.lineCap = 'round'; gx.lineJoin = 'round';
    for (var i = 0; i < pts.length - 1; i++) {
      gx.strokeStyle = base; gx.lineWidth = ws[i];
      gx.beginPath(); gx.moveTo(pts[i][0], pts[i][1]); gx.lineTo(pts[i + 1][0], pts[i + 1][1]); gx.stroke();
      gx.strokeStyle = 'rgba(255,255,255,0.14)'; gx.lineWidth = Math.max(1, ws[i] * 0.22);
      gx.beginPath(); gx.moveTo(pts[i][0], pts[i][1] - ws[i] * 0.3); gx.lineTo(pts[i + 1][0], pts[i + 1][1] - ws[i] * 0.3); gx.stroke();
      if (accent) { gx.strokeStyle = accent; gx.lineWidth = Math.max(1.2, ws[i] * 0.18); gx.beginPath(); gx.moveTo(pts[i][0], pts[i][1] + ws[i] * 0.15); gx.lineTo(pts[i + 1][0], pts[i + 1][1] + ws[i] * 0.15); gx.stroke(); }
    }
  }

  // ------------------------------------------------------------------ CAMION : porteur américain à long capot + caisse alu
  var T_CAB = new Path2D('M -6 22 L -6 -104 Q -6 -112 4 -112 L 24 -112 Q 40 -110 48 -100 L 92 -100 Q 98 -100 100 -95 L 107 -52 L 172 -47 Q 181 -46 181 -38 L 182 18 L 165.5 22 A 40 40 0 0 0 90.5 22 Z');
  function drawTruck(gx, car, col, boosting, t) {
    var V = VEH.truck, WB = V.WB, WR = V.WR, c = col.a, i;
    var fy = car.wheels[1].dist - WR, ry = car.wheels[0].dist - WR;
    var TO = { lugs: 0, rimR: 0.56, rim: '#d4d9e0', style: 'budd', disc: false };
    farWheel(gx, WB - 12, fy - 12, WR, car.wheels[1].spin, TO);
    farWheel(gx, -WB - 12, ry - 12, WR, car.wheels[0].spin, TO);
    farWheel(gx, -WB - 74, ry - 12, WR, car.wheels[0].spin, TO);
    // longerons + suspension
    gx.fillStyle = metal(gx, 18, 30, '#2b2e34'); gx.fillRect(-212, 18, 392, 11);
    shock(gx, WB - 16, 16, WB - 4, fy - 4, '#3a3d44', 4); shock(gx, -WB + 14, 16, -WB + 2, ry - 4, '#3a3d44', 4);
    gx.fillStyle = '#1b1d21'; gx.fillRect(-WB - 60, ry - 6, 64, 8);                                     // balancier tandem
    // caisse aluminium
    gx.save(); gx.translate(-3, -3); gx.fillStyle = '#7f8792'; gx.fillRect(-210, -112, 200, 100); gx.restore();
    var tg = gx.createLinearGradient(0, -112, 0, -12);
    tg.addColorStop(0, '#fbfcfd'); tg.addColorStop(0.12, '#e2e6eb'); tg.addColorStop(0.5, '#c9ced5'); tg.addColorStop(0.53, '#aeb4bd'); tg.addColorStop(1, '#8e959f');
    gx.fillStyle = tg; gx.fillRect(-210, -112, 200, 100);
    var xg = gx.createLinearGradient(-210, 0, -10, 0); xg.addColorStop(0, 'rgba(0,0,0,0.18)'); xg.addColorStop(0.08, 'rgba(0,0,0,0)'); xg.addColorStop(0.6, 'rgba(255,255,255,0.12)'); xg.addColorStop(1, 'rgba(0,0,0,0.12)');
    gx.fillStyle = xg; gx.fillRect(-210, -112, 200, 100);
    for (i = 0; i < 13; i++) {                                                                       // montants
      var px = -202 + i * 15.5;
      gx.fillStyle = 'rgba(0,0,0,0.13)'; gx.fillRect(px, -106, 1.2, 88);
      gx.fillStyle = 'rgba(255,255,255,0.4)'; gx.fillRect(px + 1.2, -106, 0.8, 88);
    }
    gx.fillStyle = metal(gx, -112, -104, '#c3c9d2'); gx.fillRect(-210, -112, 200, 6);                 // rails
    gx.fillStyle = metal(gx, -20, -12, '#9aa1ab'); gx.fillRect(-210, -20, 200, 8);
    gx.fillStyle = 'rgba(0,0,0,0.4)'; gx.fillRect(-210, -13, 200, 1.2);
    // livrée
    gx.fillStyle = c; gx.beginPath(); gx.moveTo(-200, -46); gx.lineTo(-20, -46); gx.lineTo(-20, -40); gx.lineTo(-200, -40); gx.fill();
    gx.fillStyle = '#ff8a2b'; gx.fillRect(-200, -38, 180, 2.5);
    gx.fillStyle = '#1b1d22'; gx.font = '800 italic 30px "Barlow Condensed", Arial, sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle';
    gx.fillText('V8 FREIGHT', -110, -74);
    gx.fillStyle = shade(c, 0.9); gx.font = '700 italic 10px "Barlow Condensed", Arial, sans-serif'; gx.fillText('MIAMI · FLORIDA', -110, -55);
    gx.strokeStyle = 'rgba(0,0,0,0.35)'; gx.lineWidth = 1; gx.strokeRect(-210, -112, 200, 100);
    for (i = 0; i < 4; i++) { lens(gx, 'M ' + (-205 + i * 62) + ' -110 h 5 v 3 h -5 Z', -110, -107, 'amber'); }
    lens(gx, 'M -210 -24 h 4 v 7 h -4 Z', -24, -17, 'tail'); glow(gx, -210, -20, 12, '255,40,40', 0.4);
    gx.fillStyle = '#16171b'; gx.fillRect(-212, -12, 6, 22); gx.fillRect(-216, 6, 14, 4);                // barre anti-encastrement
    // garde-boue arrière
    fillP(gx, 'M -228 ' + (ry - 2) + ' L -222 ' + (ry - 2) + ' L -222 ' + (ry + 30) + ' L -228 ' + (ry + 30) + ' Z', '#0f1013');
    // réservoir chromé + marchepieds
    gx.fillStyle = chrome(gx, 24, 44); gx.beginPath(); gx.moveTo(48, 24); gx.lineTo(84, 24); gx.quadraticCurveTo(88, 34, 84, 44); gx.lineTo(48, 44); gx.quadraticCurveTo(44, 34, 48, 24); gx.fill();
    gx.fillStyle = 'rgba(0,0,0,0.35)'; gx.fillRect(58, 24, 1.2, 20); gx.fillRect(74, 24, 1.2, 20);
    gx.fillStyle = metal(gx, 18, 23, '#b9bfc8'); gx.fillRect(56, 18, 24, 3);
    // côté opposé + peinture cabine
    gx.save(); gx.translate(-2.5, -2.5); gx.fillStyle = shade(c, 0.45); gx.fill(T_CAB); gx.restore();
    carPaint(gx, T_CAB, c, -112, -50, 22, -6, 182);
    gx.save(); gx.clip(T_CAB);
    gx.fillStyle = 'rgba(0,0,0,0.2)'; gx.fillRect(-6, -112, 50, 134);                               // couchette un ton plus bas
    gx.fillStyle = 'rgba(248,246,240,0.9)'; gx.fillRect(-6, -18, 190, 3); gx.fillRect(-6, -13, 190, 1.4);
    shadowUnder(gx, -10, 190, 8, 14);
    gx.restore();
    crease(gx, 'M 107 -52 L 172 -47', 0.45);
    gap(gx, 'M 44 -104 L 44 20'); gap(gx, 'M 52 -98 L 52 20'); gap(gx, 'M 101 -60 L 104 20'); gap(gx, 'M 110 -30 L 178 -28', 0.3);
    // vitres porte + couchette
    var win = new Path2D('M 56 -95 L 93 -95 Q 96 -95 97 -91 L 101 -64 L 56 -64 Z');
    glassFill(gx, win, -95, -64, function () {
      gx.fillStyle = '#0c0e12'; gx.beginPath(); gx.ellipse(74, -76, 6, 8, 0, 0, TAU); gx.fill();
      gx.strokeStyle = '#0c0e12'; gx.lineWidth = 3; gx.beginPath(); gx.moveTo(92, -74); gx.lineTo(88, -64); gx.stroke();
    });
    gx.strokeStyle = '#0b0c0f'; gx.lineWidth = 1.5; gx.stroke(win);
    glassFill(gx, new Path2D('M 6 -84 L 32 -84 L 32 -72 L 6 -72 Z'), -84, -72);
    // aérations latérales du capot, filtre à air chromé, rétro west coast
    gx.fillStyle = 'rgba(0,0,0,0.5)'; for (i = 0; i < 6; i++) gx.fillRect(150 + i * 4.5, -38, 2, 14);
    gx.fillStyle = chromeV(gx, 108, 122); gx.fillRect(108, -44, 14, 34);
    gx.fillStyle = 'rgba(0,0,0,0.35)'; gx.fillRect(108, -36, 14, 1); gx.fillRect(108, -20, 14, 1);
    bar(gx, 101, -84, 110, -84, 2, '#b9bfc8'); bar(gx, 101, -66, 110, -66, 2, '#b9bfc8');
    gx.fillStyle = chromeV(gx, 108, 114); gx.fillRect(108, -92, 6, 32); gx.fillStyle = '#1a1c21'; gx.fillRect(109.5, -90, 3, 28);
    // feux de gabarit de toit
    for (i = 0; i < 5; i++) { lens(gx, 'M ' + (54 + i * 9) + ' -104 h 5 v 3.5 h -5 Z', -104, -100, 'amber'); glow(gx, 56.5 + i * 9, -102, 8, '255,170,60', 0.35); }
    // calandre chromée, phare, pare-chocs, ornement
    fillP(gx, 'M 176 -44 L 183 -44 L 184 18 L 177 18 Z', chromeV(gx, 176, 184));
    gx.fillStyle = 'rgba(0,0,0,0.4)'; for (i = 0; i < 12; i++) gx.fillRect(177, -40 + i * 5, 6, 1.2);
    fillP(gx, 'M 182 -52 L 186 -52 L 186 -47 L 181 -47 Z', chrome(gx, -52, -47));
    lens(gx, 'M 168 -4 L 180 -4 L 180 6 L 168 6 Z', -4, 6, 'head'); glow(gx, 184, 1, 40, '255,240,200', 0.5);
    fillP(gx, 'M 168 18 L 190 18 Q 193 19 193 23 L 193 30 Q 193 33 189 33 L 168 33 Z', chrome(gx, 18, 33));
    fillP(gx, 'M 166 -10 L 172 -10 L 172 -4 L 166 -4 Z', '#ff9a2a');
    // cheminées chromées
    gx.fillStyle = chromeV(gx, 30, 38); gx.fillRect(30, -146, 8, 132);
    gx.fillStyle = 'rgba(0,0,0,0.3)'; for (i = 0; i < 9; i++) gx.fillRect(30, -100 + i * 6, 8, 1);   // grille de protection
    fillP(gx, 'M 30 -146 L 38 -146 L 42 -154 L 34 -154 Z', chromeV(gx, 30, 42));
    gx.fillStyle = '#0b0b0d'; gx.beginPath(); gx.ellipse(38, -154, 4, 1.4, 0, 0, TAU); gx.fill();
    if (boosting) {
      var op = gx.globalCompositeOperation; gx.globalCompositeOperation = 'lighter';
      var fl = 26 + Math.random() * 30, fx = 38, fyy = -154;
      var fg = gx.createLinearGradient(fx, fyy, fx - fl * 0.6, fyy - fl * 1.6);
      fg.addColorStop(0, 'rgba(200,225,255,0.9)'); fg.addColorStop(0.4, 'rgba(255,150,60,0.6)'); fg.addColorStop(1, 'rgba(255,60,0,0)');
      gx.fillStyle = fg; gx.beginPath(); gx.moveTo(fx - 4, fyy); gx.lineTo(fx - fl * 0.7, fyy - fl * 1.6); gx.lineTo(fx + 4, fyy); gx.fill();
      gx.globalCompositeOperation = op;
    }
    edge(gx, T_CAB, 0.6);
    // garde-boue avant (aile chromée au-dessus de la roue)
    gx.strokeStyle = chrome(gx, -10, 10); gx.lineWidth = 2; gx.beginPath(); gx.arc(WB, 36, 41, Math.PI * 1.12, Math.PI * 1.88); gx.stroke();
    var FO = { lugs: 0, rimR: 0.56, rim: '#dde1e7', style: 'budd', disc: false };
    gx.save(); gx.translate(WB, fy); tire(gx, WR, car.wheels[1].spin, FO);
    gx.fillStyle = chrome(gx, -6, 6); gx.beginPath(); gx.moveTo(-6, -6); gx.lineTo(6, -6); gx.lineTo(9, 0); gx.lineTo(6, 6); gx.lineTo(-6, 6); gx.fill();
    gx.restore();
    gx.save(); gx.translate(-WB, ry); tire(gx, WR, car.wheels[0].spin, FO); gx.restore();
    gx.save(); gx.translate(-WB - 62, ry); tire(gx, WR, car.wheels[0].spin, FO); gx.restore();
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
