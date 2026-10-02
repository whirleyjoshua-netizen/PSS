import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, it, expect, vi } from "vitest";

const source = readFileSync(join(process.cwd(), "public/ops-sw.js"), "utf8");

type Listener = (event: unknown) => void;

/** Runs public/ops-sw.js against a fake `self`, `caches` and `fetch`, capturing its listeners. */
function loadWorker(fetchImpl: (request: unknown) => Promise<unknown>) {
  const listeners: Record<string, Listener> = {};
  const offlinePage = { offline: true };
  const cache = { addAll: vi.fn(async () => undefined) };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ["pss-ops-offline-v1", "old"]),
    delete: vi.fn(async () => true),
    match: vi.fn(async (url: string) => (url === "/ops-offline.html" ? offlinePage : undefined)),
  };
  const self = {
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const fetch = vi.fn(fetchImpl);
  vm.runInNewContext(source, { self, caches, fetch, URL, Promise });
  return { listeners, cache, caches, fetch, self, offlinePage };
}

function fetchEvent(url: string, mode: string) {
  const respondWith = vi.fn();
  return { event: { request: { url, mode }, respondWith }, respondWith };
}

describe("ops service worker", () => {
  it("caches only the offline page on install", async () => {
    const { listeners, cache, caches, self } = loadWorker(async () => ({}));
    let waited: Promise<unknown> | undefined;
    listeners.install({ waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
    expect(caches.open).toHaveBeenCalledWith("pss-ops-offline-v1");
    expect(cache.addAll).toHaveBeenCalledWith(["/ops-offline.html"]);
    expect(self.skipWaiting).toHaveBeenCalled();
  });

  it("drops older caches on activate and keeps its own", async () => {
    const { listeners, caches, self } = loadWorker(async () => ({}));
    let waited: Promise<unknown> | undefined;
    listeners.activate({ waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
    expect(caches.delete).toHaveBeenCalledTimes(1);
    expect(caches.delete).toHaveBeenCalledWith("old");
    expect(self.clients.claim).toHaveBeenCalled();
  });

  it("shows the cached offline page when an admin page can't load", async () => {
    const { listeners, offlinePage } = loadWorker(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { event, respondWith } = fetchEvent("https://premiershadesolutions.com/admin/x", "navigate");
    listeners.fetch(event);
    expect(respondWith).toHaveBeenCalledTimes(1);
    await expect(respondWith.mock.calls[0][0]).resolves.toBe(offlinePage);
  });

  it("covers the start page /admin itself", async () => {
    const { listeners, offlinePage } = loadWorker(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { event, respondWith } = fetchEvent("https://premiershadesolutions.com/admin", "navigate");
    listeners.fetch(event);
    await expect(respondWith.mock.calls[0][0]).resolves.toBe(offlinePage);
  });

  it("passes a page that loads straight through", async () => {
    const response = { ok: true };
    const { listeners, caches } = loadWorker(async () => response);
    const { event, respondWith } = fetchEvent("https://premiershadesolutions.com/admin/x", "navigate");
    listeners.fetch(event);
    await expect(respondWith.mock.calls[0][0]).resolves.toBe(response);
    expect(caches.match).not.toHaveBeenCalled();
  });

  it("leaves other requests and pages outside the admin alone", () => {
    const { listeners, fetch } = loadWorker(async () => ({}));
    for (const [url, mode] of [
      ["https://premiershadesolutions.com/admin/x", "cors"],
      ["https://premiershadesolutions.com/admin/x", "no-cors"],
      ["https://premiershadesolutions.com/", "navigate"],
      ["https://premiershadesolutions.com/booking", "navigate"],
    ]) {
      const { event, respondWith } = fetchEvent(url, mode);
      listeners.fetch(event);
      expect(respondWith, `${mode} ${url}`).not.toHaveBeenCalled();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
