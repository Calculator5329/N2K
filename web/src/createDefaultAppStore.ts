/**
 * Default `AppStore` factory — instantiates every platform service
 * with its bootstrap-local implementation. Each service interface is a
 * drop-in seam for an upgrade:
 *
 *   LocalStorageContentBackend → IdbContentBackend        → Firestore
 *   AnonIdentityService      → FirebaseIdentityService
 *   StubAIService            → GeminiAIService (Cloud Run)
 *   WorkerSolverDatasetClient → HttpDatasetClient (Phase 1 chunks)
 *   WorkerSolverService      → BroadcastSolverService (multi-tab share)
 *   LiveTupleIndexService    → CachedHttpTupleIndexService (cloud index)
 *   LiveCompetitionService   → ServerCompetitionService (Cloud Run)
 *
 * Browser builds use the worker-backed dataset + solver so the React
 * render loop stays smooth during arity-4/5 Æther sweeps. Tests
 * substitute `LiveSolverDatasetClient` / `InlineSolverService`
 * explicitly because jsdom doesn't ship a `Worker`.
 */
import { AppStore } from "./stores/AppStore.js";
import { LiveCompetitionService } from "./services/competitionService.js";
import {
  LiveSolverDatasetClient,
  WorkerSolverDatasetClient,
} from "./services/datasetClient.js";
import {
  InlineSolverService,
  WorkerSolverService,
} from "./services/solverWorkerService.js";
import { LiveTupleIndexService } from "./services/tupleIndexService.js";
import { LocalStorageContentBackend } from "./services/local/localStorageContentBackend.js";
import { AnonIdentityService } from "./services/local/anonIdentityService.js";
import { StubAIService } from "./services/local/stubAIService.js";

const hasWorker =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as { Worker?: unknown }).Worker === "function";

export function createDefaultAppStore(): AppStore {
  // Single shared dataset client so chunks computed for Lookup are reused
  // by Compare / Explore / Visualize / Compose without recomputation.
  const dataset = hasWorker ? new WorkerSolverDatasetClient() : new LiveSolverDatasetClient();
  const solverWorker = hasWorker ? new WorkerSolverService() : new InlineSolverService();
  return new AppStore({
    // localStorage-backed so Phase 6 saved boards (and any future
    // user-authored content) survive reloads. Tests still use
    // MemoryContentBackend explicitly.
    content: new LocalStorageContentBackend(),
    identity: new AnonIdentityService(),
    ai: new StubAIService(),
    dataset,
    solverWorker,
    tupleIndex: new LiveTupleIndexService(dataset),
    competition: new LiveCompetitionService(dataset),
  });
}
