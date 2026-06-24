import { useEffect, useState, useCallback } from "react";

const KEY = "sellier_wishlist_v1";

type Listener = (ids: string[]) => void;
const listeners = new Set<Listener>();

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  listeners.forEach((l) => l(ids));
}

export function useWishlist() {
  const [ids, setIds] = useState<string[]>(() => read());

  useEffect(() => {
    const l: Listener = (next) => setIds(next);
    listeners.add(l);
    setIds(read());
    return () => {
      listeners.delete(l);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const cur = read();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    write(next);
  }, []);

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, toggle, has, count: ids.length };
}
