import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { HourseLogo } from "@/components/brand/hourse-logo";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Not found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <Link href="/" aria-label={siteConfig.name} className="mb-2">
        <HourseLogo variant="mark" tone="dark" height={28} />
      </Link>
      <h1 className="text-xl font-semibold text-neutral-950">
        Page not found
      </h1>
      <p className="text-[13px] text-neutral-500">
        The project may have been deleted or you don&apos;t have access.
      </p>
      <Button size="sm" asChild className="mt-2">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
