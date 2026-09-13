import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  CHUNK_RELOAD_SESSION_KEY,
  clearChunkReloadFlag,
  hasChunkReloadBeenAttempted,
  isChunkLoadError,
  markChunkReloadAttempted,
  recoverFromChunkLoadFailure,
  showChunkLoadFallback,
} from "./chunkLoadRecovery.js";

describe("chunkLoadRecovery", () => {
  const store = new Map();
  let reloadCount = 0;
  let originalSessionStorage;
  let originalLocation;

  beforeEach(() => {
    store.clear();
    reloadCount = 0;
    originalSessionStorage = globalThis.sessionStorage;
    originalLocation = globalThis.location;
    globalThis.sessionStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        store.set(k, String(v));
      },
      removeItem: (k) => {
        store.delete(k);
      },
    };
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        reload: () => {
          reloadCount += 1;
        },
      },
    });
  });

  afterEach(() => {
    if (originalSessionStorage === undefined) {
      delete globalThis.sessionStorage;
    } else {
      globalThis.sessionStorage = originalSessionStorage;
    }
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("detects known dynamic import / chunk failure messages", () => {
    assert.equal(
      isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/a.js")),
      true
    );
    assert.equal(isChunkLoadError(new Error("Importing a module script failed.")), true);
    assert.equal(isChunkLoadError(new Error("error loading dynamically imported module")), true);
    assert.equal(isChunkLoadError({ name: "ChunkLoadError", message: "Loading chunk 5 failed." }), true);
    assert.equal(isChunkLoadError(new Error("Network request failed")), false);
    assert.equal(isChunkLoadError(null), false);
  });

  it("reloads once then shows fallback without looping", () => {
    assert.equal(hasChunkReloadBeenAttempted(), false);
    assert.equal(recoverFromChunkLoadFailure(), "reloading");
    assert.equal(reloadCount, 1);
    assert.equal(sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY), "1");

    const root = {
      innerHTML: "app",
      appendChild(node) {
        this.child = node;
      },
    };
    // second failure: no second reload
    const prevDoc = globalThis.document;
    globalThis.document = {
      createElement(tag) {
        const el = {
          tagName: tag.toUpperCase(),
          style: { cssText: "" },
          textContent: "",
          children: [],
          setAttribute() {},
          addEventListener() {},
          appendChild(child) {
            this.children.push(child);
          },
        };
        return el;
      },
      getElementById() {
        return root;
      },
    };

    assert.equal(recoverFromChunkLoadFailure(), "fallback");
    assert.equal(reloadCount, 1);
    assert.equal(root.innerHTML, "");
    assert.ok(root.child);
    const text = JSON.stringify(root.child);
    // ensure Arabic copy is present in the tree
    assert.match(String(root.child.children?.[0]?.children?.[0]?.textContent || ""), /حدث تحديث/);

    globalThis.document = prevDoc;
    clearChunkReloadFlag();
    assert.equal(hasChunkReloadBeenAttempted(), false);
  });

  it("mark/clear session flag", () => {
    markChunkReloadAttempted();
    assert.equal(hasChunkReloadBeenAttempted(), true);
    clearChunkReloadFlag();
    assert.equal(hasChunkReloadBeenAttempted(), false);
  });

  it("showChunkLoadFallback writes Arabic message and reload button", () => {
    const children = [];
    const root = {
      innerHTML: "x",
      appendChild(node) {
        children.push(node);
      },
    };
    const prevDoc = globalThis.document;
    globalThis.document = {
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          style: { cssText: "" },
          textContent: "",
          type: "",
          children: [],
          setAttribute() {},
          addEventListener(type, fn) {
            this._click = type === "click" ? fn : this._click;
          },
          appendChild(child) {
            this.children.push(child);
          },
        };
      },
    };

    showChunkLoadFallback(root);
    assert.equal(root.innerHTML, "");
    assert.equal(children.length, 1);
    const msg = children[0].children[0].children[0].textContent;
    const btn = children[0].children[0].children[1];
    assert.equal(msg, "حدث تحديث في ملفات الموقع. يرجى تحديث الصفحة.");
    assert.equal(btn.textContent, "تحديث الصفحة");
    globalThis.document = prevDoc;
  });
});
