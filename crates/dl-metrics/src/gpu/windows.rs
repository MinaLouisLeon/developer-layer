//! DXGI adapter enumeration and PDH utilisation counters.
//!
//! DXGI gives the adapter list — vendor, name, dedicated VRAM and LUID — which
//! is how the integrated and dedicated GPUs appear as separate devices rather
//! than one blurred figure.
//!
//! PDH supplies utilisation for every vendor. The counter instance names embed
//! the adapter LUID, e.g.
//! `pid_1234_luid_0x00000000_0x0000C4F5_phys_0_eng_0_engtype_3D`, which is the
//! join back to DXGI. This is the same mechanism Task Manager uses, and it is
//! the only vendor-neutral source of GPU load on Windows.

use dl_core::{GpuKind, GpuMetrics, GpuVendor};
use windows::core::PCWSTR;
use windows::Win32::Foundation::LUID;
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter1, IDXGIFactory1, DXGI_ADAPTER_FLAG,
    DXGI_ADAPTER_FLAG_SOFTWARE, DXGI_ERROR_NOT_FOUND,
};
use windows::Win32::System::Performance::{
    PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW,
    PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY,
};

/// One adapter as DXGI reported it.
#[derive(Debug, Clone)]
pub struct Adapter {
    pub name: String,
    pub vendor: GpuVendor,
    pub kind: GpuKind,
    pub luid: String,
    pub dedicated_vram: u64,
}

/// Total GPU utilisation across all engines, summed per adapter.
const ENGINE_UTILIZATION: &str = r"\GPU Engine(*)\Utilization Percentage";

pub fn enumerate() -> Option<Vec<Adapter>> {
    // SAFETY: CreateDXGIFactory1 returns a COM interface or an error; the
    // factory is dropped at the end of this scope.
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }.ok()?;
    let mut adapters = Vec::new();

    for index in 0.. {
        // SAFETY: EnumAdapters1 signals the end of the list with
        // DXGI_ERROR_NOT_FOUND rather than by faulting.
        let adapter: IDXGIAdapter1 = match unsafe { factory.EnumAdapters1(index) } {
            Ok(adapter) => adapter,
            Err(e) if e.code() == DXGI_ERROR_NOT_FOUND => break,
            Err(_) => break,
        };

        // SAFETY: GetDesc1 returns the description or an error; no out-param.
        let Ok(desc) = (unsafe { adapter.GetDesc1() }) else {
            continue;
        };

        // The Microsoft Basic Render Driver is a software fallback, not a GPU;
        // showing it would put a permanently idle device in the tile.
        if DXGI_ADAPTER_FLAG(desc.Flags as i32) == DXGI_ADAPTER_FLAG_SOFTWARE {
            continue;
        }

        let name = String::from_utf16_lossy(&desc.Description)
            .trim_end_matches('\0')
            .trim()
            .to_string();

        adapters.push(Adapter {
            name,
            vendor: GpuVendor::from_pci_id(desc.VendorId),
            // Dedicated VRAM is the practical discriminator: integrated
            // adapters share system memory and report little or none of it.
            kind: if desc.DedicatedVideoMemory > 128 * 1024 * 1024 {
                GpuKind::Discrete
            } else {
                GpuKind::Integrated
            },
            luid: format_luid(desc.AdapterLuid),
            dedicated_vram: desc.DedicatedVideoMemory as u64,
        });
    }

    Some(adapters)
}

/// Sample utilisation for the given adapters.
pub fn sample(adapters: &[Adapter]) -> Vec<GpuMetrics> {
    let utilisation = collect_engine_utilisation().unwrap_or_default();

    adapters
        .iter()
        .map(|adapter| {
            let mut metrics =
                GpuMetrics::new(&adapter.name, adapter.vendor, adapter.kind, &adapter.luid);

            metrics.utilization = utilisation
                .iter()
                .find(|(luid, _)| luid == &adapter.luid)
                .map(|(_, value)| *value);

            if adapter.dedicated_vram > 0 {
                metrics.vram_total_bytes = Some(adapter.dedicated_vram);
            }

            metrics
        })
        .collect()
}

