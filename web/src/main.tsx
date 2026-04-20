import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { AppStore } from "./stores/AppStore.js";
import { AppStoreProvider } from "./stores/AppStoreContext.js";
import "./styles.css";

const store = new AppStore();

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("main.tsx: missing #root element in index.html");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>
  </React.StrictMode>,
);
