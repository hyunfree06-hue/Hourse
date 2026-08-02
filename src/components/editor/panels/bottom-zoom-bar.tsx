"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronUp, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { editorConfig } from "@/config/editor";
import { useEditorStore } from "@/stores/editor-store";
import { clampZoom } from "@/lib/canvas/viewport";

type HourseViewportApi = {
  canvas: {
    getZoom: () => number;
    requestRenderAll: () => void;
  };
  syncZoom?: () => void;
  fitAll?: () => void;
  fitSelection?: () => void;
  fitDesign?: () => void;
  fitArtboard?: () => void;
  resetViewport?: () => void;
  zoomTo?: (next: number) => number;
};

function getApi(): HourseViewportApi | undefined {
  return (window as unknown as { __hourse?: HourseViewportApi }).__hourse;
}

export function BottomZoomBar() {
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  function applyZoom(next: number) {
    const api = getApi();
    const z = clampZoom(next);
    if (api?.zoomTo) {
      setZoom(api.zoomTo(z));
      return;
    }
    setZoom(z);
  }

  function runFit(action: () => void) {
    action();
    setMenuOpen(false);
  }

  const items: { id: string; label: string; run: () => void }[] = [
    {
      id: "all",
      label: "Fit all",
      run: () => {
        const api = getApi();
        if (api?.fitAll) api.fitAll();
        else api?.fitArtboard?.();
      },
    },
    {
      id: "selection",
      label: "Fit selection",
      run: () => getApi()?.fitSelection?.(),
    },
    {
      id: "design",
      label: "Fit design region",
      run: () => getApi()?.fitDesign?.(),
    },
    {
      id: "100",
      label: "100%",
      run: () => applyZoom(1),
    },
    {
      id: "reset",
      label: "Reset viewport",
      run: () => {
        const api = getApi();
        if (api?.resetViewport) {
          api.resetViewport();
          return;
        }
        applyZoom(1);
      },
    },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-[rgba(17,17,19,0.08)] bg-white px-1.5 py-1 shadow-sm"
    >
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
        onClick={() => applyZoom(1)}
        aria-label="Reset to 100%"
        title="0"
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
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Fit options"
          aria-expanded={menuOpen}
          title="Fit"
        >
          Fit
          <ChevronUp className="size-3 opacity-60" />
        </Button>
        {menuOpen ? (
          <div className="absolute bottom-full left-1/2 mb-1.5 w-44 -translate-x-1/2 rounded-lg border border-[rgba(17,17,19,0.08)] bg-white py-1 shadow-lg">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-neutral-700 hover:bg-neutral-50"
                onClick={() => runFit(item.run)}
              >
                {item.id === "all" ? (
                  <Check className="size-3 text-[#635BFF]" />
                ) : (
                  <span className="size-3" />
                )}
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
