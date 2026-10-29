"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const manifest = require("../manifest.json");

module.exports = function load({ only } = {}) {
  const context = vm.createContext({ console, URL, setTimeout, clearTimeout, Date, Math });
  context.globalThis = context;
  const files = manifest.content_scripts[0].js.filter((f) => !only || only.includes(f));
  for (const file of files) {
    const code = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    vm.runInContext(code, context, { filename: file });
  }
  return context.VK;
};
