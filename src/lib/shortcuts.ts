const FAV = "motamayez_favs";
const RECENT = "motamayez_recent";
const BRANCH = "motamayez_branch";

export type FavItem = { to: string; key: string };

export function loadFavs(): FavItem[] {
  try {
    return JSON.parse(localStorage.getItem(FAV) || "[]");
  } catch {
    return [];
  }
}

export function toggleFav(item: FavItem) {
  const cur = loadFavs();
  const next = cur.some((x) => x.to === item.to) ? cur.filter((x) => x.to !== item.to) : [...cur, item];
  localStorage.setItem(FAV, JSON.stringify(next));
  return next;
}

export function isFav(to: string) {
  return loadFavs().some((x) => x.to === to);
}

export function loadRecent(): FavItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) || "[]");
  } catch {
    return [];
  }
}

export function pushRecent(item: FavItem) {
  const next = [item, ...loadRecent().filter((x) => x.to !== item.to)].slice(0, 8);
  localStorage.setItem(RECENT, JSON.stringify(next));
  return next;
}

export function loadBranch() {
  return Number(localStorage.getItem(BRANCH) || 1);
}

export function saveBranch(id: number) {
  localStorage.setItem(BRANCH, String(id));
}

const WARE = "motamayez_warehouse";
const VIEWS = "motamayez_views";

export function loadWarehouse() {
  return Number(localStorage.getItem(WARE) || 0);
}

export function saveWarehouse(id: number) {
  localStorage.setItem(WARE, String(id));
}

export type SavedView = { name: string; value: Record<string, string> };

export function loadViews(id: string): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(`${VIEWS}:${id}`) || "[]");
  } catch {
    return [];
  }
}

export function saveView(id: string, name: string, value: Record<string, string>) {
  const next = [...loadViews(id).filter((v) => v.name !== name), { name, value }].slice(-8);
  localStorage.setItem(`${VIEWS}:${id}`, JSON.stringify(next));
  return next;
}

export function removeView(id: string, name: string) {
  const next = loadViews(id).filter((v) => v.name !== name);
  localStorage.setItem(`${VIEWS}:${id}`, JSON.stringify(next));
  return next;
}
