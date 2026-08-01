"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditorStore } from "@/stores/editor-store";

export function PropertiesPanel() {
  const selected = useEditorStore((s) => s.selected);
  const backgroundColor = useEditorStore((s) => s.backgroundColor);
  const setBackgroundColor = useEditorStore((s) => s.setBackgroundColor);

  function updateActive(patch: Record<string, unknown>) {
    const api = (window as unknown as { __canvasai?: { canvas: { getActiveObject: () => { set: (p: object) => void; setCoords: () => void } | null; requestRenderAll: () => void } } }).__canvasai;
    if (!api) return;
    const obj = api.canvas.getActiveObject();
    if (!obj) return;
    obj.set(patch);
    obj.setCoords();
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("canvasai:dirty"));
  }

  function bringForward() {
    const api = (window as unknown as { __canvasai?: { canvas: { getActiveObject: () => unknown; bringObjectForward: (o: unknown) => void; requestRenderAll: () => void } } }).__canvasai;
    const obj = api?.canvas.getActiveObject();
    if (!api || !obj) return;
    api.canvas.bringObjectForward(obj);
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("canvasai:dirty"));
  }

  function sendBackward() {
    const api = (window as unknown as { __canvasai?: { canvas: { getActiveObject: () => unknown; sendObjectBackwards: (o: unknown) => void; requestRenderAll: () => void } } }).__canvasai;
    const obj = api?.canvas.getActiveObject();
    if (!api || !obj) return;
    api.canvas.sendObjectBackwards(obj);
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("canvasai:dirty"));
  }

  return (
    <aside className="flex w-64 flex-col gap-4 overflow-y-auto border-l border-neutral-200 bg-white p-4" aria-label="속성">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">캔버스</h2>
        <div className="mt-2 space-y-2">
          <Label htmlFor="bg">배경색</Label>
          <Input
            id="bg"
            type="color"
            value={backgroundColor}
            onChange={(e) => {
              setBackgroundColor(e.target.value);
              const api = (window as unknown as { __canvasai?: { canvas: { backgroundColor: string; requestRenderAll: () => void } } }).__canvasai;
              if (api) {
                api.canvas.backgroundColor = e.target.value;
                api.canvas.requestRenderAll();
                window.dispatchEvent(new CustomEvent("canvasai:dirty"));
              }
            }}
          />
        </div>
      </div>

      {!selected ? (
        <p className="text-sm text-neutral-500">객체를 선택하면 속성이 표시됩니다.</p>
      ) : (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">선택 객체</h2>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>X</Label>
              <Input type="number" value={Math.round(selected.left ?? 0)} onChange={(e) => updateActive({ left: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Y</Label>
              <Input type="number" value={Math.round(selected.top ?? 0)} onChange={(e) => updateActive({ top: Number(e.target.value) })} />
            </div>
            <div>
              <Label>W</Label>
              <Input type="number" value={Math.round(selected.width ?? 0)} onChange={(e) => updateActive({ scaleX: Number(e.target.value) / Math.max(1, selected.width ?? 1) })} />
            </div>
            <div>
              <Label>H</Label>
              <Input type="number" value={Math.round(selected.height ?? 0)} onChange={(e) => updateActive({ scaleY: Number(e.target.value) / Math.max(1, selected.height ?? 1) })} />
            </div>
            <div>
              <Label>회전</Label>
              <Input type="number" value={Math.round(selected.angle ?? 0)} onChange={(e) => updateActive({ angle: Number(e.target.value) })} />
            </div>
            <div>
              <Label>투명도</Label>
              <Input type="number" min={0} max={1} step={0.05} value={selected.opacity ?? 1} onChange={(e) => updateActive({ opacity: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>채우기</Label>
            <Input type="color" value={typeof selected.fill === "string" ? selected.fill : "#000000"} onChange={(e) => updateActive({ fill: e.target.value })} />
          </div>
          <div>
            <Label>테두리</Label>
            <Input type="color" value={typeof selected.stroke === "string" ? selected.stroke : "#000000"} onChange={(e) => updateActive({ stroke: e.target.value })} />
          </div>
          <div>
            <Label>테두리 두께</Label>
            <Input type="number" value={selected.strokeWidth ?? 0} onChange={(e) => updateActive({ strokeWidth: Number(e.target.value) })} />
          </div>
          {selected.type === "i-text" || selected.type === "textbox" || selected.type === "text" ? (
            <>
              <div>
                <Label>글꼴 크기</Label>
                <Input type="number" value={selected.fontSize ?? 24} onChange={(e) => updateActive({ fontSize: Number(e.target.value) })} />
              </div>
              <div>
                <Label>글꼴 두께</Label>
                <Input value={String(selected.fontWeight ?? "normal")} onChange={(e) => updateActive({ fontWeight: e.target.value })} />
              </div>
              <div>
                <Label>정렬</Label>
                <Input value={selected.textAlign ?? "left"} onChange={(e) => updateActive({ textAlign: e.target.value })} />
              </div>
            </>
          ) : null}
          {selected.type === "rect" ? (
            <div>
              <Label>모서리</Label>
              <Input type="number" value={selected.rx ?? 0} onChange={(e) => updateActive({ rx: Number(e.target.value), ry: Number(e.target.value) })} />
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={bringForward}>앞으로</Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={sendBackward}>뒤로</Button>
          </div>
        </div>
      )}
    </aside>
  );
}
