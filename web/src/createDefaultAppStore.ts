/**
 * Wires up the default browser-side service implementations and returns
 * a ready-to-use `AppStore`. Used by `main.tsx` for the real app and
 * occasionally by tests that want the default wiring.
 */
import { AppStore } from "./stores/AppStore.js";
import { MemoryContentBackend } from "./services/local/memoryContentBackend.js";
import { AnonIdentityService } from "./services/local/anonIdentityService.js";
import { StubAIService } from "./services/local/stubAIService.js";

export function createDefaultAppStore(): AppStore {
  // NOTE: MemoryContentBackend is the bootstrap default. The IdbContentBackend
  // (Phase 3 follow-up) will replace this so user-authored boards persist
  // across reloads; the Firestore impl arrives with the Cloud Run backend.
  return new AppStore({
    content: new MemoryContentBackend(),
    identity: new AnonIdentityService(),
    ai: new StubAIService(),
  });
}
