# Voight-Kampff

A Firefox extension that flags AI-generated Reddit comments and bot-like accounts. It runs locally in your browser, uses only Reddit's own public JSON endpoints, and sends nothing anywhere else.

Every checked user gets a small badge next to their name (`bot 72`), and suspicious comments get an `AI 95` / `AI? 40` badge. Hover or click a badge to see exactly which signals fired and how much each one contributed.

Works on new Reddit (`www.reddit.com`) and old Reddit (`old.reddit.com`).

## How it scores

Signals are combined as independent evidence (`1 − Π(1 − wᵢ)`), so one strong signal is enough, while several weak signals only add up slowly. Each signal is labelled by tier in the tooltip.

### 1. AI text: fingerprints (high confidence)

Leftovers that humans practically never type, mostly from copy-pasting out of a chat UI:

| Signal | Example |
| --- | --- |
| Invisible characters | zero-width space/joiner, word joiner, BOM, narrow no-break space (U+202F, ignored where French typography uses it), invisible operators, bidi controls |
| Hidden payloads | Unicode tag characters, stray variation selectors |
| Private-use characters | the markers chat UIs wrap citations in |
| Citation tokens | `turn0search3`, `【4†source】`, `:contentReference[oaicite:0]`, `filecite` |
| AI tracking parameters | links with `utm_source=chatgpt.com`, `perplexity`, `copilot.com`, `claude.ai`, … |
| Self-disclosure | "As an AI language model", "my knowledge cutoff" |
| Template leftovers | `[Your Name]`, `[Insert …]`, "Regenerate response" |
| Unrendered markdown | literal `**bold**` or `## Heading` in rendered text |

**Provider watermarks.** Anthropic and Google watermark generated text statistically, but neither scheme can be verified client-side today: Anthropic hasn't published a detector, and SynthID detection needs Google's keys and tokenizer. There's a plug-in point for when a public detector exists:

```js
VK.watermark.register({
  id: "synthid",
  name: "SynthID",
  detect: (text) => ({ score: 0.97 }),
});
```

### 2. AI text: style heuristics (low confidence)

LLM-typical vocabulary ("delve", "it's worth noting", "multifaceted"), em-dash density, "it's not just X — it's Y", rule-of-three lists, uniform sentence length (low burstiness), header-style bullet lists, and "too clean" text without casual markers or typos. These are capped at 60 combined and damped by casual writing (`lol`, `tbh`, lowercase starts, common typos). Short texts (< 30 words) are skipped. Can be turned off.

### 3. Account behaviour and metrics

Fetched lazily when a username scrolls into view (`about.json` + last 100 items of `overview.json`), rate-limited to about one request per second, honouring Reddit's rate-limit headers, and cached (12h by default).

- account age, Reddit-generated default username, unverified email, negative karma
- karma velocity on young accounts (karma farming)
- hidden or empty history despite karma
- dormant accounts that suddenly came back to life
- machine-regular posting intervals
- activity around the clock without a daily break
- posting volume per active day
- spread over many unrelated subreddits, post-heavy reposting
- uniform comment length, duplicate comments
- AI fingerprints and AI-styled share across the account's history

Declared bots (AutoModerator, `…Bot`, `…_bot`) get a neutral blue `bot ✓` badge instead of a score. Deleted, shadowbanned and suspended accounts are flagged.

## Settings

The toolbar popup lets you:

- toggle each detector
- set the badge threshold (default 30) and high-suspicion threshold (default 70)
- choose what happens to high-suspicion content: only mark, dim (default) or collapse
- show badges for clean accounts too
- manage trusted users (added via "Trust user" in a tooltip)
- set cache duration and clear the cache

## Install

Temporary (for development):

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → select `manifest.json`

Or with [web-ext](https://github.com/mozilla/web-ext):

```sh
npm start        # launches Firefox with the extension loaded
npm run build    # builds a zip into web-ext-artifacts/
```

For a permanent install, sign the build through [addons.mozilla.org](https://addons.mozilla.org/developers/) (self-distribution / unlisted works fine).

## Development

```sh
npm test         # unit tests for the text and account scoring (node --test)
npm run lint     # web-ext lint
```

No build step: the content scripts share a `VK` namespace and load in the order listed in `manifest.json`.

## Caveats

Treat scores as hints, not verdicts. Style heuristics will flag some careful human writers, and well-prompted bots can avoid them. Fingerprints and account behaviour are the more reliable signals.

## License

MIT
