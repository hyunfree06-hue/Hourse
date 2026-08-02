"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { editorConfig } from "@/config/editor";
import { sanitizeCanvasJsonForSave } from "@/lib/canvas/load-fabric-image";
import { useEditorStore } from "@/stores/editor-store";

type Props = {
  projectId: string;
  initialUpdatedAt: string;
};

type HourseWindow = {
  canvas: {
    toJSON: (propertiesToInclude?: string[]) => Record<string, unknown>;
    backgroundColor?: string;
    getWidth: () => number;
    getHeight: () => number;
    toDataURL: (o: object) => string;
    loadFromJSON: (j: unknown) => Promise<unknown>;
    requestRenderAll: () => void;
  };
};

function getHourseApi(): HourseWindow | undefined {
  return (window as unknown as { __hourse?: HourseWindow }).__hourse;
}

function readLocalBackup(projectId: string): string | null {
  const backupKey = `${editorConfig.localBackupPrefix}${projectId}`;
  const legacyBackupKey = `${editorConfig.legacyLocalBackupPrefix}${projectId}`;

  const current = localStorage.getItem(backupKey);
  if (current) return current;

  const legacy = localStorage.getItem(legacyBackupKey);
  if (!legacy) return null;

  localStorage.setItem(backupKey, legacy);
  localStorage.removeItem(legacyBackupKey);
  return legacy;
}

function buildSavePayload(api: HourseWindow, updatedAt: string) {
  const rawJson = api.canvas.toJSON([
    ...editorConfig.customObjectProperties,
  ]);
  const canvasJson = sanitizeCanvasJsonForSave(rawJson) as Record<
    string,
    unknown
  >;

  // Ensure JSON-serializable (throws on circular refs / non-finite numbers)
  const safeJson = JSON.parse(
    JSON.stringify(canvasJson, (_key, value) => {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error("Canvas contains invalid number values.");
      }
      return value;
    }),
  ) as Record<string, unknown>;

  return {
    canvasJson: safeJson,
    canvasWidth: api.canvas.getWidth(),
    canvasHeight: api.canvas.getHeight(),
    backgroundColor:
      typeof api.canvas.backgroundColor === "string"
        ? api.canvas.backgroundColor
        : "#ffffff",
    expectedUpdatedAt: updatedAt,
    updatedAt,
  };
}

export function useAutosave({ projectId, initialUpdatedAt }: Props) {
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updatedAtRef = useRef(initialUpdatedAt);
  const dirtyRef = useRef(false);
  const lastThumbRef = useRef(0);
  const savingRef = useRef(false);
  const failureCooldownRef = useRef(0);

  const backupKey = `${editorConfig.localBackupPrefix}${projectId}`;

  const save = useCallback(
    async (force = false): Promise<boolean> => {
      if (savingRef.current) return false;
      const api = getHourseApi();
      if (!api) return false;
      if (!dirtyRef.current && !force) return true;

      // Avoid tight autosave retry loops after a hard failure
      if (
        !force &&
        failureCooldownRef.current > Date.now()
      ) {
        return false;
      }

      savingRef.current = true;
      setSaveStatus("saving");

      let payload: ReturnType<typeof buildSavePayload>;
      try {
        payload = buildSavePayload(api, updatedAtRef.current);
      } catch (error) {
        setSaveStatus("error");
        toast.error(
          error instanceof Error
            ? error.message
            : "We couldn't prepare this project for saving.",
        );
        savingRef.current = false;
        failureCooldownRef.current = Date.now() + 8_000;
        return false;
      }

      try {
        try {
          localStorage.setItem(
            backupKey,
            JSON.stringify({
              updatedAt: new Date().toISOString(),
              payload: payload.canvasJson,
            }),
          );
        } catch {
          // quota / private mode — continue with network save
        }

        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (res.status === 409) {
          setSaveStatus("conflict");
          const choice = window.confirm(
            "This project was updated in another tab.\nOK: Load the latest version from the server\nCancel: Overwrite with your version",
          );
          if (choice) {
            window.location.reload();
            return false;
          }
          updatedAtRef.current = data.serverUpdatedAt;
          const retryPayload = buildSavePayload(api, data.serverUpdatedAt);
          const retry = await fetch(`/api/projects/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(retryPayload),
          });
          const retryData = await retry.json();
          if (!retry.ok) {
            throw new Error(
              retryData.error?.message ?? "We couldn't save this project.",
            );
          }
          updatedAtRef.current = retryData.project.updated_at;
        } else if (!res.ok) {
          throw new Error(
            data.error?.message ?? "We couldn't save this project.",
          );
        } else {
          updatedAtRef.current = data.project.updated_at;
        }

        dirtyRef.current = false;
        failureCooldownRef.current = 0;
        setSaveStatus("saved");

        const now = Date.now();
        if (now - lastThumbRef.current > editorConfig.thumbnailMinIntervalMs) {
          lastThumbRef.current = now;
          const dataUrl = api.canvas.toDataURL({
            format: "png",
            multiplier: 0.25,
          });
          const blob = await (await fetch(dataUrl)).blob();
          const form = new FormData();
          form.append("file", blob, "thumb.png");
          void fetch(`/api/projects/${projectId}/thumbnail`, {
            method: "POST",
            body: form,
          });
        }
        return true;
      } catch (error) {
        setSaveStatus("error");
        failureCooldownRef.current = Date.now() + 8_000;
        toast.error(
          error instanceof Error
            ? error.message
            : "We couldn't save this project.",
        );
        return false;
      } finally {
        savingRef.current = false;
      }
    },
    [backupKey, projectId, setSaveStatus],
  );

  useEffect(() => {
    const onDirty = () => {
      dirtyRef.current = true;
      setSaveStatus("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void save();
      }, editorConfig.autosaveDebounceMs);
    };

    const onForce = () => {
      void save(true);
    };

    window.addEventListener("hourse:dirty", onDirty);
    window.addEventListener("hourse:force-save", onForce);

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        void save(true);
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    const backupRaw = readLocalBackup(projectId);
    if (backupRaw) {
      try {
        const backup = JSON.parse(backupRaw) as {
          updatedAt: string;
          payload: unknown;
        };
        if (
          backup.updatedAt &&
          new Date(backup.updatedAt).getTime() >
            new Date(initialUpdatedAt).getTime() + 1000
        ) {
          const restore = window.confirm(
            "A newer local backup was found. Restore it?",
          );
          if (restore) {
            const api = getHourseApi();
            void api?.canvas.loadFromJSON(backup.payload).then(() => {
              api.canvas.requestRenderAll();
              dirtyRef.current = true;
            });
          }
        }
      } catch {
        // ignore corrupt backup
      }
    }

    return () => {
      window.removeEventListener("hourse:dirty", onDirty);
      window.removeEventListener("hourse:force-save", onForce);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [initialUpdatedAt, projectId, save, setSaveStatus]);

  return { save };
}
