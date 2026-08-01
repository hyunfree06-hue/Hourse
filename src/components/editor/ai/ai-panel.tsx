"use client";

import { useEffect, useMemo, useState } from "react";
import { FabricImage, Rect } from "fabric";
import { nanoid } from "nanoid";
import { toast } from "sonner";
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

type Availability = { openai: boolean; bfl: boolean };

const EXAMPLES = [
  "미니멀한 앱 온보딩 일러스트, 플랫 스타일, 밝은 배경",
  "제품 히어로용 추상 그라데이션 배경, 부드러운 조명",
  "모바일 UI 목업 속 대시보드 카드, 깔끔한 SaaS 스타일",
];

type Props = {
  projectId: string;
  availability: Availability;
};

export function AiPanel({ projectId, availability }: Props) {
  const aiRegion = useEditorStore((s) => s.aiRegion);
  const aiPanelOpen = useEditorStore((s) => s.aiPanelOpen);
  const credits = useEditorStore((s) => s.credits);
  const setCredits = useEditorStore((s) => s.setCredits);
  const setAiPanelOpen = useEditorStore((s) => s.setAiPanelOpen);

  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<AiProviderId>(
    availability.openai ? "openai" : availability.bfl ? "bfl" : "openai",
  );
  const [mode, setMode] = useState<AiMode>("generate");
  const [quality, setQuality] = useState<AiQuality>("standard");
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{ id: string; prompt: string; status: string }>
  >([]);

  const cost = useMemo(
    () => calculateCreditCost({ provider, quality, mode }),
    [provider, quality, mode],
  );

  useEffect(() => {
    if (!availability[provider]) {
      // do not auto-switch; keep selected but disabled generate
    }
  }, [availability, provider]);

  if (!aiPanelOpen) return null;

  async function captureRegionPng(): Promise<string | null> {
    const api = (
      window as unknown as {
        __canvasai?: {
          canvas: {
            toDataURL: (o: object) => string;
            getObjects: () => Array<{ objectRole?: string; visible?: boolean }>;
          };
        };
      }
    ).__canvasai;
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
      if (!gen) throw new Error("생성 상태를 확인할 수 없습니다.");
      setStatus(gen.status);
      if (gen.status === "completed") {
        return gen as {
          signedUrl?: string;
          output_asset_id?: string;
          id: string;
        };
      }
      if (gen.status === "failed" || gen.status === "cancelled") {
        throw new Error(gen.error_message || "생성에 실패했습니다.");
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("생성 시간이 초과되었습니다.");
  }

  async function placeResult(gen: {
    signedUrl?: string;
    output_asset_id?: string;
    id: string;
  }) {
    const api = (
      window as unknown as {
        __canvasai?: {
          canvas: {
            add: (o: unknown) => void;
            remove: (o: unknown) => void;
            getObjects: () => Array<{
              objectRole?: string;
              left?: number;
              top?: number;
            }>;
            setActiveObject: (o: unknown) => void;
            requestRenderAll: () => void;
          };
          history: { save: () => void };
        };
      }
    ).__canvasai;
    if (!api || !aiRegion || !gen.signedUrl) return;

    api.history.save();
    const img = await FabricImage.fromURL(gen.signedUrl, {
      crossOrigin: "anonymous",
    });
    const scaleX = aiRegion.width / (img.width || 1);
    const scaleY = aiRegion.height / (img.height || 1);
    const scale =
      fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    img.set(
      withCustomDefaults({
        left: aiRegion.left,
        top: aiRegion.top,
        scaleX: scale,
        scaleY: scale,
        objectRole: "generated",
        generatedBy: provider,
        generationId: gen.id,
        assetId: gen.output_asset_id,
        name: "AI 생성 이미지",
        clipPath: new Rect({
          left: aiRegion.left,
          top: aiRegion.top,
          width: aiRegion.width,
          height: aiRegion.height,
          absolutePositioned: true,
        }),
      }),
    );
    api.canvas.add(img);
    api.canvas.setActiveObject(img);
    api.canvas.requestRenderAll();
    api.history.save();
    window.dispatchEvent(new CustomEvent("canvasai:dirty"));
  }

  async function handleGenerate() {
    if (!aiRegion) {
      setError("AI 영역을 먼저 지정해 주세요.");
      return;
    }
    if (!availability[provider]) {
      setError("서버에 API 키가 설정되지 않았습니다.");
      return;
    }
    if (credits < cost) {
      setError("크레딧이 부족합니다. 요금제 또는 크레딧 팩을 확인해 주세요.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatus("queued");
    const idempotencyKey = nanoid();

    try {
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
          selection: aiRegion,
          fit,
          idempotencyKey,
          referenceImageBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? "생성 요청에 실패했습니다.");
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

      await placeResult(completed);
      setStatus("completed");
      setHistory((prev) =>
        prev.map((h) => (h.id === gen.id ? { ...h, status: "completed" } : h)),
      );
      toast.success("이미지가 생성되었습니다.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "생성에 실패했습니다.";
      setError(message);
      setStatus("failed");
      toast.error(message);
      // refresh credits from server ideally; optimistic revert
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
    <div className="absolute bottom-14 right-4 z-20 w-[360px] rounded-lg border border-neutral-200 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">AI 생성</h2>
          {aiRegion ? (
            <p className="mt-1 text-xs text-neutral-500">
              {Math.round(aiRegion.width)}×{Math.round(aiRegion.height)} ·{" "}
              {aspectRatioLabel(aiRegion.width, aiRegion.height)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-amber-600">영역을 드래그해 지정하세요</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAiPanelOpen(false)}>
          닫기
        </Button>
      </div>

      <Label htmlFor="prompt">프롬프트</Label>
      <Textarea
        id="prompt"
        className="mt-1"
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="원하는 디자인을 설명해 주세요"
        maxLength={2000}
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="rounded border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
            onClick={() => setPrompt(ex)}
          >
            예시
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <Label>Provider</Label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProviderId)}
          >
            {(["openai", "bfl"] as AiProviderId[]).map((id) => (
              <option key={id} value={id} disabled={!availability[id]}>
                {PROVIDER_LABELS[id]}
                {!availability[id] ? " (미설정)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>모드</Label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
            value={mode}
            onChange={(e) => setMode(e.target.value as AiMode)}
          >
            <option value="generate">{MODE_LABELS.generate}</option>
            <option value="replace">{MODE_LABELS.replace}</option>
            <option value="edit">{MODE_LABELS.edit}</option>
          </select>
        </div>
        <div>
          <Label>품질</Label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
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
          <Label>맞춤</Label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
            value={fit}
            onChange={(e) => setFit(e.target.value as "cover" | "contain")}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
          </select>
        </div>
      </div>

      {!availability[provider] && (
        <p className="mt-3 text-xs text-amber-700">
          서버에 API 키가 설정되지 않았습니다.
        </p>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-neutral-600">
        <span>예상 {cost} 크레딧</span>
        <span>잔여 {credits}</span>
      </div>

      {status && (
        <p className="mt-2 text-xs text-neutral-500" aria-live="polite">
          상태: {status}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          className="flex-1"
          loading={loading}
          disabled={!prompt.trim() || !availability[provider]}
          onClick={handleGenerate}
        >
          생성
        </Button>
        {loading && (
          <Button variant="outline" onClick={handleCancel}>
            취소
          </Button>
        )}
      </div>

      {history.length > 0 && (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <p className="text-xs font-medium text-neutral-500">최근 생성</p>
          <ul className="mt-2 space-y-1">
            {history.map((item) => (
              <li key={item.id} className="truncate text-xs text-neutral-600">
                [{item.status}] {item.prompt}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
