// Resume inside a user gesture, then schedule tones only once audio is running.
export function createAudio(onError = () => {}) {
  let context,
    master,
    ambienceNodes = [],
    ambienceBuffers,
    ambienceRevision = 0,
    enabled = false;
  async function unlock() {
    try {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) throw Error("このブラウザは音声再生に対応していません。");
      if (!context || context.state === "closed") {
        context = new Audio();
        master = context.createGain();
        master.gain.value = 0.65;
        master.connect(context.destination);
      }
      if (context.state !== "running") await context.resume();
      if (context.state !== "running")
        throw Error("音声を開始できません。「音を確認」を押してください。");
      return context;
    } catch (error) {
      onError(error.message);
      return null;
    }
  }
  async function play(success = true) {
    const ctx = await unlock();
    if (!ctx) return false;
    const now = ctx.currentTime + 0.025;
    const notes = success
      ? [392, 523.25, 659.25, 783.99]
      : [392, 349.23, 293.66, 261.63];
    notes.forEach((frequency, index) => {
      for (const harmonic of [1, 2]) {
        const oscillator = ctx.createOscillator(),
          gain = ctx.createGain();
        const start = now + index * 0.13;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency * harmonic;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(
          harmonic === 1 ? 0.32 : 0.08,
          start + 0.015,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.6);
        oscillator.connect(gain).connect(master);
        oscillator.start(start);
        oscillator.stop(start + 1.7);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      }
    });
    return true;
  }
  function natureBuffers(ctx) {
    if (ambienceBuffers?.sampleRate === ctx.sampleRate)
      return ambienceBuffers.layers;
    let seed = 70417;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const wind = ctx.createBuffer(1, ctx.sampleRate * 19, ctx.sampleRate);
    const water = ctx.createBuffer(1, ctx.sampleRate * 23, ctx.sampleRate);
    let soft = 0;
    const gusts = wind.getChannelData(0);
    for (let i = 0; i < gusts.length; i++) {
      const t = i / ctx.sampleRate;
      soft = 0.96 * soft + 0.04 * (random() * 2 - 1);
      const edge = Math.min(1, t / 1.5, (19 - t) / 1.5);
      const swell = 0.6 + 0.2 * Math.sin(t * 0.7) + 0.2 * Math.sin(t * 1.3);
      gusts[i] = soft * swell * edge;
    }
    const stream = water.getChannelData(0);
    for (let i = 0; i < stream.length; i++) {
      const t = i / ctx.sampleRate;
      const edge = Math.min(1, t, 23 - t);
      stream[i] =
        (random() * 2 - 1) * 0.055 * (0.7 + 0.3 * Math.sin(t * 2.1)) * edge;
    }
    // Short, decaying water drops interrupt the stream; no sustained pitched drone.
    for (let t = 0.3; t < 22.5; t += 0.35 + random() * 0.65) {
      const frequency = 750 + random() * 1200,
        amplitude = 0.12 + random() * 0.08;
      const start = Math.floor(t * ctx.sampleRate),
        count = Math.floor(0.16 * ctx.sampleRate);
      for (let i = 0; i < count && start + i < stream.length; i++) {
        const age = i / ctx.sampleRate;
        const envelope = Math.min(1, age / 0.005) * Math.exp(-age * 40);
        stream[start + i] +=
          Math.sin(2 * Math.PI * (frequency * age - 900 * age * age)) *
          amplitude *
          envelope;
      }
    }
    const layers = [wind, water];
    ambienceBuffers = { sampleRate: ctx.sampleRate, layers };
    return layers;
  }
  async function ambience(value) {
    enabled = value;
    const revision = ++ambienceRevision;
    ambienceNodes.forEach(({ source, gain, filter }) => {
      source.stop();
      source.disconnect();
      gain.disconnect();
      filter.disconnect();
    });
    ambienceNodes = [];
    if (!enabled) return;
    const ctx = await unlock();
    if (!ctx || !enabled || revision !== ambienceRevision) return;
    natureBuffers(ctx).forEach((buffer, index) => {
      const source = ctx.createBufferSource(),
        gain = ctx.createGain(),
        filter = ctx.createBiquadFilter();
      source.buffer = buffer;
      source.loop = true;
      filter.type = index === 0 ? "highpass" : "lowpass";
      filter.frequency.value = index === 0 ? 220 : 3500;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(
        index === 0 ? 0.7 : 0.65,
        ctx.currentTime + 0.6,
      );
      source.connect(filter).connect(gain).connect(master);
      source.start();
      ambienceNodes.push({ source, gain, filter });
    });
  }
  return { unlock, play, ambience };
}
