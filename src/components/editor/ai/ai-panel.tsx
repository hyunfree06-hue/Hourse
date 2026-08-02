"use client";

import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { Canvas, FabricObject } from "fabric";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  calculateCreditCost,
  QUALITY_LABELS,
  type AiQuality,
} from "@/config/credits";
import { useEditorStore } from "@/stores/editor-store";
import { aspectRatioLabel } from "@/lib/utils/geometry";
import { createObjectId } from "@/lib/canvas/custom-properties";
import type { EditableDesignScene } from "@/lib/design-scene/schema";
import type { DesignOperation } from "@/lib/design-scene/schema";
import { fabricObjectsToSceneObjects } from "@/lib/design-scene/fabric-to-scene";

type Availability = { openai: boolean; bfl: boolean };

const PROMPT_CHIPS = [
  "Brand logo",
  "Business card",
  "Editorial poster",
  "Social campaign",
  "Product graphic",
];

function mapGenerationError(code?: string, fallback?: string): string {
  switch (code) {
    case "PROJECT_SAVE_FAILED":
      return "We couldn't save this project. Retry the save before generating.";
    case "INSUFFICIENT_CREDITS":
      return "You don't have enough credits for this generation.";
    case "DESIGN_SCHEMA_INVALID":
    case "DESIGN_MODEL_NOT_CONFIGURED":
      return "Design generation is temporarily unavailable. Your credits were restored.";
    case "PROVIDER_NOT_CONFIGURED":
      return "Design generation is not configured.";
    case "AUTH_REQUIRED":
    case "unauthorized":
      return "Your session has expired. Sign in again.";
    default:
      return (
        fallback ||
        "We couldn't create this design. Your credits were restored."
      );
  }
}

type Props = {
  projectId: string;
  availability: Availability;
  onEnsureSaved?: (force?: boolean) => Promise<boolean>;
};

function getHourseApi(): {
  canvas: Canvas;
  history?: { save: () => void };
} | null {
  return (
    (
      window as unknown as {
        __hourse?: { canvas: Canvas; history?: { save: () => void } };
      }
    ).__hourse ?? null
  );
}

function collectSelectedFabricObjects(canvas: Canvas): FabricObject[] {
  const active = canvas.getActiveObject();
  if (!active) return [];
  if (active.type === "activeSelection" && "getObjects" in active) {
    return (active as unknown as { getObjects: () => FabricObject[] }).getObjects();
  }
  return [active];
}

function applyRefineOperations(canvas: Canvas, operations: DesignOperation[]) {
  const byId = new Map<string, FabricObject>();
  canvas.getObjects().forEach((obj) => {
    const id = (obj as FabricObject & { objectId?: string }).objectId;
    if (id) byId.set(id, obj);
  });

  for (const op of operations) {
    if (op.type === "delete") {
      const target = byId.get(op.objectId);
      if (target) canvas.remove(target);
      continue;
    }
    if (op.type === "reorder") {
      const target = byId.get(op.objectId);
      if (!target) continue;
      canvas.moveObjectTo?.(target, op.layerIndex);
      continue;
    }
    if (op.type === "update") {
      const target = byId.get(op.objectId);
      if (!target) continue;
      const changes = { ...op.changes } as Record<string, unknown>;
      delete changes.id;
      delete changes.type;
      if ("letterSpacing" in changes) {
        changes.charSpacing = changes.letterSpacing;
        delete changes.letterSpacing;
      }
      target.set(changes);
      target.setCoords();
    }
  }
  canvas.requestRenderAll();
}

