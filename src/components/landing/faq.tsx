const faqs = [
  {
    q: "팀 협업이나 공유 편집이 가능한가요?",
    a: "아니요. CanvasAI는 개인 디자이너용으로, 프로젝트는 생성한 본인만 접근할 수 있습니다.",
  },
  {
    q: "무료로 시작할 수 있나요?",
    a: "네. Google 계정으로 가입하면 소량의 무료 크레딧이 지급되며 카드 등록이 필요 없습니다.",
  },
  {
    q: "어떤 AI를 사용하나요?",
    a: "OpenAI 이미지 API와 Black Forest Labs FLUX API를 선택할 수 있습니다. 서버에 API 키가 설정된 Provider만 활성화됩니다.",
  },
  {
    q: "모바일에서도 편집할 수 있나요?",
    a: "대시보드와 미리보기는 모바일에서 사용할 수 있지만, 정밀 편집은 데스크톱 환경을 권장합니다.",
  },
];

export function LandingFaq() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="text-3xl font-semibold tracking-tight text-neutral-950">자주 묻는 질문</h2>
      <div className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
        {faqs.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="cursor-pointer list-none text-base font-medium text-neutral-900 marker:content-none">
              {item.q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
