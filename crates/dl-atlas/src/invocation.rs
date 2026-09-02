//! An action plus its argument, and the string form that survives a round trip
//! through the UI and the recents file.
//!
//! The command bar does not hand a palette index back to Rust. It hands back a
//! key, and the key is re-parsed and re-validated against the registry — so a
//! stale key from a palette built before an application closed fails as a
//! missing window rather than running whatever now sits at that index.

use dl_core::{AppId, WindowId};
use serde::Serialize;

use crate::action::{self, Action, ActionId, ParamKind};
use crate::AtlasError;

/// A bound argument. One variant per [`ParamKind`], and the pairing is checked
/// on the way in — that is what "typed registry" buys.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Arg {
    App(AppId),
    Window(WindowId),
    Flag(bool),
}

impl Arg {
    pub fn kind(&self) -> ParamKind {
        match self {
            Arg::App(_) => ParamKind::App,
            Arg::Window(_) => ParamKind::Window,
            Arg::Flag(_) => ParamKind::Flag,
        }
    }

    fn encode(&self) -> String {
        match self {
            Arg::App(app) => app.as_str().to_string(),
            Arg::Window(w) => w.0.to_string(),
            Arg::Flag(true) => "on".into(),
            Arg::Flag(false) => "off".into(),
        }
    }

    fn decode(kind: ParamKind, raw: &str) -> Result<Self, AtlasError> {
        match kind {
            ParamKind::App => Ok(Arg::App(AppId::new(raw))),
            ParamKind::Window => raw
                .parse::<u64>()
                .map(|id| Arg::Window(WindowId(id)))
                .map_err(|_| AtlasError::BadArgument {
                    expected: "a window id",
                    got: raw.to_string(),
                }),
            ParamKind::Flag => match raw {
                "on" => Ok(Arg::Flag(true)),
                "off" => Ok(Arg::Flag(false)),
                other => Err(AtlasError::BadArgument {
                    expected: "on or off",
                    got: other.to_string(),
                }),
            },
        }
    }
}

/// One action, ready to run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Invocation {
    pub action: ActionId,
    pub arg: Option<Arg>,
}

/// Separates the action id from its argument. Not a character any action id or
/// flag uses, and the split is on the **first** one only, so an application id
/// containing a colon still round-trips.
const SEPARATOR: char = ':';

impl Invocation {
    pub fn bare(action: ActionId) -> Self {
        Self { action, arg: None }
    }

    pub fn with(action: ActionId, arg: Arg) -> Self {
        Self {
            action,
            arg: Some(arg),
        }
    }

    /// The stable string the UI passes back and the recents file stores.
    pub fn key(&self) -> String {
        match &self.arg {
            Some(arg) => format!("{}{SEPARATOR}{}", self.action, arg.encode()),
            None => self.action.to_string(),
        }
    }

    /// Parse a key, checking it against the registry.
    ///
    /// Rejects an unknown action, an argument on an action that takes none,
    /// and a missing argument on one that requires it. All three are reachable
    /// from a stale palette or, later, from a model that invented a call.
    pub fn parse(key: &str) -> Result<Self, AtlasError> {
        let (id, raw) = match key.split_once(SEPARATOR) {
            Some((id, raw)) => (id, Some(raw)),
            None => (key, None),
        };

        let action = action::ACTIONS
            .iter()
            .find(|a| a.id.as_str() == id)
            .ok_or_else(|| AtlasError::UnknownAction(id.to_string()))?;

        match (action.param(), raw) {
            (None, None) => Ok(Self::bare(action.id)),
            (Some(param), Some(raw)) => Ok(Self::with(action.id, Arg::decode(param.kind, raw)?)),
            (Some(param), None) => Err(AtlasError::MissingArgument {
                action: action.id,
                param: param.name,
            }),
            (None, Some(_)) => Err(AtlasError::UnexpectedArgument { action: action.id }),
        }
    }

    /// The registry entry this invocation names.
    pub fn action(&self) -> &'static Action {
        action::find(self.action).expect("an Invocation is only built from the registry")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action::{APP_OPEN, LAYOUT_RETILE, TASKBAR_REPLACE, WINDOW_FOCUS};

    fn round_trip(invocation: Invocation) {
        let key = invocation.key();
        assert_eq!(
            Invocation::parse(&key).expect("parses"),
            invocation,
            "key was {key}"
        );
    }

    #[test]
    fn every_shape_of_invocation_survives_a_round_trip() {
        round_trip(Invocation::bare(LAYOUT_RETILE));
        round_trip(Invocation::with(APP_OPEN, Arg::App(AppId::new("chrome"))));
        round_trip(Invocation::with(
            WINDOW_FOCUS,
            Arg::Window(WindowId(918273)),
        ));
        round_trip(Invocation::with(TASKBAR_REPLACE, Arg::Flag(true)));
        round_trip(Invocation::with(TASKBAR_REPLACE, Arg::Flag(false)));
    }

    #[test]
    fn an_application_id_containing_a_colon_still_round_trips() {
        // Nothing in the catalog has one today, but the key is split on the
        // first separator precisely so that stays true if one arrives.
        round_trip(Invocation::with(
            APP_OPEN,
            Arg::App(AppId::new("vendor:app")),
        ));
    }

    #[test]
    fn an_unknown_action_is_refused_rather_than_ignored() {
        // Reachable from a model in phase 09, and from a key held across an
        // upgrade that renamed an action.
        let err = Invocation::parse("app.teleport:chrome").expect_err("unknown");
        assert!(matches!(err, AtlasError::UnknownAction(id) if id == "app.teleport"));
    }

    #[test]
    fn a_missing_argument_names_the_parameter_it_wants() {
        let err = Invocation::parse("app.open").expect_err("missing");
        assert!(
            matches!(err, AtlasError::MissingArgument { param, .. } if param == "app"),
            "{err:?}"
        );
    }

    #[test]
    fn an_argument_to_an_action_that_takes_none_is_refused() {
        // Silently dropping it would run a different command than was asked
        // for — "re-tile, but only display 2" would quietly re-tile everything.
        let err = Invocation::parse("layout.retile:display2").expect_err("unexpected");
        assert!(
            matches!(err, AtlasError::UnexpectedArgument { .. }),
            "{err:?}"
        );
    }

    #[test]
    fn a_window_id_that_is_not_a_number_is_refused() {
        let err = Invocation::parse("window.focus:chrome").expect_err("bad id");
        assert!(matches!(err, AtlasError::BadArgument { .. }), "{err:?}");
    }

    #[test]
    fn a_flag_takes_on_or_off_and_nothing_else() {
        assert!(Invocation::parse("taskbar.replace:maybe").is_err());
        assert!(Invocation::parse("taskbar.replace:true").is_err());
        assert!(Invocation::parse("taskbar.replace:on").is_ok());
    }
}
