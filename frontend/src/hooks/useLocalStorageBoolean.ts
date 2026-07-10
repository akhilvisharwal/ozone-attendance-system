import { useState } from "react";

type SetBoolean = (value: boolean | ((prev: boolean) => boolean)) => void;

/** Persists a boolean flag (e.g. sidebar collapsed state) across reloads. Fails silently in private/blocked storage. */
export function useLocalStorageBoolean(key: string, defaultValue: boolean): [boolean, SetBoolean] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? defaultValue : raw === "true";
    } catch {
      return defaultValue;
    }
  });

  const update: SetBoolean = (next) => {
    setValue((prev) => {
      const resolved = typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next;
      try {
        window.localStorage.setItem(key, String(resolved));
      } catch {
        // ignore storage errors (private mode, quota, disabled storage)
      }
      return resolved;
    });
  };

  return [value, update];
}
