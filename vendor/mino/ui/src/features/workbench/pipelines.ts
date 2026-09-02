/**
 * Nushell pipelines the UI sends through `runStructured`.
 *
 * SECURITY: pipeline text is fixed program text that ships with the app. Path
 * and filename values are passed in `params` and read inside the pipeline as
 * `$env.MINO_<KEY>`, so a filename containing `; rm -rf /` is data, never
 * syntax. Never build one of these strings by interpolation.
 *
 * The listing pipeline is not here on purpose: the tree's listing runs inside
 * `Transport::list_dir` in Rust, where the same rules apply.
 */
export const NU_PIPELINES = {
  /** Splits a path using the target's own rules, not the browser's. */
  pathSplit: "$env.MINO_PATH | path split | to json",
} as const;

export const NU_PARAM_PATH = "PATH";
