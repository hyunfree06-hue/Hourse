const steps = [
  {
    step: "01",
    title: "Google로 시작",
    description: "별도 회원가입 폼 없이 Google 계정으로 바로 로그인하고 무료 크레딧을 받습니다.",
  },
  {
    step: "02",
    title: "영역 지정과 편집",
    description: "캔버스에 도형을 배치하거나 AI 영역 도구로 생성할 사각형을 드래그합니다.",
  },
  {
    step: "03",
    title: "생성하고 내보내기",
    description: "프롬프트를 입력해 이미지를 삽입한 뒤 PNG, JPG, SVG로 내보냅니다.",
  },
];

export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight text-neutral-950">
          3단계로 시작
        </h2>
        <p className="mt-3 max-w-xl text-neutral-600">
          복잡한 설정 없이 로그인부터 내보내기까지 이어집니다.
        </p>
        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((item) => (
            <li key={item.step} className="relative">
              <span className="text-sm font-semibold text-indigo-600">{item.step}</span>
              <h3 className="mt-2 text-lg font-semibold text-neutral-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                {item.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
