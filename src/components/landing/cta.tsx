import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { siteConfig } from "@/config/site";

export function LandingCta() {
  return (
    <section className="border-t border-neutral-200 bg-neutral-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            오늘 아이디어를 {siteConfig.name}에서 열어보세요
          </h2>
          <p className="mt-2 text-neutral-300">
            Google 계정으로 시작하고, 가입 즉시 무료 크레딧을 받습니다.
          </p>
        </div>
        <GoogleAuthButton
          size="lg"
          label="무료 크레딧으로 시작하기"
          nextPath="/dashboard"
          className="bg-white text-neutral-950 hover:bg-neutral-100"
        />
      </div>
    </section>
  );
}
