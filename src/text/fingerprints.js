"use strict";

(function (VK) {
  const INVISIBLE = [
    { re: /[​‌‍⁠﻿]/g, id: "zero-width", label: "zero-width characters", weight: 0.55 },
    { re: / /g, id: "narrow-nbsp", label: "narrow no-break spaces (U+202F)", weight: 0.6 },
    { re: /[⁡-⁤᠎]/g, id: "invisible-op", label: "invisible operator characters", weight: 0.6 },
    { re: /[‪-‮⁦-⁩]/g, id: "bidi", label: "bidirectional control characters", weight: 0.4 },
    { re: /[\uDB40][\uDC00-\uDC7F]/g, id: "tag-chars", label: "Unicode tag characters (hidden payload)", weight: 0.85 },
    { re: /[︀-︎]|\uDB40[\uDD00-\uDDEF]/g, id: "variation-stego", label: "unusual variation selectors", weight: 0.5 },
    { re: /[-]/g, id: "private-use", label: "private-use characters (chat UI citation markers)", weight: 0.85 },
  ];

  const ARTIFACTS = [
    { re: /\b(?:cite)?turn\d+(?:search|news|view|fetch|image|file|academia|forecast|finance|sports)\d+\b/i, id: "citation-token", label: "leftover chat citation token", weight: 0.95 },
    { re: /【\d+(?::\d+)?†[^】]*】/, id: "citation-bracket", label: "leftover 【n†source】 citation", weight: 0.95 },
    { re: /:?contentReference\[oaicite:\d+\]|\[oaicite:\d+\]|\bfilecite\b|\bentity\["/i, id: "oaicite", label: "leftover oaicite / entity markup", weight: 0.95 },
    { re: /\b(?:as an ai(?: language)? model|as a large language model|i(?:'m| am) (?:just )?an ai(?: assistant| language model)?\b|my (?:training data|knowledge cutoff))/i, id: "self-disclosure", label: "AI self-disclosure", weight: 0.9 },
    { re: /\bregenerate response\b|\[(?:your name|insert [^\]]{1,30}|name|username)\]/i, id: "template-leak", label: "template / UI leftovers", weight: 0.7 },
    { re: /^(?:certainly|absolutely|sure)[!,.] here(?:'s| is| are)\b/im, id: "assistant-opener", label: "assistant-style opener", weight: 0.45 },
    { re: /\b(?:i hope this helps|let me know if you(?:'d| would) like (?:me to|more)|feel free to ask)\b/i, id: "assistant-closer", label: "assistant-style sign-off", weight: 0.25 },
  ];

  const TRACKING = /[?&]utm_source=(chatgpt\.com|openai|perplexity(?:\.ai)?|copilot\.com|claude\.ai|gemini|grok\.com|you\.com|deepseek)/i;
  const VISIBLE_MARKDOWN = /(?:^|\s)\*\*[^*\n]{2,80}\*\*(?:\s|$|[.,:;])|^#{2,4}\s+\S/m;

  const watermarkDetectors = [];

  VK.watermark = {
    register(detector) {
      if (!detector || typeof detector.detect !== "function" || !detector.id) {
        throw new TypeError("detector needs id and detect(text)");
      }
      watermarkDetectors.push(detector);
    },
    list: () => watermarkDetectors.map((d) => d.id),
  };

  function countAll(re, text) {
    re.lastIndex = 0;
    return (text.match(re) || []).length;
  }

  const FRENCH_SPACING = /\u202F(?=[;:!?»%])|(?<=«)\u202F|(?<=\d)\u202F(?=\d)/g;

  VK.fingerprints = function fingerprints({ text: original, links = [], rendered = true }) {
    const signals = [];
    const text = original.replace(FRENCH_SPACING, " ");

    for (const rule of INVISIBLE) {
      const n = countAll(rule.re, text);
      if (n > 0) {
        const weight = Math.min(rule.weight + 0.05 * (n - 1), 0.95);
        signals.push(VK.signal(rule.id, `${n}× ${rule.label}`, weight, "fingerprint"));
      }
    }

    for (const rule of ARTIFACTS) {
      if (rule.re.test(text)) signals.push(VK.signal(rule.id, rule.label, rule.weight, "fingerprint"));
    }

    const tracked = links.map((href) => href.match(TRACKING)).find(Boolean) || text.match(TRACKING);
    if (tracked) {
      signals.push(VK.signal("ai-utm", `link tagged utm_source=${tracked[1]}`, 0.9, "fingerprint"));
    }

    if (rendered && VISIBLE_MARKDOWN.test(text)) {
      signals.push(VK.signal("raw-markdown", "unrendered markdown pasted as text", 0.35, "fingerprint"));
    }

    for (const detector of watermarkDetectors) {
      try {
        const result = detector.detect(text);
        if (result && result.score > 0) {
          signals.push(VK.signal(`wm-${detector.id}`, `${detector.name || detector.id} watermark`, result.score, "watermark"));
        }
      } catch (err) {
        console.warn("[voight-kampff] watermark detector failed", detector.id, err);
      }
    }

    return signals;
  };
})(globalThis.VK);
