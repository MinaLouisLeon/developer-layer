import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@developer-layer/design/src/tokens.css";
import "./shell.css";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) {
  throw new Error("missing #root — index.html did not load");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
