import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import type { Extension } from "@codemirror/state";

/**
 * Extension to CodeMirror language. Anything unlisted - `.nu` included, since
 * CodeMirror 6 has no Nushell grammar - renders as plain text with line
 * numbers, which is correct rather than wrong-coloured.
 */
const LANGUAGES: Record<string, () => Extension> = {
  css: () => css(),
  scss: () => css(),
  html: () => html(),
  htm: () => html(),
  js: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  mjs: () => javascript(),
  cjs: () => javascript(),
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  json: () => json(),
  md: () => markdown(),
  markdown: () => markdown(),
  py: () => python(),
  rs: () => rust(),
};

export function languageFor(extension: string | null): Extension[] {
  if (!extension) return [];
  const factory = LANGUAGES[extension];
  return factory ? [factory()] : [];
}
