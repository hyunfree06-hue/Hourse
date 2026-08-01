import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { AccountClient } from "./account-client";

export default async function AccountPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/?next=/account");
  return <AccountClient profile={profile} />;
}
