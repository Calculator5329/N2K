/**
 * `AppStore` — the root composition object.
 *
 * Wires together the platform services with the cross-cutting stores
 * (identity, theme) and the feature stores (lookup, etc.). Adding a
 * new feature = add a service to `PlatformServices` if it needs one,
 * then instantiate the feature store in the constructor.
 */
import type { AIService } from "../services/aiService.js";
import type { ContentBackend } from "../services/contentBackend.js";
import type { DatasetClient } from "../services/datasetClient.js";
import type { IdentityService } from "../services/identityService.js";
import type { SolverWorkerService } from "../services/solverWorkerService.js";
import { IdentityStore } from "./IdentityStore.js";
import { LookupStore } from "./LookupStore.js";
import { ThemeStore } from "./ThemeStore.js";

export interface PlatformServices {
  readonly content: ContentBackend;
  readonly identity: IdentityService;
  readonly ai: AIService;
  readonly dataset: DatasetClient;
  readonly solverWorker: SolverWorkerService;
}

export class AppStore {
  readonly services: PlatformServices;
  readonly identity: IdentityStore;
  readonly theme: ThemeStore;
  readonly lookup: LookupStore;

  constructor(services: PlatformServices) {
    this.services = services;
    this.identity = new IdentityStore(services.identity);
    this.theme = new ThemeStore("tabletop");
    this.lookup = new LookupStore({
      dataset: services.dataset,
      solverWorker: services.solverWorker,
    });
  }

  dispose(): void {
    this.identity.dispose();
    this.lookup.dispose();
    this.services.solverWorker.dispose();
  }
}
