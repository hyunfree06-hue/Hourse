export const siteConfig = {
  name: "Hourse",
  shortName: "Hourse",
  tagline: "Turn ideas into editable design.",
  description:
    "An AI-native visual workspace for independent creators.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://hourse-two.vercel.app",
  links: {
    twitter: "",
    github: "",
    supportEmail:
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@hourse.app",
  },
  ogImage: "/og.png",
  brand: {
    markDark: "/brand/hourse-mark-dark.png",
    markLight: "/brand/hourse-mark-light.png",
    lockupDark: "/brand/hourse-lockup-dark.png",
    lockupLight: "/brand/hourse-lockup-light.png",
    favicon: "/brand/hourse-favicon.svg",
  },
} as const;

export type SiteConfig = typeof siteConfig;
