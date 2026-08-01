import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/validation/env.server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  processLemonWebhook,
  verifyLemonSignature,
} from "@/lib/billing/lemonsqueezy";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");
  const env = getServerEnv();

  if (
    !verifyLemonSignature(rawBody, signature, env.LEMONSQUEEZY_WEBHOOK_SECRET)
  ) {
    return NextResponse.json(
      { error: { code: "invalid_signature", message: "서명 검증 실패" } },
      { status: 401 },
    );
  }

  let payload: {
    meta?: { event_name?: string; event_id?: string };
    data?: { id?: string };
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "잘못된 JSON" } },
      { status: 400 },
    );
  }

  const eventName = payload.meta?.event_name ?? "unknown";
  const externalId =
    payload.meta?.event_id ??
    `${eventName}:${payload.data?.id ?? "unknown"}`;

  const admin = createServiceClient();
  const { data: inserted, error: insertError } = await admin
    .from("webhook_events")
    .insert({
      provider: "lemonsqueezy",
      event_name: eventName,
      external_id: externalId,
      payload: payload as never,
      processed: false,
    })
    .select("*")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json(
      { error: { code: "store_failed", message: "웹훅 저장 실패" } },
      { status: 500 },
    );
  }

  try {
    const result = await processLemonWebhook(eventName, externalId, payload);
    await admin
      .from("webhook_events")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        processing_error: result.skipped
          ? `skipped:${result.reason ?? "unknown"}`
          : null,
      })
      .eq("id", inserted.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "웹훅 처리 실패";
    await admin
      .from("webhook_events")
      .update({
        processed: false,
        processing_error: message,
      })
      .eq("id", inserted.id);
    return NextResponse.json(
      { error: { code: "processing_failed", message: "웹훅 처리 실패" } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
