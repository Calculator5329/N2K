/**
 * OnboardingStore — first-run welcome latch.
 *
 * Guards the "shown once" contract of the welcome overlay: a brand-new
 * visitor sees it, dismissing persists a flag, and a returning visitor
 * (same storage) never sees it again. Also covers the private-mode /
 * blocked-storage path so a throwing `localStorage` can't crash boot.
 */
import { describe, expect, it } from "vitest";
import {
  OnboardingStore,
  type OnboardingStorage,
} from "../src/stores/OnboardingStore";

function fakeStorage(seed: Record<string, string> = {}): OnboardingStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe("OnboardingStore", () => {
  it("opens on the first visit (no flag stored)", () => {
    const s = new OnboardingStore(fakeStorage());
    expect(s.open).toBe(true);
  });

  it("stays closed for a returning visitor (flag present)", () => {
    const s = new OnboardingStore(fakeStorage({ "n2k.onboarded.v1": "1" }));
    expect(s.open).toBe(false);
  });

  it("dismiss() closes it and persists so the next visit skips it", () => {
    const storage = fakeStorage();
    const first = new OnboardingStore(storage);
    expect(first.open).toBe(true);
    first.dismiss();
    expect(first.open).toBe(false);

    // A fresh store over the same storage sees the persisted flag.
    const returning = new OnboardingStore(storage);
    expect(returning.open).toBe(false);
  });

  it("dismiss() is idempotent", () => {
    const s = new OnboardingStore(fakeStorage());
    s.dismiss();
    s.dismiss();
    expect(s.open).toBe(false);
  });

  it("survives storage that throws (private mode) — shows once, doesn't crash", () => {
    const throwing: OnboardingStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const s = new OnboardingStore(throwing);
    // Read threw → treated as first run.
    expect(s.open).toBe(true);
    // Write throws but is swallowed; the in-memory flag still closes it.
    expect(() => s.dismiss()).not.toThrow();
    expect(s.open).toBe(false);
  });
});
