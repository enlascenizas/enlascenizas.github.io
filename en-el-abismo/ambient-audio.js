/* Procedural soundscapes for En las Cenizas / En el Abismo. No audio assets. */
(() => {
  'use strict';
  const script = document.currentScript;
  const theme = script?.dataset.soundscape === 'abyss' ? 'abyss' : 'ashes';
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine || document.querySelector('.sound-panel')) return;
  const lang = document.documentElement.lang;
  const words = lang.startsWith('en')
    ? ['Enable sound', 'Mute sound', 'Settings', 'Volume', 'Music', 'Ambient sound', 'Sound could not start. Try again.']
    : lang.startsWith('pt')
      ? ['Ativar som', 'Silenciar som', 'Ajustes', 'Volume', 'Música', 'Som ambiente', 'Não foi possível iniciar o som. Tente novamente.']
      : ['Activar sonido', 'Silenciar sonido', 'Ajustes', 'Volumen', 'Música', 'Ambiente sonoro', 'No se pudo activar el sonido. Vuelve a intentarlo.'];
  let volume = .22, musicEnabled = true;
  try {
    const stored = localStorage.getItem('elc-sound-volume');
    if (stored !== null && Number.isFinite(Number(stored))) volume = Math.max(0, Math.min(.65, Number(stored)));
    musicEnabled = localStorage.getItem('elc-sound-music') !== 'off';
  } catch {}
  const panel = document.createElement('div');
  panel.className = 'sound-panel'; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', words[5]);
  panel.innerHTML = `<button type="button" class="sound-toggle" aria-pressed="false"><span aria-hidden="true">♪</span> <span class="sound-label"></span></button><details class="sound-options"><summary>${words[2]}</summary><div class="sound-settings"><label class="sound-volume-label">${words[3]}<input class="sound-volume" type="range" min="0" max="100" step="1"></label><label class="sound-music-label"><input class="sound-music" type="checkbox"> ${words[4]}</label></div></details><span class="sound-sr" aria-live="polite"></span>`;
  document.body.append(panel);
  const button = panel.querySelector('.sound-toggle');
  const label = panel.querySelector('.sound-label');
  const slider = panel.querySelector('.sound-volume');
  const musicBox = panel.querySelector('.sound-music');
  const status = panel.querySelector('.sound-sr');
  slider.value = String(Math.round(volume / .65 * 100)); musicBox.checked = musicEnabled;
  let wanted = false, engine, disposed = false, action = 0;
  function update() { label.textContent = wanted ? words[1] : words[0]; button.setAttribute('aria-pressed', String(wanted)); }
  update();

  // One shared, bounded graph. Every one-shot disconnects itself when it ends.
  class Soundscape {
    constructor(ctx) {
      this.ctx = ctx; this.abyss = theme === 'abyss'; this.timer = null; this.sleepTimer = null; this.notes = 0;
      let seed = (Date.now() ^ (this.abyss ? 0x2b649 : 0x7d163)) >>> 0;
      this.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
      this.between = (a, b) => a + this.random() * (b - a);
      this.mix = ctx.createGain();
      this.fx = ctx.createGain(); this.fx.gain.value = .8; this.fx.connect(this.mix);
      this.music = ctx.createGain(); this.music.gain.value = musicEnabled ? .55 : 0; this.music.connect(this.mix);
      this.reverb = ctx.createConvolver();
      const length = Math.round(ctx.sampleRate * (this.abyss ? 5.2 : 3.2));
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel); let low = 0;
        for (let i = 0; i < length; i++) { low = low * .62 + (this.random() * 2 - 1) * .38; data[i] = low * Math.pow(1 - i / length, 3) * Math.min(1, i / 120); }
      }
      this.reverb.buffer = impulse;
      const fxSend = ctx.createGain(); fxSend.gain.value = this.abyss ? .5 : .2; this.fx.connect(fxSend); fxSend.connect(this.reverb);
      const musicSend = ctx.createGain(); musicSend.gain.value = .45; this.music.connect(musicSend); musicSend.connect(this.reverb);
      const wet = ctx.createGain(); wet.gain.value = this.abyss ? .28 : .22; this.reverb.connect(wet); wet.connect(this.mix);
      if (this.abyss) {
        const echo = ctx.createDelay(1); echo.delayTime.value = .37;
        const feedback = ctx.createGain(); feedback.gain.value = .19;
        const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 1700;
        const echoWet = ctx.createGain(); echoWet.gain.value = .12;
        this.fx.connect(echo); echo.connect(dark); dark.connect(feedback); feedback.connect(echo); dark.connect(echoWet); echoWet.connect(this.mix);
      }
      const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 6200; this.mix.connect(lowpass);
      const compressor = ctx.createDynamicsCompressor(); compressor.threshold.value = -22; compressor.knee.value = 20;
      compressor.ratio.value = 3; compressor.attack.value = .025; compressor.release.value = .5;
      lowpass.connect(compressor); this.master = ctx.createGain(); this.master.gain.value = 0; compressor.connect(this.master); this.master.connect(ctx.destination);
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const noiseData = this.noise.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) noiseData[i] = this.random() * 2 - 1;
      const real = new Float32Array(9), imaginary = new Float32Array([0, 1, .26, .20, .10, .07, .045, .03, .015]);
      this.reedWave = ctx.createPeriodicWave(real, imaginary);
      this.makeBed();
      this.next = this.abyss ? { drip: 1.4, bubbles: 8, steps: 21, cavern: 38, music: 2.5 } : { waves: 1.5, steps: 13, metal: 26, creak: 40, music: 3 };
    }
    route(node, bus, pan = 0) {
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.ctx.createGain();
      if (panner.pan) panner.pan.value = pan;
      node.connect(panner); panner.connect(bus); return panner;
    }
    envelope(param, at, duration, peak, attack = .02) {
      const rise = Math.min(attack, duration * .35);
      param.setValueAtTime(.00001, at); param.linearRampToValueAtTime(peak, at + rise);
      param.exponentialRampToValueAtTime(.00001, at + duration);
    }
    noiseVoice(at, duration, amp, frequency, type = 'lowpass', pan = 0, attack = .08, endFrequency) {
      const ctx = this.ctx, source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = this.noise; source.loop = true; filter.type = type; filter.Q.value = .65;
      filter.frequency.setValueAtTime(frequency, at);
      if (endFrequency) filter.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
      this.envelope(gain.gain, at, duration, amp, attack);
      source.connect(filter); filter.connect(gain); const panNode = this.route(gain, this.fx, pan);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); panNode.disconnect(); };
      source.start(at, this.between(0, 3)); source.stop(at + duration + .03);
    }
    sine(at, frequency, duration, amp, bus = this.fx, pan = 0, endFrequency = frequency, attack = .012) {
      const ctx = this.ctx, oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, at);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
      this.envelope(gain.gain, at, duration, amp, attack);
      oscillator.connect(gain); const panNode = this.route(gain, bus, pan);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); panNode.disconnect(); };
      oscillator.start(at); oscillator.stop(at + duration + .03);
    }
    makeBed() {
      const ctx = this.ctx, noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      noise.buffer = this.noise; noise.loop = true; filter.type = 'lowpass'; filter.frequency.value = this.abyss ? 340 : 750;
      gain.gain.value = this.abyss ? .035 : .065; noise.connect(filter); filter.connect(gain); gain.connect(this.fx);
      const sway = ctx.createOscillator(), swayAmount = ctx.createGain(); sway.frequency.value = this.abyss ? .037 : .065;
      swayAmount.gain.value = this.abyss ? .014 : .026; sway.connect(swayAmount); swayAmount.connect(gain.gain);
      noise.start(); sway.start();
      // Quiet fifths evoke a distant Nordic bourdon or cavern resonance.
      for (const [frequency, amount] of [[73.416,.018],[110,.010],[146.832,.006]]) {
        const oscillator = ctx.createOscillator(), drone = ctx.createGain(); oscillator.type = 'sine';
        oscillator.frequency.value = this.abyss ? frequency * .891 : frequency; drone.gain.value = amount;
        oscillator.connect(drone); drone.connect(this.music); oscillator.start();
      }
    }
    waves(at) {
      // Long, overlapping swells with no sharp crash.
      this.noiseVoice(at, this.between(9, 13), .22, 700, 'lowpass', this.between(-.6, .6), 3.5, 240);
      this.noiseVoice(at + 1.8, 5.5, .035, 2300, 'bandpass', .25, 1.4, 1100);
    }
    steps(at) {
      const count = 3 + Math.floor(this.random() * 3), leaf = this.abyss;
      for (let i = 0; i < count; i++) {
        const t = at + i * this.between(.63, .79), pan = (i % 2 ? 1 : -1) * .22;
        this.noiseVoice(t, leaf ? .43 : .62, leaf ? .13 : .19, leaf ? 1650 : 2450, 'bandpass', pan, .035, leaf ? 450 : 650);
        this.sine(t + .02, leaf ? 105 : 83, .15, .025, this.fx, pan, 55, .015);
        for (let k = 0; k < 3; k++) this.noiseVoice(t + .04 + k * .065, .08, .038, leaf ? 3100 : 4300, 'highpass', pan, .01);
      }
    }
    metal(at) {
      const base = this.between(185, 255), pan = this.between(-.65, .65);
      [1, 2.76, 4.07, 5.43].forEach((ratio, i) => this.sine(at + i * .003, base * ratio, 3.4 - i * .55, .052 / (i + 1), this.fx, pan));
    }
    creak(at) {
      const base = this.between(115, 165), pan = this.between(-.5, .5);
      [1, 1.49, 2.02].forEach((ratio, i) => this.sine(at + i * .07, base * ratio, 1.8, .026 / (i + 1), this.fx, pan, base * ratio * .67, .28));
      this.noiseVoice(at, 1.3, .045, 780, 'bandpass', pan, .26, 280);
    }
    drip(at) {
      const count = this.random() < .35 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const t = at + i * .27, pan = this.between(-.72, .72), pitch = this.between(700, 1150);
        this.sine(t, pitch, .29, .065, this.fx, pan, pitch * 1.55, .008);
        this.sine(t + .015, pitch * 1.96, .16, .013, this.fx, pan, pitch * 1.55, .006);
        this.noiseVoice(t, .07, .025, 2200, 'bandpass', pan, .006);
      }
    }
    bubbles(at) {
      const count = 5 + Math.floor(this.random() * 5), side = this.between(-.5, .5);
      for (let i = 0; i < count; i++) {
        const t = at + i * this.between(.18, .34), pitch = this.between(140, 310);
        this.sine(t, pitch, this.between(.13, .26), .042, this.fx, side, pitch * this.between(1.8, 2.7), .025);
      }
    }
    cavern(at) { this.noiseVoice(at, 7, .075, 280, 'bandpass', this.between(-.7, .7), 2.2, 145); }
    note(at) {
      const phrase = Math.floor(this.notes / 6), step = this.notes % 6;
      const roots = this.abyss ? [48, 44, 41, 43] : [50, 46, 43, 45];
      const motifs = [[0, 7, 14, 3, 10, 7], [7, 3, 0, 10, 7, 2], [0, 14, 10, 7, 3, 7]];
      const semitone = roots[phrase % roots.length] + motifs[phrase % motifs.length][step] + (this.abyss ? 12 : 0);
      const frequency = 440 * Math.pow(2, (semitone - 69) / 12), pan = this.between(-.28, .28);
      if (this.abyss) {
        // A soft, slightly inharmonic hammered-string voice, never a sample.
        [[1, 1], [2.002, .33], [3.008, .12], [4.018, .035]].forEach(([ratio, amp], i) => {
          this.sine(at, frequency * ratio, 5.8 - i * .85, .115 * amp, this.music, pan, frequency * ratio, .008 + i * .002);
        });
      } else {
        // Rounded reed harmonics over a quiet fifth: a distant bagpipe-like voice.
        const ctx = this.ctx, oscillator = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
        oscillator.setPeriodicWave(this.reedWave); oscillator.frequency.value = frequency;
        oscillator.detune.value = this.between(-3, 3); filter.type = 'lowpass'; filter.frequency.value = 1450;
        this.envelope(gain.gain, at, 4.8, .075, .9); oscillator.connect(filter); filter.connect(gain);
        const panNode = this.route(gain, this.music, pan);
        oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); panNode.disconnect(); };
        oscillator.start(at); oscillator.stop(at + 4.85);
      }
      this.notes++;
    }
    tick() {
      const now = this.ctx.currentTime, horizon = now + .2;
      for (const [event, next] of Object.entries(this.next)) {
        if (next > horizon) continue;
        const at = Math.max(now + .025, next);
        if (event !== 'music' || musicEnabled) this[event === 'music' ? 'note' : event](at);
        const spacing = {waves:[12,18],steps:[36,58],metal:[28,48],creak:[42,68],drip:[5,11],bubbles:[16,29],cavern:[38,62],music:[5.5,10]};
        this.next[event] = at + this.between(...spacing[event]);
      }
    }
    async play() {
      clearTimeout(this.sleepTimer); this.sleepTimer = null;
      await this.ctx.resume();
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now); this.master.gain.setTargetAtTime(volume, now, .6);
      if (!this.timer) { this.tick(); this.timer = setInterval(() => this.tick(), 140); }
    }
    pause(immediate = false) {
      clearInterval(this.timer); this.timer = null; clearTimeout(this.sleepTimer);
      const now = this.ctx.currentTime; this.master.gain.cancelScheduledValues(now);
      if (immediate) { this.master.gain.setValueAtTime(0, now); return this.ctx.suspend(); }
      this.master.gain.setTargetAtTime(0, now, .15);
      this.sleepTimer = setTimeout(() => { this.sleepTimer = null; this.ctx.suspend().catch(() => {}); }, 850);
    }
    setVolume() {
      if (wanted && !document.hidden) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, .2);
    }
    setMusic() { this.music.gain.setTargetAtTime(musicEnabled ? .55 : 0, this.ctx.currentTime, .5); }
    close() { clearInterval(this.timer); clearTimeout(this.sleepTimer); this.ctx.close().catch(() => {}); }
  }

  button.addEventListener('click', async () => {
    const currentAction = ++action; wanted = !wanted; status.textContent = ''; update();
    try {
      if (!wanted) { engine?.pause(); return; }
      if (!engine) engine = new Soundscape(new AudioEngine({latencyHint:'playback'}));
      await engine.play();
      if (!wanted || document.hidden) engine.pause(true);
    } catch (error) {
      if (currentAction !== action) return;
      wanted = false; update(); status.textContent = words[6]; engine?.close(); engine = undefined;
    }
  });
  slider.addEventListener('input', () => { volume = Number(slider.value) / 100 * .65; engine?.setVolume(); try { localStorage.setItem('elc-sound-volume', String(volume)); } catch {} });
  musicBox.addEventListener('change', () => { musicEnabled = musicBox.checked; engine?.setMusic(); try { localStorage.setItem('elc-sound-music', musicEnabled ? 'on' : 'off'); } catch {} });
  document.addEventListener('visibilitychange', () => {
    if (!engine) return;
    if (document.hidden) { engine.pause(true)?.catch(() => {}); }
    else if (wanted) engine.play().catch(() => { wanted = false; update(); });
  });
  addEventListener('pagehide', () => { disposed = true; action++; engine?.close(); engine = undefined; });
  addEventListener('pageshow', () => { if (disposed) { disposed = false; wanted = false; update(); } });
})();
