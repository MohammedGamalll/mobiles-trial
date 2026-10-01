const KEY = "pixel_token";

let memory = "";

export function getSessionToken() {
  if (memory) return memory;
  try {
    return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setSessionToken(token: string, remember = false) {
  memory = token;
  try {
    sessionStorage.setItem(KEY, token);
    if (remember) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* private / blocked storage */
  }
}

export function clearSessionToken() {
  memory = "";
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function authHeaders(base?: HeadersInit) {
  const headers = new Headers(base || {});
  const token = getSessionToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}
