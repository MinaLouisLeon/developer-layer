import { useCallback, useEffect, useRef } from "react";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";

import { reviewGutter } from "@/features/github/reviewGutter";
import { editorTheme } from "@/theme/editorTheme";

import { blameGutter } from "../blameGutter";
import { languageFor } from "../languages";
import type { CodeMirrorHandle, CodeMirrorOptions } from "../types";

/**
 * The CodeMirror 6 view.
 *
 * The view is rebuilt when a different file loads - keyed on `revision`, which
 * the loader bumps once per read - and deliberately *not* on every keystroke.
 * The document lives in the editor while it is being edited; React is told
 * about changes through `onChange` rather than owning them, because feeding
 * state back in on each keypress would rebuild the view and lose the cursor.
 *
 * `currentLine` follows the same principle one step further. The line the
 * cursor is on is wanted exactly once - when somebody asks for a link to this
 * file on github.com - so it is read from the view on demand rather than
 * mirrored into React, where it would be a re-render per arrow key for a
 * question nobody had asked yet.
 */
export function useCodeMirror(options: CodeMirrorOptions): CodeMirrorHandle {
  const container = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  // Read through refs so a changed handler does not rebuild the editor.
  const latest = useRef(options);
  latest.current = options;

  const { revision, extension, editable, content, visible, blame, review } =
    options;
  // The view is rebuilt when the gutter's contents change, so the dependency
  // is a value rather than the array itself - which is a new array on every
  // render and would rebuild the editor continuously.
  const reviewKey = review.map((thread) => `${thread.id}:${thread.line}`).join();
  // The document arrives one render after the file loads, because the editor
  // state hook fills it in. Without this in the dependencies the effect would
  // run once with nothing to show and never run again, leaving a blank pane.
  const hasContent = content !== null;

  useEffect(() => {
    const parent = container.current;
    if (!parent || content === null) return;

    const instance = new EditorView({
      parent,
      state: EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          // Save first, so the platform's save shortcut is not swallowed by
          // anything the default keymap binds.
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                latest.current.onSave();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          editorTheme,
          // Rebuilds the view when blame is toggled, which is why the toggle
          // is explicit and never automatic: it changes the editor's shape.
          ...blameGutter(blame),
          // The same, for review threads. Empty unless the reader picked a
          // pull request to review, so nothing appears unasked.
          ...reviewGutter(review, (line) => latest.current.onOpenReview(line)),
          EditorState.readOnly.of(!editable),
          EditorView.editable.of(editable),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              latest.current.onChange(update.state.doc.toString());
            }
          }),
          ...languageFor(extension),
        ],
      }),
    });

    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // `content` is the *initial* document for this revision; typing must not
    // re-run this effect, which is why it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, extension, editable, hasContent, blame, reviewKey]);

  // Coming back from diff mode. The editor was hidden rather than destroyed -
  // which is what keeps an unsaved draft and the cursor - but a CodeMirror
  // that was laid out at zero height measures itself wrong, and without this
  // it comes back blank until something else forces a redraw.
  useEffect(() => {
    if (visible) view.current?.requestMeasure();
  }, [visible]);

  return {
    container,
    // 1-based, as editors and GitHub both count. `null` when there is no
    // editor, which is every state but `showEditor`.
    currentLine: useCallback(() => {
      const instance = view.current;
      if (!instance) return null;
      return instance.state.doc.lineAt(instance.state.selection.main.head).number;
    }, []),
  };
}
