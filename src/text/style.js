"use strict";

(function (VK) {
  const MIN_WORDS = 30;
  const STYLE_CAP = 0.6;

  const LLM_VOCAB = [
    "delve", "delving", "tapestry", "testament to", "intricate", "multifaceted", "nuanced",
    "navigate the", "navigating the", "landscape of", "in the realm of", "realm", "underscore",
    "underscores", "pivotal", "crucial", "foster", "fostering", "embark", "resonate", "resonates",
    "seamless", "seamlessly", "robust", "leverage", "leveraging", "holistic", "paramount",
    "it's worth noting", "it is worth noting", "it's important to note", "it is important to note",
    "ultimately,", "in conclusion", "in summary", "overall,", "at the end of the day",
    "a myriad of", "plethora", "game-changer", "boasts", "elevate", "unwavering", "meticulous",
    "meticulously", "commendable", "invaluable", "showcasing", "vibrant", "bustling", "ever-evolving",
    "that said,", "here's the thing", "the key takeaway", "great question", "you're absolutely right",
  ];

  const CONTRAST = /\b(?:it's|it is|this is|that's|that is)?\s*not (?:just|only|merely|simply|about)\b[^.!?\n]{2,60}[,;—–-]\s*(?:it's|it is|but|rather)\b/gi;
  const TRIPLET = /\b\w+(?: \w+)?, \w+(?: \w+)?, and \w+(?: \w+)?\b/g;
  const CASUAL = /\b(?:lol|lmao|tbh|imo|imho|idk|ngl|gonna|wanna|kinda|ya|yall|dunno|bruh|fr|smh|af)\b|[!?]{2,}|\.{4,}|:\)|:D|xD/gi;
  const TYPOISH = /\b(?:i\s|dont|cant|wont|didnt|doesnt|isnt|im|ive|youre|thats|theyre|alot|definately|seperate|recieve|untill|wierd)\b/g;

  function words(text) {
    return text.toLowerCase().match(/[a-z][a-z'’-]*/g) || [];
  }

  function sentences(text) {
    return text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+(?=[A-Z"“(])/)
      .map((s) => s.trim())
      .filter((s) => s.split(" ").length >= 3);
  }

  function cv(values) {
    if (values.length < 2) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return null;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance) / mean;
  }

  VK.styleStats = function styleStats(text) {
    const lower = text.toLowerCase();
    const wordList = words(text);
    const sentenceList = sentences(text);
    const lengths = sentenceList.map((s) => s.split(" ").length);
    return {
      words: wordList.length,
      sentences: sentenceList.length,
      vocabHits: LLM_VOCAB.filter((w) => lower.includes(w)),
      emDashes: (text.match(/—/g) || []).length,
      contrasts: (text.match(CONTRAST) || []).length,
      triplets: (text.match(TRIPLET) || []).length,
      casual: (text.match(CASUAL) || []).length,
      typos: (text.match(TYPOISH) || []).length,
      lengthCv: cv(lengths),
      avgSentence: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0,
      lowercaseStarts: sentenceList.filter((s) => /^[a-z]/.test(s)).length,
      uniqueRatio: wordList.length ? new Set(wordList).size / wordList.length : 1,
      listLines: (text.match(/^\s*(?:[-*•]|\d+[.)])\s+\S/gm) || []).length,
      boldLeads: (text.match(/^\s*(?:[-*•]\s*)?\*\*[^*]+:\*\*|^\s*(?:[-*•]\s*)?[A-Z][\w ]{2,30}:\s/gm) || []).length,
    };
  };

  VK.style = function style(text) {
    const s = VK.styleStats(text);
    if (s.words < MIN_WORDS) return [];
    const per100 = (n) => (n * 100) / s.words;
    const signals = [];
    const add = (id, label, weight) => signals.push(VK.signal(id, label, weight, "style"));

    if (s.vocabHits.length >= 2) {
      add("llm-vocab", `LLM-typical wording: ${s.vocabHits.slice(0, 4).join(", ")}`, Math.min(0.05 * s.vocabHits.length, 0.25));
    }
    if (s.emDashes >= 2 && per100(s.emDashes) >= 1) add("em-dash", `${s.emDashes} em dashes`, 0.12);
    if (s.contrasts >= 1) add("not-x-but-y", `"not X, it's Y" construction ×${s.contrasts}`, Math.min(0.08 * s.contrasts, 0.2));
    if (s.triplets >= 2) add("rule-of-three", `rule-of-three lists ×${s.triplets}`, 0.06);
    if (s.sentences >= 5 && s.lengthCv !== null && s.lengthCv < 0.3) {
      add("low-burstiness", `uniform sentence length (CV ${s.lengthCv.toFixed(2)})`, 0.12);
    }
    if (s.listLines >= 3 && s.boldLeads >= 2) add("structured", "header-style bullet structure", 0.12);
    if (s.words >= 60 && s.casual === 0 && s.typos === 0 && s.lowercaseStarts === 0) {
      add("too-clean", "no casual markers, typos or lowercase starts", 0.08);
    }

    const total = VK.combine(signals.map((x) => x.weight));
    const humanity = Math.min(0.12 * s.casual + 0.1 * s.typos + 0.08 * s.lowercaseStarts, 0.6);
    const scale = Math.min(STYLE_CAP, total * (1 - humanity)) / (total || 1);
    return signals.map((x) => ({ ...x, weight: x.weight * scale }));
  };
})(globalThis.VK);
