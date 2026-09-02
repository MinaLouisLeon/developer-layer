import { File } from "lucide-react";

import { useSearchRow } from "../context/SearchRowContext";
import { HighlightedText } from "./HighlightedText";

export function SearchRowIcon() {
  const { selected } = useSearchRow();
  return (
    <File
      size={14}
      strokeWidth={1.5}
      aria-hidden="true"
      className={`shrink-0 ${selected ? "text-accentStrong" : "text-textFaint"}`}
    />
  );
}

/** The filename, with the matched characters picked out. */
export function SearchRowName() {
  const { hit, path, selected } = useSearchRow();
  const tone = selected
    ? "text-accentStrong"
    : hit.entry.hidden
      ? "text-textFaint"
      : "text-text";
  return (
    <HighlightedText
      text={path.name}
      matches={path.nameMatches}
      className={`shrink-0 truncate ${tone}`}
    />
  );
}

/**
 * The folder the file sits in, trailing after the name.
 *
 * Quieter and smaller than the name, because it is here to tell two files with
 * the same name apart rather than to be read on its own.
 */
export function SearchRowDirectory() {
  const { path } = useSearchRow();
  if (path.directory === "") return null;
  return (
    <HighlightedText
      text={path.directory}
      matches={path.directoryMatches}
      className="ml-auto min-w-0 truncate pl-2 text-xs text-textFaint"
    />
  );
}
