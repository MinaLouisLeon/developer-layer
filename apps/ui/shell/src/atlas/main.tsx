import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@developer-layer/design/src/tokens.css";
import "./atlas.css";
import { CommandBar } from "./CommandBar";

const container = document.getElementById("root");
if (!container) {
  throw new Error("missing #root — atlas.html did not load");
}

createRoot(container).render(
  <StrictMode>
    <CommandBar />
  </StrictMode>,
);
