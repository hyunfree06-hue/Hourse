"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import type { Project } from "@/types/database";

type Props = {
  projects: Project[];
  credits: number;
  planCode: string;
};

export function DashboardClient({ projects: initial, credits, planCode }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function createProject() {
    setCreating(true);
    try {
      const res = await fetch("/api/projects", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Failed to create project.");
      }
      router.push(`/editor/${data.project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation failed");
      setCreating(false);
    }
  }

  async function renameProject() {
    if (!renameId) return;
    setBusyId(renameId);
    try {
      const res = await fetch(`/api/projects/${renameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Rename failed");
      setProjects((prev) =>
        prev.map((p) => (p.id === renameId ? { ...p, name: data.project.name } : p)),
      );
      setRenameId(null);
      toast.success("Project renamed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rename failed");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicateProject(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Duplication failed");
      setProjects((prev) => [data.project, ...prev]);
      toast.success("Project duplicated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Duplication failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProject() {
    if (!deleteId) return;
    setBusyId(deleteId);
    try {
      const res = await fetch(`/api/projects/${deleteId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message ?? "Deletion failed");
      setProjects((prev) => prev.filter((p) => p.id !== deleteId));
      setDeleteId(null);
      toast.success("Project deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Deletion failed");
    } finally {
      setBusyId(null);
    }
  }

  const planLabel = planCode.charAt(0).toUpperCase() + planCode.slice(1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-950">
            Projects
          </h1>
          <p className="mt-0.5 text-[13px] text-neutral-500">
            Create, revisit, and manage your visual work.
          </p>
          <p className="mt-1 text-[12px] text-neutral-400">
            {planLabel} plan &middot; {credits} credits remaining
          </p>
        </div>
        <Button size="sm" onClick={createProject} loading={creating} aria-label="New project">
          <Plus className="size-3.5" />
          New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
          <h2 className="text-[15px] font-medium text-neutral-900">Create your first project</h2>
          <p className="mt-1.5 max-w-xs text-[13px] text-neutral-500">
            Start with a blank canvas and turn your next idea into an editable visual.
          </p>
          <Button size="sm" className="mt-5" onClick={createProject} loading={creating}>
            New project
          </Button>
          <kbd className="mt-2 text-[11px] text-neutral-400">&#8984; N</kbd>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="group overflow-hidden rounded-lg border border-neutral-200 bg-white transition hover:border-neutral-300 hover:shadow-sm"
            >
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => router.push(`/editor/${project.id}`)}
              >
                <div className="flex aspect-[16/10] items-center justify-center bg-[#F7F7F8]">
                  {project.thumbnail_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/projects/${project.id}/thumbnail`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[11px] text-neutral-300">No preview</span>
                  )}
                </div>
              </button>
              <div className="flex items-start justify-between gap-2 px-3.5 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[13px] font-medium text-neutral-900">
                    {project.name || "Untitled project"}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    Edited{" "}
                    {formatDistanceToNow(new Date(project.updated_at), {
                      addSuffix: true,
                      locale: enUS,
                    })}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Project menu"
                      disabled={busyId === project.id}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => router.push(`/editor/${project.id}`)}
                    >
                      Open
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameId(project.id);
                        setRenameValue(project.name);
                      }}
                    >
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicateProject(project.id)}>
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => setDeleteId(project.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </article>
          ))}
        </div>
      )}

      <AlertDialog open={Boolean(renameId)} onOpenChange={(o) => !o && setRenameId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename project</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            aria-label="Project name"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={renameProject}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the project and its assets. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500"
              onClick={deleteProject}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-40" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[16/10] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
