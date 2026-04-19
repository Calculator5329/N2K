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
 */
import { AppStore } from "./stores/AppStore.js";
import { LiveSolverDatasetClient } from "./services/datasetClient.js";
import { InlineSolverService } from "./services/solverWorkerService.js";
import { MemoryContentBackend } from "./services/local/memoryContentBackend.js";
import { AnonIdentityService } from "./services/local/anonIdentityService.js";
import { StubAIService } from "./services/local/stubAIService.js";

export function createDefaultAppStore(): AppStore {
  return new AppStore({
    content: new MemoryContentBackend(),
    identity: new AnonIdentityService(),
    ai: new StubAIService(),
    dataset: new LiveSolverDatasetClient(),
    solverWorker: new InlineSolverService(),
  });
}
