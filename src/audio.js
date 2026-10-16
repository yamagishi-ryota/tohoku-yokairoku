// Resume inside a user gesture, then schedule tones only once audio is running.
export function createAudio(onError = () => {}) {
  let context,
    master,
    drones = [],
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
  async function ambience(value) {
    enabled = value;
    drones.forEach(({ oscillator, gain }) => {
      oscillator.stop();
      oscillator.disconnect();
      gain.disconnect();
    });
    drones = [];
    if (!enabled) return;
    const ctx = await unlock();
    if (!ctx || !enabled || drones.length) return;
    [130.81, 196].forEach((frequency) => {
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.035;
      oscillator.connect(gain).connect(master);
      oscillator.start();
      drones.push({ oscillator, gain });
    });
  }
  return { unlock, play, ambience };
}
