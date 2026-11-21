/* MONSTER V8 — sons : enregistrements réels (OpenGameArt, voir sounds/CREDITS.md) joués via Web Audio.
   Le moteur mélange plusieurs boucles enregistrées (ralenti / milieu / haut régime) dont on varie la hauteur
   selon le régime. Si un fichier ne charge pas (page ouverte en file://, réseau…), un son synthétisé prend le relais. */
(function () {
  'use strict';
  var ac = null, master = null, noiseBuf = null, muted = false;
  var eng = null, boostGain = null, boostFilter = null;

  // ---------------------------------------------------------------- banque de sons réels
  var FILES = {
    idle: 'eng_race_idle.wav', mid: 'eng_race_mid.wav', high: 'eng_race_high.wav',
    hlow: 'eng_heavy_low.wav', hhigh: 'eng_heavy_high.wav',
    boomBig: 'explosion_big.mp3', boomSmall: 'explosion_small.mp3',
    crush1: 'crush1.mp3', crush2: 'crush2.mp3', crush3: 'crush3.mp3', crash: 'crash.mp3', land: 'land.mp3',
    spring: 'spring.mp3', coin: 'coin.mp3', buy: 'buy.mp3', nitroPick: 'nitro_pick.mp3', nitroGo: 'nitro_go.mp3',
    ring: 'ring.mp3', splash: 'splash.mp3', stunt: 'stunt.mp3', trophy: 'trophy.mp3', finish: 'finish.mp3', click: 'click.mp3'
  };
  var buf = {};
  function loadBank() {
    Object.keys(FILES).forEach(function (k) {
      try {
        var x = new XMLHttpRequest();
        x.open('GET', 'sounds/' + FILES[k]);
        x.responseType = 'arraybuffer';
        x.onload = function () {
          if (x.status !== 200 && x.status !== 0) return;
          if (!x.response || !x.response.byteLength) return;
          ac.decodeAudioData(x.response, function (b) { buf[k] = b; }, function () { /* format non lu : synthèse */ });
        };
        x.send();
      } catch (e) { /* pas de chargement possible : synthèse */ }
    });
  }
  function play(name, gain, rate, delay) {
    var b = buf[name];
    if (!ac || !b) return false;
    var s = ac.createBufferSource(); s.buffer = b;
    if (rate) s.playbackRate.value = rate;
    var g = ac.createGain(); g.gain.value = gain === undefined ? 1 : gain;
    s.connect(g); g.connect(master);
    s.start(ac.currentTime + (delay || 0));
    return true;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ---------------------------------------------------------------- synthèse (secours)
  function curve(k) {
    var n = 256, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = i * 2 / n - 1; c[i] = Math.tanh(x * k); }
    return c;
  }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);

    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    var o1 = ac.createOscillator(); o1.type = 'sawtooth';
    var o2 = ac.createOscillator(); o2.type = 'square';
    var o3 = ac.createOscillator(); o3.type = 'sawtooth';
    var mix = ac.createGain(); mix.gain.value = 0.4;
    var ws = ac.createWaveShaper(); ws.curve = curve(2.4);
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 3;
    var am = ac.createGain(); am.gain.value = 0.7;
    var lfo = ac.createOscillator(); lfo.frequency.value = 9;
    var lfoG = ac.createGain(); lfoG.gain.value = 0.3;
    var out = ac.createGain(); out.gain.value = 0;
    o1.connect(mix); o2.connect(mix); o3.connect(mix);
    mix.connect(ws); ws.connect(lp); lp.connect(am); am.connect(out); out.connect(master);
    lfo.connect(lfoG); lfoG.connect(am.gain);
    o1.start(); o2.start(); o3.start(); lfo.start();
    eng = { o1: o1, o2: o2, o3: o3, lp: lp, out: out, lfo: lfo, lfoG: lfoG };

    // souffle continu pendant le boost (bruit filtré, discret)
    var boostSrc = ac.createBufferSource(); boostSrc.buffer = noiseBuf; boostSrc.loop = true;
    boostFilter = ac.createBiquadFilter(); boostFilter.type = 'bandpass'; boostFilter.frequency.value = 1400; boostFilter.Q.value = 0.7;
    boostGain = ac.createGain(); boostGain.gain.value = 0;
    boostSrc.connect(boostFilter); boostFilter.connect(boostGain); boostGain.connect(master);
    boostSrc.start();

    loadBank();
  }

  function set(param, v, tc) { param.setTargetAtTime(v, ac.currentTime, tc || 0.04); }

  var PROFILES = {
    v8:     { div: 15, mul2: 0.5, mul3: 2.01, lp0: 260, lpt: 700, lpr: 0.28, lfoB: 5, lfoR: 650, lfoD: 0.42, g: 0.2 },
    bike:   { div: 30, mul2: 0.5, mul3: 2.0, lp0: 900, lpt: 1800, lpr: 0.6, lfoB: 3, lfoR: 4000, lfoD: 0.08, g: 0.16 },
    vtec:   { div: 30, mul2: 0.5, mul3: 2.02, lp0: 600, lpt: 1200, lpr: 0.5, lfoB: 4, lfoR: 3000, lfoD: 0.1, g: 0.18, vtec: 5800 },
    diesel: { div: 12, mul2: 0.5, mul3: 1.5, lp0: 170, lpt: 380, lpr: 0.1, lfoB: 8, lfoR: 900, lfoD: 0.5, g: 0.24 }
  };

  // ---------------------------------------------------------------- moteur à boucles enregistrées
  // layers : boucles du ralenti au haut régime · rate : hauteur de lecture au ralenti / à la zone rouge · rpm : plage du compte-tours
  var SPROF = {
    v8:     { layers: ['idle', 'mid', 'high'], rate: [0.82, 1.8], rpm: [900, 6500], g: 0.62 },
    vtec:   { layers: ['idle', 'mid', 'high'], rate: [1.15, 3.0], rpm: [1000, 9600], g: 0.55, vtec: 0.56 },
    bike:   { layers: ['idle', 'mid', 'high'], rate: [1.5, 3.5], rpm: [1400, 13800], g: 0.5 },
    diesel: { layers: ['hlow', 'hhigh'], rate: [0.78, 1.32], rpm: [650, 2300], g: 0.7 }
  };
  var es = null;
  function samplesReady(P) { for (var i = 0; i < P.layers.length; i++) if (!buf[P.layers[i]]) return false; return true; }
  function stopSampleEngine() {
    if (!es) return;
    var old = es; es = null;
    set(old.out.gain, 0, 0.05);
    setTimeout(function () { old.srcs.forEach(function (s) { try { s.stop(); } catch (e) { /* déjà arrêté */ } }); }, 300);
  }
  function startSampleEngine(prof, P) {
    stopSampleEngine();
    var out = ac.createGain(); out.gain.value = 0;
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000; lp.Q.value = 0.7;
    lp.connect(out); out.connect(master);
    var srcs = [], gains = [];
    P.layers.forEach(function (k) {
      var s = ac.createBufferSource(); s.buffer = buf[k]; s.loop = true;
      var g = ac.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(lp);
      s.start(ac.currentTime, Math.random() * buf[k].duration);
      srcs.push(s); gains.push(g);
    });
    es = { prof: prof, srcs: srcs, gains: gains, lp: lp, out: out };
  }

  // rpm : régime moteur ; throttle 0..1 ; boost bool ; prof : nom du profil
  // cut : coupure du rupteur (le son s'étouffe une fraction de seconde)
  function engine(rpm, throttle, boost, prof, cut) {
    if (!ac || !eng) return;
    var cutK = cut ? 0.28 : 1, cutTc = cut ? 0.006 : 0.02;
    var SP = SPROF[prof] || SPROF.v8;
    if (samplesReady(SP)) {
      if (!es || es.prof !== prof) startSampleEngine(prof, SP);
      var k = Math.max(0, Math.min(1, (rpm - SP.rpm[0]) / (SP.rpm[1] - SP.rpm[0])));
      var rate = SP.rate[0] + (SP.rate[1] - SP.rate[0]) * k;
      if (SP.vtec && k > SP.vtec) rate += 0.12;                    // bascule VTEC
      var n = SP.layers.length;
      for (var i = 0; i < n; i++) {
        var pos = n === 1 ? 0 : i / (n - 1);
        var w = Math.max(0, 1 - Math.abs(k - pos) * (n - 1));        // fondu triangulaire entre couches
        set(es.gains[i].gain, w, 0.05);
        set(es.srcs[i].playbackRate, rate, 0.05);
      }
      set(es.lp.frequency, 700 + throttle * 4200 + k * 2800, 0.06);  // étouffé quand on lâche les gaz
      set(es.out.gain, SP.g * (0.42 + 0.58 * throttle) * (boost ? 1.15 : 1) * cutK, cut || throttle ? cutTc : 0.06);
      set(eng.out.gain, 0, 0.05);
      set(boostGain.gain, boost ? 0.12 : 0, 0.06);
      set(boostFilter.frequency, boost ? 1800 : 900, 0.1);
      return;
    }
    // secours : moteur synthétisé
    var P = PROFILES[prof] || PROFILES.v8;
    var f = rpm / P.div;
    set(eng.o1.frequency, f);
    set(eng.o2.frequency, f * P.mul2);
    set(eng.o3.frequency, f * P.mul3);
    var lpf = P.lp0 + throttle * P.lpt + rpm * P.lpr;
    if (P.vtec && rpm > P.vtec) lpf += 1600;
    set(eng.lp.frequency, lpf);
    set(eng.out.gain, (P.g + 0.28 * throttle) * cutK, cutTc);
    set(eng.lfo.frequency, P.lfoB + rpm / P.lfoR);
    set(eng.lfoG.gain, P.lfoD * (1 - 0.7 * throttle));
    set(boostGain.gain, boost ? 0.35 : 0, 0.06);
    set(boostFilter.frequency, boost ? 1800 : 900, 0.1);
  }

  function silence() {
    if (!ac || !eng) return;
    set(eng.out.gain, 0, 0.08);
    set(boostGain.gain, 0, 0.05);
    if (es) set(es.out.gain, 0, 0.08);
  }

  function burst(dur, freq, q, gain, type, sweep) {
    if (!ac) return;
    var s = ac.createBufferSource(); s.buffer = noiseBuf;
    var f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q || 1;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), ac.currentTime + dur);
    var g = ac.createGain();
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(); s.stop(ac.currentTime + dur + 0.05);
  }

  function tone(freq, dur, gain, type, slideTo, delay) {
    if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    var g = ac.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  window.MV8_SND = {
    init: init,
    engine: engine,
    silence: silence,
    setMuted: function (m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted: function () { return muted; },
    loaded: function () { return Object.keys(buf).length + '/' + Object.keys(FILES).length; },
    pop: function () {         // pétarade d'échappement (rupteur)
      burst(0.05, rnd(900, 1600), 1.2, 0.22, 'bandpass', 300);
      if (Math.random() < 0.5) setTimeout(function () { burst(0.04, rnd(700, 1300), 1.2, 0.16, 'bandpass', 250); }, 35);
    },
    crush: function () {
      if (!play(['crush1', 'crush2', 'crush3'][Math.floor(Math.random() * 3)], 0.75, rnd(0.88, 1.1))) { burst(0.35, 1800, 1, 0.9, 'lowpass', 200); tone(110, 0.25, 0.5, 'sawtooth', 40); }
    },
    land: function (v) {
      var k = Math.min(1, v / 1100);
      if (play('land', 0.35 + 0.65 * k, rnd(0.85, 1.05))) { if (k > 0.75) play('crush3', 0.35 * k, 0.8); return; }
      burst(0.25 + 0.2 * k, 600, 1, 0.3 + 0.7 * k, 'lowpass', 90); tone(70, 0.2, 0.5 * k, 'sine', 35);
    },
    boom: function () {
      if (play('boomBig', 1)) { play('boomSmall', 0.7); play('crush2', 0.5, 0.8, 0.05); return; }
      burst(1.1, 3200, 0.8, 1, 'lowpass', 60); burst(0.5, 900, 1, 1, 'lowpass', 40); tone(70, 0.9, 0.9, 'sawtooth', 24); tone(40, 1.0, 0.8, 'sine', 20);
    },
    crash: function () { if (!play('crash', 0.9)) { burst(0.6, 2500, 1, 1, 'lowpass', 120); tone(90, 0.5, 0.6, 'sawtooth', 30); } },
    coin: function () { if (!play('coin', 0.45, rnd(0.96, 1.08))) { tone(880, 0.09, 0.25, 'square'); tone(1320, 0.14, 0.25, 'square', null, 0.07); } },
    splash: function () { if (!play('splash', 0.9)) burst(0.8, 2200, 0.8, 0.8, 'lowpass', 150); },
    checkpoint: function () { if (!play('stunt', 0.5)) { tone(660, 0.12, 0.3, 'triangle'); tone(990, 0.2, 0.3, 'triangle', null, 0.1); } },
    stunt: function () { if (!play('stunt', 0.6)) { tone(520, 0.1, 0.25, 'triangle'); tone(780, 0.1, 0.25, 'triangle', null, 0.08); tone(1040, 0.2, 0.25, 'triangle', null, 0.16); } },
    fanfare: function () {
      if (play('finish', 0.8)) { play('trophy', 0.5, 1, 0.25); return; }
      [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.28, 0.3, 'square', null, i * 0.13); });
      tone(1046, 0.7, 0.3, 'square', null, 0.55);
    },
    click: function () { if (!play('click', 0.4)) tone(440, 0.05, 0.2, 'square'); },
    nitroGo: function () { if (!play('nitroGo', 0.85)) { burst(0.9, 600, 0.9, 0.8, 'bandpass', 3500); tone(110, 0.5, 0.35, 'sawtooth', 330); } },
    nitroPick: function () { if (!play('nitroPick', 0.7)) { tone(523, 0.08, 0.25, 'square'); tone(784, 0.08, 0.25, 'square', null, 0.06); tone(1046, 0.16, 0.22, 'square', null, 0.12); } },
    spring: function () { if (!play('spring', 0.8)) { tone(180, 0.35, 0.5, 'sine', 720); tone(360, 0.25, 0.2, 'triangle', 1100, 0.03); } },
    ring: function () { if (!play('ring', 1)) { tone(988, 0.12, 0.25, 'triangle'); tone(1319, 0.12, 0.25, 'triangle', null, 0.06); tone(1976, 0.25, 0.22, 'triangle', null, 0.12); burst(0.3, 3000, 1, 0.25, 'highpass', 6000); } else play('coin', 0.25, 1.4); },
    tnt: function () { if (play('boomSmall', 1)) { play('crush1', 0.4, 0.9); return; } burst(0.8, 2600, 0.8, 1, 'lowpass', 80); tone(60, 0.7, 0.8, 'sine', 25); },
    buy: function () { if (!play('buy', 0.6)) { tone(660, 0.08, 0.25, 'square'); tone(880, 0.08, 0.25, 'square', null, 0.07); tone(1320, 0.18, 0.25, 'square', null, 0.14); } },
    trophy: function () { if (!play('trophy', 0.6)) { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0.22, 0.25, 'triangle', null, i * 0.09); }); } }
  };
})();
