"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  DESIGN_PROMPT_LIMIT_MESSAGE,
  DESIGN_PROMPT_WARN_LENGTH,
  MAX_DESIGN_PROMPT_LENGTH,
} from "@/config/prompt";
import { useEditorStore } from "@/stores/editor-store";
import { aspectRatioLabel } from "@/lib/utils/geometry";
import { createObjectId } from "@/lib/canvas/custom-properties";
import type { EditableDesignScene } from "@/lib/design-scene/schema";
import type { DesignOperation } from "@/lib/design-scene/schema";
import { fabricObjectsToSceneObjects } from "@/lib/design-scene/fabric-to-scene";
import {
  getEditableSelection,
} from "@/lib/canvas/editable-selection";
import {
  DesignApplyError,
  applyDesignOperationsToCanvas,
  logDesignApplyError,
} from "@/lib/design-scene/apply-operations";
import {
  DEFAULT_DESIGN_REGION,
  MIN_DESIGN_HEIGHT,
  MIN_DESIGN_WIDTH,
  isDesignRegionLargeEnough,
} from "@/lib/design-scene/region";

type Availability = { openai: boolean; bfl: boolean };

const PROMPT_CHIPS = [
  "Brand logo",
  "Business card",
  "Editorial poster",
  "Social campaign",
  "Product graphic",
];

const APPLY_ERROR_MESSAGE =
  "The design was created, but we couldn't add it to the canvas.";

function mapGenerationError(
  code?: string,
  fallback?: string,
  opts?: { refunded?: boolean },
): string {
  const refunded = opts?.refunded === true;
  const withRefund = (msg: string) =>
    refunded ? `${msg} Your credits were restored.` : msg;

  switch (code) {
    case "PROJECT_SAVE_FAILED":
      return "We couldn't save this project. Retry the save before generating.";
    case "INSUFFICIENT_CREDITS":
      return "You don't have enough credits for this generation.";
    case "INVALID_REFINEMENT_SELECTION":
      return "Select at least one editable object to refine.";
    case "DESIGN_REGION_TOO_SMALL":
      return `Minimum design area: ${MIN_DESIGN_WIDTH} × ${MIN_DESIGN_HEIGHT}`;
    case "DESIGN_PROVIDER_REFUSED":
      return withRefund("This design request could not be completed.");
    case "DESIGN_PROVIDER_INCOMPLETE":
      return withRefund("The design model did not finish the request.");
    case "DESIGN_OPERATIONS_EMPTY":
    case "DESIGN_OUTPUT_EMPTY":
      return withRefund("No editable elements were created.");
    case "DESIGN_SCENE_INVALID":
    case "DESIGN_OUTPUT_SCHEMA_INVALID":
    case "DESIGN_OUTPUT_PARSE_FAILED":
    case "DESIGN_NORMALIZATION_FAILED":
    case "DESIGN_OBJECT_CONVERSION_FAILED":
      return withRefund("The design could not be prepared.");
    case "DESIGN_SCHEMA_INVALID":
    case "DESIGN_MODEL_NOT_CONFIGURED":
      return withRefund("Design generation is temporarily unavailable.");
    case "PROVIDER_NOT_CONFIGURED":
      return "Design generation is not configured.";
    case "AUTH_REQUIRED":
    case "unauthorized":
      return "Your session has expired. Sign in again.";
    case "CREDIT_REFUND_ERROR":
      return "The design could not be created. We couldn't restore the credits automatically.";
    default:
      if (fallback && !/credits were restored/i.test(fallback)) {
        return withRefund(fallback);
      }
      if (fallback && refunded) return fallback;
      if (fallback && !refunded) {
        return fallback.replace(/\s*Your credits were restored\.?/i, "").trim();
      }
      return withRefund("We couldn't create this design.");
  }
}

type Props = {
  projectId: string;
  availability: Availability;
  onEnsureSaved?: (force?: boolean) => Promise<boolean>;
};

