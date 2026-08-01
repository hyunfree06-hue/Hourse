export const siteConfig = {
  name: "CanvasAI",
  tagline: "개인 디자이너를 위한 AI 디자인 캔버스",
  description:
    "무한 캔버스에서 도형·텍스트·이미지를 편집하고, AI 영역을 지정해 OpenAI 또는 FLUX로 디자인을 생성하세요.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  links: {
    twitter: "",
    github: "",
    supportEmail: "support@canvasai.app",
  },
  ogImage: "/og.png",
} as const;

export type SiteConfig = typeof siteConfig;
