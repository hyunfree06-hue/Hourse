"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Eye,
  Lock,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { designFonts } from "@/lib/design-scene/font-registry";
import { LayersPanel } from "@/components/editor/panels/layers-panel";
import { DimensionDraftInput } from "@/components/editor/properties/dimension-draft-input";
import {
  DEFAULT_DESIGN_REGION,
  MIN_DESIGN_HEIGHT,
  MIN_DESIGN_WIDTH,
  applyAiRegionSize,
  getVisualSize,
  isAiRegionFabricObject,
  isDesignRegionLargeEnough,
  resizeRegionAboutCenter,
} from "@/lib/design-scene/region";
import type { FabricObject } from "fabric";

function getCanvasApi() {
  return (
    window as unknown as {
      __hourse?: {
        canvas: {
          getActiveObject: () =>
            | (FabricObject & Record<string, unknown>)
            | null;
          setActiveObject?: (o: unknown) => void;
          requestRenderAll: () => void;
          bringObjectForward: (o: unknown) => void;
          sendObjectBackwards: (o: unknown) => void;
          remove: (...o: unknown[]) => void;
          add: (o: unknown) => void;
          discardActiveObject: () => void;
          getWidth: () => number;
          getHeight: () => number;
        };
      };
    }
  ).__hourse;
}

function syncSelectionFromObject(obj: FabricObject) {
  const visual = getVisualSize(obj);
  const anyObj = obj as FabricObject & {
    objectId?: string;
    objectRole?: string;
  };
  useEditorStore.getState().setSelected({
    objectId: anyObj.objectId,
    type: obj.type,
    objectRole: anyObj.objectRole,
    left: obj.left,
    top: obj.top,
    width: visual.width,
    height: visual.height,
    angle: obj.angle,
    fill: typeof obj.fill === "string" ? obj.fill : undefined,
    stroke: typeof obj.stroke === "string" ? obj.stroke : undefined,
    strokeWidth: obj.strokeWidth,
    opacity: obj.opacity,
  });
  if (isAiRegionFabricObject(obj)) {
    useEditorStore.getState().setAiRegion({
      left: obj.left ?? 0,
      top: obj.top ?? 0,
      width: visual.width,
      height: visual.height,
    });
  }
}

