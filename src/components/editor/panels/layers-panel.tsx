"use client";

import { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Type,
  Square,
  Circle,
  Minus,
  ImageIcon,
  Group,
  Layers,
} from "lucide-react";
import type { FabricObject } from "fabric";
import { cn } from "@/lib/utils/cn";
import { isEditableDesignObject } from "@/lib/canvas/editable-selection";

type LayerRow = {
  objectId: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
};

function typeIcon(type: string) {
  switch (type) {
    case "textbox":
    case "i-text":
    case "text":
      return Type;
    case "ellipse":
    case "circle":
      return Circle;
    case "line":
      return Minus;
    case "image":
      return ImageIcon;
    case "group":
      return Group;
    default:
      return Square;
  }
}

function readLayers(): LayerRow[] {
  const api = (
    window as unknown as {
      __hourse?: {
        canvas: {
          getObjects: () => Array<
            FabricObject & {
              objectId?: string;
              name?: string;
              objectRole?: string;
              locked?: boolean;
            }
          >;
        };
      };
    }
  ).__hourse;
  if (!api) return [];
  return api.canvas
    .getObjects()
    .filter((o) => isEditableDesignObject(o))
    .map((o, index) => ({
      objectId: o.objectId ?? `anon-${index}`,
      name: o.name || o.type || `Layer ${index + 1}`,
      type: o.type ?? "object",
      visible: o.visible !== false,
      locked: Boolean(o.locked),
    }))
    .reverse();
}

export function LayersPanel() {
  const [layers, setLayers] = useState<LayerRow[]>([]);

  useEffect(() => {
    const refresh = () => setLayers(readLayers());
    refresh();
    window.addEventListener("hourse:dirty", refresh);
    const id = window.setInterval(refresh, 1500);
    return () => {
      window.removeEventListener("hourse:dirty", refresh);
      window.clearInterval(id);
    };
  }, []);

  function withCanvas(
    fn: (canvas: {
      getObjects: () => Array<FabricObject & { objectId?: string; locked?: boolean }>;
      setActiveObject: (o: FabricObject) => void;
      discardActiveObject: () => void;
      requestRenderAll: () => void;
      remove: (...o: FabricObject[]) => void;
      bringObjectForward: (o: FabricObject) => void;
      sendObjectBackwards: (o: FabricObject) => void;
    }) => void,
  ) {
    const api = (
      window as unknown as {
        __hourse?: {
          canvas: {
            getObjects: () => Array<FabricObject & { objectId?: string; locked?: boolean }>;
            setActiveObject: (o: FabricObject) => void;
            discardActiveObject: () => void;
            requestRenderAll: () => void;
            remove: (...o: FabricObject[]) => void;
            bringObjectForward: (o: FabricObject) => void;
            sendObjectBackwards: (o: FabricObject) => void;
          };
        };
      }
    ).__hourse;
    if (!api) return;
    fn(api.canvas);
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
    setLayers(readLayers());
  }

  function findById(objectId: string) {
    const api = (
      window as unknown as {
        __hourse?: {
          canvas: {
            getObjects: () => Array<FabricObject & { objectId?: string }>;
          };
        };
      }
    ).__hourse;
    return api?.canvas.getObjects().find((o) => o.objectId === objectId) ?? null;
  }

  return (
    <div className="border-b border-[rgba(17,17,19,0.08)]">
      <div className="flex items-center gap-1.5 px-4 py-2.5">
        <Layers className="size-3.5 text-neutral-400" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Layers
        </h2>
      </div>
      {layers.length === 0 ? (
        <p className="px-4 pb-3 text-[11px] text-neutral-400">No objects yet.</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto px-2 pb-2">
          {layers.map((layer) => {
            const Icon = typeIcon(layer.type);
            return (
              <li
                key={layer.objectId}
                className={cn(
                  "group flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-neutral-50",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => {
                    const obj = findById(layer.objectId);
                    if (!obj) return;
                    withCanvas((canvas) => canvas.setActiveObject(obj));
                  }}
                >
                  <Icon className="size-3 shrink-0 text-neutral-400" />
                  <span className="truncate text-neutral-700">{layer.name}</span>
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-neutral-400 hover:text-neutral-700"
                  title={layer.visible ? "Hide" : "Show"}
                  onClick={() => {
                    const obj = findById(layer.objectId);
                    if (!obj) return;
                    obj.visible = !layer.visible;
                    withCanvas(() => undefined);
                  }}
                >
                  {layer.visible ? (
                    <Eye className="size-3" />
                  ) : (
                    <EyeOff className="size-3" />
                  )}
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-neutral-400 hover:text-neutral-700"
                  title={layer.locked ? "Unlock" : "Lock"}
                  onClick={() => {
                    const obj = findById(layer.objectId);
                    if (!obj) return;
                    const next = !layer.locked;
                    obj.set({
                      locked: next,
                      selectable: !next,
                      evented: !next,
                    });
                    withCanvas(() => undefined);
                  }}
                >
                  {layer.locked ? (
                    <Lock className="size-3" />
                  ) : (
                    <Unlock className="size-3" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
