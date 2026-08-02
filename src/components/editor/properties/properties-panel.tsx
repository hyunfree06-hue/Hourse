"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowUp, ArrowDown } from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";

export function PropertiesPanel() {
  const selected = useEditorStore((s) => s.selected);
  const backgroundColor = useEditorStore((s) => s.backgroundColor);
  const setBackgroundColor = useEditorStore((s) => s.setBackgroundColor);

  function updateActive(patch: Record<string, unknown>) {
    const api = (window as unknown as { __hourse?: { canvas: { getActiveObject: () => { set: (p: object) => void; setCoords: () => void } | null; requestRenderAll: () => void } } }).__hourse;
    if (!api) return;
    const obj = api.canvas.getActiveObject();
    if (!obj) return;
    obj.set(patch);
    obj.setCoords();
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  function bringForward() {
    const api = (window as unknown as { __hourse?: { canvas: { getActiveObject: () => unknown; bringObjectForward: (o: unknown) => void; requestRenderAll: () => void } } }).__hourse;
    const obj = api?.canvas.getActiveObject();
    if (!api || !obj) return;
    api.canvas.bringObjectForward(obj);
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  function sendBackward() {
    const api = (window as unknown as { __hourse?: { canvas: { getActiveObject: () => unknown; sendObjectBackwards: (o: unknown) => void; requestRenderAll: () => void } } }).__hourse;
    const obj = api?.canvas.getActiveObject();
    if (!api || !obj) return;
    api.canvas.sendObjectBackwards(obj);
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
  }

  return (
    <aside className="flex w-[260px] flex-col overflow-y-auto border-l border-[rgba(17,17,19,0.08)] bg-white" aria-label="Properties">
      {/* Canvas section */}
      <div className="border-b border-[rgba(17,17,19,0.08)] px-4 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Canvas</h2>
        <div className="mt-2.5 flex items-center gap-2">
          <Label htmlFor="bg" className="text-xs text-neutral-600">Background</Label>
          <Input
            id="bg"
            type="color"
            className="ml-auto h-7 w-10 cursor-pointer rounded border border-[rgba(17,17,19,0.08)] p-0.5"
            value={backgroundColor}
            onChange={(e) => {
              setBackgroundColor(e.target.value);
              const api = (window as unknown as { __hourse?: { canvas: { backgroundColor: string; requestRenderAll: () => void } } }).__hourse;
              if (api) {
                api.canvas.backgroundColor = e.target.value;
                api.canvas.requestRenderAll();
                window.dispatchEvent(new CustomEvent("hourse:dirty"));
              }
            }}
          />
        </div>
      </div>

      {/* Selection section */}
      {!selected ? (
        <div className="px-4 py-6">
          <p className="text-xs text-neutral-400">Select an object to view its properties.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0 divide-y divide-[rgba(17,17,19,0.08)]">
          {/* Position & Size */}
          <div className="px-4 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Position</h2>
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
              <div>
                <Label className="text-[10px] text-neutral-500">X</Label>
                <Input className="h-7 text-xs" type="number" value={Math.round(selected.left ?? 0)} onChange={(e) => updateActive({ left: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-[10px] text-neutral-500">Y</Label>
                <Input className="h-7 text-xs" type="number" value={Math.round(selected.top ?? 0)} onChange={(e) => updateActive({ top: Number(e.target.value) })} />
              </div>
            </div>
          </div>

          <div className="px-4 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Size</h2>
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
              <div>
                <Label className="text-[10px] text-neutral-500">W</Label>
                <Input className="h-7 text-xs" type="number" value={Math.round(selected.width ?? 0)} onChange={(e) => updateActive({ scaleX: Number(e.target.value) / Math.max(1, selected.width ?? 1) })} />
              </div>
              <div>
                <Label className="text-[10px] text-neutral-500">H</Label>
                <Input className="h-7 text-xs" type="number" value={Math.round(selected.height ?? 0)} onChange={(e) => updateActive({ scaleY: Number(e.target.value) / Math.max(1, selected.height ?? 1) })} />
              </div>
            </div>
          </div>

          {/* Rotation & Opacity */}
          <div className="px-4 py-3">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              <div>
                <Label className="text-[10px] text-neutral-500">Rotation</Label>
                <Input className="h-7 text-xs" type="number" value={Math.round(selected.angle ?? 0)} onChange={(e) => updateActive({ angle: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-[10px] text-neutral-500">Opacity</Label>
                <Input className="h-7 text-xs" type="number" min={0} max={1} step={0.05} value={selected.opacity ?? 1} onChange={(e) => updateActive({ opacity: Number(e.target.value) })} />
              </div>
            </div>
          </div>

          {/* Fill & Stroke */}
          <div className="px-4 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Fill</h2>
            <Input className="mt-2 h-7 w-full" type="color" value={typeof selected.fill === "string" ? selected.fill : "#000000"} onChange={(e) => updateActive({ fill: e.target.value })} />
          </div>

          <div className="px-4 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Stroke</h2>
            <div className="mt-2 flex items-center gap-2">
              <Input className="h-7 w-10 p-0.5" type="color" value={typeof selected.stroke === "string" ? selected.stroke : "#000000"} onChange={(e) => updateActive({ stroke: e.target.value })} />
              <div className="flex-1">
                <Label className="text-[10px] text-neutral-500">Width</Label>
                <Input className="h-7 text-xs" type="number" value={selected.strokeWidth ?? 0} onChange={(e) => updateActive({ strokeWidth: Number(e.target.value) })} />
              </div>
            </div>
          </div>

          {/* Corner radius (rect only) */}
          {selected.type === "rect" && (
            <div className="px-4 py-3">
              <Label className="text-[10px] text-neutral-500">Corner radius</Label>
              <Input className="mt-1 h-7 text-xs" type="number" value={selected.rx ?? 0} onChange={(e) => updateActive({ rx: Number(e.target.value), ry: Number(e.target.value) })} />
            </div>
          )}

          {/* Text properties */}
          {(selected.type === "i-text" || selected.type === "textbox" || selected.type === "text") && (
            <div className="px-4 py-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Text</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
                <div>
                  <Label className="text-[10px] text-neutral-500">Font size</Label>
                  <Input className="h-7 text-xs" type="number" value={selected.fontSize ?? 24} onChange={(e) => updateActive({ fontSize: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-[10px] text-neutral-500">Weight</Label>
                  <Input className="h-7 text-xs" value={String(selected.fontWeight ?? "normal")} onChange={(e) => updateActive({ fontWeight: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] text-neutral-500">Align</Label>
                  <Input className="h-7 text-xs" value={selected.textAlign ?? "left"} onChange={(e) => updateActive({ textAlign: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {/* Layer controls */}
          <div className="px-4 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Layer</h2>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" className="h-7 flex-1 gap-1 text-xs" onClick={bringForward}>
                <ArrowUp className="size-3" /> Bring forward
              </Button>
              <Button variant="outline" size="sm" className="h-7 flex-1 gap-1 text-xs" onClick={sendBackward}>
                <ArrowDown className="size-3" /> Send backward
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
