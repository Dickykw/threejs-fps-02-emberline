// Procedural sound: every effect is synthesized with WebAudio, so the game ships no
// audio files and makes no network request. Created on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function noise(duration, filterFreq, gain, type = 'lowpass') {
    if (!ensure()) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(g).connect(master);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  function tone(freq, duration, gain, type = 'sine', slideTo = 0) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    shot(kind) {
      if (kind === 'rifle') noise(0.12, 1800, 0.5);
      else if (kind === 'smg') noise(0.08, 2400, 0.35);
      else noise(0.1, 1400, 0.4);
      tone(180, 0.08, 0.25, 'square', 60);
    },
    enemyShot(distance) {
      const gain = Math.max(0.05, 0.4 - distance * 0.008);
      noise(0.1, 1500, gain);
    },
    reload() {
      tone(900, 0.05, 0.15, 'square');
      setTimeout(() => tone(600, 0.05, 0.15, 'square'), 180);
    },
    dryFire() {
      tone(1200, 0.04, 0.12, 'square');
    },
    hit() {
      tone(1400, 0.06, 0.2, 'sine');
    },
    kill() {
      tone(1400, 0.06, 0.2, 'sine');
      setTimeout(() => tone(1800, 0.09, 0.2, 'sine'), 70);
    },
    hurt() {
      tone(220, 0.15, 0.3, 'sawtooth', 110);
    },
    step() {
      noise(0.05, 300, 0.06);
    },
    plantTick() {
      tone(1000, 0.07, 0.2, 'sine');
    },
    bombBeep(fast) {
      tone(fast ? 1600 : 1100, 0.08, 0.22, 'sine');
    },
    explosion() {
      noise(0.9, 500, 0.8);
      tone(90, 0.7, 0.5, 'sine', 30);
    },
    buy() {
      tone(800, 0.05, 0.15, 'sine');
      setTimeout(() => tone(1200, 0.07, 0.15, 'sine'), 60);
    },
    roundWin() {
      tone(523, 0.12, 0.2, 'sine');
      setTimeout(() => tone(659, 0.12, 0.2, 'sine'), 120);
      setTimeout(() => tone(784, 0.2, 0.2, 'sine'), 240);
    },
    roundLose() {
      tone(392, 0.15, 0.2, 'sine');
      setTimeout(() => tone(311, 0.25, 0.2, 'sine'), 150);
    },
  };
}
