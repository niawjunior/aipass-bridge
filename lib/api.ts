/**
 * Base URL for the ViHokAI API.
 * Empty string = same origin (works with a local backend or a reverse proxy).
 * Set NEXT_PUBLIC_API_BASE to point at a separate host.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** Fired on the window whenever the stored token/user changes. */
export const SESSION_EVENT = "vihokai:session";

function notifySessionChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

const TOKEN_KEY = "vihokai_token";
const USER_KEY = "vihokai_user";

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/** Read the stored auth token (null when signed out). */
export function getToken(): string | null {
  return safeGet(TOKEN_KEY);
}

export function setToken(token: string): void {
  safeSet(TOKEN_KEY, token);
  notifySessionChange();
}

export function getUser(): string | null {
  return safeGet(USER_KEY);
}

export function setUser(user: string): void {
  safeSet(USER_KEY, user);
  notifySessionChange();
}

export function clearSession(): void {
  safeRemove(TOKEN_KEY);
  safeRemove(USER_KEY);
  notifySessionChange();
}

/** Persist a successful login/register response. */
export function saveSession(token: string, user?: unknown): void {
  setToken(token);
  setUser(typeof user === "string" ? user : JSON.stringify(user ?? ""));
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}
