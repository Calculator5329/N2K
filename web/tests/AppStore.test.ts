import { describe, expect, it } from "vitest";
import { AppStore, type PlatformServices } from "../src/stores/AppStore.js";
import { MemoryContentBackend } from "../src/services/local/memoryContentBackend.js";
import { AnonIdentityService } from "../src/services/local/anonIdentityService.js";
import { StubAIService } from "../src/services/local/stubAIService.js";
import { LiveSolverDatasetClient } from "../src/services/datasetClient.js";
import { InlineSolverService } from "../src/services/solverWorkerService.js";
import { LiveTupleIndexService } from "../src/services/tupleIndexService.js";
import { LiveCompetitionService } from "../src/services/competitionService.js";
import { createDefaultAppStore } from "../src/createDefaultAppStore.js";

function makeServices(overrides: Partial<PlatformServices> = {}): PlatformServices {
  const dataset = new LiveSolverDatasetClient();
  return {
    content: new MemoryContentBackend(),
    identity: new AnonIdentityService(),
    ai: new StubAIService(),
    dataset,
    solverWorker: new InlineSolverService(),
    tupleIndex: new LiveTupleIndexService(dataset),
    competition: new LiveCompetitionService(dataset),
    ...overrides,
  };
}

describe("AppStore", () => {
  it("composes the platform services + identity + theme + lookup stores", () => {
    const services = makeServices();
    const store = new AppStore(services);
    expect(store.services).toBe(services);
    expect(store.identity.user.anonymous).toBe(true);
    expect(store.theme.activeId).toBe("tabletop");
    expect(store.lookup).toBeDefined();
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
    const store = new AppStore(makeServices({ identity }));
    const original = store.identity.user.id;
    identity.renameForTesting("Edited");
    expect(store.identity.user.displayName).toBe("Edited");
    expect(store.identity.user.id).toBe(original);
    store.dispose();
  });
});
