//! What was run lately, most recent first.
//!
//! Pure and bounded. It holds invocation keys rather than action ids, so
//! "Open Chrome" rises without dragging "Open Postman" up with it — the
//! argument is the part the user repeats.

use serde::{Deserialize, Serialize};

/// How many are kept.
///
/// Long enough to cover a working day's habits, short enough that the tail
/// carries no weight worth persisting. The boost tapers to nothing across the
/// list, so a longer one would mostly store zeroes.
pub const CAPACITY: usize = 24;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Recents {
    keys: Vec<String>,
}

impl Recents {
    pub fn new(keys: Vec<String>) -> Self {
        let mut recents = Self::default();
        // Rebuilt through `record` so a hand-edited or outdated file cannot
        // introduce duplicates or exceed the cap.
        for key in keys.into_iter().rev() {
            recents.record(key);
        }
        recents
    }

    pub fn keys(&self) -> &[String] {
        &self.keys
    }

    pub fn len(&self) -> usize {
        self.keys.len()
    }

    pub fn is_empty(&self) -> bool {
        self.keys.is_empty()
    }

    /// Position of `key`, 0 being the most recent.
    pub fn rank(&self, key: &str) -> Option<usize> {
        self.keys.iter().position(|k| k == key)
    }

    /// Move `key` to the front, dropping the oldest if that overflows.
    pub fn record(&mut self, key: impl Into<String>) {
        let key = key.into();
        self.keys.retain(|k| k != &key);
        self.keys.insert(0, key);
        self.keys.truncate(CAPACITY);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn running_the_same_command_twice_does_not_store_it_twice() {
        // A duplicate would push a genuinely different command off the end and
        // occupy two rows' worth of ranking.
        let mut recents = Recents::default();
        recents.record("app.open:chrome");
        recents.record("app.open:slack");
        recents.record("app.open:chrome");

        assert_eq!(recents.keys(), ["app.open:chrome", "app.open:slack"]);
        assert_eq!(recents.rank("app.open:chrome"), Some(0));
    }

    #[test]
    fn the_list_is_capped_and_drops_the_oldest() {
        let mut recents = Recents::default();
        for i in 0..CAPACITY + 10 {
            recents.record(format!("app.open:{i}"));
        }
        assert_eq!(recents.len(), CAPACITY);
        assert_eq!(recents.rank("app.open:0"), None);
        assert_eq!(recents.rank(&format!("app.open:{}", CAPACITY + 9)), Some(0));
    }

    #[test]
    fn a_stored_list_is_rebuilt_through_the_same_rules_that_wrote_it() {
        // The file is plain text a user can edit. Duplicates and an overlong
        // list are both reachable, and neither should survive loading.
        let stored = vec![
            "app.open:chrome".to_string(),
            "app.open:slack".to_string(),
            "app.open:chrome".to_string(),
        ];
        let recents = Recents::new(stored);
        assert_eq!(recents.keys(), ["app.open:chrome", "app.open:slack"]);
    }

    #[test]
    fn an_argument_is_part_of_what_is_remembered() {
        // Otherwise opening Chrome would raise every application equally,
        // which is the same as remembering nothing.
        let mut recents = Recents::default();
        recents.record("app.open:chrome");
        assert_eq!(recents.rank("app.open:chrome"), Some(0));
        assert_eq!(recents.rank("app.open:postman"), None);
    }
}
