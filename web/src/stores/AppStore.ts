/**
 * `AppStore` — the root composition object.
 *
 * Wires together the platform services with the cross-cutting stores
 * (identity, theme, favorites) and the feature stores (lookup, explore,
 * compare, visualize, compose, play). Adding a new feature = add a service
 * to `PlatformServices` if it needs one, then instantiate the feature
 * store in the constructor.
 */
import type { AIService } from "../services/aiService.js";
import type { CompetitionService } from "../services/competitionService.js";
import type { ContentBackend } from "../services/contentBackend.js";
import type { DatasetClient } from "../services/datasetClient.js";
import type { IdentityService } from "../services/identityService.js";
import type { SolverWorkerService } from "../services/solverWorkerService.js";
import type { TupleIndexService } from "../services/tupleIndexService.js";
import { CompareStore } from "./CompareStore.js";
import { ComposeStore } from "./ComposeStore.js";
import { ExploreStore } from "./ExploreStore.js";
import { FavoritesStore } from "./FavoritesStore.js";
import { IdentityStore } from "./IdentityStore.js";
import { LookupStore } from "./LookupStore.js";
import { PlayStore } from "./PlayStore.js";
import { ThemeStore } from "./ThemeStore.js";
import { VisualizeStore } from "./VisualizeStore.js";

export interface PlatformServices {
  readonly content: ContentBackend;
  readonly identity: IdentityService;
  readonly ai: AIService;
  readonly dataset: DatasetClient;
  readonly solverWorker: SolverWorkerService;
  readonly tupleIndex: TupleIndexService;
  readonly competition: CompetitionService;
}

export class AppStore {
  readonly services: PlatformServices;
  readonly identity: IdentityStore;
  readonly theme: ThemeStore;
  readonly favorites: FavoritesStore;
  readonly lookup: LookupStore;
  readonly explore: ExploreStore;
  readonly compare: CompareStore;
  readonly visualize: VisualizeStore;
  readonly compose: ComposeStore;
  readonly play: PlayStore;

  constructor(services: PlatformServices) {
    this.services = services;
    this.identity = new IdentityStore(services.identity);
    this.theme = new ThemeStore("tabletop");
    this.favorites = new FavoritesStore();
    this.lookup = new LookupStore({
      dataset: services.dataset,
      solverWorker: services.solverWorker,
    });
    this.explore = new ExploreStore({
      tupleIndex: services.tupleIndex,
      favorites: this.favorites,
    });
    this.compare = new CompareStore({ dataset: services.dataset });
    this.visualize = new VisualizeStore({ explore: this.explore, dataset: services.dataset });
    this.compose = new ComposeStore({ competition: services.competition });
    this.play = new PlayStore();
  }

  dispose(): void {
    this.identity.dispose();
    this.lookup.dispose();
    this.explore.dispose();
    this.compare.dispose();
    this.services.solverWorker.dispose();
  }
}
