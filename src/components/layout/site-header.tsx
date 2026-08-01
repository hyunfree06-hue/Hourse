import Link from "next/link";
import { siteConfig } from "@/config/site";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/#features", label: "기능" },
  { href: "/#how-it-works", label: "사용 방법" },
  { href: "/pricing", label: "요금제" },
];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label={siteConfig.name}>
          <span className="flex size-8 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">
            C
          </span>
          <span className="text-base font-semibold tracking-tight text-neutral-900">
            {siteConfig.name}
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="주요 메뉴">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-neutral-600 transition-colors hover:text-neutral-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <GoogleAuthButton
            variant="ghost"
            size="sm"
            label="로그인"
            nextPath="/dashboard"
            className="hidden sm:inline-flex"
          />
          <GoogleAuthButton
            size="sm"
            label="무료로 시작하기"
            nextPath="/dashboard"
          />
        </div>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
              C
            </span>
            <span className="font-semibold text-neutral-900">{siteConfig.name}</span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-neutral-500">
            {siteConfig.tagline}
          </p>
        </div>
        <div className="flex gap-10 text-sm">
          <div className="flex flex-col gap-2">
            <span className="font-medium text-neutral-900">제품</span>
            <Link href="/#features" className="text-neutral-500 hover:text-neutral-800">
              기능
            </Link>
            <Link href="/pricing" className="text-neutral-500 hover:text-neutral-800">
              요금제
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-medium text-neutral-900">법적 고지</span>
            <Link href="/privacy" className="text-neutral-500 hover:text-neutral-800">
              개인정보처리방침
            </Link>
            <Link href="/terms" className="text-neutral-500 hover:text-neutral-800">
              이용약관
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-neutral-200 py-4 text-center text-xs text-neutral-400">
        © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
      </div>
    </footer>
  );
}

export function AppHeader({
  credits,
  displayName,
}: {
  credits?: number;
  displayName?: string | null;
}) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
              C
            </span>
            <span className="font-semibold text-neutral-900">{siteConfig.name}</span>
          </Link>
          <nav className="hidden gap-4 text-sm md:flex">
            <Link href="/dashboard" className="text-neutral-600 hover:text-neutral-900">
              프로젝트
            </Link>
            <Link href="/pricing" className="text-neutral-600 hover:text-neutral-900">
              요금제
            </Link>
            <Link href="/billing" className="text-neutral-600 hover:text-neutral-900">
              결제
            </Link>
            <Link href="/account" className="text-neutral-600 hover:text-neutral-900">
              계정
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {typeof credits === "number" && (
            <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700">
              크레딧 {credits}
            </span>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/account">{displayName ?? "계정"}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
