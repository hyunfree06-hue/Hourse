"use client";

import Link from "next/link";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b border-neutral-200">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.18), transparent), linear-gradient(180deg, #fafafa 0%, #ffffff 60%)",
        }}
      />
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-28">
        <div>
          <p className="mb-4 text-sm font-medium tracking-wide text-indigo-600">
            {siteConfig.name}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">
            아이디어를 바로 디자인으로 만드세요
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            개인 디자이너를 위한 AI 캔버스입니다. 영역을 드래그하고 프롬프트를
            입력하면 OpenAI 또는 FLUX가 디자인 이미지를 바로 캔버스에 배치합니다.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <GoogleAuthButton
              size="lg"
              label="무료 크레딧으로 시작하기"
              nextPath="/dashboard"
            />
            <Button asChild variant="outline" size="lg">
              <Link href="#editor-preview">에디터 미리보기</Link>
            </Button>
          </div>
        </div>

        <div
          id="editor-preview"
          className="relative overflow-hidden rounded-xl border border-neutral-200 bg-[#F5F5F5] shadow-sm"
          aria-hidden
        >
          <div className="flex h-10 items-center gap-2 border-b border-neutral-200 bg-white px-3">
            <div className="size-2.5 rounded-full bg-neutral-300" />
            <div className="size-2.5 rounded-full bg-neutral-300" />
            <div className="size-2.5 rounded-full bg-neutral-300" />
            <div className="ml-3 h-5 flex-1 rounded bg-neutral-100" />
          </div>
          <div className="grid grid-cols-[48px_1fr_160px]">
            <div className="flex flex-col items-center gap-2 border-r border-neutral-200 bg-white py-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className={`size-7 rounded-md ${i === 6 ? "bg-indigo-100 ring-1 ring-indigo-400" : "bg-neutral-100"}`}
                />
              ))}
            </div>
            <div className="relative min-h-[280px] p-6">
              <div className="absolute left-10 top-12 h-28 w-40 rounded-md border-2 border-dashed border-indigo-400 bg-indigo-50/50">
                <span className="absolute -top-5 left-0 text-[10px] font-medium text-indigo-600">
                  AI 영역 320×224
                </span>
              </div>
              <div className="absolute bottom-16 right-12 h-20 w-32 rounded bg-white shadow-sm ring-1 ring-neutral-200" />
              <div className="absolute left-1/3 top-1/2 h-3 w-36 rounded bg-neutral-300" />
            </div>
            <div className="space-y-3 border-l border-neutral-200 bg-white p-3">
              <div className="h-3 w-16 rounded bg-neutral-200" />
              <div className="h-8 rounded bg-neutral-100" />
              <div className="h-8 rounded bg-neutral-100" />
              <div className="h-20 rounded bg-indigo-50 ring-1 ring-indigo-100" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
