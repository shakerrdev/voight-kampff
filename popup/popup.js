"use strict";

const form = document.body;
const field = (name) => form.querySelector(`[name="${name}"]`);
const NUMERIC = new Set(["showThreshold", "highThreshold", "cacheHours"]);

function render(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const el = field(key);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = value;
    else el.value = String(value);
  }
  field("showThresholdOut").value = settings.showThreshold;
  field("highThresholdOut").value = settings.highThreshold;
  document.body.classList.toggle("off", !settings.enabled);
  field("styleHeuristics").disabled = !settings.textDetection;
  renderTrusted(settings.trusted);
}

function renderTrusted(trusted) {
  const list = document.getElementById("trusted");
  list.replaceChildren(
    ...trusted.map((name) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `u/${name}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = `Stop trusting u/${name}`;
      remove.addEventListener("click", async () => {
        const current = await VK.loadSettings();
        render(await VK.saveSettings({ trusted: current.trusted.filter((t) => t !== name) }));
      });
      li.append(label, remove);
      return li;
    }),
  );
  document.getElementById("trusted-empty").hidden = trusted.length > 0;
}

async function refreshCacheCount() {
  const { cached } = await VK.accounts.stats();
  document.getElementById("cache-count").textContent = `${cached} account${cached === 1 ? "" : "s"} cached`;
}

form.addEventListener("input", async (event) => {
  const el = event.target;
  if (!el.name || el.name.endsWith("Out")) return;
  let value = el.type === "checkbox" ? el.checked : el.value;
  if (NUMERIC.has(el.name)) value = Number(value);
  const patch = { [el.name]: value };
  const current = await VK.loadSettings();
  if (el.name === "showThreshold" && value > current.highThreshold) patch.highThreshold = value;
  if (el.name === "highThreshold" && value < current.showThreshold) patch.showThreshold = value;
  render(await VK.saveSettings(patch));
});

document.getElementById("clear-cache").addEventListener("click", async () => {
  await VK.accounts.clear();
  refreshCacheCount();
});

VK.loadSettings().then(render);
refreshCacheCount();
