/**
 * Default `AppStore` factory — instantiates every platform service
 * with its bootstrap-local implementation. Each service interface is a
 * drop-in seam for an upgrade:
 *
 *   MemoryContentBackend     → IdbContentBackend          → Firestore
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
import { MemoryContentBackend } from "./services/local/memoryContentBackend.js";
import { AnonIdentityService } from "./services/local/anonIdentityService.js";
import { StubAIService } from "./services/local/stubAIService.js";

export function createDefaultAppStore(): AppStore {
  // Single shared dataset client so chunks computed for Lookup are reused
  // by Compare / Explore / Visualize / Compose without recomputation.
  const dataset = new LiveSolverDatasetClient();
  return new AppStore({
    content: new MemoryContentBackend(),
    identity: new AnonIdentityService(),
    ai: new StubAIService(),
    dataset,
    solverWorker: new InlineSolverService(),
    tupleIndex: new LiveTupleIndexService(dataset),
    competition: new LiveCompetitionService(dataset),
  });
}
