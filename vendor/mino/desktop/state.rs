//! The one transport the window is currently talking to.
//!
//! Commands never construct a transport themselves; they take it from here,
//! which is what keeps transport selection in `mino_core::transport_for`.

use std::sync::{Arc, RwLock};

use mino_core::types::ConnectionTarget;
use mino_core::{Transport, TransportError};

#[derive(Default)]
pub struct AppState {
    transport: RwLock<Option<Arc<dyn Transport>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Picks the implementation for `target` and makes it current. Any
    /// transport already in place is torn down by the caller first.
    pub fn select(&self, target: &ConnectionTarget) -> Result<Arc<dyn Transport>, TransportError> {
        let transport = mino_core::transport_for(target);
        let mut slot = self
            .transport
            .write()
            .map_err(|_| TransportError::io("the transport lock was poisoned"))?;
        *slot = Some(Arc::clone(&transport));
        Ok(transport)
    }

    pub fn current(&self) -> Result<Arc<dyn Transport>, TransportError> {
        self.transport
            .read()
            .map_err(|_| TransportError::io("the transport lock was poisoned"))?
            .clone()
            .ok_or(TransportError::NotConnected)
    }

    /// Best-effort read used during teardown, where "not connected" is normal.
    pub fn take(&self) -> Option<Arc<dyn Transport>> {
        let mut slot = self.transport.write().ok()?;
        slot.take()
    }
}
