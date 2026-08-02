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
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { editorConfig } from "@/config/editor";
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
import { HourseLogo } from "@/components/brand/hourse-logo";

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
    const api = (window as unknown as { __hourse?: { history: { undo: () => void; redo: () => void } } }).__hourse;
    if (!api) return;
    void (action === "undo" ? api.history.undo() : api.history.redo());
  }

  async function exportCanvas(format: "png" | "jpeg" | "svg") {
    const api = (window as unknown as { __hourse?: { canvas: { toDataURL: (o: object) => string; toSVG: () => string } } }).__hourse;
    if (!api) return;
    try {
      let href = "";
      const slug = projectName?.trim() || editorConfig.exportFilePrefix;
      const filename = `${slug}.${format === "jpeg" ? "jpg" : format}`;
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
      toast.success("Export complete.");
    } catch {
      toast.error("Export failed.");
    }
  }

  const statusLabel =
    saveStatus === "saving"
      ? "Saving\u2026"
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Save failed \u00b7 Retry"
          : saveStatus === "conflict"
            ? "Offline changes pending"
            : "";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[rgba(17,17,19,0.08)] bg-white px-3">
      {/* Left cluster: brand + project name + save status */}
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex shrink-0 items-center rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#635BFF]"
          aria-label="Hourse"
        >
          <HourseLogo variant="mark" tone="dark" height={22} priority />
        </Link>

        <div className="h-4 w-px bg-[rgba(17,17,19,0.08)]" aria-hidden />

        {editing ? (
          <Input
            className="h-7 w-48 text-sm"
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
            aria-label="Project name"
          />
        ) : (
          <button
            type="button"
            className="truncate text-[13px] font-medium text-neutral-800 hover:text-neutral-900"
            onClick={() => setEditing(true)}
          >
            {projectName}
          </button>
        )}

        <span className="hidden items-center gap-1.5 text-xs text-neutral-500 sm:flex" aria-live="polite">
          {saveStatus === "saving" && <Loader2 className="size-3 animate-spin" />}
          {saveStatus === "saved" && <Check className="size-3 text-emerald-600" />}
          {saveStatus === "error" && <AlertCircle className="size-3 text-red-500" />}
          {saveStatus === "conflict" && <WifiOff className="size-3 text-amber-500" />}
          {statusLabel}
        </span>
      </div>

      {/* Right cluster: undo/redo, export, credits, avatar */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-8" aria-label="Undo" onClick={() => runHistory("undo")}>
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Redo" onClick={() => runHistory("redo")}>
          <Redo2 className="size-4" />
        </Button>

        <div className="mx-1 h-4 w-px bg-[rgba(17,17,19,0.08)]" aria-hidden />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" aria-label="Export">
              <Download className="size-3.5" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportCanvas("png")}>PNG</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCanvas("jpeg")}>JPG</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCanvas("svg")}>SVG</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-1 rounded-md border border-[rgba(17,17,19,0.08)] bg-[#F7F7F8] px-2 py-1 text-xs font-medium tabular-nums text-neutral-600">
          {credits} credits
        </span>

        <Link href="/account" aria-label="Account" className="ml-1">
          <Avatar className="size-7">
            <AvatarImage src={avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="text-xs">{(displayName ?? "U").slice(0, 1)}</AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
