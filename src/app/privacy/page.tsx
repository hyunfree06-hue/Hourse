import Link from "next/link";
import type { Metadata } from "next";
import { LandingHeader, LandingFooter } from "@/components/layout/site-header";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy",
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="prose prose-neutral prose-sm mx-auto max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <h1>Privacy Policy</h1>
        <p>
          <strong>Effective date:</strong> August 2, 2026
        </p>
        <p>
          {siteConfig.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or the
          &ldquo;Service&rdquo;) is an AI-native visual workspace for
          independent creators. This policy explains how we collect, use, and
          protect your personal information.
        </p>

        <h2>1. Information We Collect</h2>
        <h3>Account information</h3>
        <p>
          When you sign in with Google OAuth, we receive your email address,
          display name, and profile photo from your Google account. We do not
          store your Google password.
        </p>
        <h3>Projects and assets</h3>
        <p>
          We store project data (canvas state, layer metadata) and uploaded or
          generated image assets associated with your account.
        </p>
        <h3>Payment information</h3>
        <p>
          Payments are processed by Lemon Squeezy. We store order IDs,
          subscription IDs, and credit transaction records. We do not store
          full card numbers.
        </p>
        <h3>AI generation data</h3>
        <p>
          When you use AI generation features, prompts and parameters are sent
          to third-party AI providers (OpenAI, Black Forest Labs). Generated
          images are stored in your project. We do not use your prompts or
          generated content to train our own models.
        </p>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>Create and authenticate your account</li>
          <li>Store and serve your personal projects and assets</li>
          <li>Process payments, manage subscriptions, and track credits</li>
          <li>Improve service reliability and prevent abuse</li>
        </ul>

        <h2>3. Data Retention</h2>
        <p>
          Your data is retained for as long as your account is active. When you
          delete your account, your profile, projects, and associated assets are
          permanently removed. Payment records required by law may be retained
          for the legally mandated period.
        </p>

        <h2>4. Data Sharing</h2>
        <p>
          We do not sell your data. We share information only with service
          providers necessary to operate the platform: Supabase (database and
          auth), Lemon Squeezy (payments), and AI providers for generation
          requests.
        </p>

        <h2>5. Security</h2>
        <p>
          We use encryption in transit (TLS) and at rest where applicable. Access
          to production data is restricted to authorized personnel.
        </p>

        <h2>6. Your Rights</h2>
        <p>
          You may export your projects, update your profile, or delete your
          account at any time from the Account settings page.
        </p>

        <h2>7. Contact</h2>
        <p>
          Questions or requests? Email us at{" "}
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
