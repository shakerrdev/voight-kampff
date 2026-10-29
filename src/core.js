"use strict";

globalThis.VK = globalThis.VK || {};

(function (VK) {
  VK.VERSION = "0.1.0";

  VK.DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    textDetection: true,
    accountDetection: true,
    styleHeuristics: true,
    showThreshold: 30,
    highThreshold: 70,
    highAction: "dim",
    showCleanBadges: false,
    cacheHours: 12,
    trusted: [],
  });

  VK.combine = function combine(weights) {
    let miss = 1;
    for (const w of weights) miss *= 1 - Math.min(Math.max(w, 0), 1);
    return 1 - miss;
  };

  VK.signal = function signal(id, label, weight, tier) {
    return { id, label, weight, tier };
  };

  VK.toPercent = (p) => Math.round(p * 100);

  VK.level = function level(percent, settings) {
    if (percent >= settings.highThreshold) return "high";
    if (percent >= settings.showThreshold) return "medium";
    return "low";
  };

  const storage = () => globalThis.browser?.storage?.local;

  VK.loadSettings = async function loadSettings() {
    const area = storage();
    if (!area) return { ...VK.DEFAULT_SETTINGS };
    const { settings } = await area.get("settings");
    return { ...VK.DEFAULT_SETTINGS, ...(settings || {}) };
  };

  VK.saveSettings = async function saveSettings(patch) {
    const current = await VK.loadSettings();
    const next = { ...current, ...patch };
    await storage()?.set({ settings: next });
    return next;
  };
})(globalThis.VK);
