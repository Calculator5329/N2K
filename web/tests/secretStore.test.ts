/**
 * SecretStore — Konami-code unlock + Æther mode latch.
 *
 * Sanity coverage for the gate that the Lookup / Compose / Play
 * surfaces all key off (`secret.aetherActive`). If this regresses,
 * Æther features either never light up or stay on after a reset.
 */
import { describe, expect, it } from "vitest";
import { SecretStore } from "../src/stores/SecretStore";

const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];

describe("SecretStore", () => {
  it("starts locked in standard mode", () => {
    const s = new SecretStore();
    expect(s.unlocked).toBe(false);
    expect(s.mode).toBe("standard");
    expect(s.aetherActive).toBe(false);
  });

  it("unlocks Æther after the full Konami sequence", () => {
    const s = new SecretStore();
    for (const k of KONAMI) s.ingestKey(k);
    expect(s.unlocked).toBe(true);
    expect(s.mode).toBe("aether");
    expect(s.aetherActive).toBe(true);
  });

  it("ignores stray keys and resets the cursor", () => {
    const s = new SecretStore();
    s.ingestKey("ArrowUp");
    s.ingestKey("ArrowUp");
    s.ingestKey("Escape"); // resets
    s.ingestKey("ArrowDown");
    expect(s.unlocked).toBe(false);
  });

  it("toggles back to standard after unlock", () => {
    const s = new SecretStore();
    s.forceUnlock();
    expect(s.aetherActive).toBe(true);
    s.toggleMode();
    expect(s.aetherActive).toBe(false);
    expect(s.mode).toBe("standard");
  });

  it("refuses setMode('aether') while locked", () => {
    const s = new SecretStore();
    s.setMode("aether");
    expect(s.mode).toBe("standard");
  });
});
