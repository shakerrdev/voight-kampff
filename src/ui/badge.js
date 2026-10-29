"use strict";

(function (VK) {
  const TIER_LABEL = { fingerprint: "fingerprint", watermark: "watermark", style: "style", account: "account" };
  let tooltip = null;
  let hideTimer = null;

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) el.append(c);
    return el;
  }

  function signalList(signals) {
    if (!signals.length) return h("p", { class: "vk-empty" }, "No signals.");
    return h(
      "ul",
      { class: "vk-signals" },
      [...signals]
        .sort((a, b) => b.weight - a.weight)
        .map((s) =>
          h("li", { class: `vk-tier-${s.tier}` },
            h("span", { class: "vk-w" }, s.weight ? `+${VK.toPercent(s.weight)}` : "·"),
            h("span", { class: "vk-label" }, s.label),
            h("span", { class: "vk-tier" }, TIER_LABEL[s.tier] || s.tier),
          ),
        ),
    );
  }

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = h("div", { class: "vk-tooltip", role: "tooltip" });
    tooltip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    tooltip.addEventListener("mouseleave", scheduleHide);
    document.body.append(tooltip);
    return tooltip;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => tooltip?.classList.remove("vk-open"), 250);
  }

  function showTooltip(anchor, build) {
    const tip = ensureTooltip();
    clearTimeout(hideTimer);
    tip.replaceChildren(...build());
    tip.classList.add("vk-open");
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 16);
    tip.style.width = `${width}px`;
    tip.style.left = `${Math.max(8, Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - width - 8))}px`;
    const below = rect.bottom + window.scrollY + 6;
    tip.style.top = `${below}px`;
    const tipRect = tip.getBoundingClientRect();
    if (tipRect.bottom > window.innerHeight && rect.top > tipRect.height + 12) {
      tip.style.top = `${rect.top + window.scrollY - tipRect.height - 6}px`;
    }
  }

  function bindHover(el, build) {
    el.addEventListener("mouseenter", () => showTooltip(el, build));
    el.addEventListener("focus", () => showTooltip(el, build));
    el.addEventListener("mouseleave", scheduleHide);
    el.addEventListener("blur", scheduleHide);
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTooltip(el, build);
    });
  }

  function statsLine(stats) {
    const parts = [];
    if (stats.ageDays != null) parts.push(stats.ageDays >= 365 ? `${(stats.ageDays / 365).toFixed(1)}y old` : `${stats.ageDays}d old`);
    if (stats.karma != null) parts.push(`${stats.karma.toLocaleString()} karma`);
    if (stats.items != null) parts.push(`${stats.items} items checked`);
    if (stats.eligible) parts.push(`${stats.styled}/${stats.eligible} long comments AI-styled`);
    return parts.join(" · ");
  }

  VK.ui = {
    h,

    pending(author) {
      return h("span", { class: "vk-badge vk-pending", title: `Voight-Kampff: checking u/${author}…` }, "…");
    },

    accountBadge(el, author, account, settings, actions) {
      const pct = VK.toPercent(account.score);
      const level = account.declared ? "declared" : VK.level(pct, settings);
      el.className = `vk-badge vk-${level}`;
      el.tabIndex = 0;
      el.textContent = account.declared ? "bot ✓" : account.status === "error" ? "?" : `bot ${pct}`;
      el.removeAttribute("title");
      bindHover(el, () => [
        h("div", { class: "vk-head" },
          h("strong", {}, `u/${author}`),
          h("span", { class: `vk-score vk-${level}` }, account.declared ? "declared bot" : `${pct}% bot-like`),
        ),
        h("p", { class: "vk-stats" }, statsLine(account.stats || {})),
        signalList(account.signals),
        h("div", { class: "vk-foot" },
          h("button", { type: "button", onclick: () => actions.trust(author) }, "Trust user"),
          h("button", { type: "button", onclick: () => actions.recheck(author) }, "Recheck"),
        ),
      ]);
      return el;
    },

    textBadge(analysis, settings) {
      const pct = VK.toPercent(analysis.score);
      const level = VK.level(pct, settings);
      const label = analysis.tier === "fingerprint" ? `AI ${pct}` : `AI? ${pct}`;
      const el = h("span", { class: `vk-badge vk-text vk-${level}`, tabindex: "0" }, label);
      bindHover(el, () => [
        h("div", { class: "vk-head" },
          h("strong", {}, "This text"),
          h("span", { class: `vk-score vk-${level}` }, `${pct}% AI-like`),
        ),
        h("p", { class: "vk-stats" }, analysis.tier === "fingerprint"
          ? "Contains machine fingerprints — high confidence."
          : "Style heuristics only — low confidence, humans write like this too."),
        signalList(analysis.signals),
      ]);
      return el;
    },

    collapseToggle(onShow, pct) {
      return h("button", { type: "button", class: "vk-reveal", onclick: onShow }, `Hidden by Voight-Kampff (${pct}) — show`);
    },
  };
})(globalThis.VK);
