"use client";

import { useSyncExternalStore } from "react";
import { getToken, SESSION_EVENT } from "./api";

/**
 * The URL only changes via a navigation, which remounts the tree anyway, so
 * there is nothing to subscribe to here.
 */
const subscribeToNothing = () => () => {};

/**
 * Read a query parameter without tripping a hydration mismatch. The server
 * snapshot is always "" and React swaps in the real value right after
 * hydration, which is exactly the behaviour a setState-in-effect produced but
 * without the cascading render.
 */
export function useSearchParam(key: string): string {
  return useSyncExternalStore(
    subscribeToNothing,
    () => new URLSearchParams(window.location.search).get(key) ?? "",
    () => ""
  );
}

function subscribeToSession(onChange: () => void): () => void {
  window.addEventListener(SESSION_EVENT, onChange);
  // "storage" fires in *other* tabs, so sign-out in one tab signs out the rest.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SESSION_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** True when a token is stored. Re-renders on sign-in and sign-out. */
export function useIsLoggedIn(): boolean {
  const token = useSyncExternalStore(
    subscribeToSession,
    () => getToken() ?? "",
    () => ""
  );
  return token.length > 0;
}