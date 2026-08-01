"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
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
        throw new Error(data.error?.message ?? "프로젝트 생성에 실패했습니다.");
      }
      router.push(`/editor/${data.project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "생성 실패");
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
      if (!res.ok) throw new Error(data.error?.message ?? "이름 변경 실패");
      setProjects((prev) =>
        prev.map((p) => (p.id === renameId ? { ...p, name: data.project.name } : p)),
      );
      setRenameId(null);
      toast.success("이름이 변경되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "이름 변경 실패");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicateProject(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "복제 실패");
      setProjects((prev) => [data.project, ...prev]);
      toast.success("프로젝트를 복제했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "복제 실패");
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
      if (!res.ok) throw new Error(data.error?.message ?? "삭제 실패");
      setProjects((prev) => prev.filter((p) => p.id !== deleteId));
      setDeleteId(null);
      toast.success("프로젝트가 삭제되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "삭제 실패");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            내 프로젝트
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            플랜 {planCode} · 잔여 크레딧 {credits}
          </p>
        </div>
        <Button onClick={createProject} loading={creating} aria-label="새 프로젝트">
          <Plus className="size-4" />
          새 프로젝트
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-20 text-center">
          <h2 className="text-lg font-medium text-neutral-900">아직 프로젝트가 없습니다</h2>
          <p className="mt-2 max-w-sm text-sm text-neutral-500">
            새 프로젝트를 만들어 AI 캔버스에서 디자인을 시작해 보세요.
          </p>
          <Button className="mt-6" onClick={createProject} loading={creating}>
            첫 프로젝트 만들기
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-300"
            >
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => router.push(`/editor/${project.id}`)}
              >
                <div className="flex aspect-[16/10] items-center justify-center bg-[#F5F5F5]">
                  {project.thumbnail_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/projects/${project.id}/thumbnail`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-neutral-400">미리보기 없음</span>
                  )}
                </div>
              </button>
              <div className="flex items-start justify-between gap-2 p-4">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-medium text-neutral-900">
                    {project.name}
                  </h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    {formatDistanceToNow(new Date(project.updated_at), {
                      addSuffix: true,
                      locale: ko,
                    })}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="프로젝트 메뉴"
                      disabled={busyId === project.id}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => router.push(`/editor/${project.id}`)}
                    >
                      열기
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameId(project.id);
                        setRenameValue(project.name);
                      }}
                    >
                      이름 변경
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicateProject(project.id)}>
                      복제
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => setDeleteId(project.id)}
                    >
                      삭제
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
            <AlertDialogTitle>프로젝트 이름 변경</AlertDialogTitle>
            <AlertDialogDescription>
              새 이름을 입력하세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            aria-label="프로젝트 이름"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={renameProject}>저장</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>프로젝트를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제하면 관련 에셋도 함께 정리되며 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500"
              onClick={deleteProject}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[16/10] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
