/**
 * Default `AppStore` factory — instantiates every platform service
 * with its bootstrap-local implementation. Each service interface is a
 * drop-in seam for an upgrade:
 *
 *   LocalStorageContentBackend → IdbContentBackend        → Firestore
 *   AnonIdentityService      → FirebaseIdentityService
 *   StubAIService            → GeminiAIService (Cloud Run)
 *   LiveSolverDatasetClient  → HttpDatasetClient (Phase 1 chunks)
 *   InlineSolverService      → WorkerSolverService (Web Worker)
 *   LiveTupleIndexService    → CachedHttpTupleIndexService (cloud index)
 *   LiveCompetitionService   → ServerCompetitionService (Cloud Run)
 */
import { AppStore } from "./stores/AppStore.js";
import { LiveCompetitionService } from "./services/competitionService.js";
import { LiveSolverDatasetClient } from "./services/datasetClient.js";
import { InlineSolverService } from "./services/solverWorkerService.js";
import { LiveTupleIndexService } from "./services/tupleIndexService.js";
import { LocalStorageContentBackend } from "./services/local/localStorageContentBackend.js";
import { AnonIdentityService } from "./services/local/anonIdentityService.js";
import { StubAIService } from "./services/local/stubAIService.js";

export function createDefaultAppStore(): AppStore {
  // Single shared dataset client so chunks computed for Lookup are reused
  // by Compare / Explore / Visualize / Compose without recomputation.
  const dataset = new LiveSolverDatasetClient();
  return new AppStore({
    // localStorage-backed so Phase 6 saved boards (and any future
    // user-authored content) survive reloads. Tests still use
    // MemoryContentBackend explicitly.
    content: new LocalStorageContentBackend(),
    identity: new AnonIdentityService(),
    ai: new StubAIService(),
    dataset,
    solverWorker: new InlineSolverService(),
    tupleIndex: new LiveTupleIndexService(dataset),
    competition: new LiveCompetitionService(dataset),
  });
}
