"use client";

import { api } from "@/lib/api";

let pending: Promise<void> | null = null;

/**
 * Guarantees the logged user has their starter data (categories, budgets,
 * accounts and a small history) before any page queries the API.
 * Memoised per page load so it never runs twice.
 */
export function ensureBootstrap(): Promise<void> {
  if (!pending) {
    pending = api
      .post<{ created: boolean }>("/api/bootstrap", {})
      .then((res) => {
        if (!res.ok) {
          console.error("[ensureBootstrap] error:", res.error);
          return;
        }
        console.log("[ensureBootstrap] listo, datos creados:", res.data?.created);
      })
      .catch((err) => {
        console.error("[ensureBootstrap] excepción:", err);
      });
  }
  return pending;
}
