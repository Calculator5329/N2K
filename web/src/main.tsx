import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { AppStoreContext } from "./stores/AppStoreContext.js";
import { createDefaultAppStore } from "./createDefaultAppStore.js";
import { StoreProvider } from "./v1stores/storeContext.js";
import { V1AppStore } from "./v1stores/AppStore.js";
import "./styles.css";

const v2 = createDefaultAppStore();
const v1 = new V1AppStore(v2);

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("main.tsx: missing #root element in index.html");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <AppStoreContext.Provider value={v2}>
      <StoreProvider store={v1}>
        <App />
      </StoreProvider>
    </AppStoreContext.Provider>
  </React.StrictMode>,
);
