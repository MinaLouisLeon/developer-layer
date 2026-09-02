import { Fragment } from "react";

interface HighlightedTextProps {
  text: string;
  /** Character indices to mark, ascending. Anything out of range is ignored. */
  matches: number[];
  /** Tone for the unmatched characters; the matched ones are always accented. */
  className?: string;
}

/**
 * Renders text with the characters the query matched picked out.
 *
 * The indices come from the Rust matcher rather than from anything computed
 * here, so what is highlighted is exactly what was matched - a second, local
 * guess at "which letters did they mean" would eventually disagree with the
 * ranking and highlight the wrong ones.
 */
export function HighlightedText({
  text,
  matches,
  className,
}: HighlightedTextProps) {
  if (matches.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const marked = new Set(matches);
  const characters = [...text];

  return (
    <span className={className}>
      {characters.map((character, index) => (
        <Fragment key={index}>
          {marked.has(index) ? (
            <span className="font-semibold text-accentStrong">{character}</span>
          ) : (
            character
          )}
        </Fragment>
      ))}
    </span>
  );
}
