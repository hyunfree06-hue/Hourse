"use client";

import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  calculateCreditCost,
  MODE_LABELS,
  PROVIDER_LABELS,
  QUALITY_LABELS,
  type AiMode,
  type AiProviderId,
  type AiQuality,
} from "@/config/credits";
import { useEditorStore } from "@/stores/editor-store";
import { withCustomDefaults } from "@/lib/canvas/custom-properties";
import { aspectRatioLabel } from "@/lib/utils/geometry";
import {
  CANVAS_INSERT_ERROR_MESSAGE,
  GeneratedImageLoadError,
} from "@/lib/canvas/load-fabric-image";

function sanitizeUserError(message: string): string {
  if (/supabase\.co|object\/sign|token=|X-Amz-|signed/i.test(message)) {
    return CANVAS_INSERT_ERROR_MESSAGE;
  }
  if (/fabric:\s*error loading/i.test(message)) {
    return CANVAS_INSERT_ERROR_MESSAGE;
  }
  return message;
}

type Availability = { openai: boolean; bfl: boolean };

const PROMPT_CHIPS = [
  "Editorial poster",
  "Soft 3D icon",
  "Abstract gradient",
  "Product still life",
];

function mapGenerationError(code?: string, fallback?: string): string {
  switch (code) {
    case "PROJECT_SAVE_FAILED":
      return "We couldn't save this project. Retry the save before generating.";
    case "INSUFFICIENT_CREDITS":
      return "You don't have enough credits for this generation.";
    case "PROVIDER_NOT_CONFIGURED":
    case "provider_unavailable":
      return "This model is not configured.";
    case "INVALID_GENERATION_SIZE":
      return "This selection could not be prepared for the selected model.";
    case "PROVIDER_REQUEST_FAILED":
    case "provider_error":
      return "The image model couldn't complete this request. Your credits were restored.";
    case "STORAGE_UPLOAD_FAILED":
    case "upload_failed":
      return "The image was generated, but we couldn't add it to your project.";
    case "AUTH_REQUIRED":
    case "unauthorized":
      return "Your session has expired. Sign in again.";
    default:
      return fallback || "Generation failed. Please try again.";
  }
}

type Props = {
  projectId: string;
  availability: Availability;
  onEnsureSaved?: (force?: boolean) => Promise<boolean>;
};

