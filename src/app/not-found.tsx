import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold text-neutral-950">
        페이지를 찾을 수 없습니다
      </h1>
      <p className="text-sm text-neutral-600">
        프로젝트가 삭제되었거나 접근 권한이 없을 수 있습니다.
      </p>
      <Button asChild>
        <Link href="/dashboard">대시보드로</Link>
      </Button>
    </div>
  );
}
