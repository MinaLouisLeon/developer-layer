//! Geometry primitives shared by the slot engine and the platform layer.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A rectangle in physical pixels, in virtual-desktop coordinates.
///
/// Windows places secondary monitors at negative coordinates, so `x` and `y`
/// are deliberately signed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl Rect {
    pub const fn new(x: i32, y: i32, width: i32, height: i32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    pub const fn right(&self) -> i32 {
        self.x + self.width
    }

    pub const fn bottom(&self) -> i32 {
        self.y + self.height
    }

    pub const fn area(&self) -> i64 {
        self.width as i64 * self.height as i64
    }

    pub fn is_empty(&self) -> bool {
        self.width <= 0 || self.height <= 0
    }

    /// Shrink on every side by `gap`. Used to apply the configured tile gap.
    pub fn inset(&self, gap: i32) -> Self {
        Self {
            x: self.x + gap,
            y: self.y + gap,
            width: (self.width - gap * 2).max(0),
            height: (self.height - gap * 2).max(0),
        }
    }

    /// Grow on every side by `by`. Used to compensate for the invisible
    /// resize border reported by `GetWindowRect` on Windows 10 and 11.
    pub fn outset(&self, by: i32) -> Self {
        Self {
            x: self.x - by,
            y: self.y - by,
            width: self.width + by * 2,
            height: self.height + by * 2,
        }
    }

    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.x && x < self.right() && y >= self.y && y < self.bottom()
    }

    pub fn intersects(&self, other: &Rect) -> bool {
        self.x < other.right()
            && other.x < self.right()
            && self.y < other.bottom()
            && other.y < self.bottom()
    }
}

/// A rectangle expressed as fractions (0.0..=1.0) of a monitor's work area.
///
/// Slots are stored normalised so a resolution or scaling change re-projects
/// the layout instead of invalidating it. This is why changing a monitor from
/// 1440p to 4K keeps your workspace intact.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct NormalizedRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl NormalizedRect {
    pub const FULL: Self = Self {
        x: 0.0,
        y: 0.0,
        width: 1.0,
        height: 1.0,
    };

    pub fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    /// Project onto a concrete work area, rounding to whole pixels.
    pub fn project(&self, work_area: &Rect) -> Rect {
        let w = work_area.width as f32;
        let h = work_area.height as f32;
        Rect {
            x: work_area.x + (self.x * w).round() as i32,
            y: work_area.y + (self.y * h).round() as i32,
            width: (self.width * w).round() as i32,
            height: (self.height * h).round() as i32,
        }
    }

    pub fn is_valid(&self) -> bool {
        self.width > 0.0
            && self.height > 0.0
            && self.x >= 0.0
            && self.y >= 0.0
            && self.x + self.width <= 1.0001
            && self.y + self.height <= 1.0001
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projects_onto_offset_work_area() {
        // A secondary monitor sitting to the left of primary, so negative x.
        let work_area = Rect::new(-1920, 0, 1920, 1040);
        let half = NormalizedRect::new(0.0, 0.0, 0.5, 1.0);

        let projected = half.project(&work_area);

        assert_eq!(projected, Rect::new(-1920, 0, 960, 1040));
    }

    #[test]
    fn projection_survives_resolution_change() {
        let slot = NormalizedRect::new(0.5, 0.0, 0.5, 1.0);

        let on_1440p = slot.project(&Rect::new(0, 0, 2560, 1400));
        let on_4k = slot.project(&Rect::new(0, 0, 3840, 2120));

        // Same relative position, different pixels — the layout is preserved.
        assert_eq!(on_1440p, Rect::new(1280, 0, 1280, 1400));
        assert_eq!(on_4k, Rect::new(1920, 0, 1920, 2120));
    }

    #[test]
    fn inset_never_produces_negative_dimensions() {
        let tiny = Rect::new(0, 0, 4, 4);
        assert_eq!(tiny.inset(10), Rect::new(10, 10, 0, 0));
    }

    #[test]
    fn rejects_out_of_bounds_normalized_rect() {
        assert!(NormalizedRect::new(0.6, 0.0, 0.5, 1.0)
            .is_valid()
            .eq(&false));
        assert!(NormalizedRect::FULL.is_valid());
    }
}
