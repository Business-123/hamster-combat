// Lightweight, dependency-free sound engine built on the Web Audio API.
// Every sound here is generated synthetically (oscillators + envelopes),
// so there are no audio files to bundle, host, or fetch.

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;

const MUSIC_PREF_KEY = 'hamster-kombat-music';
let musicEnabled = localStorage.getItem(MUSIC_PREF_KEY) !== 'off';
let musicStarted = false;
let musicTimer: ReturnType<typeof setTimeout> | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();

    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.1;
    musicGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.35;
    sfxGain.connect(masterGain);
  }
  return ctx;
}

/**
 * Browsers block audio until a user gesture. Call this from any tap/click
 * handler — it resumes the (possibly suspended) AudioContext and, the very
 * first time it runs, kicks off the background music loop if it's enabled.
 */
export function ensureAudioStarted(): void {
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  if (musicEnabled && !musicStarted) startMusic();
}

export function isMusicOn(): boolean {
  return musicEnabled;
}

export function toggleMusic(): boolean {
  musicEnabled = !musicEnabled;
  localStorage.setItem(MUSIC_PREF_KEY, musicEnabled ? 'on' : 'off');

  if (musicEnabled) {
    ensureAudioStarted();
    if (musicGain) musicGain.gain.value = 0.1;
    if (!musicStarted) startMusic();
  } else if (musicGain) {
    musicGain.gain.value = 0;
  }
  return musicEnabled;
}

/**
 * A bright, satisfying "coin collect" blip — a fast upward square-wave
 * chirp with a shimmering triangle-wave harmonic on top, in the spirit of
 * classic arcade coin sounds.
 */
export function playCoinSound(): void {
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  const t0 = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(880, t0);
  osc.frequency.exponentialRampToValueAtTime(1760, t0 + 0.08);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
  osc.connect(gain);
  gain.connect(sfxGain!);
  osc.start(t0);
  osc.stop(t0 + 0.17);

  const shimmer = c.createOscillator();
  const shimmerGain = c.createGain();
  shimmer.type = 'triangle';
  shimmer.frequency.setValueAtTime(1318.5, t0 + 0.05);
  shimmerGain.gain.setValueAtTime(0.0001, t0 + 0.05);
  shimmerGain.gain.exponentialRampToValueAtTime(0.32, t0 + 0.06);
  shimmerGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
  shimmer.connect(shimmerGain);
  shimmerGain.connect(sfxGain!);
  shimmer.start(t0 + 0.05);
  shimmer.stop(t0 + 0.25);
}

// ---------------------------------------------------------------------
// Background music: a tiny looping 8-bit-style riff, scheduled with a
// lookahead so it stays tight regardless of setTimeout jitter.
// ---------------------------------------------------------------------

const NOTE: Record<string, number> = {
  C4: 261.63, D4: 293.66, Eb4: 311.13, F4: 349.23, G4: 392.0,
  Bb4: 466.16, C5: 523.25, D5: 587.33, Eb5: 622.25,
};

const RIFF: { note: number | null; dur: number }[] = [
  { note: NOTE.C4, dur: 0.25 }, { note: NOTE.Eb4, dur: 0.25 },
  { note: NOTE.G4, dur: 0.25 }, { note: NOTE.C5, dur: 0.25 },
  { note: NOTE.Bb4, dur: 0.25 }, { note: NOTE.G4, dur: 0.25 },
  { note: NOTE.Eb4, dur: 0.25 }, { note: null, dur: 0.25 },
  { note: NOTE.D4, dur: 0.25 }, { note: NOTE.F4, dur: 0.25 },
  { note: NOTE.Bb4, dur: 0.25 }, { note: NOTE.D5, dur: 0.25 },
  { note: NOTE.C5, dur: 0.25 }, { note: NOTE.G4, dur: 0.25 },
  { note: NOTE.Eb4, dur: 0.25 }, { note: null, dur: 0.25 },
];

let noteIndex = 0;
let nextNoteTime = 0;

function scheduleNote(freq: number, time: number, dur: number) {
  const c = getCtx();

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(1, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.9);
  osc.connect(gain);
  gain.connect(musicGain!);
  osc.start(time);
  osc.stop(time + dur);

  // A soft bass note every 4th step gives the loop some body.
  if (noteIndex % 4 === 0) {
    const bass = c.createOscillator();
    const bassGain = c.createGain();
    bass.type = 'triangle';
    bass.frequency.value = freq / 4;
    bassGain.gain.setValueAtTime(0.0001, time);
    bassGain.gain.exponentialRampToValueAtTime(0.6, time + 0.02);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, time + dur * 3.5);
    bass.connect(bassGain);
    bassGain.connect(musicGain!);
    bass.start(time);
    bass.stop(time + dur * 4);
  }
}

function musicScheduler() {
  const c = getCtx();
  while (nextNoteTime < c.currentTime + 0.2) {
    const step = RIFF[noteIndex % RIFF.length];
    if (step.note) scheduleNote(step.note, nextNoteTime, step.dur);
    nextNoteTime += step.dur;
    noteIndex++;
  }
  musicTimer = setTimeout(musicScheduler, 50);
}

function startMusic() {
  const c = getCtx();
  musicStarted = true;
  noteIndex = 0;
  nextNoteTime = c.currentTime + 0.1;
  if (musicGain) musicGain.gain.value = 0.1;
  if (musicTimer) clearTimeout(musicTimer);
  musicScheduler();
}
