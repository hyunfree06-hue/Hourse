import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";
import { getProviderAvailability } from "@/lib/validation/env.server";
import { EditorShell } from "@/components/editor/editor-shell";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/?next=/dashboard");

  const { projectId } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) notFound();
  if (!profile) redirect("/?next=/dashboard");

  return (
    <EditorShell
      project={project}
      profile={profile}
      availability={getProviderAvailability()}
    />
  );
}
