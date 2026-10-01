import { authHeaders, clearSessionToken } from "./session";

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status = 0, payload: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function isGet(init?: RequestInit) {
  const method = String(init?.method || "GET").toUpperCase();
  return method === "GET" || method === "HEAD";
}

function looksLikeHtml(text: string) {
  const t = text.trimStart().slice(0, 24).toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<head");
}

function fail(message: string, status: number, payload: unknown = null): never {
  throw new ApiError(message, status, payload);
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const headers = authHeaders(init?.headers);
  if (!isGet(init) && !headers.has("Content-Type") && !(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch (err) {
    if (init?.signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      throw new Error("aborted");
    }
    fail("unreachable", 0);
  }
  if (init?.signal?.aborted) {
    throw new Error("aborted");
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const html = looksLikeHtml(text);
  if (!res.ok) {
    if (
      res.status === 401 &&
      typeof window !== "undefined" &&
      path !== "/api/auth/login" &&
      path !== "/api/auth/logout" &&
      path !== "/api/auth/me"
    ) {
      clearSessionToken();
      window.dispatchEvent(new Event("motamayez-unauth"));
    }
    if (html || data == null) {
      fail(res.status === 404 || res.status === 405 ? "api_unavailable" : "unreachable", res.status);
    }
    fail(String(data?.error || `HTTP ${res.status}`), res.status, data);
  }
  if (html) fail("api_unavailable", res.status || 404);
  return data as T;
}

export const get = <T>(path: string, init?: RequestInit) => api<T>(path, init);
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body || {}) });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body || {}) });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
