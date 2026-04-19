/**
 * `AppStore` — the root composition object.
 *
 * Wires together the three platform services (content, identity, AI)
 * with the cross-cutting stores (identity, theme). Feature stores are
 * NOT instantiated here — the App composes them lazily as features
 * mount. Keeping AppStore narrow means the boot path stays fast and
 * tree-shakable.
 */
import type { AIService } from "../services/aiService.js";
import type { ContentBackend } from "../services/contentBackend.js";
import type { IdentityService } from "../services/identityService.js";
import { IdentityStore } from "./IdentityStore.js";
import { ThemeStore } from "./ThemeStore.js";

export interface PlatformServices {
  readonly content: ContentBackend;
  readonly identity: IdentityService;
  readonly ai: AIService;
}

export class AppStore {
  readonly services: PlatformServices;
  readonly identity: IdentityStore;
  readonly theme: ThemeStore;

  constructor(services: PlatformServices) {
    this.services = services;
    this.identity = new IdentityStore(services.identity);
    this.theme = new ThemeStore("tabletop");
  }

  dispose(): void {
    this.identity.dispose();
  }
}
