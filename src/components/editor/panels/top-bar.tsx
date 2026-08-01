"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Download,
  Redo2,
  Undo2,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorStore } from "@/stores/editor-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Props = {
  projectId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  onRename: (name: string) => Promise<void>;
};

export function EditorTopBar({
  avatarUrl,
  displayName,
  onRename,
}: Props) {
  const projectName = useEditorStore((s) => s.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const credits = useEditorStore((s) => s.credits);
  const [editing, setEditing] = useState(false);

  function runHistory(action: "undo" | "redo") {
    const api = (window as unknown as { __canvasai?: { history: { undo: () => void; redo: () => void } } }).__canvasai;
    if (!api) return;
    void (action === "undo" ? api.history.undo() : api.history.redo());
  }

  async function exportCanvas(format: "png" | "jpeg" | "svg") {
    const api = (window as unknown as { __canvasai?: { canvas: { toDataURL: (o: object) => string; toSVG: () => string } } }).__canvasai;
    if (!api) return;
    try {
      let href = "";
      const filename = `${projectName || "design"}.${format === "jpeg" ? "jpg" : format}`;
      if (format === "svg") {
        const blob = new Blob([api.canvas.toSVG()], { type: "image/svg+xml" });
        href = URL.createObjectURL(blob);
      } else {
        href = api.canvas.toDataURL({
          format,
          quality: 1,
          multiplier: 1,
        });
      }
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      if (format === "svg") URL.revokeObjectURL(href);
      toast.success("내보내기가 완료되었습니다.");
    } catch {
      toast.error("내보내기에 실패했습니다.");
    }
  }

  const statusLabel =
    saveStatus === "saving"
      ? "저장 중..."
      : saveStatus === "saved"
        ? "모든 변경사항이 저장됨"
        : saveStatus === "error"
          ? "저장 실패 · 다시 시도"
          : saveStatus === "conflict"
            ? "충돌 · 선택 필요"
            : "";

  return (
    <header className="flex h-12 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2" aria-label="대시보드">
          <span className="flex size-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
            C
          </span>
          <span className="hidden text-sm font-semibold sm:inline">{siteConfig.name}</span>
        </Link>
        {editing ? (
          <Input
            className="h-8 w-48"
            value={projectName}
            autoFocus
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={async () => {
              setEditing(false);
              await onRename(projectName);
            }}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                setEditing(false);
                await onRename(projectName);
              }
            }}
            aria-label="프로젝트 이름"
          />
        ) : (
          <button
            type="button"
            className="truncate text-sm font-medium text-neutral-800 hover:underline"
            onClick={() => setEditing(true)}
          >
            {projectName}
          </button>
        )}
        <span className="hidden items-center gap-1 text-xs text-neutral-500 sm:flex" aria-live="polite">
          {saveStatus === "saving" && <Loader2 className="size-3 animate-spin" />}
          {saveStatus === "saved" && <Check className="size-3 text-emerald-600" />}
          {saveStatus === "error" && <AlertCircle className="size-3 text-red-500" />}
          {statusLabel}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="실행 취소" onClick={() => runHistory("undo")}>
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="다시 실행" onClick={() => runHistory("redo")}>
          <Redo2 className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label="내보내기">
              <Download className="size-4" />
              내보내기
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportCanvas("png")}>PNG</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCanvas("jpeg")}>JPG</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCanvas("svg")}>SVG</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium">
          크레딧 {credits}
        </span>
        <Link href="/account" aria-label="계정">
          <Avatar className="size-8">
            <AvatarImage src={avatarUrl ?? undefined} alt="" />
            <AvatarFallback>{(displayName ?? "U").slice(0, 1)}</AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
