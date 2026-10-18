const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const KEY = "attendai_token";

export const tokenStore = {
  get: () => localStorage.getItem(KEY),
  set: (token: string) => localStorage.setItem(KEY, token),
  clear: () => localStorage.removeItem(KEY),
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function errorText(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ") || fallback;
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check that the backend is running.");
  }
  if (res.status === 401 && token) {
    tokenStore.clear();
    window.dispatchEvent(new Event("auth:expired"));
  }
  if (!res.ok) throw new ApiError(res.status, errorText(await res.json().catch(() => null), res.statusText));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const send = (method: string) => <T>(path: string, body?: unknown) =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: send("POST"),
  patch: send("PATCH"),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Fetches a file with the login token and saves it, since a plain link cannot send the Authorization header. */
export async function download(path: string, filename: string) {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check that the backend is running.");
  }
  if (!res.ok) throw new ApiError(res.status, errorText(await res.json().catch(() => null), res.statusText));
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
