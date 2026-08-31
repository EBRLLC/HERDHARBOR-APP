"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const cloud = read("herdharbor-cloud.js");
assert.match(cloud, /const renderStartupFailure = \(\) =>/);
assert.match(cloud, /document\.addEventListener\("DOMContentLoaded", retry/);
assert.match(cloud, /const failureTarget = document\.body/);
assert.match(cloud, /document\.body\.appendChild\(failure\)/);
assert.doesNotMatch(cloud, /const failureTarget = document\.body \|\|/);

{
  const listeners = {};
  const head = element("head");
  const documentElement = element("html");
  const classes = [];
  documentElement.classList = { add(name) { classes.push(name); } };
  let body = null;
  const documentRef = {
    readyState: "loading",
    head,
    body,
    documentElement,
    addEventListener(type, callback) {
      (listeners[type] ||= []).push(callback);
    },
    createElement(tagName) { return element(tagName, documentRef); },
    getElementById(id) {
      return [...head.children, ...(body?.children || [])].find((node) => node.id === id) || null;
    }
  };
  const windowRef = { supabase: null };
  const context = vm.createContext({ window: windowRef, document: documentRef, console, setTimeout });
  vm.runInContext(read("herdharbor-cloud.js"), context, { filename: "herdharbor-cloud.js" });
  assert.equal(head.children.length, 0, "cloud fallback does not append into head while body is unavailable");
  assert.equal(body, null, "cloud lifecycle fixture starts without a body");
  body = element("body", documentRef);
  documentRef.body = body;
  for (const callback of listeners.DOMContentLoaded || []) callback();
  assert.ok(head.children.some((node) => node.id === "hh-cloud-startup-style"), "cloud fallback adds its style after body exists");
  assert.ok(body.children.some((node) => node.id === "hh-cloud-startup-error"), "cloud fallback renders a visible error after body exists");
  assert.deepEqual(classes, ["hh-auth-locked"], "cloud fallback locks only after the body is available");
}
function element(tagName, documentRef) {
  const listeners = {};
  return {
    tagName: tagName.toUpperCase(),
    id: "",
    children: [],
    dataset: {},
    ownerDocument: documentRef,
    addEventListener(type, callback) {
      (listeners[type] ||= []).push(callback);
    },
    dispatchEvent(event) {
      for (const callback of listeners[event.type] || []) callback(event);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, width: 0, height: 0 }; }
  };
}

function pwaContext() {
  const elements = new Map();
  const body = element("body");
  const documentRef = {
    readyState: "complete",
    head: null,
    body,
    documentElement: element("html"),
    visibilityState: "visible",
    addEventListener() {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tagName) {
      const node = element(tagName, documentRef);
      const originalAppend = body.appendChild.bind(body);
      return node;
    },
    getElementById(id) { return elements.get(id) || null; }
  };
  body.ownerDocument = documentRef;
  body.appendChild = (child) => {
    body.children.push(child);
    elements.set(child.id, child);
    if (child.tagName === "SCRIPT") child.dispatchEvent({ type: "error" });
    return child;
  };
  const windowRef = {
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    setTimeout,
    requestAnimationFrame: (callback) => callback(),
    HerdHarborMonitoring: null,
    location: { reload() {} },
    open() { return null; }
  };
  const navigatorRef = { standalone: false, onLine: true, userAgent: "test" };
  windowRef.window = windowRef;
  return { windowRef, documentRef, navigatorRef, inserted: body.children };
}

{
  const { windowRef, documentRef, navigatorRef, inserted } = pwaContext();
  const context = vm.createContext({
    window: windowRef,
    document: documentRef,
    navigator: navigatorRef,
    console,
    setTimeout,
    URL,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  });
  vm.runInContext(read("pwa.js"), context, { filename: "pwa.js" });
  assert.ok(inserted.some((node) => node.id === "hh-monitoring-config"), "monitoring config falls back when head is unavailable");
  assert.ok(inserted.some((node) => node.id === "hh-pedigree-visual-script"), "pedigree script still loads through the fallback target");
  assert.equal(new Set(inserted.map((node) => node.id)).size, inserted.length, "dynamic fallback does not duplicate nodes");
}

{
  const listeners = {};
  let body = null;
  let observedTarget = null;
  let observeCount = 0;
  const head = element("head");
  const documentRef = {
    readyState: "loading",
    head,
    body,
    documentElement: element("html"),
    fonts: { ready: Promise.resolve() },
    addEventListener(type, callback) {
      (listeners[type] ||= []).push(callback);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tagName) { return element(tagName, documentRef); },
    getElementById() { return null; }
  };
  const windowRef = {
    addEventListener() {},
    setTimeout,
    requestAnimationFrame: (callback) => callback(),
    open() { return null; },
    HerdHarborMonitoring: null
  };
  const context = vm.createContext({
    window: windowRef,
    document: documentRef,
    localStorage: { getItem() { return null; }, setItem() {} },
    MutationObserver: class {
      observe(target) {
        observeCount += 1;
        observedTarget = target;
      }
    },
    console,
    setTimeout,
    Promise
  });
  vm.runInContext(read("pedigree-visual.js"), context, { filename: "pedigree-visual.js" });
  assert.equal(observeCount, 0, "pedigree does not observe before body exists");
  body = element("body", documentRef);
  documentRef.body = body;
  documentRef.readyState = "interactive";
  for (const callback of listeners.DOMContentLoaded || []) callback();
  assert.equal(observeCount, 1, "pedigree starts one observer after body exists");
  assert.equal(observedTarget, body, "pedigree observes the available body node");
  for (const callback of listeners.DOMContentLoaded || []) callback();
  assert.equal(observeCount, 1, "pedigree startup remains deduplicated");
}

console.log("runtime DOM lifecycle regression tests passed");
