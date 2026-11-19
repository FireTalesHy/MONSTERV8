/* MONSTER V8 — sons synthétisés (Web Audio) : moteur V8, nitro, écrasements… */
(function () {
  'use strict';
  var ac = null, master = null, noiseBuf = null, muted = false;
  var eng = null, boostSrc = null, boostGain = null, boostFilter = null;

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

    // --- moteur V8 : dents de scie + carré, déformés, filtrés, modulés (le "blub-blub")
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

    // --- souffle du nitro
    boostSrc = ac.createBufferSource(); boostSrc.buffer = noiseBuf; boostSrc.loop = true;
    boostFilter = ac.createBiquadFilter(); boostFilter.type = 'bandpass'; boostFilter.frequency.value = 1400; boostFilter.Q.value = 0.7;
    boostGain = ac.createGain(); boostGain.gain.value = 0;
    boostSrc.connect(boostFilter); boostFilter.connect(boostGain); boostGain.connect(master);
    boostSrc.start();
  }

  function set(param, v, tc) { param.setTargetAtTime(v, ac.currentTime, tc || 0.04); }

  // profils moteur : div = fondamentale (rpm/div Hz), lp = filtre, lfo = « lope » du ralenti
  var PROFILES = {
    v8:     { div: 15, mul2: 0.5, mul3: 2.01, lp0: 260, lpt: 700, lpr: 0.28, lfoB: 5, lfoR: 650, lfoD: 0.42, g: 0.2 },
    bike:   { div: 30, mul2: 0.5, mul3: 2.0, lp0: 900, lpt: 1800, lpr: 0.6, lfoB: 3, lfoR: 4000, lfoD: 0.08, g: 0.16 },
    vtec:   { div: 30, mul2: 0.5, mul3: 2.02, lp0: 600, lpt: 1200, lpr: 0.5, lfoB: 4, lfoR: 3000, lfoD: 0.1, g: 0.18, vtec: 5800 },
    diesel: { div: 12, mul2: 0.5, mul3: 1.5, lp0: 170, lpt: 380, lpr: 0.1, lfoB: 8, lfoR: 900, lfoD: 0.5, g: 0.24 }
  };

  // rpm : régime moteur ; throttle 0..1 ; boost bool ; prof : nom du profil
  function engine(rpm, throttle, boost, prof) {
    if (!ac || !eng) return;
    var P = PROFILES[prof] || PROFILES.v8;
    var f = rpm / P.div;
    set(eng.o1.frequency, f);
    set(eng.o2.frequency, f * P.mul2);
    set(eng.o3.frequency, f * P.mul3);
    var lp = P.lp0 + throttle * P.lpt + rpm * P.lpr;
    if (P.vtec && rpm > P.vtec) lp += 1600;           // bascule VTEC : le son s'ouvre d'un coup
    set(eng.lp.frequency, lp);
    set(eng.out.gain, P.g + 0.28 * throttle);
    set(eng.lfo.frequency, P.lfoB + rpm / P.lfoR);
    set(eng.lfoG.gain, P.lfoD * (1 - 0.7 * throttle));
    set(boostGain.gain, boost ? 0.35 : 0, 0.06);
    set(boostFilter.frequency, boost ? 1800 : 900, 0.1);
  }

  function silence() {
    if (!ac || !eng) return;
    set(eng.out.gain, 0, 0.08);
    set(boostGain.gain, 0, 0.05);
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
    crush: function () { burst(0.35, 1800, 1, 0.9, 'lowpass', 200); tone(110, 0.25, 0.5, 'sawtooth', 40); },
    land: function (v) { var k = Math.min(1, v / 1100); burst(0.25 + 0.2 * k, 600, 1, 0.3 + 0.7 * k, 'lowpass', 90); tone(70, 0.2, 0.5 * k, 'sine', 35); },
    boom: function () { burst(1.1, 3200, 0.8, 1, 'lowpass', 60); burst(0.5, 900, 1, 1, 'lowpass', 40); tone(70, 0.9, 0.9, 'sawtooth', 24); tone(40, 1.0, 0.8, 'sine', 20); },
    crash: function () { burst(0.6, 2500, 1, 1, 'lowpass', 120); tone(90, 0.5, 0.6, 'sawtooth', 30); },
    coin: function () { tone(880, 0.09, 0.25, 'square'); tone(1320, 0.14, 0.25, 'square', null, 0.07); },
    splash: function () { burst(0.8, 2200, 0.8, 0.8, 'lowpass', 150); },
    checkpoint: function () { tone(660, 0.12, 0.3, 'triangle'); tone(990, 0.2, 0.3, 'triangle', null, 0.1); },
    stunt: function () { tone(520, 0.1, 0.25, 'triangle'); tone(780, 0.1, 0.25, 'triangle', null, 0.08); tone(1040, 0.2, 0.25, 'triangle', null, 0.16); },
    fanfare: function () {
      [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.28, 0.3, 'square', null, i * 0.13); });
      tone(1046, 0.7, 0.3, 'square', null, 0.55);
    },
    click: function () { tone(440, 0.05, 0.2, 'square'); }
  };
})();
