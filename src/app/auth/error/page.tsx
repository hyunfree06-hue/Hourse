import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LandingHeader, LandingFooter } from "@/components/layout/site-header";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const params = await searchParams;
  const message = params.message ?? "인증에 실패했습니다.";

  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
        <h1 className="text-2xl font-semibold text-neutral-950">인증 오류</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">{message}</p>
        <div className="mt-8 flex gap-3">
          <Button asChild>
            <Link href="/">홈으로 돌아가기</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/?next=/dashboard">다시 로그인</Link>
          </Button>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
