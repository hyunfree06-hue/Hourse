import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/site-header";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/?next=/dashboard");
  }
  const profile = await getCurrentProfile();

  return (
    <div className="flex min-h-full flex-col bg-neutral-50">
      <AppHeader
        credits={profile?.credit_balance}
        displayName={profile?.display_name}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
