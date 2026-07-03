import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "sellier_wishlist_v1";

type Listener = (ids: string[]) => void;
const listeners = new Set<Listener>();
let currentIds: string[] = [];
let currentUserId: string | null = null;
let initialized = false;

function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeLocal(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(ids));
}

function broadcast(ids: string[]) {
  currentIds = ids;
  listeners.forEach((l) => l(ids));
}

async function fetchCloudIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("wishlists")
    .select("shopify_product_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load wishlist", error);
    return [];
  }
  return (data ?? []).map((r: any) => r.shopify_product_id as string);
}

async function migrateLocalToCloud(userId: string, localIds: string[]) {
  if (localIds.length === 0) return;
  const rows = localIds.map((id) => ({ user_id: userId, shopify_product_id: id }));
  const { error } = await supabase.from("wishlists").upsert(rows, {
    onConflict: "user_id,shopify_product_id",
    ignoreDuplicates: true,
  });
  if (error) {
    console.error("Failed to migrate local wishlist", error);
  }
}

async function refresh(userId: string | null) {
  if (userId) {
    const cloudIds = await fetchCloudIds(userId);
    const local = readLocal();
    // First-time sign-in: push local ids up, then merge for state.
    if (local.length > 0) {
      await migrateLocalToCloud(userId, local);
      const merged = Array.from(new Set([...local, ...cloudIds]));
      writeLocal([]); // clear local mirror once uploaded
      broadcast(merged);
      return;
    }
    broadcast(cloudIds);
  } else {
    broadcast(readLocal());
  }
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  currentIds = readLocal();
  supabase.auth.getSession().then(({ data }) => {
    currentUserId = data.session?.user.id ?? null;
    refresh(currentUserId);
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user.id ?? null;
    if (nextUser !== currentUserId) {
      currentUserId = nextUser;
      refresh(currentUserId);
    }
  });
}

export function useWishlist() {
  const [ids, setIds] = useState<string[]>(() => currentIds);
  const mounted = useRef(true);

  useEffect(() => {
    ensureInit();
    mounted.current = true;
    const l: Listener = (next) => {
      if (mounted.current) setIds(next);
    };
    listeners.add(l);
    setIds(currentIds);
    return () => {
      mounted.current = false;
      listeners.delete(l);
    };
  }, []);

  const toggle = useCallback(async (productId: string) => {
    const isIn = currentIds.includes(productId);
    const next = isIn
      ? currentIds.filter((x) => x !== productId)
      : [productId, ...currentIds];
    broadcast(next);

    const userId = currentUserId;
    if (userId) {
      if (isIn) {
        const { error } = await supabase
          .from("wishlists")
          .delete()
          .eq("user_id", userId)
          .eq("shopify_product_id", productId);
        if (error) {
          console.error("Failed to remove from wishlist", error);
          broadcast(currentIds.includes(productId) ? currentIds : [productId, ...currentIds]);
        }
      } else {
        const { error } = await supabase.from("wishlists").upsert(
          { user_id: userId, shopify_product_id: productId },
          { onConflict: "user_id,shopify_product_id", ignoreDuplicates: true },
        );
        if (error) {
          console.error("Failed to add to wishlist", error);
          broadcast(currentIds.filter((x) => x !== productId));
        }
      }
    } else {
      writeLocal(next);
    }
  }, []);

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, toggle, has, count: ids.length };
}
