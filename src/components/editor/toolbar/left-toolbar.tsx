"use client";

import {
  MousePointer2,
  Hand,
  Square,
  Circle,
  Minus,
  Type,
  ImageIcon,
  Frame,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useEditorStore, type EditorTool } from "@/stores/editor-store";

const tools: { id: EditorTool; label: string; icon: typeof Square }[] = [
  { id: "select", label: "선택", icon: MousePointer2 },
  { id: "hand", label: "이동", icon: Hand },
  { id: "frame", label: "프레임", icon: Frame },
  { id: "rect", label: "사각형", icon: Square },
  { id: "ellipse", label: "원", icon: Circle },
  { id: "line", label: "선", icon: Minus },
  { id: "text", label: "텍스트", icon: Type },
  { id: "image", label: "이미지 업로드", icon: ImageIcon },
  { id: "ai-region", label: "AI 영역", icon: Sparkles },
];

export function LeftToolbar({ onUploadImage }: { onUploadImage: () => void }) {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);

  return (
    <aside
      className="flex w-12 flex-col items-center gap-1 border-r border-neutral-200 bg-white py-2"
      aria-label="도구"
    >
      {tools.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={tool === item.id}
            className={cn(
              "flex size-9 items-center justify-center rounded-md text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              tool === item.id && "bg-indigo-50 text-indigo-700",
            )}
            onClick={() => {
              if (item.id === "image") {
                onUploadImage();
                return;
              }
              setTool(item.id);
            }}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </aside>
  );
}
