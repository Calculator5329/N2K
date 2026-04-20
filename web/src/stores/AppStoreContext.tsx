/**
 * React context + hook for the singleton {@link AppStore}.
 *
 * Components reach the store via {@link useAppStore}. The legacy
 * `useStore` name is preserved as an alias so the v1-ported feature
 * views continue to compile unchanged.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { AppStore } from "./AppStore.js";

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({
  store,
  children,
}: {
  store: AppStore;
  children: ReactNode;
}) {
  return (
    <AppStoreContext.Provider value={store}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (store === null) {
    throw new Error(
      "useAppStore: no AppStore in context. Wrap the tree in <AppStoreProvider>.",
    );
  }
  return store;
}

/** Back-compat alias used by the v1-ported feature views. */
export const useStore = useAppStore;
