import { describe, expect, it } from "vitest";
import { AppStore } from "../src/stores/AppStore.js";
import { MemoryContentBackend } from "../src/services/local/memoryContentBackend.js";
import { AnonIdentityService } from "../src/services/local/anonIdentityService.js";
import { StubAIService } from "../src/services/local/stubAIService.js";
import { createDefaultAppStore } from "../src/createDefaultAppStore.js";

describe("AppStore", () => {
  it("composes the three platform services + identity + theme stores", () => {
    const services = {
      content: new MemoryContentBackend(),
      identity: new AnonIdentityService(),
      ai: new StubAIService(),
    };
    const store = new AppStore(services);
    expect(store.services).toBe(services);
    expect(store.identity.user.anonymous).toBe(true);
    expect(store.theme.activeId).toBe("tabletop");
    store.dispose();
  });

  it("createDefaultAppStore wires sensible defaults", () => {
    const store = createDefaultAppStore();
    expect(store.identity.user.id).toBeTruthy();
    expect(store.theme.availableThemes.length).toBeGreaterThanOrEqual(2);
    store.dispose();
  });

  it("identity store mirrors identity service updates", () => {
    const identity = new AnonIdentityService();
    const store = new AppStore({
      content: new MemoryContentBackend(),
      identity,
      ai: new StubAIService(),
    });
    const original = store.identity.user.id;
    identity.renameForTesting("Edited");
    expect(store.identity.user.displayName).toBe("Edited");
    expect(store.identity.user.id).toBe(original); // id unchanged
    store.dispose();
  });
});
