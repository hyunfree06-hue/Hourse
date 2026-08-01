"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LeftToolbar } from "@/components/editor/toolbar/left-toolbar";
import { EditorTopBar } from "@/components/editor/panels/top-bar";
import { PropertiesPanel } from "@/components/editor/properties/properties-panel";
import { BottomZoomBar } from "@/components/editor/panels/bottom-zoom-bar";
import { AiPanel } from "@/components/editor/ai/ai-panel";
import { useEditorStore } from "@/stores/editor-store";
import { useAutosave } from "@/hooks/use-autosave";
import type { Project, Profile } from "@/types/database";
import { Button } from "@/components/ui/button";

const FabricCanvas = dynamic(
  () =>
    import("@/components/editor/canvas/fabric-canvas").then(
      (m) => m.FabricCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#F5F5F5] text-sm text-neutral-500">
        캔버스 로딩 중...
      </div>
    ),
  },
);

type Props = {
  project: Project;
  profile: Profile;
  availability: { openai: boolean; bfl: boolean };
};

export function EditorShell({ project, profile, availability }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const setCredits = useEditorStore((s) => s.setCredits);
  const setBackgroundColor = useEditorStore((s) => s.setBackgroundColor);
  const setIsMobilePreview = useEditorStore((s) => s.setIsMobilePreview);
  const isMobilePreview = useEditorStore((s) => s.isMobilePreview);
  const [loadError, setLoadError] = useState<string | null>(null);

  useAutosave({
    projectId: project.id,
    initialUpdatedAt: project.updated_at,
  });

  useEffect(() => {
    setProjectName(project.name);
    setCredits(profile.credit_balance);
    setBackgroundColor(project.background_color);
  }, [
    project.name,
    project.background_color,
    profile.credit_balance,
    setBackgroundColor,
    setCredits,
    setProjectName,
  ]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsMobilePreview(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [setIsMobilePreview]);

  useEffect(() => {
    const onError = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setLoadError(detail || "캔버스 로딩 실패");
    };
    window.addEventListener("canvasai:load-error", onError);
    return () => window.removeEventListener("canvasai:load-error", onError);
  }, []);

  async function onRename(name: string) {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) toast.error("이름 변경에 실패했습니다.");
  }

  async function onUploadImage() {
    fileRef.current?.click();
  }

  async function handleFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("projectId", project.id);
    const res = await fetch("/api/assets/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error?.message ?? "업로드에 실패했습니다.");
      return;
    }
    const mod = await import("@/components/editor/canvas/fabric-canvas");
    const api = (
      window as unknown as {
        __canvasai?: { canvas: import("fabric").Canvas };
      }
    ).__canvasai;
    if (api && data.signedUrl) {
      await mod.addImageToCanvas(api.canvas, data.signedUrl, {
        assetId: data.asset?.id,
      });
    }
  }

  if (isMobilePreview) {
    return (
      <div className="flex min-h-screen flex-col bg-neutral-50">
        <EditorTopBar
          projectId={project.id}
          avatarUrl={profile.avatar_url}
          displayName={profile.display_name}
          onRename={onRename}
        />
        <div className="mx-auto flex max-w-lg flex-1 flex-col justify-center px-6 py-12 text-center">
          <h1 className="text-xl font-semibold text-neutral-900">
            정밀 편집은 데스크톱 환경을 권장합니다
          </h1>
          <p className="mt-3 text-sm text-neutral-600">
            모바일에서는 프로젝트 미리보기만 제공합니다. 도형·AI 영역 등 편집
            도구는 더 넓은 화면에서 사용해 주세요.
          </p>
          <div className="mt-8 overflow-hidden rounded-lg border border-neutral-200 bg-[#F5F5F5]">
            <div className="flex aspect-[16/10] items-center justify-center text-xs text-neutral-400">
              {project.name} 미리보기
            </div>
          </div>
          <Button className="mt-6" onClick={() => setIsMobilePreview(false)}>
            그래도 에디터 열기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <EditorTopBar
        projectId={project.id}
        avatarUrl={profile.avatar_url}
        displayName={profile.display_name}
        onRename={onRename}
      />
      <div className="relative flex min-h-0 flex-1">
        <LeftToolbar onUploadImage={onUploadImage} />
        <div className="relative min-w-0 flex-1">
          {loadError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#F5F5F5]">
              <p className="text-sm text-red-600">{loadError}</p>
              <Button onClick={() => window.location.reload()}>다시 시도</Button>
            </div>
          ) : (
            <FabricCanvas
              projectId={project.id}
              initialJson={project.canvas_json}
              width={project.canvas_width}
              height={project.canvas_height}
              backgroundColor={project.background_color}
            />
          )}
          <BottomZoomBar />
          <AiPanel projectId={project.id} availability={availability} />
        </div>
        <PropertiesPanel />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
