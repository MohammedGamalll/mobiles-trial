export type UiLayout = "modern" | "classic_easy";

export const UI_LAYOUT_KEY = "motamayez_ui_layout";

export function isUiLayout(v: unknown): v is UiLayout {
  return v === "modern" || v === "classic_easy";
}

export function loadUiLayout(): UiLayout {
  try {
    const raw = localStorage.getItem(UI_LAYOUT_KEY);
    if (isUiLayout(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "modern";
}

export function saveUiLayout(layout: UiLayout) {
  try {
    localStorage.setItem(UI_LAYOUT_KEY, layout);
  } catch {
    /* ignore */
  }
}

export function applyUiLayout(layout: UiLayout) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.ui = layout === "classic_easy" ? "classic" : "modern";
}