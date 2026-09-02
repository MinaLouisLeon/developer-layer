import { useGitHubContext } from "../context/GitHubContext";
import { useNewPullRequest } from "../hooks/useNewPullRequest";
import { NEW_PR_COPY } from "../messages";
import { CreatePrConfirm } from "./CreatePrConfirm";
import { ExternalLink } from "./ExternalLink";
import { Section } from "./Section";

const FIELD =
  "w-full rounded border border-border bg-surface px-1.5 py-1 text-xs text-text placeholder:text-textFaint focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-40";

/**
 * #16 - and the one part of this view that writes.
 *
 * Collapsed by default, and last in the pane, because creating a pull request
 * is something you do occasionally and reading checks is something you do all
 * day.
 *
 * The submit button **asks**; it does not create. Everything about the shape
 * of this component follows from that: the form's own submit opens
 * `CreatePrConfirm`, which shows the title, the branch pair and the draft
 * state, and only its confirm button sends anything. A pull request is public
 * the moment it lands, and a single accidental click should not be able to
 * make one.
 *
 * There is no field for the head branch. `gh` uses the branch that is checked
 * out, which is the one the author is looking at; a chooser here would be this
 * app deciding, from a value it read a moment ago, what git knows for certain
 * now.
 *
 * Presentational: every decision it renders comes from `useNewPullRequest`.
 */
export function NewPullRequest({ active }: { active: boolean }) {
  const form = useNewPullRequest(active);
  const { branch } = useGitHubContext();

  return (
    <Section
      heading={NEW_PR_COPY.heading}
      open={form.open}
      toggle={form.toggle}
      hint={form.open ? NEW_PR_COPY.hide : NEW_PR_COPY.show}
    >
      <form
        className="flex flex-col gap-1.5 px-2 pb-2 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          // Asks. Does not create. See the component doc.
          form.ask();
        }}
      >
        <label className="flex flex-col gap-0.5 text-xs text-textMuted">
          {NEW_PR_COPY.titleLabel}
          <input
            value={form.title}
            onChange={(event) => form.setTitle(event.target.value)}
            disabled={form.busy}
            placeholder={NEW_PR_COPY.titlePlaceholder}
            className={FIELD}
          />
        </label>

        <label className="flex flex-col gap-0.5 text-xs text-textMuted">
          {NEW_PR_COPY.bodyLabel}
          <textarea
            value={form.body}
            onChange={(event) => form.setBody(event.target.value)}
            disabled={form.busy}
            rows={4}
            placeholder={NEW_PR_COPY.bodyPlaceholder}
            className={`${FIELD} resize-y font-mono`}
          />
        </label>

        <label className="flex flex-col gap-0.5 text-xs text-textMuted">
          {NEW_PR_COPY.baseLabel}
          <input
            value={form.base}
            onChange={(event) => form.setBase(event.target.value)}
            disabled={form.busy}
            className={FIELD}
          />
        </label>

        <label
          className="flex items-center gap-1.5 text-xs text-textFaint"
          title={NEW_PR_COPY.draftHint}
        >
          <input
            type="checkbox"
            checked={form.draft}
            onChange={form.toggleDraft}
            disabled={form.busy}
          />
          {NEW_PR_COPY.draftLabel}
        </label>

        <button
          type="submit"
          disabled={form.busy || form.title.trim() === ""}
          className="self-start rounded border border-borderStrong px-1.5 py-1 text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-40"
        >
          {form.busy ? NEW_PR_COPY.creating : NEW_PR_COPY.submit}
        </button>
      </form>

      {form.error ? (
        <p className="px-2 pb-1 text-xs text-danger">{form.error}</p>
      ) : null}

      {/* The URL it made. A pull request whose address the author has to go
          and find is one this app only half opened. */}
      {form.created ? (
        <p className="flex items-center gap-1 px-2 pb-1 text-xs text-accent">
          <span>{NEW_PR_COPY.created}</span>
          <ExternalLink
            url={form.created.url}
            title={NEW_PR_COPY.openCreated}
          />
        </p>
      ) : null}

      <CreatePrConfirm form={form} head={branch} />
    </Section>
  );
}
