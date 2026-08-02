import Link from "next/link";
import type { Metadata } from "next";
import { LandingHeader, LandingFooter } from "@/components/layout/site-header";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Terms",
};

export default function TermsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="prose prose-neutral prose-sm mx-auto max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <h1>Terms of Service</h1>
        <p>
          <strong>Effective date:</strong> August 2, 2026
        </p>
        <p>
          By using {siteConfig.name} (the &ldquo;Service&rdquo;), you agree to
          these terms. If you do not agree, do not use the Service.
        </p>

        <h2>1. Service Description</h2>
        <p>
          {siteConfig.name} is an AI-native visual workspace for individual
          creators. Projects are private to the account that created them. The
          Service does not offer team workspaces, shared editing, or public
          sharing links.
        </p>

        <h2>2. Accounts</h2>
        <p>
          You sign in via Google OAuth. You are responsible for the security of
          your Google account. One person per account; accounts are
          non-transferable.
        </p>

        <h2>3. Credits and Usage</h2>
        <p>
          AI generation features consume credits. Free accounts receive a
          one-time credit grant on signup. Paid subscriptions renew monthly and
          grant a fixed number of credits each billing cycle. Credit packs are
          one-time purchases. Unused credits from subscriptions do not roll over
          unless otherwise stated.
        </p>

        <h2>4. Billing and Refunds</h2>
        <p>
          All payments are processed in USD through Lemon Squeezy. Subscriptions
          renew automatically until cancelled. You may cancel anytime from the
          billing portal; access continues until the end of the current billing
          period. Refunds for credit packs are available within 7 days of
          purchase if no credits have been consumed. Subscription refunds are
          handled on a case-by-case basis.
        </p>

        <h2>5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Generate content that infringes on others&apos; rights</li>
          <li>Abuse, exploit, or reverse-engineer the API, payment, or credit system</li>
          <li>Perform unauthorized scraping or automated attacks</li>
          <li>Use the Service for any unlawful purpose</li>
        </ul>

        <h2>6. Generated Content</h2>
        <p>
          AI-generated images are produced by third-party models. We make no
          guarantee regarding the accuracy, legality, or commercial suitability
          of generated content. You are solely responsible for how you use
          generated outputs.
        </p>

        <h2>7. Availability</h2>
        <p>
          We strive to maintain high availability but do not guarantee
          uninterrupted access. Scheduled maintenance and unforeseen outages may
          occur. We are not liable for losses resulting from downtime.
        </p>

        <h2>8. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, {siteConfig.name} is provided
          &ldquo;as is&rdquo; without warranties of any kind. Our total
          liability shall not exceed the amounts you paid to us in the 12 months
          preceding any claim.
        </p>

        <h2>9. Termination</h2>
        <p>
          We may suspend or terminate your account if you violate these terms. You
          may delete your account at any time from the Account settings page.
          Upon termination, your data is deleted in accordance with our Privacy
          Policy.
        </p>

        <h2>10. Contact</h2>
        <p>
          Questions? Email us at{" "}
          <a href={`mailto:${siteConfig.links.supportEmail}`}>
            {siteConfig.links.supportEmail}
          </a>
          .
        </p>

        <p className="mt-8">
          <Link href="/">Back to home</Link>
        </p>
      </main>
      <LandingFooter />
    </div>
  );
}
