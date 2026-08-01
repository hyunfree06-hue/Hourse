import Link from "next/link";
import { LandingHeader, LandingFooter } from "@/components/layout/site-header";
import { siteConfig } from "@/config/site";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="prose prose-neutral mx-auto max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <h1>개인정보처리방침</h1>
        <p>
          {siteConfig.name}(이하 “서비스”)는 개인 디자이너를 위한 AI 디자인
          캔버스입니다. 본 방침은 서비스가 수집·이용하는 개인정보의 처리에 대해
          설명합니다.
        </p>
        <h2>수집 항목</h2>
        <ul>
          <li>Google 계정 인증을 통해 제공되는 이메일, 이름, 프로필 사진</li>
          <li>프로젝트 데이터, 업로드·생성 이미지 메타데이터</li>
          <li>결제 관련 식별자(Lemon Squeezy 주문/구독 ID) 및 크레딧 내역</li>
        </ul>
        <h2>이용 목적</h2>
        <ul>
          <li>계정 생성 및 인증</li>
          <li>개인 프로젝트 저장 및 AI 생성 처리</li>
          <li>결제·구독·크레딧 관리</li>
          <li>서비스 안정성 개선 및 부정 이용 방지</li>
        </ul>
        <h2>보관 및 삭제</h2>
        <p>
          계정 탈퇴 시 프로필과 연관된 프로젝트·에셋은 삭제됩니다. 법령상 보관이
          필요한 결제 기록은 관련 기간 동안 유지될 수 있습니다.
        </p>
        <h2>문의</h2>
        <p>
          문의:{" "}
          <a href={`mailto:${siteConfig.links.supportEmail}`}>
            {siteConfig.links.supportEmail}
          </a>
        </p>
        <p>
          <Link href="/">홈으로</Link>
        </p>
      </main>
      <LandingFooter />
    </div>
  );
}
