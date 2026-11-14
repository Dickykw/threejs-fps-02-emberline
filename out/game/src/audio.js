// Audio: every sound is synthesized with WebAudio — no audio files, no network.
// The context is created lazily on the first user gesture; until then calls are no-ops.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 1;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    const c = ensure();
    if (!c || !master) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type = 'lowpass') {
    const c = ensure();
    if (!c || !master || !noiseBuf) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  return {
    // Call once from a user gesture so later sounds are allowed.
    unlock() {
      ensure();
    },
    shot(kind) {
      if (kind === 'rifle') {
        noise(0.09, 0.5, 1800);
        tone(160, 0.08, 'square', 0.22, 60);
      } else if (kind === 'smg') {
        noise(0.06, 0.4, 2400);
        tone(220, 0.05, 'square', 0.16, 90);
      } else if (kind === 'bot') {
        noise(0.08, 0.25, 1200);
        tone(140, 0.07, 'square', 0.12, 55);
      } else {
        noise(0.11, 0.55, 1400);
        tone(120, 0.1, 'square', 0.25, 45);
      }
    },
    dryFire() {
      tone(1400, 0.04, 'square', 0.12);
    },
    reload() {
      tone(500, 0.05, 'square', 0.12);
      setTimeout(() => tone(700, 0.05, 'square', 0.12), 160);
      setTimeout(() => tone(900, 0.06, 'square', 0.14), 320);
    },
    step() {
      noise(0.05, 0.08, 400);
    },
    hit() {
      tone(880, 0.06, 'sine', 0.2, 660);
    },
    hurt() {
      tone(220, 0.15, 'sawtooth', 0.2, 90);
      noise(0.12, 0.2, 500);
    },
    explosion() {
      noise(0.7, 0.9, 300);
      tone(90, 0.6, 'sine', 0.5, 30);
    },
    plant() {
      tone(1040, 0.09, 'sine', 0.22);
    },
    plantDone() {
      tone(1040, 0.09, 'sine', 0.22);
      setTimeout(() => tone(1318, 0.14, 'sine', 0.22), 120);
    },
    defuse() {
      tone(784, 0.08, 'sine', 0.18);
    },
    click() {
      tone(1200, 0.04, 'sine', 0.14);
    },
    buy() {
      tone(660, 0.07, 'sine', 0.18);
      setTimeout(() => tone(990, 0.1, 'sine', 0.18), 90);
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'sine', 0.2), i * 130));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.18), i * 140));
    },
  };
}
