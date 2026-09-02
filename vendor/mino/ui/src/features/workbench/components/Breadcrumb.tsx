import { useBreadcrumb } from "../hooks/useBreadcrumb";

/**
 * The working-directory trail. Segments come from Nushell's own `path split`
 * so the target's rules decide where the boundaries are.
 */
export function Breadcrumb({ path }: { path: string | null }) {
  const segments = useBreadcrumb(path);
  if (!path) return null;

  return (
    <nav aria-label="Working directory" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 truncate text-xs text-textMuted">
        {segments.map((segment, index) => (
          <li
            key={`${segment}-${index}`}
            className="flex shrink-0 items-center gap-1"
          >
            {index > 0 ? (
              <span aria-hidden="true" className="text-textFaint">
                /
              </span>
            ) : null}
            <span
              className={
                index === segments.length - 1 ? "text-text" : undefined
              }
            >
              {segment}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
