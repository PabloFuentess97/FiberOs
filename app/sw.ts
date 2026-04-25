// Service worker de Serwist. Este archivo se compila por @serwist/next a /sw.js.
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision?: string })[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Tiles del mapa (MapTiler) — cache first con 500 entradas máx.
    {
      matcher: ({ url }) => url.hostname === "api.maptiler.com",
      handler: "CacheFirst",
      options: {
        cacheName: "map-tiles",
        expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Bootstrap: siempre online cuando hay red; cache si no.
    {
      matcher: ({ url }) => url.pathname === "/api/field/bootstrap",
      handler: "NetworkFirst",
      options: { cacheName: "field-bootstrap", networkTimeoutSeconds: 5 },
    },
    // Rutas de dashboard y field: NetworkFirst con fallback offline.
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/field/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
