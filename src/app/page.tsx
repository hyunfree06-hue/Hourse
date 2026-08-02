import { LandingHeader, LandingFooter } from "@/components/layout/site-header";
import { HeroSection } from "@/components/landing/hero";
import { ProductPreview } from "@/components/landing/product-preview";
import { ValueSection } from "@/components/landing/value-section";
import { WorkflowSection } from "@/components/landing/workflow-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCta } from "@/components/landing/final-cta";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection />
        <ProductPreview />
        <ValueSection />
        <WorkflowSection />
        <PricingSection />
        <FaqSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
