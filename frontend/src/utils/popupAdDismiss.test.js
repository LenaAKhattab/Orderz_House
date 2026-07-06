import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  clearEveryLoginPopupDismissals,
  everyLoginSeenStorageKey,
  firstLoginSeenStorageKey,
  isPopupAdDismissed,
  markPopupAdDismissed,
  pickPopupAdToShow,
} from "./popupAdDismiss.js";

const storage = new Map();

function installStorageMock() {
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, String(value));
    },
    removeItem: (key) => {
      storage.delete(key);
    },
    clear: () => storage.clear(),
  };
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(`sess:${key}`) ?? null,
    setItem: (key, value) => {
      storage.set(`sess:${key}`, String(value));
    },
    removeItem: (key) => {
      storage.delete(`sess:${key}`);
    },
    clear: () => storage.clear(),
    key: (index) => Array.from(storage.keys()).filter((k) => k.startsWith("sess:"))[index]?.slice(5) ?? null,
    get length() {
      return Array.from(storage.keys()).filter((k) => k.startsWith("sess:")).length;
    },
  };
}

describe("popupAdDismiss first_login_only", () => {
  beforeEach(() => {
    storage.clear();
    installStorageMock();
  });

  afterEach(() => {
    storage.clear();
  });

  it("builds user-specific first-login storage key", () => {
    assert.equal(firstLoginSeenStorageKey(42, 7), "popup_ad_first_login_seen_42_7");
  });

  it("treats first_login_only as dismissed for guests", () => {
    const ad = { id: 5, frequency: "first_login_only" };
    assert.equal(isPopupAdDismissed(ad, "/", { isAuthenticated: false }), true);
    assert.equal(pickPopupAdToShow([ad], "/", { isAuthenticated: false }), null);
  });

  it("shows first_login_only once per user and not again after mark", () => {
    const ad = { id: 5, frequency: "first_login_only" };
    const opts = { userId: 99, isAuthenticated: true };

    assert.equal(isPopupAdDismissed(ad, "/", opts), false);
    assert.equal(pickPopupAdToShow([ad], "/", opts)?.id, 5);

    markPopupAdDismissed(ad, "/", { userId: 99 });
    assert.equal(localStorage.getItem(firstLoginSeenStorageKey(99, 5)), "1");
    assert.equal(isPopupAdDismissed(ad, "/", opts), true);
    assert.equal(pickPopupAdToShow([ad], "/", opts), null);
  });

  it("tracks first_login_only separately per user", () => {
    const ad = { id: 5, frequency: "first_login_only" };
    markPopupAdDismissed(ad, "/", { userId: 1 });

    assert.equal(pickPopupAdToShow([ad], "/", { userId: 1, isAuthenticated: true }), null);
    assert.equal(pickPopupAdToShow([ad], "/", { userId: 2, isAuthenticated: true })?.id, 5);
  });

  it("keeps session frequency behavior unchanged", () => {
    const ad = { id: 3, frequency: "session" };
    assert.equal(pickPopupAdToShow([ad], "/about", { isAuthenticated: false })?.id, 3);
    markPopupAdDismissed(ad, "/about");
    assert.equal(pickPopupAdToShow([ad], "/about", { isAuthenticated: false }), null);
  });
});

describe("popupAdDismiss every_login", () => {
  beforeEach(() => {
    storage.clear();
    installStorageMock();
  });

  afterEach(() => {
    storage.clear();
  });

  it("builds user-specific every-login storage key", () => {
    assert.equal(everyLoginSeenStorageKey(12, 8), "popup_ad_every_login_seen_12_8");
  });

  it("treats every_login as dismissed for guests", () => {
    const ad = { id: 2, frequency: "every_login" };
    assert.equal(pickPopupAdToShow([ad], "/dashboard/freelancer", { isAuthenticated: false }), null);
  });

  it("hides every_login after dismiss in same login session", () => {
    const ad = { id: 2, frequency: "every_login" };
    const opts = { userId: 7, isAuthenticated: true };

    assert.equal(pickPopupAdToShow([ad], "/dashboard/freelancer", opts)?.id, 2);
    markPopupAdDismissed(ad, "/dashboard/freelancer", { userId: 7 });
    assert.equal(sessionStorage.getItem(everyLoginSeenStorageKey(7, 2)), "1");
    assert.equal(pickPopupAdToShow([ad], "/dashboard/freelancer", opts), null);
  });

  it("shows every_login again after logout clears session dismissals", () => {
    const ad = { id: 2, frequency: "every_login" };
    const opts = { userId: 7, isAuthenticated: true };

    markPopupAdDismissed(ad, "/dashboard/freelancer", { userId: 7 });
    assert.equal(pickPopupAdToShow([ad], "/dashboard/freelancer", opts), null);

    clearEveryLoginPopupDismissals(7);
    assert.equal(pickPopupAdToShow([ad], "/dashboard/freelancer", opts)?.id, 2);
  });

  it("targets freelancers only via audience on API list, not client role", () => {
    const ad = { id: 2, frequency: "every_login", audience: "freelancer" };
    assert.equal(pickPopupAdToShow([ad], "/dashboard/freelancer", { userId: 7, isAuthenticated: true })?.id, 2);
  });
});
