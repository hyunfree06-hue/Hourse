"use client";

import { GoogleAuthButton } from "@/components/auth/google-auth-button";

export function FinalCta() {
  return (
    <section className="border-t border-[#E4E4E7] bg-[#111113]">
      <div className="mx-auto flex max-w-[1120px] flex-col items-start gap-6 px-5 py-16 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-white sm:text-[32px]">
            Make the next idea visible.
          </h2>
          <p className="mt-2 text-[15px] text-[#A1A1AA]">
            Open a canvas and move from thought to design in minutes.
          </p>
        </div>
        <GoogleAuthButton
          size="lg"
          label="Start creating free"
          nextPath="/dashboard"
          className="rounded-[10px] bg-white px-6 text-[14px] font-medium text-[#111113] hover:bg-[#F4F4F5]"
        />
      </div>
    </section>
  );
}
