type SoundName =
  | "click" | "hover" | "start" | "shoot_g18" | "shoot_uzi" | "shoot_f12" | "shoot_akm" | "shoot_awm"
  | "hit" | "enemy_hit" | "kill" | "hurt" | "explosion" | "pickup" | "drop"
  | "container_open" | "coin" | "equip" | "unequip" | "upgrade" | "sell" | "transfer"
  | "draw" | "buff_select" | "submit" | "extract" | "boss" | "gameover" | "level_clear" | "denied";

class AudioManagerImpl {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private enabled = true;

  init(): void {
    if (this.context) {
      if (this.context.state === "suspended") void this.context.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new Ctor();
    this.master = this.context.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.context.destination);
    this.sfx = this.context.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
  }

  setVolume(volume: number): void {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, volume));
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  play(name: SoundName, volume = 0.7): void {
    if (!this.enabled || !this.context || !this.sfx) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    const duration = this.durations[name] ?? 0.2;
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    gain.connect(this.sfx);

    const tone = (freq: number, type: OscillatorType, endFreq = freq, duration = 0.08) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + duration);
    };

    const noise = (duration = 0.08, filterFreq = 1800) => {
      const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = filterFreq;
      source.connect(filter);
      filter.connect(gain);
      source.start(now);
      source.stop(now + duration);
    };

    switch (name) {
      case "click": tone(500, "square", 220, 0.05); break;
      case "hover": tone(880, "sine", 1100, 0.03); break;
      case "start": tone(260, "sawtooth", 520, 0.4); noise(0.25, 900); break;
      case "shoot_g18": tone(760, "square", 180, 0.07); noise(0.06, 2600); break;
      case "shoot_uzi": tone(980, "square", 300, 0.045); noise(0.04, 3200); break;
      case "shoot_f12": tone(300, "square", 90, 0.15); noise(0.16, 1300); break;
      case "shoot_akm": tone(520, "sawtooth", 120, 0.10); noise(0.09, 1800); break;
      case "shoot_awm": tone(180, "sawtooth", 35, 0.22); noise(0.20, 900); break;
      case "hit": noise(0.06, 2600); tone(1200, "sine", 500, 0.05); break;
      case "enemy_hit": noise(0.07, 2000); tone(300, "square", 90, 0.06); break;
      case "kill": tone(180, "square", 45, 0.18); noise(0.12, 1200); break;
      case "hurt": tone(130, "sawtooth", 55, 0.22); noise(0.10, 500); break;
      case "explosion": tone(95, "sawtooth", 28, 0.45); noise(0.42, 350); break;
      case "pickup": tone(660, "sine", 1320, 0.10); tone(990, "sine", 1980, 0.10); break;
      case "drop": tone(440, "triangle", 220, 0.12); break;
      case "container_open": tone(250, "sine", 900, 0.35); noise(0.15, 1200); break;
      case "coin": tone(880, "square", 1760, 0.08); tone(1320, "square", 2640, 0.08); break;
      case "equip": tone(420, "triangle", 700, 0.12); break;
      case "unequip": tone(500, "triangle", 260, 0.10); break;
      case "upgrade": tone(700, "square", 1400, 0.12); tone(1050, "square", 2100, 0.12); break;
      case "sell": tone(520, "square", 1040, 0.10); noise(0.07, 3000); break;
      case "transfer": tone(300, "triangle", 620, 0.16); break;
      case "draw": tone(340, "sawtooth", 900, 0.45); noise(0.30, 1800); break;
      case "buff_select": tone(520, "sine", 1300, 0.20); break;
      case "submit": tone(280, "sine", 840, 0.55); tone(560, "sine", 1680, 0.55); break;
      case "extract": tone(220, "sine", 880, 0.8); noise(0.6, 700); break;
      case "boss": tone(70, "sawtooth", 180, 0.8); tone(140, "sawtooth", 90, 0.8); break;
      case "gameover": tone(220, "sawtooth", 55, 1.0); noise(0.7, 300); break;
      case "level_clear": tone(523, "triangle", 1046, 0.4); tone(659, "triangle", 1318, 0.4); tone(784, "triangle", 1568, 0.4); break;
      case "denied": tone(180, "square", 90, 0.14); break;
    }
  }

  private durations: Partial<Record<SoundName, number>> = {
    shoot_g18: 0.07, shoot_uzi: 0.05, shoot_f12: 0.18, shoot_akm: 0.10, shoot_awm: 0.22,
    explosion: 0.45, gameover: 1.0, boss: 0.8, extract: 0.9, draw: 0.5,
  };
}

export const AudioManager = new AudioManagerImpl();


