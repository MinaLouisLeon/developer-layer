//! Validating the configured accelerators before anything tries to register
//! them.
//!
//! Registration itself belongs to the platform — the global-shortcut plugin
//! does it, and on macOS something else will. What belongs here is the policy:
//! which accelerators are *allowed*, which is a decision, not an OS call.
//!
//! One rule earns this module on its own. A hotkey with no modifier registers
//! successfully and then swallows that key across the entire desktop: bind the
//! command bar to `Space` and no application on the machine can type a space
//! again until Developer Layer exits. The OS reports no error, so nothing
//! downstream can catch it. It has to be refused here.

use std::fmt;

use crate::AtlasError;

/// Modifiers, in the order they are written back out. Fixed so two spellings
/// of the same combination compare equal.
const MODIFIERS: &[(&str, &str)] = &[
    ("ctrl", "Ctrl"),
    ("control", "Ctrl"),
    ("alt", "Alt"),
    ("option", "Alt"),
    ("shift", "Shift"),
    ("super", "Super"),
    ("meta", "Super"),
    ("win", "Super"),
    ("cmd", "Super"),
    ("command", "Super"),
];

const CANONICAL_ORDER: &[&str] = &["Ctrl", "Alt", "Shift", "Super"];

/// A validated accelerator.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hotkey {
    modifiers: Vec<&'static str>,
    key: String,
}

impl Hotkey {
    /// The canonical form, which is what gets registered and what a settings
    /// screen should display.
    pub fn accelerator(&self) -> String {
        self.to_string()
    }

    pub fn key(&self) -> &str {
        &self.key
    }

    pub fn modifiers(&self) -> &[&'static str] {
        &self.modifiers
    }
}

impl fmt::Display for Hotkey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut parts: Vec<&str> = self.modifiers.clone();
        parts.push(&self.key);
        f.write_str(&parts.join("+"))
    }
}

/// Parse an accelerator such as `Ctrl+Alt+Shift+T`.
pub fn parse(input: &str) -> Result<Hotkey, AtlasError> {
    let raw = input.trim();
    if raw.is_empty() {
        return Err(AtlasError::EmptyHotkey);
    }

    let mut modifiers: Vec<&'static str> = Vec::new();
    let mut key: Option<String> = None;

    for part in raw.split('+').map(str::trim).filter(|p| !p.is_empty()) {
        let lower = part.to_ascii_lowercase();
        match MODIFIERS.iter().find(|(name, _)| *name == lower) {
            Some((_, canonical)) => {
                if !modifiers.contains(canonical) {
                    modifiers.push(canonical);
                }
            }
            // Everything that is not a modifier is the key, and there can only
            // be one — `Ctrl+A+B` is a typo, not a chord.
            None if key.is_none() => key = Some(canonical_key(part)),
            None => {
                return Err(AtlasError::HotkeyHasTwoKeys {
                    hotkey: raw.to_string(),
                })
            }
        }
    }

    let key = key.ok_or_else(|| AtlasError::HotkeyHasNoKey {
        hotkey: raw.to_string(),
    })?;

    if modifiers.is_empty() {
        return Err(AtlasError::HotkeyHasNoModifier {
            hotkey: raw.to_string(),
        });
    }

    modifiers.sort_by_key(|m| {
        CANONICAL_ORDER
            .iter()
            .position(|c| c == m)
            .unwrap_or(usize::MAX)
    });

    Ok(Hotkey { modifiers, key })
}

/// Normalise a key name to one spelling: first character upper, rest lower.
///
/// `space`, `Space` and `SPACE` are one hotkey, and so are `PageUp` and
/// `pageup` — the config file is hand-edited, so both spellings turn up. The
/// registrar parses case-insensitively (see the accelerator test in
/// `apps/desktop`), so any consistent form registers; this one also reads
/// correctly in a settings screen.
fn canonical_key(key: &str) -> String {
    let mut chars = key.chars();
    match chars.next() {
        Some(first) => {
            first.to_ascii_uppercase().to_string() + &chars.as_str().to_ascii_lowercase()
        }
        None => String::new(),
    }
}

/// Every hotkey Developer Layer registers, checked together.
///
/// Together because the interesting failure is the set: two hotkeys on one
/// combination register in order and the second silently loses, so whichever
/// the user needs more is the one that stops working — and the taskbar restore
/// hotkey must never be the loser, since it is one of the four routes back
/// from a hidden shell.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hotkeys {
    pub command_bar: Hotkey,
    pub restore_taskbar: Hotkey,
    /// Held to speak, rather than pressed. That changes what makes a *good*
    /// binding — see [`parse_all`] — but not what makes a valid one.
    pub push_to_talk: Hotkey,
}

