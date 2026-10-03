const TTL_MS = 30_000;

type Entry = { at: number; data: unknown };
const store = new Map<string, Entry>();

export function peekCached<T>(key: string): T | undefined {
  const hit = store.get(key);
  return hit ? (hit.data as T) : undefined;
}

export function setCached(key: string, data: unknown) {
  store.set(key, { at: Date.now(), data });
}

export function isFresh(key: string) {
  const hit = store.get(key);
  return !!hit && Date.now() - hit.at < TTL_MS;
}

export function invalidateGetCache(match?: string) {
  if (!match) {
    store.clear();
    return;
  }
  for (const k of [...store.keys()]) {
    if (k.includes(match)) store.delete(k);
  }
}
