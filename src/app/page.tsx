import { LandingHeader, LandingFooter } from "@/components/layout/site-header";
import { LandingHero } from "@/components/landing/hero";
import { LandingFeatures } from "@/components/landing/features";
import { LandingHowItWorks } from "@/components/landing/how-it-works";
import { LandingPricingTeaser } from "@/components/landing/pricing-teaser";
import { LandingFaq } from "@/components/landing/faq";
import { LandingCta } from "@/components/landing/cta";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingPricingTeaser />
        <LandingFaq />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
