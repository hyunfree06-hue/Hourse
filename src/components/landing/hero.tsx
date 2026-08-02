"use client";

import Link from "next/link";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% -10%, rgba(99,91,255,0.07), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-[1120px] px-5 pb-10 pt-14 sm:pb-12 sm:pt-18">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[13px] font-medium tracking-[0.04em] text-[#635BFF]">
            AI-native design workspace
          </p>
          <h1 className="mt-4 text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] text-[#111113] sm:text-[64px] lg:text-[72px]">
            Turn ideas into editable design.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.65] text-[#3F3F46] sm:text-[16px]">
            Create, refine, and compose visual work in one fluid canvas—built
            for independent creators who move fast.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <GoogleAuthButton
              size="lg"
              label="Start creating free"
              nextPath="/dashboard"
              className="rounded-[8px] bg-[#111113] px-5 text-[14px] font-medium text-white hover:bg-[#27272A]"
            />
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-[8px] border-[rgba(17,17,19,0.12)] text-[14px] font-medium text-[#3F3F46] hover:border-[rgba(17,17,19,0.2)] hover:text-[#111113]"
            >
              <Link href="#product">Explore the editor</Link>
            </Button>
          </div>
          <p className="mt-4 text-[13px] text-[#71717A]">
            Start with 10 free credits. No card required.
          </p>
        </div>
      </div>
    </section>
  );
}
