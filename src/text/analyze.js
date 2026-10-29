"use strict";

(function (VK) {
  const MARKDOWN_LINK = /\]\((https?:\/\/[^)\s]+)\)|https?:\/\/\S+/g;

  VK.extractLinks = function extractLinks(markdown) {
    const links = [];
    for (const m of markdown.matchAll(MARKDOWN_LINK)) links.push(m[1] || m[0]);
    return links;
  };

  VK.analyzeText = function analyzeText({ text, links = [], rendered = true }, settings = VK.DEFAULT_SETTINGS) {
    if (!text || !text.trim()) return { score: 0, signals: [], tier: null };
    const signals = VK.fingerprints({ text, links, rendered });
    if (settings.styleHeuristics) signals.push(...VK.style(text));
    const score = VK.combine(signals.map((s) => s.weight));
    const tier = signals.some((s) => s.tier !== "style") ? "fingerprint" : signals.length ? "style" : null;
    return { score, signals, tier };
  };
})(globalThis.VK);