type PendingApply = {
  generationId: string;
  refine: boolean;
  operations?: DesignOperation[];
  scene?: EditableDesignScene;
  imageAssets?: Record<
    string,
    { assetId: string; signedUrl: string | null; bucket: string; path: string }
  >;
  selection: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

function getHourseApi(): {
  canvas: Canvas;
  history?: { save: () => void };
  revealObjects?: (objects: FabricObject[]) => number;
  fitGeneration?: (generationId: string) => number;
  syncZoom?: () => void;
} | null {
  return (
    (
      window as unknown as {
        __hourse?: {
          canvas: Canvas;
          history?: { save: () => void };
          revealObjects?: (objects: FabricObject[]) => number;
          fitGeneration?: (generationId: string) => number;
          syncZoom?: () => void;
        };
      }
    ).__hourse ?? null
  );
}

function clampPrompt(value: string): { text: string; truncated: boolean } {
  if (value.length <= MAX_DESIGN_PROMPT_LENGTH) {
    return { text: value, truncated: false };
  }
  return {
    text: value.slice(0, MAX_DESIGN_PROMPT_LENGTH),
    truncated: true,
  };
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
  const [promptLimitMessage, setPromptLimitMessage] = useState<string | null>(
    null,
  );
  const [quality, setQuality] = useState<AiQuality>("standard");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingApply, setPendingApply] = useState<PendingApply | null>(null);
  const [lastGenerationId, setLastGenerationId] = useState<string | null>(null);
  const [selectionEpoch, setSelectionEpoch] = useState(0);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const bump = () => setSelectionEpoch((n) => n + 1);
    window.addEventListener("hourse:dirty", bump);
    return () => {
      window.removeEventListener("hourse:dirty", bump);
    };
  }, []);

  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(220, Math.max(80, el.scrollHeight));
    el.style.height = `${next}px`;
  }, [prompt, aiPanelOpen]);

  const editableSelection = useMemo(() => {
    void selected;
    void selectionEpoch;
    if (typeof window === "undefined") return [] as FabricObject[];
    const api = getHourseApi();
    if (!api) return [];
    return getEditableSelection(api.canvas);
  }, [selected, selectionEpoch]);

  const isRefine = editableSelection.length > 0;

  const regionTooSmall =
    !isRefine &&
    !!aiRegion &&
    !isDesignRegionLargeEnough(aiRegion.width, aiRegion.height);

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
    imageAssets?: PendingApply["imageAssets"],
  ) {
    const api = getHourseApi();
    if (!api) throw new DesignApplyError("CANVAS_UNAVAILABLE", "Canvas unavailable");

    const { insertDesignSceneToCanvas, scaleSceneToRegion } = await import(
      "@/lib/design-scene/scene-to-fabric"
    );

    const designBlockId = createObjectId();
    const fit = scaleSceneToRegion(scene, selection);
    const imageUrlById = new Map<string, string>();
    if (imageAssets) {
      for (const [id, asset] of Object.entries(imageAssets)) {
        if (asset.signedUrl) imageUrlById.set(id, asset.signedUrl);
        else if (asset.assetId) {
          imageUrlById.set(id, `/api/assets/${asset.assetId}/content`);
        }
      }
    }

    const { fabricObjects } = await insertDesignSceneToCanvas(
      api.canvas,
      scene,
      {
        offsetLeft: fit.offsetLeft,
        offsetTop: fit.offsetTop,
        scaleX: fit.scaleX,
        scaleY: fit.scaleY,
        generationId,
        designBlockId,
      },
      imageUrlById,
    );

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
      .filter((obj) => {
        const role = (obj as FabricObject & { objectRole?: string }).objectRole;
        const name = (obj as FabricObject & { name?: string }).name;
        return role === "ai-region" || name === "AI region";
      });
    if (regions.length) {
      api.canvas.remove(...regions);
      setAiRegion(null);
    }

    for (const object of fabricObjects) {
      object.setCoords();
    }

    api.revealObjects?.(fabricObjects);
    api.syncZoom?.();
    setLastGenerationId(generationId);

    api.history?.save();
    api.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent("hourse:dirty"));
    return fabricObjects;
  }

  async function applyCompletedGeneration(
    pending: PendingApply,
    editableSelectionCount: number,
  ) {
    const api = getHourseApi();
    if (!api) {
      throw new DesignApplyError("CANVAS_UNAVAILABLE", "Canvas unavailable");
    }

    try {
      if (pending.refine && pending.operations) {
        await applyDesignOperationsToCanvas(api.canvas, pending.operations, {
          generationId: pending.generationId,
          editableSelectionCount,
        });
        api.history?.save();
        window.dispatchEvent(new CustomEvent("hourse:dirty"));
        const created = api.canvas
          .getObjects()
          .filter(
            (obj) =>
              (obj as FabricObject & { generationId?: string }).generationId ===
              pending.generationId,
          );
        if (created.length) {
          api.revealObjects?.(created);
          api.syncZoom?.();
        }
        setLastGenerationId(pending.generationId);
        return;
      }

      if (pending.scene) {
        await placeDesignScene(
          pending.scene,
          pending.generationId,
          pending.selection,
          pending.imageAssets,
        );
        return;
      }

      throw new DesignApplyError(
        "EMPTY_OPERATIONS",
        "No design payload to apply",
      );
    } catch (error) {
      logDesignApplyError({
        generationId: pending.generationId,
        applicationStage: "apply_completed_generation",
        error,
        createdObjectCount: 0,
        editableSelectionCount,
        operationType: pending.refine ? "refine" : "create",
      });
      throw error;
    }
  }

  async function retryApplyToCanvas() {
    if (!pendingApply) return;
    setApplying(true);
    setError(null);
    setStatus("Adding design to canvas…");
    try {
      // Prefer server-stored payload (0 credits, no OpenAI).
      const res = await fetch(
        `/api/ai/generations/${pendingApply.generationId}`,
      );
      const data = await res.json();
      const gen = data.generation;
      const next: PendingApply = {
        ...pendingApply,
        operations: Array.isArray(gen?.operations)
          ? gen.operations
          : pendingApply.operations,
        scene: (gen?.scene as EditableDesignScene | undefined) ?? pendingApply.scene,
        refine: Boolean(gen?.refine ?? pendingApply.refine),
      };
      await applyCompletedGeneration(next, editableSelection.length);
      setPendingApply(null);
      setStatus(null);
      toast.success(
        next.refine ? "Design updated." : "Design added to canvas.",
      );
    } catch (err) {
      logDesignApplyError({
        generationId: pendingApply.generationId,
        applicationStage: "retry_apply",
        error: err,
        editableSelectionCount: editableSelection.length,
      });
      setError(APPLY_ERROR_MESSAGE);
      toast.error(APPLY_ERROR_MESSAGE);
    } finally {
      setApplying(false);
      setStatus(null);
    }
  }

  async function handleGenerate() {
    const api = getHourseApi();
    const selectedObjects = api ? getEditableSelection(api.canvas) : [];
    const refining = selectedObjects.length > 0;

    if (prompt.length > MAX_DESIGN_PROMPT_LENGTH) {
      setPromptLimitMessage(DESIGN_PROMPT_LIMIT_MESSAGE);
      return;
    }
    if (!prompt.trim()) {
      setError("Enter a design prompt.");
      return;
    }

    if (!refining && !aiRegion) {
      setError("Draw an area on the canvas first.");
      return;
    }
    if (
      !refining &&
      aiRegion &&
      !isDesignRegionLargeEnough(aiRegion.width, aiRegion.height)
    ) {
      setError(
        `Minimum design area: ${MIN_DESIGN_WIDTH} × ${MIN_DESIGN_HEIGHT}`,
      );
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
    setPendingApply(null);
    setStatus(
      refining ? "Refining your design…" : "Creating your design…",
    );
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
        if (typeof data.creditBalance === "number") {
          setCredits(data.creditBalance);
        }
        throw Object.assign(
          new Error(
            mapGenerationError(data.error?.code, data.error?.message, {
              refunded: data.refunded === true,
            }),
          ),
          {
            code: data.error?.code,
            refunded: data.refunded === true,
            creditBalance:
              typeof data.creditBalance === "number"
                ? data.creditBalance
                : undefined,
          },
        );
      }

      const gen = data.generation;
      setCredits(Math.max(0, credits - cost));

      const pending: PendingApply = {
        generationId: gen.id,
        refine: Boolean(gen.refine),
        operations: Array.isArray(gen.operations) ? gen.operations : undefined,
        scene: gen.scene as EditableDesignScene | undefined,
        imageAssets: gen.imageAssets,
        selection: {
          left: selectionSnapshot.left,
          top: selectionSnapshot.top,
          width: selectionSnapshot.width,
          height: selectionSnapshot.height,
        },
      };

      try {
        await applyCompletedGeneration(pending, selectedObjects.length);
        setPendingApply(null);
        setStatus(null);
        toast.success(
          pending.refine ? "Design updated." : "Design added to canvas.",
        );
      } catch (applyError) {
        setPendingApply(pending);
        setStatus("insertion_failed");
        setError(APPLY_ERROR_MESSAGE);
        toast.error(APPLY_ERROR_MESSAGE);
        // Credits already charged for a completed generation — do not restore.
        setCredits(Math.max(0, credits - cost));
        logDesignApplyError({
          generationId: gen.id,
          applicationStage: "post_generation_apply",
          error: applyError,
          editableSelectionCount: selectedObjects.length,
        });
      }
    } catch (err) {
      const errObj = err as {
        code?: string;
        message?: string;
        refunded?: boolean;
        creditBalance?: number;
      };
      if (typeof errObj.creditBalance === "number") {
        setCredits(errObj.creditBalance);
      } else if (errObj.refunded === true) {
        // Balance already restored server-side; keep optimistic previous if unknown.
        setCredits(previousCredits);
      } else {
        // Do not claim a refund restored the balance when the server did not confirm.
        void fetch("/api/account")
          .then((r) => r.json())
          .then((account) => {
            if (typeof account?.profile?.credit_balance === "number") {
              setCredits(account.profile.credit_balance);
            }
          })
          .catch(() => {
            /* ignore */
          });
      }

      const message =
        err instanceof Error
          ? mapGenerationError(errObj.code, err.message, {
              refunded: errObj.refunded === true,
            })
          : "We couldn't create this design.";
      const looksLikeRawJs =
        /TypeError|Cannot read propert|is not an object \(evaluating/i.test(
          message,
        );
      const safeMessage = looksLikeRawJs ? APPLY_ERROR_MESSAGE : message;
      setError(safeMessage);
      setStatus(null);
      toast.error(safeMessage);
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
            <p
              className={`mt-0.5 text-[11px] ${
                regionTooSmall ? "text-amber-600" : "text-neutral-500"
              }`}
            >
              {Math.round(aiRegion.width)}&times;{Math.round(aiRegion.height)}{" "}
              &middot; {aspectRatioLabel(aiRegion.width, aiRegion.height)}
            </p>
          ) : isRefine ? (
            <p className="mt-0.5 text-[11px] text-neutral-500">
              Refine selected objects
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-amber-600">
              Click or drag to place a {DEFAULT_DESIGN_REGION.width}×
              {DEFAULT_DESIGN_REGION.height} area
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
            ref={promptRef}
            className="mt-1 max-h-[220px] min-h-[80px] resize-none overflow-y-auto text-sm"
            rows={3}
            value={prompt}
            onChange={(e) => {
              const next = clampPrompt(e.target.value);
              setPrompt(next.text);
              setPromptLimitMessage(
                next.truncated ? DESIGN_PROMPT_LIMIT_MESSAGE : null,
              );
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (!pasted) return;
              const el = e.currentTarget;
              const start = el.selectionStart ?? prompt.length;
              const end = el.selectionEnd ?? prompt.length;
              const merged =
                prompt.slice(0, start) + pasted + prompt.slice(end);
              if (merged.length > MAX_DESIGN_PROMPT_LENGTH) {
                e.preventDefault();
                const clipped = clampPrompt(merged);
                setPrompt(clipped.text);
                setPromptLimitMessage(DESIGN_PROMPT_LIMIT_MESSAGE);
              }
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                if (!loading && prompt.trim()) {
                  void handleGenerate();
                }
              }
            }}
            placeholder="Describe the design you want to create…"
            maxLength={MAX_DESIGN_PROMPT_LENGTH}
          />
          <div className="mt-1 flex items-start justify-between gap-2">
            <p
              className={`text-[10px] ${
                promptLimitMessage
                  ? "text-amber-600"
                  : "text-transparent"
              }`}
              aria-live="polite"
            >
              {promptLimitMessage ?? DESIGN_PROMPT_LIMIT_MESSAGE}
            </p>
            <p
              className={`text-right text-[10px] tabular-nums ${
                prompt.length >= MAX_DESIGN_PROMPT_LENGTH
                  ? "font-medium text-amber-700"
                  : prompt.length >= DESIGN_PROMPT_WARN_LENGTH
                    ? "text-amber-600"
                    : "text-neutral-400"
              }`}
            >
              {prompt.length.toLocaleString("en-US")} /{" "}
              {MAX_DESIGN_PROMPT_LENGTH.toLocaleString("en-US")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PROMPT_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="rounded-full border border-[rgba(17,17,19,0.08)] px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:border-[#635BFF]/30 hover:text-[#635BFF]"
              onClick={() =>
                setPrompt((prev) => {
                  const next = prev
                    ? `${prev}, ${chip.toLowerCase()}`
                    : chip;
                  const clipped = clampPrompt(next);
                  if (clipped.truncated) {
                    setPromptLimitMessage(DESIGN_PROMPT_LIMIT_MESSAGE);
                  }
                  return clipped.text;
                })
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

        {regionTooSmall ? (
          <p className="text-[11px] text-amber-600">
            Minimum design area: {MIN_DESIGN_WIDTH} × {MIN_DESIGN_HEIGHT}
          </p>
        ) : null}

        {status && status !== "insertion_failed" && (
          <p className="text-[11px] text-neutral-500" aria-live="polite">
            {status}
          </p>
        )}
        {error && (
          <div className="space-y-2" role="alert">
            <p className="text-[11px] text-red-600">{error}</p>
            {pendingApply ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                loading={applying}
                onClick={() => void retryApplyToCanvas()}
              >
                Retry adding design
              </Button>
            ) : null}
          </div>
        )}

        {lastGenerationId && !pendingApply ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-full text-[11px]"
            onClick={() => {
              const api = getHourseApi();
              if (!api || !lastGenerationId) return;
              api.fitGeneration?.(lastGenerationId);
              api.syncZoom?.();
            }}
          >
            Show generated design
          </Button>
        ) : null}

        <Button
          className="w-full bg-[#635BFF] text-white hover:bg-[#5851db]"
          loading={loading}
          disabled={
            !prompt.trim() ||
            prompt.length > MAX_DESIGN_PROMPT_LENGTH ||
            !availability.openai ||
            (!isRefine && (!aiRegion || regionTooSmall))
          }
          onClick={() => void handleGenerate()}
        >
          {loading
            ? isRefine
              ? "Refining your design…"
              : "Creating your design…"
            : isRefine
              ? "Refine selection"
              : "Generate design"}
        </Button>
      </div>
    </div>
  );
}
