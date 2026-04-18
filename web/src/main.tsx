import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { AppStoreContext } from "./stores/AppStoreContext.js";
import { createDefaultAppStore } from "./createDefaultAppStore.js";
import "./styles.css";

const store = createDefaultAppStore();

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("main.tsx: missing #root element in index.html");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <AppStoreContext.Provider value={store}>
      <App />
    </AppStoreContext.Provider>
  </React.StrictMode>,
);