pub fn parse_all(
    command_bar: &str,
    restore_taskbar: &str,
    push_to_talk: &str,
) -> Result<Hotkeys, AtlasError> {
    let command_bar = parse(command_bar)?;
    let restore_taskbar = parse(restore_taskbar)?;
    let push_to_talk = parse(push_to_talk)?;

    // Pairwise rather than by sorting: three is few enough that the loop is
    // the clearer statement, and it stays correct when a fourth is added.
    let all = [
        (&command_bar, "the command bar"),
        (&restore_taskbar, "the taskbar restore"),
        (&push_to_talk, "push-to-talk"),
    ];
    for (i, (a, _)) in all.iter().enumerate() {
        for (b, _) in all.iter().skip(i + 1) {
            if a == b {
                return Err(AtlasError::HotkeyCollision {
                    hotkey: a.to_string(),
                });
            }
        }
    }

    Ok(Hotkeys {
        command_bar,
        restore_taskbar,
        push_to_talk,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hotkey_with_no_modifier_is_refused() {
        // It registers successfully and then swallows that key across the
        // whole desktop. The OS reports nothing, so this is the only place it
        // can be caught.
        let err = parse("Space").expect_err("no modifier");
        assert!(
            matches!(err, AtlasError::HotkeyHasNoModifier { .. }),
            "{err:?}"
        );
        assert!(parse("F5").is_err());
    }

    #[test]
    fn modifiers_alone_are_refused() {
        let err = parse("Ctrl+Alt").expect_err("no key");
        assert!(matches!(err, AtlasError::HotkeyHasNoKey { .. }), "{err:?}");
    }

    #[test]
    fn two_keys_are_a_typo_rather_than_a_chord() {
        assert!(matches!(
            parse("Ctrl+A+B").expect_err("two keys"),
            AtlasError::HotkeyHasTwoKeys { .. }
        ));
    }

    #[test]
    fn spelling_and_order_do_not_change_which_hotkey_it_is() {
        // The config file is hand-editable, so `alt + ctrl + t` and
        // `Ctrl+Alt+T` have to be the same hotkey — otherwise the collision
        // check below can be walked straight past.
        let a = parse("Ctrl+Alt+T").expect("a");
        let b = parse("alt + control + t").expect("b");
        assert_eq!(a, b);
        assert_eq!(a.accelerator(), "Ctrl+Alt+T");
    }

    #[test]
    fn every_windows_spelling_of_the_meta_key_is_the_same_modifier() {
        for spelling in ["Win+K", "Super+K", "Meta+K", "Cmd+K", "Command+K"] {
            assert_eq!(parse(spelling).expect(spelling).modifiers(), ["Super"]);
        }
    }

    #[test]
    fn one_spelling_of_a_key_name_wins_whatever_the_file_says() {
        // Both turn up in a hand-edited config, and they have to compare equal
        // or the collision check below can be walked straight past.
        assert_eq!(
            parse("Ctrl+PageUp").expect("a"),
            parse("ctrl+pageup").expect("b")
        );
        assert_eq!(parse("Alt+space").expect("c").key(), "Space");
    }

    #[test]
    fn a_repeated_modifier_is_not_counted_twice() {
        let hotkey = parse("Ctrl+Control+T").expect("hotkey");
        assert_eq!(hotkey.modifiers(), ["Ctrl"]);
    }

    #[test]
    fn the_defaults_that_ship_in_the_config_are_valid() {
        // The one test that would have caught shipping a default nothing can
        // register.
        let config = dl_core::AtlasConfig::default();
        let general = dl_core::GeneralConfig::default();
        let hotkeys = parse_all(
            &config.command_bar_hotkey,
            &general.panic_restore_hotkey,
            &config.push_to_talk_hotkey,
        )
        .expect("the shipped defaults are valid and do not collide");

        assert_eq!(hotkeys.command_bar.accelerator(), "Alt+Space");
        assert_eq!(hotkeys.restore_taskbar.accelerator(), "Ctrl+Alt+Shift+T");
        assert_eq!(hotkeys.push_to_talk.accelerator(), "Ctrl+Alt+A");
    }

    #[test]
    fn two_hotkeys_on_one_combination_are_refused_rather_than_registered_in_order() {
        // The second registration silently loses, and the taskbar restore
        // hotkey must never be the one that loses — it is a route back from a
        // hidden shell.
        let err = parse_all("Ctrl+Alt+T", "alt+ctrl+t", "Ctrl+Alt+A").expect_err("collision");
        assert!(matches!(err, AtlasError::HotkeyCollision { .. }), "{err:?}");
    }

    #[test]
    fn a_collision_is_caught_between_any_two_of_them_not_just_the_first_pair() {
        // Checking only the first pair would let push-to-talk quietly take the
        // taskbar restore hotkey, which is the one that must always work.
        let err =
            parse_all("Alt+Space", "Ctrl+Alt+Shift+T", "ctrl+alt+shift+t").expect_err("collision");
        assert!(matches!(err, AtlasError::HotkeyCollision { .. }), "{err:?}");
    }

    #[test]
    fn an_empty_setting_says_so_rather_than_registering_nothing() {
        assert!(matches!(
            parse("   ").expect_err("empty"),
            AtlasError::EmptyHotkey
        ));
    }
}
