"use strict";

(function (VK) {
  const IGNORED_AUTHORS = new Set(["[deleted]", "[removed]", ""]);

  const linksIn = (el) => (el ? [...el.querySelectorAll("a[href]")].map((a) => a.href) : []);
  const textOf = (el) => (el ? el.innerText || el.textContent || "" : "");

  function authorLink(scope, author) {
    if (!scope) return null;
    const lower = author.toLowerCase();
    return [...scope.querySelectorAll('a[href*="/user/"], a[href*="/u/"]')].find((a) => {
      const m = a.getAttribute("href").match(/\/(?:user|u)\/([^/?#]+)/i);
      return m && decodeURIComponent(m[1]).toLowerCase() === lower && a.getClientRects().length > 0;
    }) || null;
  }

  function ownSlot(el, slot) {
    return [...el.querySelectorAll(`[slot="${slot}"]`)].find((n) => n.parentElement?.closest(el.localName) === el) || null;
  }

  function ownFirst(el, selector, scope = el) {
    return [...scope.querySelectorAll(selector)].find((n) => n.closest(el.localName) === el) || null;
  }

  const adapters = [
    {
      name: "shreddit-comment",
      selector: "shreddit-comment[author]",
      read(el) {
        const author = el.getAttribute("author");
        const body = ownSlot(el, "comment");
        const meta = ownSlot(el, "commentMeta");
        const anchor = authorLink(meta, author) || (meta && ownFirst(el, "faceplate-timeago, time", meta));
        return { author, body, meta, text: textOf(body), links: linksIn(body), anchor, container: el };
      },
    },
    {
      name: "shreddit-post",
      selector: "shreddit-post[author]",
      read(el) {
        const author = el.getAttribute("author");
        const body = ownSlot(el, "text-body");
        const title = el.getAttribute("post-title") || textOf(ownSlot(el, "title"));
        const credit = ownSlot(el, "credit-bar");
        const anchor = authorLink(credit || el, author) || ownFirst(el, "faceplate-timeago, time", credit || el);
        return {
          author,
          body,
          meta: credit,
          text: [title, textOf(body)].filter(Boolean).join("\n\n"),
          links: linksIn(body),
          anchor,
          container: el,
        };
      },
    },
    {
      name: "old-comment",
      selector: ".thing.comment[data-author]",
      read(el) {
        const entry = el.querySelector(":scope > .entry");
        const body = entry?.querySelector(".usertext-body .md");
        return {
          author: el.dataset.author,
          body,
          text: textOf(body),
          links: linksIn(body),
          anchor: entry?.querySelector(".tagline a.author"),
          container: el,
        };
      },
    },
    {
      name: "old-post",
      selector: ".thing.link[data-author]",
      read(el) {
        const entry = el.querySelector(":scope > .entry");
        const body = entry?.querySelector(".expando .usertext-body .md");
        const title = textOf(entry?.querySelector("a.title"));
        return {
          author: el.dataset.author,
          body,
          text: [title, textOf(body)].filter(Boolean).join("\n\n"),
          links: linksIn(body),
          anchor: entry?.querySelector(".tagline a.author"),
          container: el,
        };
      },
    },
  ];

  VK.reddit = {
    selector: adapters.map((a) => a.selector).join(","),

    find(root) {
      const found = [];
      for (const adapter of adapters) {
        if (root.matches?.(adapter.selector)) found.push([adapter, root]);
        root.querySelectorAll?.(adapter.selector).forEach((el) => found.push([adapter, el]));
      }
      return found;
    },

    read(adapter, el) {
      const item = adapter.read(el);
      if (!item.author || IGNORED_AUTHORS.has(item.author)) return null;
      return { ...item, kind: adapter.name };
    },
  };
})(globalThis.VK);
