//! Window thumbnails.
//!
//! The DWM thumbnail API (`DwmRegisterThumbnail`) is cheaper and gives a live
//! preview, but it composites into an `HWND` rectangle that draws *above* the
//! webview — no border radius, no glow, nothing the Atlas treatment can touch,
//! and fighting its z-order against a WebView2 surface is a losing game.
//!
//! `PrintWindow` costs a capture per request, but the result is an ordinary
//! image inside the DOM. Captures happen on hover rather than continuously, so
//! the cost is paid only when a preview is actually being looked at.

use dl_platform::{PlatformError, Result};
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

/// Include layered and DirectComposition content.
///
/// Without this, Chrome, VS Code and every other GPU-composited application
/// captures as a blank rectangle — which is most of the dock.
const PW_RENDERFULLCONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(0x0000_0002);

/// Longest edge of a captured thumbnail. Larger costs capture time for detail
/// nobody reads at preview size.
const MAX_EDGE: i32 = 320;

/// Capture a window as PNG bytes.
pub fn capture_window(hwnd: HWND) -> Result<Vec<u8>> {
    let mut rect = windows::Win32::Foundation::RECT::default();
    // SAFETY: writing into a local RECT.
    unsafe { GetWindowRect(hwnd, &mut rect) }
        .map_err(|e| PlatformError::Shell(format!("GetWindowRect: {e}")))?;

    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;

    if width <= 0 || height <= 0 {
        // A minimised window has degenerate bounds; there is nothing to show.
        return Err(PlatformError::Shell("window has no visible area".into()));
    }

    // SAFETY: the DCs and bitmap below are released on every path.
    unsafe {
        let screen_dc = GetDC(None);
        let memory_dc = CreateCompatibleDC(Some(screen_dc));
        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        let previous = SelectObject(memory_dc, bitmap.into());

        let captured = PrintWindow(hwnd, memory_dc, PW_RENDERFULLCONTENT).as_bool();

        let pixels = if captured {
            read_pixels(memory_dc, bitmap, width, height)
        } else {
            None
        };

        SelectObject(memory_dc, previous);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(memory_dc);
        ReleaseDC(None, screen_dc);

        match pixels {
            Some(rgba) => Ok(downscale_to_png(width, height, rgba)),
            None => Err(PlatformError::Shell(
                "PrintWindow produced no image; the window may be suspended".into(),
            )),
        }
    }
}

/// Copy a bitmap's pixels out as RGBA.
///
/// # Safety
/// `bitmap` must be selected into `dc`, and both must outlive the call.
unsafe fn read_pixels(
    dc: windows::Win32::Graphics::Gdi::HDC,
    bitmap: windows::Win32::Graphics::Gdi::HBITMAP,
    width: i32,
    height: i32,
) -> Option<Vec<u8>> {
    let mut pixels = vec![0u8; (width * height * 4) as usize];

    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            // Negative height requests a top-down DIB, matching PNG row order.
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    let copied = GetDIBits(
        dc,
        bitmap,
        0,
        height as u32,
        Some(pixels.as_mut_ptr() as *mut _),
        &mut info,
        DIB_RGB_COLORS,
    );

    if copied == 0 {
        return None;
    }

    // GDI hands back BGRA and leaves alpha at zero for opaque windows, which
    // would render the whole thumbnail invisible.
    for chunk in pixels.chunks_exact_mut(4) {
        chunk.swap(0, 2);
        chunk[3] = 255;
    }

    Some(pixels)
}

/// Reduce to at most [`MAX_EDGE`] and encode.
///
/// Nearest-neighbour: a thumbnail is looked at for a second, and a box filter
/// would cost more per hover than the extra quality is worth at this size.
fn downscale_to_png(width: i32, height: i32, rgba: Vec<u8>) -> Vec<u8> {
    let scale = (MAX_EDGE as f32 / width.max(height) as f32).min(1.0);
    let target_w = ((width as f32 * scale) as i32).max(1);
    let target_h = ((height as f32 * scale) as i32).max(1);

    if target_w == width && target_h == height {
        return encode_png(width as u32, height as u32, &rgba);
    }

    let mut scaled = vec![0u8; (target_w * target_h * 4) as usize];

    for y in 0..target_h {
        let source_y = (y as f32 / scale) as i32;
        for x in 0..target_w {
            let source_x = (x as f32 / scale) as i32;
            let source = ((source_y * width + source_x) * 4) as usize;
            let target = ((y * target_w + x) * 4) as usize;

            if source + 4 <= rgba.len() {
                scaled[target..target + 4].copy_from_slice(&rgba[source..source + 4]);
            }
        }
    }

    encode_png(target_w as u32, target_h as u32, &scaled)
}

fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        if let Ok(mut writer) = encoder.write_header() {
            let _ = writer.write_image_data(rgba);
        }
    }
    out
}