/// Read `\GPU Engine(*)\Utilization Percentage` and sum per adapter LUID.
///
/// Every engine on a card — 3D, copy, video decode, video encode — reports
/// separately, and the sum is what Task Manager shows as one figure. Capped at
/// 1.0 because concurrent engines can total above 100%.
fn collect_engine_utilisation() -> Option<Vec<(String, f32)>> {
    let mut query = PDH_HQUERY::default();
    // SAFETY: writing a query handle into a local.
    if unsafe { PdhOpenQueryW(PCWSTR::null(), 0, &mut query) } != 0 {
        return None;
    }

    let path: Vec<u16> = ENGINE_UTILIZATION
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    let mut counter = PDH_HCOUNTER::default();
    // SAFETY: `path` is null-terminated UTF-16 and outlives the call.
    let added = unsafe { PdhAddEnglishCounterW(query, PCWSTR(path.as_ptr()), 0, &mut counter) };
    if added != 0 {
        // SAFETY: query came from PdhOpenQueryW.
        unsafe { PdhCloseQuery(query) };
        return None;
    }

    // Utilisation counters are deltas, so a single collection yields nothing.
    // Two are required, and the interval between them is the sampling window —
    // the caller's 1Hz loop supplies that on subsequent samples.
    // SAFETY: query is valid until PdhCloseQuery below.
    unsafe {
        PdhCollectQueryData(query);
        PdhCollectQueryData(query);
    }

    let mut buffer_size = 0u32;
    let mut item_count = 0u32;

    // SAFETY: a null buffer asks PDH for the required size.
    unsafe {
        PdhGetFormattedCounterArrayW(
            counter,
            PDH_FMT_DOUBLE,
            &mut buffer_size,
            &mut item_count,
            None,
        )
    };

    if buffer_size == 0 || item_count == 0 {
        // SAFETY: query came from PdhOpenQueryW.
        unsafe { PdhCloseQuery(query) };
        return None;
    }

    let mut buffer = vec![0u8; buffer_size as usize];
    // SAFETY: buffer is sized by the call above.
    let filled = unsafe {
        PdhGetFormattedCounterArrayW(
            counter,
            PDH_FMT_DOUBLE,
            &mut buffer_size,
            &mut item_count,
            Some(buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W),
        )
    };

    let mut totals: Vec<(String, f32)> = Vec::new();

    if filled == 0 {
        // SAFETY: PDH filled `item_count` items into the buffer.
        let items = unsafe {
            std::slice::from_raw_parts(
                buffer.as_ptr() as *const PDH_FMT_COUNTERVALUE_ITEM_W,
                item_count as usize,
            )
        };

        for item in items {
            // SAFETY: PDH owns this string for the lifetime of the buffer.
            let instance = unsafe { item.szName.to_string() }.unwrap_or_default();
            let Some(luid) = luid_from_instance(&instance) else {
                continue;
            };

            // SAFETY: the union holds a double because PDH_FMT_DOUBLE was
            // requested.
            let value = unsafe { item.FmtValue.Anonymous.doubleValue } as f32 / 100.0;

            match totals.iter_mut().find(|(l, _)| l == &luid) {
                Some((_, total)) => *total = (*total + value).min(1.0),
                None => totals.push((luid, value.min(1.0))),
            }
        }
    }

    // SAFETY: query came from PdhOpenQueryW and is not used afterwards.
    unsafe { PdhCloseQuery(query) };

    Some(totals)
}

fn format_luid(luid: LUID) -> String {
    format!("0x{:08X}_0x{:08X}", luid.HighPart as u32, luid.LowPart)
}

/// Extract the adapter LUID from a PDH GPU Engine instance name.
///
/// Instances look like
/// `pid_1234_luid_0x00000000_0x0000C4F5_phys_0_eng_0_engtype_3D`.
fn luid_from_instance(instance: &str) -> Option<String> {
    let rest = instance.split("luid_").nth(1)?;
    let mut parts = rest.split('_');
    let high = parts.next()?;
    let low = parts.next()?;
    Some(format!("{high}_{low}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_luid_is_extracted_from_a_pdh_instance_name() {
        assert_eq!(
            luid_from_instance("pid_1234_luid_0x00000000_0x0000C4F5_phys_0_eng_0_engtype_3D"),
            Some("0x00000000_0x0000C4F5".to_string())
        );
    }

    #[test]
    fn an_instance_without_a_luid_is_skipped() {
        // Some engine instances do not carry one; dropping them is correct.
        assert_eq!(luid_from_instance("pid_1234_phys_0"), None);
        assert_eq!(luid_from_instance(""), None);
    }

    #[test]
    fn a_truncated_luid_is_rejected_rather_than_half_parsed() {
        assert_eq!(luid_from_instance("luid_0x00000000"), None);
    }

    #[test]
    fn dxgi_and_pdh_luids_agree_in_format() {
        // The join between the two APIs depends on these matching exactly.
        let dxgi = format_luid(LUID {
            LowPart: 0x0000C4F5,
            HighPart: 0,
        });
        let pdh = luid_from_instance("pid_1_luid_0x00000000_0x0000C4F5_phys_0").expect("parses");

        assert_eq!(dxgi, pdh);
    }
}
