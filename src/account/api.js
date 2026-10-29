"use strict";

(function (VK) {
  const MIN_GAP_MS = 1100;
  const HISTORY_LIMIT = 100;

  let chain = Promise.resolve();
  let nextAt = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function throttled(task) {
    const run = chain.then(async () => {
      const wait = nextAt - Date.now();
      if (wait > 0) await sleep(wait);
      nextAt = Date.now() + MIN_GAP_MS;
      return task();
    });
    chain = run.catch(() => {});
    return run;
  }

  function respectRateLimit(res) {
    const remaining = parseFloat(res.headers.get("x-ratelimit-remaining"));
    const reset = parseFloat(res.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(remaining) && Number.isFinite(reset) && remaining < 3) {
      nextAt = Math.max(nextAt, Date.now() + reset * 1000);
    }
  }

  async function getJson(path, attempt = 0) {
    const res = await throttled(() =>
      fetch(`${location.origin}${path}`, { credentials: "include", headers: { Accept: "application/json" } }),
    );
    respectRateLimit(res);
    if (res.status === 429 && attempt < 2) {
      const reset = parseFloat(res.headers.get("x-ratelimit-reset")) || 30;
      nextAt = Math.max(nextAt, Date.now() + reset * 1000);
      return getJson(path, attempt + 1);
    }
    if (!res.ok) return { status: res.status, data: null };
    return { status: res.status, data: await res.json() };
  }

  VK.api = {
    async fetchUser(name) {
      const user = encodeURIComponent(name);
      const about = await getJson(`/user/${user}/about.json?raw_json=1`);
      if (!about.data) return { status: about.status === 404 ? "missing" : "error", about: null, items: [] };
      const data = about.data.data || {};
      if (data.is_suspended) return { status: "suspended", about: data, items: [] };
      const overview = await getJson(`/user/${user}/overview.json?limit=${HISTORY_LIMIT}&raw_json=1`);
      const children = overview.data?.data?.children || [];
      return { status: "ok", about: data, items: children.map(normalizeItem).filter(Boolean) };
    },
  };

  function normalizeItem({ kind, data }) {
    if (kind === "t1") {
      return { kind: "comment", text: data.body || "", subreddit: data.subreddit, created: data.created_utc, score: data.score };
    }
    if (kind === "t3") {
      const text = [data.title, data.selftext].filter(Boolean).join("\n\n");
      return { kind: "post", text, subreddit: data.subreddit, created: data.created_utc, score: data.score, url: data.url };
    }
    return null;
  }

  VK.normalizeItem = normalizeItem;
})(globalThis.VK);
