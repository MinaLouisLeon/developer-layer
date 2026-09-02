import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AtlasHit } from "@developer-layer/shared";

import { onOpened, run, search, setVisible } from "./ipc";

/**
 * The Atlas command bar.
 *
 * Every decision about *what* is listed and *what a row does* is Rust's, in
 * `dl-atlas`, where it is tested. What is left here is the part only a
 * keyboard can get wrong: which row is selected, what happens on each key, and
 * making sure a slow answer to an old query cannot overwrite the answer to the
 * current one.
 */
export function CommandBar() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AtlasHit[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /**
   * Which query the newest request was for. Results for anything older are
   * dropped: typing "chr" fires three searches, and without this the answer to
   * "c" can land last and replace the answer to "chr".
   */
  const latest = useRef(0);

  const dismiss = useCallback(() => {
    void setVisible(false);
  }, []);

  // The backend clears the bar every time the hotkey reveals it. Left alone,
  // the first keystroke of the next invocation would append to a query from
  // however long ago, and the list would already be filtered by it.
  useEffect(() => {
    const unlisten = onOpened(() => {
      setQuery("");
      setSelected(0);
      setError(null);
      input.current?.focus();
      input.current?.select();
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  useEffect(() => {
    const ticket = ++latest.current;
    search(query)
      .then((results) => {
        if (ticket !== latest.current) return;
        setHits(results);
        setSelected(0);
        setError(null);
      })
      .catch((e: unknown) => {
        if (ticket !== latest.current) return;
        setError(String(e));
        setHits([]);
      });
  }, [query]);

  const execute = useCallback(
    (hit: AtlasHit | undefined) => {
      if (!hit || busy) return;
      setBusy(true);
      // Hidden first. Every command acts on another window, and a bar still
      // sitting in front of the thing it just focused is in the way.
      void setVisible(false)
        .then(() => run(hit.key))
        .catch((e: unknown) => {
          setError(String(e));
          // Back up, so the failure is read rather than flashed past.
          void setVisible(true);
        })
        .finally(() => setBusy(false));
    },
    [busy],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        dismiss();
        break;
      case "ArrowDown":
        event.preventDefault();
        // Wrapping, because a list reached by typing is short and the fastest
        // route to the last row is often upwards.
        setSelected((current) => (hits.length ? (current + 1) % hits.length : 0));
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelected((current) =>
          hits.length ? (current - 1 + hits.length) % hits.length : 0,
        );
        break;
      case "Home":
        event.preventDefault();
        setSelected(0);
        break;
      case "End":
        event.preventDefault();
        setSelected(Math.max(0, hits.length - 1));
        break;
      case "Enter":
        event.preventDefault();
        execute(hits[selected]);
        break;
      default:
        break;
    }
  };

  // Keep the selected row on screen when the arrows walk past the fold.
  useEffect(() => {
    const row = list.current?.children[selected];
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  const grouped = useMemo(() => withHeadings(hits), [hits]);

  return (
    <div
      className="atlas"
      // Clicking outside the panel dismisses, the way every launcher does.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div className="atlas__panel" role="dialog" aria-modal="true" aria-label="Atlas">
        <div className="atlas__field">
          <span className="atlas__mark" aria-hidden="true">
            ▸
          </span>
          <input
            ref={input}
            autoFocus
            type="text"
            className="atlas__input"
            placeholder="Type a command, or an application"
            value={query}
            spellCheck={false}
            autoComplete="off"
            aria-label="Command"
            aria-controls="atlas-results"
            aria-activedescendant={hits[selected] ? `atlas-${selected}` : undefined}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>

        {error ? (
          <p className="atlas__error" role="alert">
            {error}
          </p>
        ) : null}

        {hits.length === 0 && !error ? (
          <p className="atlas__empty">Nothing matches “{query}”.</p>
        ) : (
          <ul
            ref={list}
            id="atlas-results"
            className="atlas__results"
            role="listbox"
            aria-label="Results"
          >
            {grouped.map(({ hit, heading }, index) => (
              <li
                key={hit.key}
                id={`atlas-${index}`}
                role="option"
                aria-selected={index === selected}
                className={`atlas__row${index === selected ? " atlas__row--on" : ""}`}
                onMouseDown={(event) => {
                  // mousedown, not click: the input loses focus on mouseup and
                  // the row would be gone before the click landed.
                  event.preventDefault();
                  execute(hit);
                }}
                onMouseEnter={() => setSelected(index)}
              >
                {heading ? (
                  <span className="atlas__heading" aria-hidden="true">
                    {heading}
                  </span>
                ) : null}
                <span className="atlas__label">{hit.label}</span>
                <span className="atlas__detail">{hit.detail}</span>
              </li>
            ))}
          </ul>
        )}

        <footer className="atlas__hint" aria-hidden="true">
          <span>↑↓ move</span>
          <span>⏎ run</span>
          <span>esc dismiss</span>
        </footer>
      </div>
    </div>
  );
}

/**
 * Mark the first row of each run of a category.
 *
 * A heading per run rather than per category: the list is ranked, so the same
 * category can appear more than once, and re-grouping the rows would override
 * the ranking the user is steering with every keystroke.
 */
function withHeadings(hits: AtlasHit[]): { hit: AtlasHit; heading: string | null }[] {
  let previous: string | null = null;
  return hits.map((hit) => {
    const heading = hit.category === previous ? null : hit.category;
    previous = hit.category;
    return { hit, heading };
  });
}
