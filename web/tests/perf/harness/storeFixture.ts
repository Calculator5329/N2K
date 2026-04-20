import { AppStore } from "../../../src/stores/AppStore.js";

/**
 * Builds a fresh AppStore suitable for perf tests.
 *
 * AppStore's constructor is documented as side-effect-free aside from
 * child-store initializers (e.g. ThemeStore reads localStorage and sets
 * `<html data-theme>`). Under happy-dom those operations succeed, so no
 * patching is required here.
 *
 * The Konami `window` keydown listener is attached by `App.tsx`, not the
 * store constructor, so there's nothing to tear down at the window level.
 * Callers that exercise the timer (`play.start`) should call
 * `store.dispose()` themselves in `afterEach`.
 */
export function buildTestAppStore(): AppStore {
  return new AppStore();
}
