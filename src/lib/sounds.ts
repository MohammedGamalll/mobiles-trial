export type SoundKind = "ok" | "err" | "done";

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function unlockSounds() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

function beep(freq: number, dur: number, gain = 0.09, when = 0) {
  const c = getCtx();
  if (!c || !enabled) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playSound(kind: SoundKind) {
  if (!enabled) return;
  unlockSounds();
  if (kind === "ok") {
    beep(1400, 0.07);
    return;
  }
  if (kind === "err") {
    beep(280, 0.16, 0.12);
    beep(210, 0.18, 0.1, 0.15);
    return;
  }
  beep(880, 0.08);
  beep(1320, 0.12, 0.09, 0.1);
}

export function matchScanned<T extends { sku?: string; barcode?: string; extra_code1?: string; extra_code2?: string; units?: { barcode?: string }[] }>(rows: T[], scan: string): T | undefined {
  const s = scan.trim();
  if (!s) return undefined;
  return rows.find((p) =>
    p.sku === s || p.barcode === s || p.extra_code1 === s || p.extra_code2 === s
    || (p.units || []).some((u) => u.barcode === s),
  );
}
