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

const tools: { id: EditorTool; label: string; shortcut?: string; icon: typeof Square }[] = [
  { id: "select", label: "Select", shortcut: "V", icon: MousePointer2 },
  { id: "hand", label: "Hand", shortcut: "H", icon: Hand },
  { id: "frame", label: "Frame", shortcut: "F", icon: Frame },
  { id: "rect", label: "Rectangle", shortcut: "R", icon: Square },
  { id: "ellipse", label: "Ellipse", shortcut: "O", icon: Circle },
  { id: "line", label: "Line", shortcut: "L", icon: Minus },
  { id: "text", label: "Text", shortcut: "T", icon: Type },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "ai-region", label: "Create design", shortcut: "A", icon: Sparkles },
];

export function LeftToolbar({ onUploadImage }: { onUploadImage: () => void }) {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const setAiPanelOpen = useEditorStore((s) => s.setAiPanelOpen);
  const selected = useEditorStore((s) => s.selected);

  return (
    <aside
      className="flex w-11 flex-col items-center gap-0.5 border-r border-[rgba(17,17,19,0.08)] bg-white py-2"
      aria-label="Tools"
    >
      {tools.map((item) => {
        const Icon = item.icon;
        const tooltip = item.shortcut ? `${item.label} (${item.shortcut})` : item.label;
        return (
          <button
            key={item.id}
            type="button"
            title={tooltip}
            aria-label={tooltip}
            aria-pressed={tool === item.id}
            className={cn(
              "flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#635BFF]/40",
              tool === item.id && "bg-[#635BFF]/8 text-[#635BFF]",
            )}
            onClick={() => {
              if (item.id === "image") {
                onUploadImage();
                return;
              }
              if (item.id === "ai-region") {
                if (selected?.objectId) {
                  setAiPanelOpen(true);
                }
                setTool(item.id);
                return;
              }
              setTool(item.id);
            }}
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </button>
        );
      })}
    </aside>
  );
}
