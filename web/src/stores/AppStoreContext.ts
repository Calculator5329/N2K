/**
 * React context + hook for the app-wide singleton `AppStore`.
 *
 * Components grab dependencies via `useAppStore()`. Tests inject a
 * custom store with a memory ContentBackend / stub AIService.
 */
import { createContext, useContext } from "react";
import type { AppStore } from "./AppStore.js";

export const AppStoreContext = createContext<AppStore | null>(null);

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (store === null) {
    throw new Error(
      "useAppStore: no AppStore in context. Wrap the tree in <AppStoreContext.Provider>.",
    );
  }
  return store;
}
