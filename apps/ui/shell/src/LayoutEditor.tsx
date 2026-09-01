import { useCallback, useRef, useState } from "react";

import type { Monitor, PinnedApp, SlotLayout } from "@developer-layer/shared";

import {
  assignApp,
  moveBorder,
  removeSlot,
  saveLayout,
  splitSlot,
  type EdgeName,
} from "./ipc";

interface Props {
  layout: SlotLayout;
  monitors: Monitor[];
  apps: PinnedApp[];
  onLayout: (layout: SlotLayout) => void;
  onError: (message: string) => void;
}

/**
 * Edit mode.
 *
 * Slots are stored as fractions of the work area, so each display renders as a
 * scale model and a drag translates directly into a fractional delta — no
 * pixel-to-fraction conversion that could drift between displays of different
 * resolutions.
 *
 * Border drags are sent to the engine, which owns the rules: the neighbours
 * sharing a border move with it, and a drag that would crush a slot below the
 * minimum is refused outright rather than partially applied.
 */
export function LayoutEditor({
  layout,
  monitors,
  apps,
  onLayout,
  onError,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const run = useCallback(
    (op: Promise<SlotLayout>) => {
      op.then(onLayout).catch((e: unknown) => onError(String(e)));
    },
    [onLayout, onError],
  );

  return (
    <section className="editor">
      <header className="editor__bar">
        <span className="editor__title">Layout</span>
        <span className="editor__hint">
          Drag a border to resize. Select a slot to split, assign or remove it.
        </span>
        <button
          type="button"
          className="editor__save"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            saveLayout()
              .catch((e: unknown) => onError(String(e)))
              .finally(() => setSaving(false));
          }}
        >
          {saving ? "Saving…" : "Save layout"}
        </button>
      </header>

      <div className="editor__displays">
        {monitors.map((monitor) => (
          <DisplayCanvas
            key={monitor.id}
            monitor={monitor}
            layout={layout}
            selected={selected}
            onSelect={setSelected}
            onDrag={(slot, edge, delta) => run(moveBorder(slot, edge, delta))}
          />
        ))}
      </div>

      {selected ? (
        <SlotControls
          slot={selected}
          apps={apps}
          layout={layout}
          onSplit={(axis) =>
            run(splitSlot(selected, axis, `${selected}-${Date.now()}`))
          }
          onRemove={() => {
            run(removeSlot(selected));
            setSelected(null);
          }}
          onAssign={(app) => run(assignApp(selected, app))}
        />
      ) : null}
    </section>
  );
}

interface CanvasProps {
  monitor: Monitor;
  layout: SlotLayout;
  selected: string | null;
  onSelect: (slot: string) => void;
  onDrag: (slot: string, edge: EdgeName, delta: number) => void;
}

function DisplayCanvas({
  monitor,
  layout,
  selected,
  onSelect,
  onDrag,
}: CanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const slots = layout.slots.filter((s) => s.monitor === monitor.id);

  /**
   * Convert a pointer drag into a fractional delta and hand it to the engine
   * once the gesture ends. Sending per-pointermove would issue an IPC call per
   * frame and fight the engine's own validation.
   */
  const startDrag = (slot: string, edge: EdgeName) => (event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();

    const canvas = ref.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const horizontal = edge === "left" || edge === "right";
    const origin = horizontal ? event.clientX : event.clientY;
    const extent = horizontal ? rect.width : rect.height;

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const finish = (end: PointerEvent) => {
      target.releasePointerCapture(event.pointerId);
      target.removeEventListener("pointerup", finish);

      const moved = (horizontal ? end.clientX : end.clientY) - origin;
      const delta = moved / extent;
      // Ignore taps and jitter; a stray one-pixel drag should select, not resize.
      if (Math.abs(delta) > 0.005) {
        onDrag(slot, edge, delta);
      }
    };

    target.addEventListener("pointerup", finish);
  };

  return (
    <figure className="display">
      <figcaption className="display__label">
        {monitor.name}
        {monitor.isPrimary ? " · primary" : ""}
      </figcaption>

      <div className="display__canvas" ref={ref}>
        {slots.map((slot) => (
          <div
            key={slot.id}
            className={`tile${selected === slot.id ? " tile--selected" : ""}`}
            style={{
              left: `${slot.bounds.x * 100}%`,
              top: `${slot.bounds.y * 100}%`,
              width: `${slot.bounds.width * 100}%`,
              height: `${slot.bounds.height * 100}%`,
            }}
            onPointerDown={() => onSelect(slot.id)}
          >
            <span className="tile__name">
              {slot.assignedApp ?? (slot.isTelemetry ? "Telemetry" : slot.id)}
            </span>

            {/* Only interior borders are draggable; the display edge has no
                neighbour to resize against and the engine refuses it. */}
            {slot.bounds.x + slot.bounds.width < 0.999 ? (
              <span
                className="handle handle--v"
                style={{ right: 0 }}
                onPointerDown={startDrag(slot.id, "right")}
              />
            ) : null}
            {slot.bounds.y + slot.bounds.height < 0.999 ? (
              <span
                className="handle handle--h"
                style={{ bottom: 0 }}
                onPointerDown={startDrag(slot.id, "bottom")}
              />
            ) : null}
          </div>
        ))}
      </div>
    </figure>
  );
}

interface ControlsProps {
  slot: string;
  apps: PinnedApp[];
  layout: SlotLayout;
  onSplit: (axis: "horizontal" | "vertical") => void;
  onRemove: () => void;
  onAssign: (app: string | null) => void;
}

function SlotControls({
  slot,
  apps,
  layout,
  onSplit,
  onRemove,
  onAssign,
}: ControlsProps) {
  const current = layout.slots.find((s) => s.id === slot);

  return (
    <div className="controls">
      <span className="controls__label">{slot}</span>

      <button type="button" onClick={() => onSplit("vertical")}>
        Split vertically
      </button>
      <button type="button" onClick={() => onSplit("horizontal")}>
        Split horizontally
      </button>
      <button type="button" onClick={onRemove}>
        Remove
      </button>

      <label className="controls__assign">
        Opens here
        <select
          value={current?.assignedApp ?? ""}
          onChange={(e) => onAssign(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">Any application</option>
          {apps.map((app) => (
            <option key={app.id} value={app.id}>
              {app.displayName}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
