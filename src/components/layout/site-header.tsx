"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/config/site";
import { HourseLogo } from "@/components/brand/hourse-logo";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const landingNav = [
  { href: "/#product", label: "Product" },
  { href: "/#workflow", label: "Workflow" },
  { href: "/#pricing", label: "Pricing" },
];

const appNav = [
  { href: "/dashboard", label: "Projects" },
  { href: "/pricing", label: "Pricing" },
  { href: "/billing", label: "Billing" },
  { href: "/account", label: "Account" },
];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(17,17,19,0.08)] bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5">
        <Link
          href="/"
          aria-label={siteConfig.name}
          className="inline-flex items-center rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#635BFF]"
        >
          <HourseLogo variant="lockup" tone="dark" height={26} priority />
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {landingNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13px] font-medium text-[#3F3F46] transition-colors duration-150 hover:text-[#111113]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <GoogleAuthButton
            variant="ghost"
            size="sm"
            label="Sign in"
            nextPath="/dashboard"
            className="hidden text-[13px] font-medium text-[#3F3F46] hover:text-[#111113] sm:inline-flex"
          />
          <GoogleAuthButton
            size="sm"
            label="Start free"
            nextPath="/dashboard"
            className="rounded-[8px] bg-[#111113] text-[13px] font-medium text-white hover:bg-[#27272A]"
          />
        </div>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-[rgba(17,17,19,0.08)] bg-[#FAFAFA]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-8 px-5 py-12 md:flex-row md:items-start md:justify-between">
        <div>
          <HourseLogo variant="lockup" tone="dark" height={24} decorative />
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-[#71717A]">
            {siteConfig.description}
          </p>
        </div>
        <div className="flex gap-12 text-[13px]">
          <div className="flex flex-col gap-2.5">
            <span className="font-medium text-[#111113]">Product</span>
            <Link
              href="/#product"
              className="text-[#71717A] transition-colors hover:text-[#111113]"
            >
              Features
            </Link>
            <Link
              href="/#workflow"
              className="text-[#71717A] transition-colors hover:text-[#111113]"
            >
              Workflow
            </Link>
            <Link
              href="/#pricing"
              className="text-[#71717A] transition-colors hover:text-[#111113]"
            >
              Pricing
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="font-medium text-[#111113]">Legal</span>
            <Link
              href="/privacy"
              className="text-[#71717A] transition-colors hover:text-[#111113]"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-[#71717A] transition-colors hover:text-[#111113]"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-[rgba(17,17,19,0.08)] py-5 text-center text-[12px] text-[#A1A1AA]">
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
  const pathname = usePathname();

  return (
    <header className="border-b border-[rgba(17,17,19,0.08)] bg-white">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-5">
        <div className="flex items-center gap-7">
          <Link
            href="/dashboard"
            aria-label={siteConfig.name}
            className="inline-flex items-center rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#635BFF]"
          >
            <span className="hidden sm:inline-flex">
              <HourseLogo variant="lockup" tone="dark" height={24} priority />
            </span>
            <span className="inline-flex sm:hidden">
              <HourseLogo variant="mark" tone="dark" height={22} priority />
            </span>
          </Link>
          <nav className="hidden items-center gap-1 text-[13px] md:flex">
            {appNav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-[6px] px-2.5 py-1.5 font-medium transition-colors duration-150",
                    active
                      ? "bg-[#F1F0FF] text-[#554EDB]"
                      : "text-[#3F3F46] hover:bg-[#F7F7F8] hover:text-[#111113]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {typeof credits === "number" && (
            <span className="tabular-nums rounded-[6px] border border-[rgba(17,17,19,0.08)] bg-[#FAFAFA] px-2.5 py-1 text-[12px] font-medium text-[#3F3F46]">
              {credits} credits
            </span>
          )}
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-[8px] text-[13px]"
          >
            <Link href="/account">{displayName ?? "Account"}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
