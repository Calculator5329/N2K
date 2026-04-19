import { createContext, useContext, type ReactNode } from "react";
import type { V1AppStore } from "./AppStore.js";

const StoreContext = createContext<V1AppStore | null>(null);

export function StoreProvider({
  store,
  children,
}: {
  store: V1AppStore;
  children: ReactNode;
}) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): V1AppStore {
  const store = useContext(StoreContext);
  if (store === null) {
    throw new Error("useStore must be used within <StoreProvider>");
  }
  return store;
}
