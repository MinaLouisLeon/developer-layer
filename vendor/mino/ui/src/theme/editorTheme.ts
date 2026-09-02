import { EditorView } from "@codemirror/view";

import { colorTokens, fontStacks } from "./tokens";

/**
 * CodeMirror takes colours as JavaScript strings, so like the terminal theme
 * it reads the shared tokens rather than carrying its own palette.
 */
export const editorTheme = EditorView.theme(
  {
    "&": {
      color: colorTokens.text,
      backgroundColor: colorTokens.surface,
      height: "100%",
      fontSize: "13px",
    },
    ".cm-content": {
      fontFamily: fontStacks.mono.join(", "),
      caretColor: colorTokens.accent,
    },
    ".cm-gutters": {
      backgroundColor: colorTokens.surfaceRaised,
      color: colorTokens.textFaint,
      border: "none",
      borderRight: `1px solid ${colorTokens.border}`,
    },
    ".cm-activeLineGutter": { backgroundColor: colorTokens.surfaceHover },
    // The blame gutter. Quiet by design: it sits beside every line and should
    // read as marginalia, not as part of the code.
    ".cm-blame-gutter": {
      color: colorTokens.textFaint,
      paddingLeft: "6px",
      paddingRight: "6px",
      minWidth: "13ch",
      borderRight: `1px solid ${colorTokens.border}`,
    },
    ".cm-blame-entry": {
      fontFamily: fontStacks.mono.join(", "),
      fontSize: "11px",
      whiteSpace: "nowrap",
    },
    // The review gutter. Narrow, and the one gutter marker that is a control
    // rather than a label - so it takes the accent, which is what the rest of
    // the app means by "you can press this".
    ".cm-review-gutter": {
      minWidth: "2ch",
      paddingLeft: "2px",
      paddingRight: "2px",
      borderRight: `1px solid ${colorTokens.border}`,
    },
    ".cm-review-marker": {
      background: "none",
      border: "none",
      cursor: "pointer",
      padding: "0",
      color: colorTokens.accent,
      fontFamily: fontStacks.mono.join(", "),
      fontSize: "11px",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: colorTokens.selection,
    },
    ".cm-scroller": { overflow: "auto" },
  },
  { dark: true },
);