export function PropertiesPanel() {
  const selected = useEditorStore((s) => s.selected);
  const backgroundColor = useEditorStore((s) => s.backgroundColor);
  const setBackgroundColor = useEditorStore((s) => s.setBackgroundColor);

  function updateActive(patch: Record<string, unknown>) {
    const api = getCanvasApi();
    if (!api) return;
    const obj = api.canvas.getActiveObject();
    if (!obj) return;
    obj.set(patch);
    obj.setCoords();
    api.canvas.requestRenderAll();
    syncSelectionFromObject(obj);
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  function applyDimension(axis: "width" | "height", value: number, commit: boolean) {
    const api = getCanvasApi();
    if (!api) return;
    const obj = api.canvas.getActiveObject();
    if (!obj) return;

    const canvasW = api.canvas.getWidth();
    const canvasH = api.canvas.getHeight();
    const visual = getVisualSize(obj);
    const nextWidth = axis === "width" ? value : visual.width;
    const nextHeight = axis === "height" ? value : visual.height;

    if (isAiRegionFabricObject(obj)) {
      const minW = commit ? MIN_DESIGN_WIDTH : 1;
      const minH = commit ? MIN_DESIGN_HEIGHT : 1;
      const clampedW = Math.max(minW, Math.min(canvasW, nextWidth));
      const clampedH = Math.max(minH, Math.min(canvasH, nextHeight));
      const placed = resizeRegionAboutCenter(
        {
          left: obj.left ?? 0,
          top: obj.top ?? 0,
          width: visual.width,
          height: visual.height,
        },
        clampedW,
        clampedH,
        canvasW,
        canvasH,
      );
      applyAiRegionSize(obj, placed);
    } else {
      // Prefer baked width/height with scale 1 so W/H match visual size.
      obj.set({
        scaleX: 1,
        scaleY: 1,
        width: Math.max(1, nextWidth),
        height: Math.max(1, nextHeight),
      });
      obj.setCoords();
    }

    api.canvas.requestRenderAll();
    syncSelectionFromObject(obj);
    if (commit) {
      window.dispatchEvent(new CustomEvent("hourse:dirty"));
    } else {
      // Debounced autosave still runs via dirty — fire dirty only on commit
      // to avoid a PATCH per keystroke. Live visual update only.
    }
  }

  function resizeAiRegionToMinimum() {
    const api = getCanvasApi();
    if (!api) return;
    const obj = api.canvas.getActiveObject();
    if (!obj || !isAiRegionFabricObject(obj)) return;
    const visual = getVisualSize(obj);
    const placed = resizeRegionAboutCenter(
      {
        left: obj.left ?? 0,
        top: obj.top ?? 0,
        width: visual.width,
        height: visual.height,
      },
      DEFAULT_DESIGN_REGION.width,
      DEFAULT_DESIGN_REGION.height,
      api.canvas.getWidth(),
      api.canvas.getHeight(),
    );
    applyAiRegionSize(obj, placed);
    api.canvas.requestRenderAll();
    syncSelectionFromObject(obj);
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  function bringForward() {
    const api = getCanvasApi();
    const obj = api?.canvas.getActiveObject();
    if (!api || !obj) return;
    api.canvas.bringObjectForward(obj);
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  function sendBackward() {
    const api = getCanvasApi();
    const obj = api?.canvas.getActiveObject();
    if (!api || !obj) return;
    api.canvas.sendObjectBackwards(obj);
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  async function duplicate() {
    const api = getCanvasApi();
    const obj = api?.canvas.getActiveObject();
    if (!api || !obj) return;
    const cloned = await obj.clone();
    cloned.set({
      left: (obj.left ?? 0) + 16,
      top: (obj.top ?? 0) + 16,
      objectId: crypto.randomUUID(),
    });
    api.canvas.add(cloned);
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  function removeSelected() {
    const api = getCanvasApi();
    const obj = api?.canvas.getActiveObject();
    if (!api || !obj) return;
    api.canvas.remove(obj);
    api.canvas.discardActiveObject();
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  function toggleVisibility() {
    const api = getCanvasApi();
    const obj = api?.canvas.getActiveObject();
    if (!api || !obj) return;
    obj.set({ visible: obj.visible === false });
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  function toggleLock() {
    const api = getCanvasApi();
    const obj = api?.canvas.getActiveObject();
    if (!api || !obj) return;
    const next = !obj.locked;
    obj.set({ locked: next, selectable: !next, evented: !next });
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  function groupSelection() {
    const api = getCanvasApi();
    const obj = api?.canvas.getActiveObject() as
      | (FabricObject & { type?: string; toGroup?: () => FabricObject })
      | null
      | undefined;
    if (!api || !obj || obj.type !== "activeSelection" || !obj.toGroup) return;
    const group = obj.toGroup();
    api.canvas.setActiveObject?.(group);
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  function ungroupSelection() {
    const api = getCanvasApi();
    const obj = api?.canvas.getActiveObject() as
      | (FabricObject & { type?: string; toActiveSelection?: () => void })
      | null
      | undefined;
    if (!api || !obj || obj.type !== "group" || !obj.toActiveSelection) return;
    obj.toActiveSelection();
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  const isText =
    selected?.type === "i-text" ||
    selected?.type === "textbox" ||
    selected?.type === "text";
  const isShape =
    selected?.type === "rect" ||
    selected?.type === "ellipse" ||
    selected?.type === "circle" ||
    selected?.type === "polygon" ||
    selected?.type === "path" ||
    selected?.type === "line";
  const isAiRegion =
    selected?.objectRole === "ai-region" ||
    (typeof window !== "undefined" &&
      isAiRegionFabricObject(getCanvasApi()?.canvas.getActiveObject() ?? null));
  const regionBelowMin =
    isAiRegion &&
    !isDesignRegionLargeEnough(selected?.width ?? 0, selected?.height ?? 0);

  return (
    <aside
      className="flex w-[260px] flex-col overflow-y-auto border-l border-[rgba(17,17,19,0.08)] bg-white"
      aria-label="Properties"
    >
      <LayersPanel />

      <div className="border-b border-[rgba(17,17,19,0.08)] px-4 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Canvas
        </h2>
        <div className="mt-2.5 flex items-center gap-2">
          <Label htmlFor="bg" className="text-xs text-neutral-600">
            Background
          </Label>
          <Input
            id="bg"
            type="color"
            className="ml-auto h-7 w-10 cursor-pointer rounded border border-[rgba(17,17,19,0.08)] p-0.5"
            value={backgroundColor}
            onChange={(e) => {
              setBackgroundColor(e.target.value);
              const api = getCanvasApi() as
                | { canvas: { backgroundColor: string; requestRenderAll: () => void } }
                | undefined;
              if (api) {
                api.canvas.backgroundColor = e.target.value;
                api.canvas.requestRenderAll();
                window.dispatchEvent(new CustomEvent("hourse:dirty"));
              }
            }}
          />
        </div>
      </div>

      {!selected ? (
        <div className="px-4 py-6">
          <p className="text-xs text-neutral-400">
            Select an object to view its properties.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-0 divide-y divide-[rgba(17,17,19,0.08)]">
          <div className="px-4 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Position
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
              <div>
                <Label className="text-[10px] text-neutral-500">X</Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  value={Math.round(selected.left ?? 0)}
                  onChange={(e) =>
                    updateActive({ left: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label className="text-[10px] text-neutral-500">Y</Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  value={Math.round(selected.top ?? 0)}
                  onChange={(e) =>
                    updateActive({ top: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>

          <div className="px-4 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Size
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
              <DimensionDraftInput
                label="W"
                committedValue={selected.width ?? 0}
                min={isAiRegion ? MIN_DESIGN_WIDTH : 1}
                max={8192}
                onLiveChange={(value) => applyDimension("width", value, false)}
                onCommit={(value) => applyDimension("width", value, true)}
              />
              <DimensionDraftInput
                label="H"
                committedValue={selected.height ?? 0}
                min={isAiRegion ? MIN_DESIGN_HEIGHT : 1}
                max={8192}
                onLiveChange={(value) => applyDimension("height", value, false)}
                onCommit={(value) => applyDimension("height", value, true)}
              />
            </div>
            {regionBelowMin ? (
              <div className="mt-2 space-y-1.5">
                <p className="text-[11px] text-amber-600">
                  Minimum design area: {MIN_DESIGN_WIDTH} × {MIN_DESIGN_HEIGHT}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={resizeAiRegionToMinimum}
                >
                  Resize to minimum
                </Button>
              </div>
            ) : null}
          </div>

          <div className="px-4 py-3">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              <div>
                <Label className="text-[10px] text-neutral-500">Rotation</Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  value={Math.round(selected.angle ?? 0)}
                  onChange={(e) =>
                    updateActive({ angle: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label className="text-[10px] text-neutral-500">Opacity</Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selected.opacity ?? 1}
                  onChange={(e) =>
                    updateActive({ opacity: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>

          {(isShape || isText) && (
            <>
              <div className="px-4 py-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Fill
                </h2>
                <Input
                  className="mt-2 h-7 w-full"
                  type="color"
                  value={
                    typeof selected.fill === "string"
                      ? selected.fill
                      : "#000000"
                  }
                  onChange={(e) => updateActive({ fill: e.target.value })}
                />
              </div>
              <div className="px-4 py-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Stroke
                </h2>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    className="h-7 w-10 p-0.5"
                    type="color"
                    value={
                      typeof selected.stroke === "string"
                        ? selected.stroke
                        : "#000000"
                    }
                    onChange={(e) => updateActive({ stroke: e.target.value })}
                  />
                  <div className="flex-1">
                    <Label className="text-[10px] text-neutral-500">Width</Label>
                    <Input
                      className="h-7 text-xs"
                      type="number"
                      value={selected.strokeWidth ?? 0}
                      onChange={(e) =>
                        updateActive({ strokeWidth: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {selected.type === "rect" && (
            <div className="px-4 py-3">
              <Label className="text-[10px] text-neutral-500">
                Corner radius
              </Label>
              <Input
                className="mt-1 h-7 text-xs"
                type="number"
                value={selected.rx ?? 0}
                onChange={(e) =>
                  updateActive({
                    rx: Number(e.target.value),
                    ry: Number(e.target.value),
                  })
                }
              />
            </div>
          )}

          {(selected.type === "path" || selected.type === "line") && (
            <div className="px-4 py-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-neutral-500">
                    Line cap
                  </Label>
                  <select
                    className="mt-1 h-7 w-full rounded-md border border-[rgba(17,17,19,0.08)] px-1 text-xs"
                    value={selected.strokeLineCap ?? "round"}
                    onChange={(e) =>
                      updateActive({ strokeLineCap: e.target.value })
                    }
                  >
                    <option value="butt">Butt</option>
                    <option value="round">Round</option>
                    <option value="square">Square</option>
                  </select>
                </div>
                <div>
                  <Label className="text-[10px] text-neutral-500">
                    Line join
                  </Label>
                  <select
                    className="mt-1 h-7 w-full rounded-md border border-[rgba(17,17,19,0.08)] px-1 text-xs"
                    value={selected.strokeLineJoin ?? "round"}
                    onChange={(e) =>
                      updateActive({ strokeLineJoin: e.target.value })
                    }
                  >
                    <option value="miter">Miter</option>
                    <option value="round">Round</option>
                    <option value="bevel">Bevel</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {isText && (
            <div className="px-4 py-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Text
              </h2>
              <div className="mt-2 space-y-1.5">
                <div>
                  <Label className="text-[10px] text-neutral-500">Content</Label>
                  <Input
                    className="h-7 text-xs"
                    value={selected.text ?? ""}
                    onChange={(e) => updateActive({ text: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-neutral-500">Font</Label>
                  <select
                    className="mt-0.5 h-7 w-full rounded-md border border-[rgba(17,17,19,0.08)] px-1 text-xs"
                    value={selected.fontFamily ?? "Inter"}
                    onChange={(e) =>
                      updateActive({ fontFamily: e.target.value })
                    }
                  >
                    {designFonts.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                  <div>
                    <Label className="text-[10px] text-neutral-500">Size</Label>
                    <Input
                      className="h-7 text-xs"
                      type="number"
                      value={selected.fontSize ?? 24}
                      onChange={(e) =>
                        updateActive({ fontSize: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-neutral-500">
                      Weight
                    </Label>
                    <Input
                      className="h-7 text-xs"
                      value={String(selected.fontWeight ?? "400")}
                      onChange={(e) =>
                        updateActive({ fontWeight: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-neutral-500">
                      Line height
                    </Label>
                    <Input
                      className="h-7 text-xs"
                      type="number"
                      step={0.05}
                      value={selected.lineHeight ?? 1.2}
                      onChange={(e) =>
                        updateActive({ lineHeight: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-neutral-500">
                      Letter spacing
                    </Label>
                    <Input
                      className="h-7 text-xs"
                      type="number"
                      value={selected.charSpacing ?? 0}
                      onChange={(e) =>
                        updateActive({ charSpacing: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] text-neutral-500">
                      Alignment
                    </Label>
                    <select
                      className="mt-0.5 h-7 w-full rounded-md border border-[rgba(17,17,19,0.08)] px-1 text-xs"
                      value={selected.textAlign ?? "left"}
                      onChange={(e) =>
                        updateActive({ textAlign: e.target.value })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="px-4 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Layer
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={bringForward}
              >
                <ArrowUp className="size-3" /> Forward
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={sendBackward}
              >
                <ArrowDown className="size-3" /> Backward
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => void duplicate()}
              >
                <Copy className="size-3" /> Duplicate
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={toggleVisibility}
              >
                <Eye className="size-3" /> Hide
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={toggleLock}
              >
                <Lock className="size-3" /> Lock
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={groupSelection}
              >
                Group
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={ungroupSelection}
              >
                Ungroup
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs text-red-600"
                onClick={removeSelected}
              >
                <Trash2 className="size-3" /> Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