export function AiPanel({ projectId, availability, onEnsureSaved }: Props) {
  const aiRegion = useEditorStore((s) => s.aiRegion);
  const aiPanelOpen = useEditorStore((s) => s.aiPanelOpen);
  const credits = useEditorStore((s) => s.credits);
  const setCredits = useEditorStore((s) => s.setCredits);
  const setAiPanelOpen = useEditorStore((s) => s.setAiPanelOpen);
  const setAiRegion = useEditorStore((s) => s.setAiRegion);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const selected = useEditorStore((s) => s.selected);

  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<AiQuality>("standard");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectionEpoch, setSelectionEpoch] = useState(0);

  useEffect(() => {
    const bump = () => setSelectionEpoch((n) => n + 1);
    window.addEventListener("hourse:dirty", bump);
    return () => window.removeEventListener("hourse:dirty", bump);
  }, []);

  const isRefine = useMemo(() => {
    void selected;
    void selectionEpoch;
    if (typeof window === "undefined") return false;
    const api = getHourseApi();
    if (!api) return false;
    const selectedObjects = collectSelectedFabricObjects(api.canvas).filter(
      (obj) =>
        (obj as FabricObject & { objectRole?: string }).objectRole !==
        "ai-region",
    );
    return selectedObjects.length > 0;
  }, [selected, selectionEpoch]);

  const cost = useMemo(
    () =>
      calculateCreditCost({
        provider: "openai",
        quality,
        mode: "design",
      }),
    [quality],
  );

  if (!aiPanelOpen) return null;

  async function placeDesignScene(
    scene: EditableDesignScene,
    generationId: string,
    selection: { left: number; top: number; width: number; height: number },
    imageAssets?: Record<
      string,
      { assetId: string; signedUrl: string | null; bucket: string; path: string }
    >,
  ) {
    const api = getHourseApi();
    if (!api) throw new Error("Canvas unavailable");

    const { insertDesignSceneToCanvas, scaleSceneToRegion } = await import(
      "@/lib/design-scene/scene-to-fabric"
    );

    const designBlockId = createObjectId();
    const { scaleX, scaleY } = scaleSceneToRegion(scene, selection);
    const imageUrlById = new Map<string, string>();
    if (imageAssets) {
      for (const [id, asset] of Object.entries(imageAssets)) {
        if (asset.signedUrl) imageUrlById.set(id, asset.signedUrl);
        else if (asset.assetId) {
          imageUrlById.set(id, `/api/assets/${asset.assetId}/content`);
        }
      }
    }

    const { objectIds } = await insertDesignSceneToCanvas(
      api.canvas,
      scene,
      {
        offsetLeft: selection.left,
        offsetTop: selection.top,
        scaleX,
        scaleY,
        generationId,
        designBlockId,
      },
      imageUrlById,
    );

    // Attach asset metadata for image layers
    if (imageAssets) {
      api.canvas.getObjects().forEach((obj) => {
        const id = (obj as FabricObject & { objectId?: string }).objectId;
        if (!id || !imageAssets[id]) return;
        const meta = imageAssets[id];
        obj.set({
          assetId: meta.assetId,
          storageBucket: meta.bucket,
          storagePath: meta.path,
        });
      });
    }

    const regions = api.canvas
      .getObjects()
      .filter(
        (obj) =>
          (obj as FabricObject & { objectRole?: string }).objectRole ===
          "ai-region",
      );
    if (regions.length) {
      api.canvas.remove(...regions);
      setAiRegion(null);
    }

    api.history?.save();
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
    return objectIds;
  }

  async function handleGenerate() {
    const api = getHourseApi();
    const selectedObjects = api
      ? collectSelectedFabricObjects(api.canvas).filter(
          (obj) =>
            (obj as FabricObject & { objectRole?: string }).objectRole !==
            "ai-region",
        )
      : [];
    const refining = selectedObjects.length > 0;

    if (!refining && !aiRegion) {
      setError("Draw an area on the canvas first.");
      return;
    }
    if (!availability.openai) {
      setError("Design generation is not configured.");
      return;
    }
    if (credits < cost) {
      setError("You don't have enough credits for this generation.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatus("Creating your design…");
    const idempotencyKey = nanoid();
    const previousCredits = credits;

    try {
      if (saveStatus === "error" || saveStatus === "idle" || onEnsureSaved) {
        const saved = onEnsureSaved ? await onEnsureSaved(true) : true;
        if (!saved) {
          throw Object.assign(
            new Error(
              "We couldn't save this project. Retry the save before generating.",
            ),
            { code: "PROJECT_SAVE_FAILED" },
          );
        }
      }

      const selectionSnapshot = refining
        ? (() => {
            const bounds = selectedObjects.reduce(
              (acc, obj) => {
                const l = obj.left ?? 0;
                const t = obj.top ?? 0;
                const w = obj.getScaledWidth();
                const h = obj.getScaledHeight();
                return {
                  left: Math.min(acc.left, l),
                  top: Math.min(acc.top, t),
                  right: Math.max(acc.right, l + w),
                  bottom: Math.max(acc.bottom, t + h),
                };
              },
              {
                left: Number.POSITIVE_INFINITY,
                top: Number.POSITIVE_INFINITY,
                right: Number.NEGATIVE_INFINITY,
                bottom: Number.NEGATIVE_INFINITY,
              },
            );
            return {
              left: bounds.left,
              top: bounds.top,
              width: Math.max(64, bounds.right - bounds.left),
              height: Math.max(64, bounds.bottom - bounds.top),
              fit: "cover" as const,
            };
          })()
        : {
            left: aiRegion!.left,
            top: aiRegion!.top,
            width: aiRegion!.width,
            height: aiRegion!.height,
            fit: "cover" as const,
          };

      const selectedSceneObjects = refining
        ? fabricObjectsToSceneObjects(selectedObjects)
        : undefined;

      const res = await fetch("/api/ai/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          prompt,
          provider: "openai",
          quality,
          mode: "design",
          selection: selectionSnapshot,
          fit: "cover",
          idempotencyKey,
          selectedObjectIds: refining
            ? selectedSceneObjects?.map((o) => o.id)
            : undefined,
          selectedObjects: selectedSceneObjects,
          nearbySummary: refining
            ? `Refining ${selectedObjects.length} selected object(s).`
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw Object.assign(
          new Error(mapGenerationError(data.error?.code, data.error?.message)),
          { code: data.error?.code },
        );
      }

      const gen = data.generation;
      setCredits(Math.max(0, credits - cost));

      if (gen.refine && Array.isArray(gen.operations) && api) {
        applyRefineOperations(api.canvas, gen.operations);
        api.history?.save();
        window.dispatchEvent(new CustomEvent("hourse:dirty"));
        setStatus(null);
        toast.success("Design updated.");
      } else if (gen.scene) {
        await placeDesignScene(
          gen.scene as EditableDesignScene,
          gen.id,
          selectionSnapshot,
          gen.imageAssets,
        );
        setStatus(null);
        toast.success("Design added to canvas.");
      } else {
        throw new Error(
          "We couldn't create this design. Your credits were restored.",
        );
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "We couldn't create this design. Your credits were restored.";
      setError(message);
      setStatus(null);
      toast.error(message);
      setCredits(previousCredits);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="absolute bottom-14 right-4 z-20 w-[360px] rounded-xl border border-[rgba(17,17,19,0.08)] bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-[rgba(17,17,19,0.08)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Create</h2>
          {aiRegion ? (
            <p className="mt-0.5 text-[11px] text-neutral-500">
              {Math.round(aiRegion.width)}&times;{Math.round(aiRegion.height)}{" "}
              &middot; {aspectRatioLabel(aiRegion.width, aiRegion.height)}
            </p>
          ) : isRefine ? (
            <p className="mt-0.5 text-[11px] text-neutral-500">
              Refine selected objects
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-amber-600">
              Draw an area on the canvas
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAiPanelOpen(false)}
          className="flex size-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div>
          <Label htmlFor="prompt" className="text-xs text-neutral-600">
            Prompt
          </Label>
          <Textarea
            id="prompt"
            className="mt-1 resize-none text-sm"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the design you want to create…"
            maxLength={2000}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PROMPT_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="rounded-full border border-[rgba(17,17,19,0.08)] px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:border-[#635BFF]/30 hover:text-[#635BFF]"
              onClick={() =>
                setPrompt((prev) =>
                  prev ? `${prev}, ${chip.toLowerCase()}` : chip,
                )
              }
            >
              {chip}
            </button>
          ))}
        </div>

        <div>
          <Label className="text-[10px] text-neutral-500">Quality</Label>
          <select
            className="mt-1 h-8 w-full rounded-md border border-[rgba(17,17,19,0.08)] bg-white px-2 text-xs"
            value={quality === "fast" ? "standard" : quality}
            onChange={(e) => setQuality(e.target.value as AiQuality)}
          >
            <option value="standard">{QUALITY_LABELS.standard}</option>
            <option value="high">{QUALITY_LABELS.high}</option>
          </select>
        </div>

        <div className="flex items-center justify-between rounded-md bg-[#F7F7F8] px-3 py-2 text-xs">
          <span className="text-neutral-600">
            Estimated cost: <strong>{cost} credits</strong>
          </span>
          <span className="tabular-nums text-neutral-500">
            {credits} remaining
          </span>
        </div>

        {status && (
          <p className="text-[11px] text-neutral-500" aria-live="polite">
            {status}
          </p>
        )}
        {error && (
          <p className="text-[11px] text-red-600" role="alert">
            {error}
          </p>
        )}

        <Button
          className="w-full bg-[#635BFF] text-white hover:bg-[#5851db]"
          loading={loading}
          disabled={!prompt.trim() || !availability.openai}
          onClick={() => void handleGenerate()}
        >
          {loading
            ? "Creating your design…"
            : isRefine
              ? "Refine selection"
              : "Generate design"}
        </Button>
      </div>
    </div>
  );
}
