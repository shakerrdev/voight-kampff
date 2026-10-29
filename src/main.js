"use strict";

(function (VK) {
  let settings = { ...VK.DEFAULT_SETTINGS };
  let records = new Map();
  let byAuthor = new Map();
  let visibility = null;
  let mutations = null;

  const lower = (s) => s.toLowerCase();
  const isTrusted = (author) => settings.trusted.some((t) => lower(t) === lower(author));

  function badgeHost(item) {
    if (item.anchor) return item.anchor.closest("faceplate-hovercard") || item.anchor;
    return null;
  }

  function place(item, el, after) {
    const host = badgeHost(item);
    if (host) (after || host).after(el);
    else if (item.meta) item.meta.append(el);
    else if (item.body) item.body.before(el);
    else item.container.prepend(el);
  }

  function target(record) {
    const { item } = record;
    if (item.body && !item.kind.endsWith("post")) return item.body;
    return item.container;
  }

  function applyVerdict(record) {
    const el = target(record);
    const textPct = record.analysis ? VK.toPercent(record.analysis.score) : 0;
    const accountPct = record.account && !record.account.declared ? VK.toPercent(record.account.score) : 0;
    const pct = Math.max(textPct, accountPct);
    const level = VK.level(pct, settings);

    el.classList.remove("vk-marked-medium", "vk-marked-high", "vk-dim", "vk-collapsed");
    record.reveal?.remove();
    record.reveal = null;
    if (level !== "low" && el !== record.item.container) el.classList.add(`vk-marked-${level}`);
    if (level !== "high" || record.revealed) return;

    if (settings.highAction === "dim") el.classList.add("vk-dim");
    if (settings.highAction === "collapse") {
      el.classList.add("vk-collapsed");
      record.reveal = VK.ui.collapseToggle(() => {
        record.revealed = true;
        applyVerdict(record);
      }, pct);
      el.before(record.reveal);
    }
  }

  const actions = {
    async trust(author) {
      await VK.saveSettings({ trusted: [...new Set([...settings.trusted, author])] });
    },
    async recheck(author) {
      await VK.accounts.forget(author);
      for (const record of byAuthor.get(lower(author)) || []) {
        record.account = null;
        const pending = VK.ui.pending(author);
        if (record.accountBadge) record.accountBadge.replaceWith(pending);
        else place(record.item, pending);
        record.accountBadge = pending;
      }
      loadAccount(author);
    },
  };

  function renderAccount(record) {
    const { account, item } = record;
    const pct = VK.toPercent(account.score);
    const visible = account.declared || settings.showCleanBadges || pct >= settings.showThreshold;
    if (!visible) {
      record.accountBadge?.remove();
      record.accountBadge = null;
    } else {
      if (!record.accountBadge) {
        record.accountBadge = document.createElement("span");
        place(item, record.accountBadge);
      }
      VK.ui.accountBadge(record.accountBadge, item.author, account, settings, actions);
    }
    applyVerdict(record);
  }

  async function loadAccount(author) {
    let account;
    try {
      account = await VK.accounts.get(author, settings);
    } catch (err) {
      console.warn("[voight-kampff] account check failed", author, err);
      account = { status: "error", score: 0, signals: [], stats: {} };
    }
    for (const record of byAuthor.get(lower(author)) || []) {
      if (!record.item.container.isConnected) continue;
      record.account = account;
      renderAccount(record);
    }
  }

  function onVisible(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      visibility.unobserve(entry.target);
      const record = records.get(entry.target.closest(VK.reddit.selector));
      if (!record || record.requested) continue;
      const siblings = byAuthor.get(lower(record.item.author));
      siblings.forEach((r) => (r.requested = true));
      if (!record.account) {
        record.accountBadge = VK.ui.pending(record.item.author);
        place(record.item, record.accountBadge);
        loadAccount(record.item.author);
      }
    }
  }

  function analyze(record) {
    if (!settings.textDetection) return;
    const { item } = record;
    const key = item.text;
    if (record.analyzedText === key) return;
    record.analyzedText = key;
    record.analysis = VK.analyzeText({ text: item.text, links: item.links, rendered: true }, settings);
    record.textBadge?.remove();
    record.textBadge = null;
    if (VK.toPercent(record.analysis.score) >= settings.showThreshold) {
      record.textBadge = VK.ui.textBadge(record.analysis, settings);
      place(item, record.textBadge, record.accountBadge);
    }
    applyVerdict(record);
  }

  function process(adapter, el) {
    const existing = records.get(el);
    if (existing) {
      const fresh = VK.reddit.read(adapter, el);
      if (fresh && fresh.text !== existing.item.text) {
        existing.item = fresh;
        analyze(existing);
      }
      return;
    }
    const item = VK.reddit.read(adapter, el);
    if (!item || isTrusted(item.author)) return;

    const record = { item, analysis: null, account: null };
    records.set(el, record);
    const key = lower(item.author);
    if (!byAuthor.has(key)) byAuthor.set(key, new Set());
    byAuthor.get(key).add(record);

    analyze(record);

    if (!settings.accountDetection) return;
    const known = [...byAuthor.get(key)].find((r) => r.account);
    if (known) {
      record.account = known.account;
      record.requested = true;
      renderAccount(record);
    } else if ([...byAuthor.get(key)].some((r) => r !== record && r.requested)) {
      record.requested = true;
      record.accountBadge = VK.ui.pending(item.author);
      place(item, record.accountBadge);
    } else {
      visibility.observe(badgeHost(item) || item.container);
    }
  }

  function scan(root) {
    for (const [adapter, el] of VK.reddit.find(root)) process(adapter, el);
  }

  function onMutations(list) {
    const roots = new Set();
    for (const m of list) {
      if (m.type === "attributes") {
        roots.add(m.target);
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1 || node.classList?.contains("vk-badge") || node.classList?.contains("vk-tooltip")) continue;
        roots.add(node);
        const owner = node.parentElement?.closest(VK.reddit.selector);
        if (owner) roots.add(owner);
      }
    }
    roots.forEach(scan);
  }

  function teardown() {
    mutations?.disconnect();
    visibility?.disconnect();
    document.querySelectorAll(".vk-badge, .vk-reveal").forEach((el) => el.remove());
    document.querySelectorAll(".vk-marked-medium, .vk-marked-high, .vk-dim, .vk-collapsed").forEach((el) =>
      el.classList.remove("vk-marked-medium", "vk-marked-high", "vk-dim", "vk-collapsed"),
    );
    records = new Map();
    byAuthor = new Map();
  }

  function start() {
    teardown();
    if (!settings.enabled) return;
    visibility = new IntersectionObserver(onVisible, { rootMargin: "300px 0px" });
    mutations = new MutationObserver(onMutations);
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["author", "data-author"] });
    scan(document);
  }

  async function init() {
    settings = await VK.loadSettings();
    start();
    VK.accounts.prune(settings).catch(() => {});
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      settings = { ...VK.DEFAULT_SETTINGS, ...changes.settings.newValue };
      start();
    });
  }

  init();
})(globalThis.VK);
