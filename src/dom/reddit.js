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
      return m && decodeURIComponent(m[1]).toLowerCase() === lower;
    }) || null;
  }

  const adapters = [
    {
      name: "shreddit-comment",
      selector: "shreddit-comment[author]",
      read(el) {
        const author = el.getAttribute("author");
        const body = el.querySelector(':scope > [slot="comment"]');
        const meta = el.querySelector(':scope > [slot="commentMeta"]');
        return { author, body, text: textOf(body), links: linksIn(body), anchor: authorLink(meta, author), container: el };
      },
    },
    {
      name: "shreddit-post",
      selector: "shreddit-post[author]",
      read(el) {
        const author = el.getAttribute("author");
        const body = el.querySelector('[slot="text-body"]');
        const title = el.getAttribute("post-title") || textOf(el.querySelector('[slot="title"]'));
        const credit = el.querySelector('[slot="credit-bar"]') || el;
        return {
          author,
          body,
          text: [title, textOf(body)].filter(Boolean).join("\n\n"),
          links: linksIn(body),
          anchor: authorLink(credit, author),
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
