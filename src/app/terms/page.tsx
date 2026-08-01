import Link from "next/link";
import { LandingHeader, LandingFooter } from "@/components/layout/site-header";
import { siteConfig } from "@/config/site";

export default function TermsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="prose prose-neutral mx-auto max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <h1>이용약관</h1>
        <p>
          {siteConfig.name} 서비스를 이용함으로써 본 약관에 동의하는 것으로
          간주됩니다.
        </p>
        <h2>서비스 성격</h2>
        <p>
          본 서비스는 개인 디자이너를 위한 AI 캔버스이며, 팀 워크스페이스·공동
          편집·공유 링크 공동 수정 기능을 제공하지 않습니다. 프로젝트는 생성한
          사용자 본인만 접근할 수 있습니다.
        </p>
        <h2>계정</h2>
        <p>
          Google OAuth를 통해서만 가입·로그인할 수 있습니다. 계정 보안은 사용자
          본인의 Google 계정 관리에 따릅니다.
        </p>
        <h2>크레딧과 결제</h2>
        <p>
          AI 생성에는 서비스 내부 크레딧이 사용됩니다. 유료 구독 및 크레딧 팩은
          Lemon Squeezy를 통해 결제되며, 환불 정책은 결제 대행사의 정책과 서비스
          안내에 따릅니다.
        </p>
        <h2>금지 행위</h2>
        <ul>
          <li>타인의 권리를 침해하는 콘텐츠 생성</li>
          <li>서비스 API·결제·크레딧 시스템의 남용</li>
          <li>무단 스크래핑 또는 자동화 공격</li>
        </ul>
        <h2>면책</h2>
        <p>
          AI 생성 결과물의 정확성·적법성·상업적 적합성은 보장되지 않으며, 최종
          사용 책임은 사용자에게 있습니다.
        </p>
        <p>
          <Link href="/">홈으로</Link>
        </p>
      </main>
      <LandingFooter />
    </div>
  );
}
