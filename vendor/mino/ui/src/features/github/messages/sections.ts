/**
 * User-facing copy for the GitHub pane's four sections.
 *
 * Kept out of the components so the strings stay shallow and a future
 * translation pass has one file to reach for.
 *
 * The absence sentences are the important ones here. Three of the probe's four
 * answers are quiet states rather than failures, and each has to say what is
 * missing *and* what the reader can do about it - "install gh", "run
 * `gh auth login`", "this remote is not a GitHub one". A view that only said
 * "unavailable" would leave three very different situations looking the same.
 * `gh`'s own sentence is appended to these by Rust, so it is not repeated here.
 */
export const GITHUB_COPY = {
  title: "GitHub",

  loadingTitle: "Looking for a GitHub repository…",

  absentTitle: "The GitHub CLI is not installed",
  unauthenticatedTitle: "Not signed in to GitHub",
  unsupportedTitle: "No GitHub repository here",
  failedTitle: "GitHub could not be reached",
  notConnectedTitle: "No folder is open",
  notConnectedBody: "Open a folder to see its checks, pull requests and issues.",

  /** The header action, and the one call every section shares. */
  refresh: "Refresh",
  refreshHint:
    "Ask GitHub again. Nothing here polls on a timer - a workbench that quietly made network calls forever would be a surprise, and the rate limit is somebody's account budget.",

  errorTitle: "That did not work",

  /** Shown beside the repository name in the pane header. */
  openRepository: "Open on github.com",
} as const;

export const CHECKS_COPY = {
  heading: "Checks",
  show: "Show the latest run",
  hide: "Hide the latest run",
  loading: "Reading the latest run…",
  empty: "No workflow run for this branch yet.",
  noBranch: "There is no branch checked out, so there is no run to look at.",
  /** Named because a red dot on its own is not something to act on. */
  failingJobs: "Failing jobs",
  jobsLoading: "Reading the jobs…",
  viewRun: "Open this run on github.com",
} as const;

export const PULL_REQUESTS_COPY = {
  heading: "Pull requests",
  show: "Show open pull requests",
  hide: "Hide open pull requests",
  loading: "Reading open pull requests…",
  empty: "No open pull requests.",
  draft: "Draft",
  by: (author: string) => (author === "" ? "by a deleted account" : `by ${author}`),
  into: (base: string) => `into ${base}`,
  open: "Open this pull request on github.com",
  detailLoading: "Reading the description…",
  noBody: "This pull request has no description.",
  collapseDetail: "Close the description",
} as const;

export const ISSUES_COPY = {
  heading: "Issues",
  show: "Show open issues",
  hide: "Hide open issues",
  loading: "Reading open issues…",
  empty: "No open issues.",
  open: "Open this issue on github.com",
} as const;

export const NEW_PR_COPY = {
  heading: "New pull request",
  show: "Show the new pull request form",
  hide: "Hide the new pull request form",

  titleLabel: "Title",
  titlePlaceholder: "What this changes",
  bodyLabel: "Description",
  bodyPlaceholder: "Optional. Markdown, exactly as GitHub takes it.",
  baseLabel: "Base branch",
  draftLabel: "Open as a draft",
  draftHint: "A draft cannot be merged until it is marked ready.",

  submit: "Create pull request",
  creating: "Creating…",

  /** The confirmation. It shows what will be made, not just that something will. */
  confirmTitle: "Create this pull request?",
  confirmBody:
    "This is public the moment it lands, and everybody watching the repository will see it.",
  confirmFrom: (head: string, base: string) => `${head} → ${base}`,
  confirmDraft: "As a draft",
  confirmReady: "Ready for review",
  confirmYes: "Create it",
  confirmNo: "Cancel",

  created: "Pull request created",
  openCreated: "Open it on github.com",
} as const;

/** One phrase per check state. A colour alone is not something a reader can hear. */
export const CHECK_STATE_LABELS = {
  pending: "Queued",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
  unknown: "No checks",
} as const;

/** The viewer header command, #19. */
export const OPEN_ON_GITHUB_COPY = {
  label: "GitHub",
  hint: "Open this file on github.com at the line the cursor is on",
  opening: "Opening…",
  failedTitle: "Could not open this file on github.com",
} as const;
