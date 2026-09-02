//! Ranking the palette against what has been typed.
//!
//! Fuzzy matching is `nucleo`, the matcher behind Helix's picker — the same
//! subsequence scoring a developer already has in their fingers. Everything
//! around it is here: what happens with an empty query, how ties break, and
//! how recently-used commands rise.
//!
//! Determinism is the property worth protecting. A list that reorders between
//! two identical queries makes the bar unusable by muscle memory, because the
//! row under the cursor is not the row that was there a moment ago. So every
//! comparison ends in a total order.

use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};

use crate::palette::Entry;
use crate::recents::Recents;

/// A ranked row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hit<'a> {
    pub entry: &'a Entry,
    pub score: u32,
}

/// How much a recent command outranks one never used.
///
/// Additive rather than multiplicative: a multiplier would let a stale
/// favourite beat an exact match on a different row, which is the failure mode
/// where the bar stops feeling like it is listening. The whole recents list is
/// worth less than a couple of matched characters.
const RECENCY_BONUS: u32 = 24;

fn recency_boost(rank: Option<usize>, depth: usize) -> u32 {
    match rank {
        // The most recent gets the full bonus, tapering to nothing.
        Some(rank) if rank < depth => {
            let remaining = (depth - rank) as u32;
            RECENCY_BONUS * remaining / depth as u32
        }
        _ => 0,
    }
}

/// Rank `entries` for `query`, best first.
///
/// An empty query is not a special case that shows nothing — it is the state
/// the bar opens in, so it lists everything, ordered by recency and then by
/// the registry's own priority.
pub fn rank<'a>(entries: &'a [Entry], query: &str, recents: &Recents) -> Vec<Hit<'a>> {
    let query = query.trim();
    let depth = recents.len().max(1);

    let mut hits: Vec<Hit<'a>> = if query.is_empty() {
        entries
            .iter()
            .map(|entry| Hit {
                entry,
                score: recency_boost(recents.rank(&entry.key()), depth),
            })
            .collect()
    } else {
        let mut matcher = Matcher::new(Config::DEFAULT);
        let pattern = Pattern::parse(query, CaseMatching::Ignore, Normalization::Smart);
        let mut buffer = Vec::new();

        entries
            .iter()
            .filter_map(|entry| {
                let haystack = Utf32Str::new(&entry.haystack, &mut buffer);
                pattern.score(haystack, &mut matcher).map(|score| Hit {
                    entry,
                    score: score + recency_boost(recents.rank(&entry.key()), depth),
                })
            })
            .collect()
    };

    // Score first, then the registry's category order, then the label. The
    // last is what makes the order total: two rows that tie on everything else
    // still have exactly one arrangement, so the list cannot shuffle.
    hits.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.entry.category.cmp(&b.entry.category))
            .then_with(|| a.entry.label.cmp(&b.entry.label))
    });
    hits
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action;
    use crate::palette::{self, Context};
    use dl_core::{AppId, AppRef, DockEntry, DockWindow, PinnedApp, WindowId};

    fn app(id: &str, name: &str) -> PinnedApp {
        PinnedApp {
            id: AppId::new(id),
            display_name: name.into(),
            app_ref: AppRef::executable(format!(r"C:\{id}.exe")),
            icon_key: None,
            always_float: false,
        }
    }

    fn installed() -> Vec<PinnedApp> {
        vec![
            app("chrome", "Chrome"),
            app("slack", "Slack"),
            app("code", "VS Code"),
            app("postman", "Postman"),
        ]
    }

    fn palette(installed: &[PinnedApp], dock: &[DockEntry]) -> Vec<Entry> {
        palette::build(&Context {
            installed,
            dock,
            taskbar_hidden: false,
        })
    }

    fn labels(hits: &[Hit<'_>]) -> Vec<String> {
        hits.iter().map(|h| h.entry.label.clone()).collect()
    }

    #[test]
    fn an_empty_query_lists_everything_rather_than_nothing() {
        // It is the state the bar opens in. Showing nothing until a key is
        // pressed hides the answer to "what can this do?".
        let apps = installed();
        let entries = palette(&apps, &[]);
        let hits = rank(&entries, "", &Recents::default());
        assert_eq!(hits.len(), entries.len());
    }

    #[test]
    fn a_query_matches_a_subsequence_the_way_a_fuzzy_picker_should() {
        let apps = installed();
        let entries = palette(&apps, &[]);
        let hits = rank(&entries, "vsc", &Recents::default());
        assert_eq!(hits.first().expect("a hit").entry.label, "Open VS Code");
    }

    #[test]
    fn a_query_matching_nothing_returns_nothing_rather_than_the_whole_list() {
        // Falling back to everything would make Enter run an unrelated command
        // that happened to sort first.
        let apps = installed();
        let entries = palette(&apps, &[]);
        assert!(rank(&entries, "zzzzqqq", &Recents::default()).is_empty());
    }

    #[test]
    fn the_order_is_identical_for_two_identical_queries() {
        // Muscle memory depends on it: the second row must still be the second
        // row when the same thing is typed again.
        let apps = installed();
        let entries = palette(&apps, &[]);
        let recents = Recents::default();
        assert_eq!(
            labels(&rank(&entries, "o", &recents)),
            labels(&rank(&entries, "o", &recents))
        );
    }

    #[test]
    fn a_recently_used_command_rises_among_rows_that_match_equally() {
        let apps = installed();
        let entries = palette(&apps, &[]);

        let cold = rank(&entries, "", &Recents::default());
        let first_cold = cold[0].entry.key();

        let mut recents = Recents::default();
        recents.record("app.open:postman");
        let warm = rank(&entries, "", &recents);

        assert_eq!(warm[0].entry.key(), "app.open:postman");
        assert_ne!(warm[0].entry.key(), first_cold);
    }

    #[test]
    fn recency_never_outranks_a_much_better_match() {
        // The failure mode this guards is the bar ignoring what was typed
        // because something else was used yesterday.
        let apps = installed();
        let entries = palette(&apps, &[]);
        let mut recents = Recents::default();
        recents.record("app.open:postman");

        let hits = rank(&entries, "chrome", &recents);
        assert_eq!(hits[0].entry.label, "Open Chrome");
    }

    #[test]
    fn a_window_is_findable_by_its_title() {
        let dock = vec![DockEntry {
            app: Some(AppId::new("chrome")),
            display_name: "Chrome".into(),
            pinned: true,
            windows: vec![DockWindow {
                id: WindowId(4),
                title: "Quarterly review — Google Docs".into(),
                minimized: false,
            }],
            active: false,
        }];
        let entries = palette(&[], &dock);
        let hits = rank(&entries, "quarterly", &Recents::default());
        assert_eq!(
            hits.first().expect("a hit").entry.label,
            "Focus Quarterly review — Google Docs"
        );
    }

    #[test]
    fn applications_come_first_when_scores_tie() {
        // A command bar is opened to reach an application far more often than
        // to reach a setting, so that is the tie-break the registry declares.
        assert!(action::Category::Application < action::Category::Shell);
    }
}