export function AiPanel({ projectId, availability, onEnsureSaved }: Props) {
  const aiRegion = useEditorStore((s) => s.aiRegion);
  const aiPanelOpen = useEditorStore((s) => s.aiPanelOpen);
  const credits = useEditorStore((s) => s.credits);
  const setCredits = useEditorStore((s) => s.setCredits);
  const setAiPanelOpen = useEditorStore((s) => s.setAiPanelOpen);
  const setAiRegion = useEditorStore((s) => s.setAiRegion);
  const saveStatus = useEditorStore((s) => s.saveStatus);

  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<AiProviderId>(
    availability.openai ? "openai" : availability.bfl ? "bfl" : "openai",
  );
  const [mode, setMode] = useState<AiMode>("generate");
  const [quality, setQuality] = useState<AiQuality>("standard");
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [loading, setLoading] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [pendingInsert, setPendingInsert] = useState<{
    id: string;
    output_asset_id?: string;
    signedUrl?: string;
    selection: {
      left: number;
      top: number;
      width: number;
      height: number;
      fit: "cover" | "contain";
    };
  } | null>(null);
  const [history, setHistory] = useState<
    Array<{ id: string; prompt: string; status: string }>
  >([]);

  const cost = useMemo(
    () => calculateCreditCost({ provider, quality, mode }),
    [provider, quality, mode],
  );

  useEffect(() => {
    if (!availability[provider]) {
      // keep selected but disable generate
    }
  }, [availability, provider]);

  if (!aiPanelOpen) return null;

  async function captureRegionPng(): Promise<string | null> {
    const api = (
      window as unknown as {
        __hourse?: {
          canvas: {
            toDataURL: (o: object) => string;
            getObjects: () => Array<{ objectRole?: string; visible?: boolean }>;
          };
        };
      }
    ).__hourse;
    if (!api || !aiRegion) return null;
    const hidden: Array<{ obj: { visible?: boolean }; prev: boolean }> = [];
    api.canvas.getObjects().forEach((obj) => {
      if (obj.objectRole === "ai-region") {
        hidden.push({ obj, prev: obj.visible !== false });
        obj.visible = false;
      }
    });
    const dataUrl = api.canvas.toDataURL({
      format: "png",
      left: aiRegion.left,
      top: aiRegion.top,
      width: aiRegion.width,
      height: aiRegion.height,
      multiplier: 1,
    });
    hidden.forEach(({ obj, prev }) => {
      obj.visible = prev;
    });
    return dataUrl;
  }

  async function pollGeneration(id: string) {
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`/api/ai/generations/${id}`);
      const data = await res.json();
      const gen = data.generation;
      if (!gen) throw new Error("Unable to check generation status.");
      setStatus(gen.status);
      if (gen.status === "completed") {
        return gen as {
          signedUrl?: string;
          output_asset_id?: string;
          id: string;
        };
      }
      if (gen.status === "failed" || gen.status === "cancelled") {
        throw new Error(gen.error_message || "Generation failed.");
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Generation timed out.");
  }

  async function refreshAssetAccess(id: string): Promise<{
    signedUrl: string | null;
    assetId: string | null;
    bucket: string | null;
    path: string | null;
  }> {
    const res = await fetch(`/api/ai/generations/${id}/signed-url`, {
      method: "POST",
    });
    if (!res.ok) {
      return { signedUrl: null, assetId: null, bucket: null, path: null };
    }
    const data = await res.json();
    return {
      signedUrl: typeof data.signedUrl === "string" ? data.signedUrl : null,
      assetId: typeof data.assetId === "string" ? data.assetId : null,
      bucket: typeof data.bucket === "string" ? data.bucket : null,
      path: typeof data.path === "string" ? data.path : null,
    };
  }

  function logInsert(
    insertStage: string,
    data?: Record<string, unknown>,
  ) {
    if (process.env.NODE_ENV !== "development") return;
    const safe = { ...(data ?? {}) };
    delete safe.signedUrl;
    delete safe.url;
    delete safe.token;
    delete safe.authorization;
    delete safe.cookie;
    console.info(
      JSON.stringify({
        scope: "client_image_insert",
        stage: insertStage,
        ...safe,
      }),
    );
  }

  async function placeResult(gen: {
    signedUrl?: string | null;
    output_asset_id?: string;
    id: string;
    storageBucket?: string | null;
    storagePath?: string | null;
    selection?: {
      left: number;
      top: number;
      width: number;
      height: number;
      fit: "cover" | "contain";
    };
  }) {
    const api = (
      window as unknown as {
        __hourse?: {
          canvas: {
            add: (o: unknown) => void;
            remove: (...o: unknown[]) => void;
            getObjects: () => Array<{
              objectRole?: string;
              clipPath?: { absolutePositioned?: boolean };
            }>;
            setActiveObject: (o: unknown) => void;
            requestRenderAll: () => void;
          };
        };
      }
    ).__hourse;

    const selection = gen.selection ?? (aiRegion
      ? {
          left: aiRegion.left,
          top: aiRegion.top,
          width: aiRegion.width,
          height: aiRegion.height,
          fit,
        }
      : null);

    if (!api || !selection) {
      throw new GeneratedImageLoadError("CANVAS_UNAVAILABLE");
    }

    const assetId = gen.output_asset_id;
    let signedUrl = gen.signedUrl ?? null;
    let storageBucket = gen.storageBucket ?? null;
    let storagePath = gen.storagePath ?? null;

    if (!assetId && !signedUrl) {
      const refreshed = await refreshAssetAccess(gen.id);
      signedUrl = refreshed.signedUrl;
      storageBucket = refreshed.bucket;
      storagePath = refreshed.path;
    } else if (assetId && (!storageBucket || !storagePath)) {
      const refreshed = await refreshAssetAccess(gen.id);
      signedUrl = signedUrl ?? refreshed.signedUrl;
      storageBucket = storageBucket ?? refreshed.bucket;
      storagePath = storagePath ?? refreshed.path;
    }

    const {
      loadFabricImageForAsset,
      getFabricVersionForLogs,
    } = await import("@/lib/canvas/load-fabric-image");
    const {
      computeGeneratedImagePlacement,
      applyGeneratedImagePlacement,
      isAbsoluteClipPath,
    } = await import("@/lib/canvas/place-generated-image");

    logInsert("asset_fetch", {
      event: "start",
      assetId,
      generationId: gen.id,
      fabricVersion: getFabricVersionForLogs(),
    });

    const loaded = await loadFabricImageForAsset({
      assetId,
      signedUrl,
      preferSameOrigin: true,
      generationId: gen.id,
      refreshSignedUrl: async () => {
        const refreshed = await refreshAssetAccess(gen.id);
        return refreshed.signedUrl;
      },
      onStage: (stageName, data) => logInsert(stageName, data),
    });

    const img = loaded.image;
    const target = {
      left: Number(selection.left),
      top: Number(selection.top),
      width: Number(selection.width),
      height: Number(selection.height),
    };

    logInsert("image_transform", {
      event: "placement_start",
      width: img.width,
      height: img.height,
      blobSize: loaded.blobSize,
      contentType: loaded.contentType,
      targetWidth: target.width,
      targetHeight: target.height,
      fit: selection.fit,
    });

    const placement = computeGeneratedImagePlacement(
      img.width || 0,
      img.height || 0,
      target,
      selection.fit,
    );

    logInsert("clip_path", {
      event: "create_relative_rect",
      absolutePositioned: false,
      localClipWidth: placement.localClipWidth,
      localClipHeight: placement.localClipHeight,
      scaleX: placement.scaleX,
      scaleY: placement.scaleY,
      centerLeft: placement.left,
      centerTop: placement.top,
    });

    const clipPath = applyGeneratedImagePlacement(img, placement);
    if (isAbsoluteClipPath(clipPath)) {
      throw new GeneratedImageLoadError("INVALID_CLIP_PATH");
    }

    img.set(
      withCustomDefaults({
        objectId: loaded.objectId,
        objectRole: "generated",
        generatedBy: provider,
        generationId: gen.id,
        assetId,
        storageBucket: storageBucket ?? "generated-assets",
        storagePath: storagePath ?? undefined,
        name: "Generated image",
      }),
    );
    // Re-apply placement after withCustomDefaults so custom props don't wipe transform/clip.
    applyGeneratedImagePlacement(img, placement);
    img.setCoords();

    logInsert("canvas_add", { event: "add_start" });
    api.canvas.add(img);

    // Remove temporary AI-region overlays only — never dispose the image clipPath.
    const regions = api.canvas
      .getObjects()
      .filter((obj) => obj.objectRole === "ai-region");
    if (regions.length) {
      api.canvas.remove(...regions);
      setAiRegion(null);
      logInsert("clip_path", {
        event: "ai_region_removed",
        removedCount: regions.length,
        clipStillAttached: Boolean(img.clipPath),
        clipAbsolute: isAbsoluteClipPath(
          img.clipPath as { absolutePositioned?: boolean } | undefined,
        ),
      });
    }

    api.canvas.setActiveObject(img);
    img.setCoords();
    logInsert("canvas_render", { event: "requestRenderAll" });
    api.canvas.requestRenderAll();

    const objects = api.canvas.getObjects();
    const wasAdded = objects.includes(img);
    logInsert("canvas_add", {
      event: "verify",
      wasAdded,
      objectCount: objects.length,
      width: img.width,
      height: img.height,
      scaleX: placement.scaleX,
      source: loaded.source,
      objectUrlKeptAlive: Boolean(loaded.objectUrl),
      contentType: loaded.contentType,
      blobSize: loaded.blobSize,
      clipAbsolutePositioned: isAbsoluteClipPath(
        img.clipPath as { absolutePositioned?: boolean } | undefined,
      ),
    });
    if (!wasAdded) {
      throw new GeneratedImageLoadError("FABRIC_IMAGE_NOT_ADDED");
    }

    // Autosave is separate — never report save failure as insertion_failed.
    logInsert("autosave", { event: "trigger_after_insertion_success" });
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent("hourse:dirty"));
    });
  }

  async function retryInsertToCanvas() {
    if (!pendingInsert) return;
    setInserting(true);
    setError(null);
    logInsert("retry", {
      event: "start",
      generationId: pendingInsert.id,
      assetId: pendingInsert.output_asset_id,
      note: "insert_only_no_openai_no_credits",
    });
    try {
      const refreshed = await refreshAssetAccess(pendingInsert.id);
      await placeResult({
        id: pendingInsert.id,
        output_asset_id:
          refreshed.assetId ?? pendingInsert.output_asset_id,
        signedUrl: refreshed.signedUrl ?? pendingInsert.signedUrl,
        storageBucket: refreshed.bucket,
        storagePath: refreshed.path,
        selection: pendingInsert.selection,
      });
      setPendingInsert(null);
      setStatus("completed");
      setHistory((prev) =>
        prev.map((h) =>
          h.id === pendingInsert.id ? { ...h, status: "completed" } : h,
        ),
      );
      toast.success("Image added to canvas.");
    } catch (err) {
      setStatus("insertion_failed");
      setError(CANVAS_INSERT_ERROR_MESSAGE);
      toast.error(CANVAS_INSERT_ERROR_MESSAGE);
      logInsert("retry", {
        event: "failed",
        code:
          err instanceof GeneratedImageLoadError ? err.code : "unknown",
        httpStatus:
          err instanceof GeneratedImageLoadError ? err.httpStatus : undefined,
      });
    } finally {
      setInserting(false);
    }
  }

  async function handleGenerate() {
    if (!aiRegion) {
      setError("Draw an AI region on the canvas first.");
      return;
    }
    if (!availability[provider]) {
      setError("This model is not configured.");
      return;
    }
    if (credits < cost) {
      setError("You don't have enough credits for this generation.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatus("queued");
    const idempotencyKey = nanoid();

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

      // Snapshot selection before async work — AI region may be deselected later.
      const selectionSnapshot = {
        left: aiRegion.left,
        top: aiRegion.top,
        width: aiRegion.width,
        height: aiRegion.height,
        fit,
      };

      let referenceImageBase64: string | undefined;
      if (mode === "replace" || mode === "edit") {
        referenceImageBase64 = (await captureRegionPng()) ?? undefined;
      }

      const res = await fetch("/api/ai/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          prompt,
          provider,
          quality,
          mode,
          selection: {
            left: selectionSnapshot.left,
            top: selectionSnapshot.top,
            width: selectionSnapshot.width,
            height: selectionSnapshot.height,
            fit: selectionSnapshot.fit,
          },
          fit: selectionSnapshot.fit,
          idempotencyKey,
          referenceImageBase64,
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
      setGenerationId(gen.id);
      setHistory((prev) => [
        { id: gen.id, prompt, status: gen.status },
        ...prev.slice(0, 9),
      ]);
      setCredits(Math.max(0, credits - cost));

      let completed = gen;
      if (gen.status !== "completed") {
        completed = await pollGeneration(gen.id);
      } else if (!gen.signedUrl && gen.id) {
        completed = await pollGeneration(gen.id);
      }

      // Provider + storage succeeded — credits already charged. Insertion is separate.
      setStatus("insertion_pending");
      try {
        await placeResult({
          ...completed,
          selection: selectionSnapshot,
        });
        setPendingInsert(null);
        setStatus("completed");
        setHistory((prev) =>
          prev.map((h) => (h.id === gen.id ? { ...h, status: "completed" } : h)),
        );
        toast.success("Image generated successfully.");
      } catch (insertError) {
        setPendingInsert({
          id: completed.id,
          output_asset_id: completed.output_asset_id,
          signedUrl: completed.signedUrl,
          selection: selectionSnapshot,
        });
        setStatus("insertion_failed");
        setError(CANVAS_INSERT_ERROR_MESSAGE);
        toast.error(CANVAS_INSERT_ERROR_MESSAGE);
        logInsert("client_insertion_failed", {
          generationId: completed.id,
          assetId: completed.output_asset_id,
          code:
            insertError instanceof GeneratedImageLoadError
              ? insertError.code
              : "unknown",
          httpStatus:
            insertError instanceof GeneratedImageLoadError
              ? insertError.httpStatus
              : undefined,
          contentType:
            insertError instanceof GeneratedImageLoadError
              ? insertError.contentType
              : undefined,
          message:
            insertError instanceof Error ? insertError.message : undefined,
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? sanitizeUserError(err.message)
          : "Generation failed.";
      setError(message);
      setStatus("failed");
      toast.error(message);
      // Only restore optimistic credit display when generation itself failed
      setCredits(credits);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!generationId) return;
    await fetch(`/api/ai/generations/${generationId}/cancel`, {
      method: "POST",
    });
    setLoading(false);
    setStatus("cancelled");
  }

  return (
    <div className="absolute bottom-14 right-4 z-20 w-[360px] rounded-xl border border-[rgba(17,17,19,0.08)] bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[rgba(17,17,19,0.08)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Generate</h2>
          {aiRegion ? (
            <p className="mt-0.5 text-[11px] text-neutral-500">
              {Math.round(aiRegion.width)}&times;{Math.round(aiRegion.height)} &middot;{" "}
              {aspectRatioLabel(aiRegion.width, aiRegion.height)}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-amber-600">Drag an area on the canvas</p>
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
        {/* Prompt */}
        <div>
          <Label htmlFor="prompt" className="text-xs text-neutral-600">Prompt</Label>
          <Textarea
            id="prompt"
            className="mt-1 resize-none text-sm"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what should appear in this area\u2026"
            maxLength={2000}
          />
        </div>

        {/* Chips */}
        <div className="flex flex-wrap gap-1.5">
          {PROMPT_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="rounded-full border border-[rgba(17,17,19,0.08)] px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:border-[#635BFF]/30 hover:text-[#635BFF]"
              onClick={() => setPrompt((prev) => (prev ? `${prev}, ${chip.toLowerCase()}` : chip))}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Controls grid */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-neutral-500">Model</Label>
            <select
              className="mt-1 h-8 w-full rounded-md border border-[rgba(17,17,19,0.08)] bg-white px-2 text-xs"
              value={provider}
              onChange={(e) => setProvider(e.target.value as AiProviderId)}
            >
              {(["openai", "bfl"] as AiProviderId[]).map((id) => (
                <option key={id} value={id} disabled={!availability[id]}>
                  {PROVIDER_LABELS[id]}
                  {!availability[id] ? " (unavailable)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[10px] text-neutral-500">Mode</Label>
            <select
              className="mt-1 h-8 w-full rounded-md border border-[rgba(17,17,19,0.08)] bg-white px-2 text-xs"
              value={mode}
              onChange={(e) => setMode(e.target.value as AiMode)}
            >
              <option value="generate">{MODE_LABELS.generate}</option>
              <option value="replace">{MODE_LABELS.replace}</option>
              <option value="edit">{MODE_LABELS.edit}</option>
            </select>
          </div>
          <div>
            <Label className="text-[10px] text-neutral-500">Quality</Label>
            <select
              className="mt-1 h-8 w-full rounded-md border border-[rgba(17,17,19,0.08)] bg-white px-2 text-xs"
              value={quality}
              onChange={(e) => setQuality(e.target.value as AiQuality)}
            >
              {(Object.keys(QUALITY_LABELS) as AiQuality[]).map((q) => (
                <option key={q} value={q}>
                  {QUALITY_LABELS[q]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[10px] text-neutral-500">Fit</Label>
            <select
              className="mt-1 h-8 w-full rounded-md border border-[rgba(17,17,19,0.08)] bg-white px-2 text-xs"
              value={fit}
              onChange={(e) => setFit(e.target.value as "cover" | "contain")}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
            </select>
          </div>
        </div>

        {!availability[provider] && (
          <p className="text-[11px] text-amber-700">
            API key not configured on the server.
          </p>
        )}

        {/* Cost estimate */}
        <div className="flex items-center justify-between rounded-md bg-[#F7F7F8] px-3 py-2 text-xs">
          <span className="text-neutral-600">Estimated cost: <strong>{cost} credits</strong></span>
          <span className="tabular-nums text-neutral-500">{credits} remaining</span>
        </div>

        {/* Status */}
        {status && (
          <p className="text-[11px] text-neutral-500" aria-live="polite">
            Status: {status}
          </p>
        )}
        {error && (
          <div className="space-y-2" role="alert">
            <p className="text-[11px] text-red-600">{error}</p>
            {pendingInsert && status === "insertion_failed" ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  loading={inserting}
                  onClick={() => void retryInsertToCanvas()}
                >
                  Retry adding to canvas
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    setPendingInsert(null);
                    setError(null);
                    setStatus("completed");
                  }}
                >
                  Dismiss
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-[#635BFF] text-white hover:bg-[#5851db]"
            loading={loading}
            disabled={!prompt.trim() || !availability[provider]}
            onClick={handleGenerate}
          >
            {loading ? "Generating\u2026" : "Generate"}
          </Button>
          {loading && (
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="border-t border-[rgba(17,17,19,0.08)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Recent</p>
          <ul className="mt-1.5 space-y-1">
            {history.map((item) => (
              <li key={item.id} className="truncate text-[11px] text-neutral-600">
                <span className="mr-1 inline-block rounded bg-neutral-100 px-1 py-0.5 text-[10px] text-neutral-500">{item.status}</span>
                {item.prompt}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
