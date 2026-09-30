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
}

export function getUser(): string | null {
  return safeGet(USER_KEY);
}

export function setUser(user: string): void {
  safeSet(USER_KEY, user);
}

export function clearSession(): void {
  safeRemove(TOKEN_KEY);
  safeRemove(USER_KEY);
}
