import { useEffect, useRef, useState } from "react";

import { atlas, loadColor } from "@developer-layer/design";
import type { GpuMetrics, MetricsSnapshot } from "@developer-layer/shared";

import { onTelemetry } from "./ipc";

/**
 * The telemetry tile.
 *
 * Gauges are drawn to Canvas rather than styled with CSS. Filter-based glow on
 * an always-visible widget re-rasterises every frame on every display, which is
 * exactly the cost a system monitor should not impose on the system it is
 * measuring.
 *
 * Samples arrive pushed from the backend; this component never polls. History
 * lives in Rust, so being remounted by a layout edit or a display change costs
 * nothing.
 */
export function Telemetry() {
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);

  useEffect(() => onTelemetry(setSnapshot), []);

  if (!snapshot) {
    return (
      <section className="telemetry telemetry--waiting">
        <span className="telemetry__waiting">Awaiting first sample…</span>
      </section>
    );
  }

  const { cpu, memory, network, disks, gpus } = snapshot;

  return (
    <section className="telemetry">
      <div className="telemetry__row">
        <Ring label="CPU" value={cpu.total} detail={`${num(cpu.logicalCores)} threads`} />
        <Ring
          label="RAM"
          value={
            num(memory.totalBytes) > 0
              ? num(memory.usedBytes) / num(memory.totalBytes)
              : 0
          }
          detail={`${bytes(memory.usedBytes)} / ${bytes(memory.totalBytes)}`}
        />
        {gpus.map((gpu) => (
          <Ring
            key={gpu.luid || gpu.name}
            label={gpu.kind === "integrated" ? "iGPU" : "GPU"}
            value={gpu.utilization}
            detail={gpuDetail(gpu)}
          />
        ))}
      </div>

      <div className="telemetry__cores">
        {cpu.perCore.map((load, index) => (
          <Bar key={index} value={load} />
        ))}
      </div>

      <dl className="telemetry__stats">
        <Stat label="Net down" value={`${bytes(network.rxBytesPerSec)}/s`} />
        <Stat label="Net up" value={`${bytes(network.txBytesPerSec)}/s`} />
        {disks.slice(0, 2).map((disk) => (
          <Stat
            key={disk.mount}
            label={disk.mount}
            value={`${bytes(disk.usedBytes)} / ${bytes(disk.totalBytes)}`}
          />
        ))}
      </dl>

      {gpus.length > 0 ? (
        <dl className="telemetry__stats">
          {gpus.map((gpu) => (
            <Stat
              key={`${gpu.luid}-detail`}
              label={gpu.name}
              // A dash rather than a zero: on a non-NVIDIA adapter these are a
              // genuine gap in what Windows exposes, not a reading of zero.
              value={[
                gpu.temperatureC != null ? `${Math.round(gpu.temperatureC)}°C` : null,
                gpu.powerWatts != null ? `${Math.round(gpu.powerWatts)}W` : null,
                gpu.coreClockMhz != null ? `${num(gpu.coreClockMhz)}MHz` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            />
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function gpuDetail(gpu: GpuMetrics): string {
  if (gpu.vramUsedBytes != null && gpu.vramTotalBytes != null) {
    return `${bytes(gpu.vramUsedBytes)} / ${bytes(gpu.vramTotalBytes)}`;
  }
  if (gpu.vramTotalBytes != null) {
    return `${bytes(gpu.vramTotalBytes)} VRAM`;
  }
  return gpu.name;
}

interface RingProps {
  label: string;
  /** `null` when the platform cannot measure this, which renders as a dash. */
  value: number | null;
  detail: string;
}

/** A circular gauge drawn to Canvas at device pixel ratio. */
function Ring({ label, value, detail }: RingProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // Backing store at DPR, CSS box at logical size — otherwise the arc is
    // soft on the scaled displays this app is built for.
    const dpr = window.devicePixelRatio || 1;
    const size = 76;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const centre = size / 2;
    const radius = centre - 7;
    // Start at the top and leave a gap at the bottom, so the arc reads as a
    // gauge rather than a pie.
    const start = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;

    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.arc(centre, centre, radius, start, start + sweep);
    ctx.strokeStyle = atlas.color.hairline;
    ctx.lineWidth = 5;
    ctx.stroke();

    if (value != null) {
      const clamped = Math.min(Math.max(value, 0), 1);
      ctx.beginPath();
      ctx.arc(centre, centre, radius, start, start + sweep * clamped);
      ctx.strokeStyle = loadColor(clamped);
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }, [value]);

  return (
    <figure className="ring">
      <canvas ref={ref} className="ring__canvas" style={{ width: 76, height: 76 }} />
      <figcaption className="ring__caption">
        <span className="ring__value">
          {value != null ? `${Math.round(value * 100)}%` : "—"}
        </span>
        <span className="ring__label">{label}</span>
        <span className="ring__detail">{detail}</span>
      </figcaption>
    </figure>
  );
}

function Bar({ value }: { value: number }) {
  const clamped = Math.min(Math.max(value, 0), 1);
  return (
    <span className="corebar" title={`${Math.round(clamped * 100)}%`}>
      <span
        className="corebar__fill"
        style={{ height: `${clamped * 100}%`, background: loadColor(clamped) }}
      />
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="telemetry__stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Coerce a byte count to a number.
 *
 * ts-rs maps Rust `u64` to `bigint` because the type can exceed JavaScript's
 * safe integer range. Tauri's transport is JSON though, so these actually
 * arrive as numbers — and no real byte count approaches 2^53 (9 petabytes)
 * anyway. Accepting both keeps the UI correct whichever the runtime hands us.
 */
function num(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

/** Binary units, matching what Task Manager reports. */
function bytes(raw: number | bigint): string {
  const value = num(raw);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let scaled = value;
  let unit = 0;

  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }

  return `${scaled < 10 && unit > 0 ? scaled.toFixed(1) : Math.round(scaled)}${units[unit]}`;
}
