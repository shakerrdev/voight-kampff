"use strict";

(function (VK) {
  const PREFIX = "acct:";
  const MAX_ENTRIES = 4000;
  const inflight = new Map();

  const area = () => globalThis.browser?.storage?.local;
  const key = (name) => PREFIX + name.toLowerCase();

  async function readCached(name, settings) {
    const store = area();
    if (!store) return null;
    const k = key(name);
    const { [k]: entry } = await store.get(k);
    if (!entry || entry.v !== VK.VERSION) return null;
    if (Date.now() - entry.at > settings.cacheHours * 3600 * 1000) return null;
    return entry.result;
  }

  async function writeCached(name, result) {
    await area()?.set({ [key(name)]: { v: VK.VERSION, at: Date.now(), result } });
  }

  VK.accounts = {
    get(name, settings) {
      const k = name.toLowerCase();
      if (inflight.has(k)) return inflight.get(k);
      const job = (async () => {
        const cached = await readCached(name, settings);
        if (cached) return cached;
        const raw = await VK.api.fetchUser(name);
        const result = VK.assessAccount(raw, settings);
        if (raw.status !== "error") await writeCached(name, result);
        return result;
      })().finally(() => setTimeout(() => inflight.delete(k), 5000));
      inflight.set(k, job);
      return job;
    },

    async stats() {
      const all = (await area()?.get(null)) || {};
      return { cached: Object.keys(all).filter((k) => k.startsWith(PREFIX)).length };
    },

    async clear() {
      const store = area();
      if (!store) return;
      const all = await store.get(null);
      await store.remove(Object.keys(all).filter((k) => k.startsWith(PREFIX)));
      inflight.clear();
    },

    async prune(settings) {
      const store = area();
      if (!store) return;
      const all = await store.get(null);
      const ttl = settings.cacheHours * 3600 * 1000;
      const entries = Object.entries(all).filter(([k]) => k.startsWith(PREFIX));
      const stale = entries.filter(([, e]) => e.v !== VK.VERSION || Date.now() - e.at > ttl).map(([k]) => k);
      const fresh = entries.filter(([k]) => !stale.includes(k)).sort((a, b) => b[1].at - a[1].at);
      const overflow = fresh.slice(MAX_ENTRIES).map(([k]) => k);
      if (stale.length || overflow.length) await store.remove([...stale, ...overflow]);
    },
  };
})(globalThis.VK);
