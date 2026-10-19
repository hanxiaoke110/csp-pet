import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import ErrorBoundary from "./components/ErrorBoundary";
import StorageSafety from './components/StorageSafety';
import FocusRuntime from './components/focus/FocusRuntime';
import DungeonSyncRuntime from '../src-dungeon/components/DungeonSyncRuntime';
import { recoverInterruptedRestore } from './lib/restoreStartup';

const render = () => ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <FocusRuntime />
      <DungeonSyncRuntime />
      <StorageSafety />
    </ErrorBoundary>
  </React.StrictMode>,
);
void recoverInterruptedRestore().then(recovered => { if (recovered) window.location.reload(); else render(); }).catch(render);
