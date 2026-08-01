import {
  BoxSelect,
  Layers,
  Sparkles,
  Save,
  Download,
  Wand2,
} from "lucide-react";

const features = [
  {
    icon: BoxSelect,
    title: "AI 영역 지정 후 생성",
    description:
      "캔버스에서 원하는 영역을 드래그하면 점선 영역이 생기고, 그 안에서 바로 이미지를 생성합니다.",
  },
  {
    icon: Layers,
    title: "자유로운 캔버스 편집",
    description:
      "도형, 텍스트, 이미지를 선택·이동·크기 조절·회전하며 익숙한 디자인 툴 흐름으로 작업합니다.",
  },
  {
    icon: Wand2,
    title: "OpenAI와 FLUX 선택",
    description:
      "작업에 맞는 Provider와 품질을 고르고, 예상 크레딧을 확인한 뒤 생성합니다.",
  },
  {
    icon: Save,
    title: "개인 프로젝트 자동 저장",
    description:
      "변경 후 자동으로 저장되며, 충돌 시 최신 버전을 불러오거나 내 버전을 유지할 수 있습니다.",
  },
  {
    icon: Download,
    title: "결과물 내보내기",
    description: "완성된 디자인을 PNG, JPG, SVG로 내보낼 수 있습니다.",
  },
  {
    icon: Sparkles,
    title: "영역 교체와 참조 편집",
    description:
      "기존 캔버스 영역을 참조해 AI로 수정하거나 교체하고, 결과는 바로 다시 편집할 수 있습니다.",
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight text-neutral-950">
          개인 작업에 맞춘 AI 캔버스
        </h2>
        <p className="mt-3 text-neutral-600">
          팀 협업 기능 없이, 혼자 빠르게 스케치하고 생성하는 흐름에 집중했습니다.
        </p>
      </div>
      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="space-y-3">
            <div className="flex size-10 items-center justify-center rounded-md border border-neutral-200 bg-white text-indigo-600">
              <feature.icon className="size-5" aria-hidden />
            </div>
            <h3 className="text-base font-semibold text-neutral-900">
              {feature.title}
            </h3>
            <p className="text-sm leading-relaxed text-neutral-600">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
