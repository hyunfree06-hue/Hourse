"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { editorConfig } from "@/config/editor";
import { useEditorStore } from "@/stores/editor-store";

export function BottomZoomBar() {
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);

  function applyZoom(next: number) {
    const api = (
      window as unknown as {
        __canvasai?: { canvas: { setZoom: (z: number) => void; requestRenderAll: () => void } };
      }
    ).__canvasai;
    const z = Math.min(
      editorConfig.maxZoom,
      Math.max(editorConfig.minZoom, next),
    );
    setZoom(z);
    if (api) {
      api.canvas.setZoom(z);
      api.canvas.requestRenderAll();
    }
  }

  function fit() {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "0", bubbles: true }),
    );
  }

  return (
    <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        aria-label="축소"
        onClick={() => applyZoom(zoom - editorConfig.zoomStep)}
      >
        <Minus className="size-4" />
      </Button>
      <span className="min-w-12 text-center text-xs tabular-nums text-neutral-700">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="확대"
        onClick={() => applyZoom(zoom + editorConfig.zoomStep)}
      >
        <Plus className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={fit} aria-label="화면 맞춤">
        맞춤
      </Button>
    </div>
  );
}
