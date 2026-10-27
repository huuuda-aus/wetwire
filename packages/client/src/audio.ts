import type { GameEvent } from '@wetwire/sim';

type Cue = 'tick' | 'spot' | 'hit' | 'hack' | 'dumpshock';

/** Web Audio only; no assets. The context is created on the first user gesture, as browsers require. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: GainNode | null = null;
  private volume: number;

  constructor(volume: number) {
    this.volume = volume;
  }

  /** Call from a click or key handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = this.volume;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.startRain(ctx, master);
      this.startHum(ctx, master);
    } catch (err) {
      console.warn('wetwire: audio unavailable', err);
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** 0 = Street, 1 = Net: the low hum fades in as the wipe moves down. */
  setNetMix(mix: number): void {
    if (this.hum) this.hum.gain.value = 0.09 * mix;
  }

  private startRain(ctx: AudioContext, out: AudioNode): void {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3200;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(filter).connect(gain).connect(out);
    src.start();
  }

  private startHum(ctx: AudioContext, out: AudioNode): void {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    for (const f of [55, 110.5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start();
    }
    gain.connect(out);
    this.hum = gain;
  }

  private blip(freq: number, to: number, dur: number, type: OscillatorType, level: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  play(cue: Cue): void {
    switch (cue) {
      case 'tick':
        this.blip(220, 110, 0.12, 'triangle', 0.25);
        break;
      case 'spot':
        this.blip(880, 660, 0.25, 'square', 0.12);
        break;
      case 'hit':
        this.blip(140, 40, 0.3, 'sawtooth', 0.3);
        break;
      case 'hack':
        this.blip(400, 1200, 0.18, 'sine', 0.2);
        break;
      case 'dumpshock':
        this.blip(90, 30, 0.6, 'sawtooth', 0.35);
    }
  }

  /** Map sim events to cues. The renderer never infers events by diffing state. */
  onEvents(events: readonly GameEvent[]): void {
    this.play('tick');
    const seen = new Set<Cue>();
    for (const e of events) {
      const cue: Cue | null =
        e.type === 'CameraSpotted' || e.type === 'HunterSpotted'
          ? 'spot'
          : e.type === 'CourierHit' || e.type === 'KadeHit'
            ? 'hit'
            : e.type === 'HackApplied'
              ? 'hack'
              : e.type === 'KadeDumpshocked'
                ? 'dumpshock'
                : null;
      if (cue && !seen.has(cue)) {
        seen.add(cue);
        this.play(cue);
      }
    }
  }
}
