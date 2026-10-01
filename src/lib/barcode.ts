const CODE39: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};

export function barcodeSafe(value: string) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-Z. $/+% -]/g, "")
    .slice(0, 24) || "X";
}

export function barcodeModules(value: string) {
  const text = `*${barcodeSafe(value)}*`;
  const mods: { black: boolean; w: number }[] = [];
  for (const ch of text) {
    const pat = CODE39[ch];
    if (!pat) continue;
    if (mods.length) mods.push({ black: false, w: 1 });
    for (let i = 0; i < pat.length; i++) {
      mods.push({ black: i % 2 === 0, w: pat[i] === "w" ? 3 : 1 });
    }
  }
  return mods;
}

export function barcodeWidth(value: string, unit = 1.4) {
  return barcodeModules(value).reduce((s, m) => s + m.w, 0) * unit;
}
