"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { editorConfig } from "@/config/editor";
import { useEditorStore } from "@/stores/editor-store";

type Props = {
  projectId: string;
  initialUpdatedAt: string;
};

type HourseWindow = {
  canvas: {
    toJSON: () => unknown;
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

export function useAutosave({ projectId, initialUpdatedAt }: Props) {
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updatedAtRef = useRef(initialUpdatedAt);
  const dirtyRef = useRef(false);
  const lastThumbRef = useRef(0);
  const savingRef = useRef(false);

  const backupKey = `${editorConfig.localBackupPrefix}${projectId}`;

  const save = useCallback(
    async (force = false) => {
      if (savingRef.current) return;
      const api = getHourseApi();
      if (!api) return;
      if (!dirtyRef.current && !force) return;

      savingRef.current = true;
      setSaveStatus("saving");
      const json = api.canvas.toJSON();
      const payload = {
        canvasJson: json,
        canvasWidth: api.canvas.getWidth(),
        canvasHeight: api.canvas.getHeight(),
        backgroundColor:
          typeof api.canvas.backgroundColor === "string"
            ? api.canvas.backgroundColor
            : "#ffffff",
        updatedAt: updatedAtRef.current,
      };

      try {
        localStorage.setItem(
          backupKey,
          JSON.stringify({
            updatedAt: new Date().toISOString(),
            payload: json,
          }),
        );

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
            return;
          }
          updatedAtRef.current = data.serverUpdatedAt;
          const retry = await fetch(`/api/projects/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              updatedAt: data.serverUpdatedAt,
            }),
          });
          const retryData = await retry.json();
          if (!retry.ok) {
            throw new Error(retryData.error?.message ?? "Unable to save");
          }
          updatedAtRef.current = retryData.project.updated_at;
        } else if (!res.ok) {
          throw new Error(data.error?.message ?? "Unable to save");
        } else {
          updatedAtRef.current = data.project.updated_at;
        }

        dirtyRef.current = false;
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
      } catch (error) {
        setSaveStatus("error");
        toast.error(
          error instanceof Error ? error.message : "Unable to save.",
        );
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
