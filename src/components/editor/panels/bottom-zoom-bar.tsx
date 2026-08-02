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
        __hourse?: { canvas: { setZoom: (z: number) => void; requestRenderAll: () => void } };
      }
    ).__hourse;
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

  function resetTo100() {
    applyZoom(1);
  }

  return (
    <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-[rgba(17,17,19,0.08)] bg-white px-1.5 py-1 shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Zoom out"
        onClick={() => applyZoom(zoom - editorConfig.zoomStep)}
      >
        <Minus className="size-3.5" />
      </Button>
      <button
        type="button"
        className="min-w-11 rounded px-1.5 py-0.5 text-center text-[11px] font-medium tabular-nums text-neutral-700 hover:bg-neutral-100"
        onClick={resetTo100}
        aria-label="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Zoom in"
        onClick={() => applyZoom(zoom + editorConfig.zoomStep)}
      >
        <Plus className="size-3.5" />
      </Button>
      <div className="mx-0.5 h-4 w-px bg-[rgba(17,17,19,0.08)]" aria-hidden />
      <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={fit} aria-label="Fit to screen">
        Fit
      </Button>
    </div>
  );
}
