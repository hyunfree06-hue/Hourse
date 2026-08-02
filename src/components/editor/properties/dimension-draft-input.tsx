"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

type Props = {
  label: string;
  /** Committed visual dimension from selection state. */
  committedValue: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Live update while the draft parses to a valid positive number. */
  onLiveChange: (value: number) => void;
  /** Commit clamped value (Enter / blur). */
  onCommit: (value: number) => void;
  className?: string;
};

function formatCommitted(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value));
}

function parseDraft(draft: string): number | null {
  const trimmed = draft.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === ".") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Professional W/H numeric field with local draft strings so multi-digit
 * typing never resets from Fabric/store round-trips mid-keystroke.
 * While unfocused, the displayed value is derived from `committedValue`
 * (no sync effect).
 */
export function DimensionDraftInput({
  label,
  committedValue,
  min = 1,
  max = 8192,
  disabled,
  onLiveChange,
  onCommit,
  className,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const committedOnFocusRef = useRef(formatCommitted(committedValue));
  const lastLiveRef = useRef<number | null>(Math.round(committedValue));

  const display = editing ? draft : formatCommitted(committedValue);

  function clamp(n: number): number {
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function commitDraft(raw: string) {
    const parsed = parseDraft(raw);
    const fallback = Number(committedOnFocusRef.current);
    const next = clamp(
      parsed ?? (Number.isFinite(fallback) && fallback > 0 ? fallback : min),
    );
    setDraft(formatCommitted(next));
    lastLiveRef.current = next;
    onCommit(next);
  }

  return (
    <div className={className}>
      <Label className="text-[10px] text-neutral-500">{label}</Label>
      <Input
        className={cn("h-7 text-xs tabular-nums")}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={display}
        onFocus={(e) => {
          const initial = formatCommitted(committedValue);
          committedOnFocusRef.current = initial;
          setDraft(initial);
          setEditing(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          commitDraft(draft);
          setEditing(false);
        }}
        onWheel={(e) => {
          // Prevent page scroll from accidentally changing dimensions.
          e.currentTarget.blur();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft(draft);
            setEditing(false);
            e.currentTarget.blur();
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            const restored = committedOnFocusRef.current;
            setDraft(restored);
            const n = Number(restored);
            if (Number.isFinite(n) && n > 0) {
              lastLiveRef.current = n;
              onCommit(n);
            }
            setEditing(false);
            e.currentTarget.blur();
          }
        }}
        onChange={(e) => {
          const nextDraft = e.target.value;
          // Allow empty / intermediate typing states.
          if (nextDraft !== "" && !/^\d*\.?\d*$/.test(nextDraft)) return;
          setDraft(nextDraft);
          const parsed = parseDraft(nextDraft);
          if (parsed == null) return;
          const live = Math.min(max, Math.max(1, parsed));
          if (lastLiveRef.current === live) return;
          lastLiveRef.current = live;
          onLiveChange(live);
        }}
      />
    </div>
  );
}
