/**
 * One-off: refund failed Design generation 59a07dcf-0020-4796-9f92-09a8957e05b0
 * Idempotent via generation_refund:{id}
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"|"$/g, "");
      }
    }
  } catch {
    // ignore
  }
}

loadEnvLocal();

const GENERATION_ID = "59a07dcf-0020-4796-9f92-09a8957e05b0";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase admin env");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: gen, error } = await admin
    .from("ai_generations")
    .select(
      "id, user_id, status, credits_charged, error_code, error_message, mode, output_type",
    )
    .eq("id", GENERATION_ID)
    .maybeSingle();

  if (error || !gen) {
    console.error("Generation not found", error);
    process.exit(1);
  }

  const { data: profileBefore } = await admin
    .from("profiles")
    .select("credit_balance")
    .eq("id", gen.user_id)
    .single();

  const { data: existingRefund } = await admin
    .from("credit_ledger")
    .select("id, delta, balance_after, reason, idempotency_key")
    .eq("idempotency_key", `generation_refund:${GENERATION_ID}`)
    .maybeSingle();

  console.log(
    JSON.stringify(
      {
        generation: gen,
        balanceBefore: profileBefore?.credit_balance ?? null,
        existingRefund: existingRefund ?? null,
      },
      null,
      2,
    ),
  );

  if (existingRefund) {
    await admin
      .from("ai_generations")
      .update({
        status: "failed",
        error_code: "DESIGN_SCHEMA_INVALID",
        error_message:
          "Design generation is temporarily unavailable. Your credits were restored.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", GENERATION_ID);
    console.log(
      JSON.stringify({
        action: "already_refunded",
        statusUpdated: true,
        balanceAfter: profileBefore?.credit_balance ?? null,
      }),
    );
    return;
  }

  const amount = Number(gen.credits_charged ?? 0);
  if (amount > 0) {
    const { data: refundResult, error: refundError } = await admin.rpc(
      "refund_credits",
      {
        p_user_id: gen.user_id,
        p_amount: amount,
        p_reason: "generation_refund",
        p_idempotency_key: `generation_refund:${GENERATION_ID}`,
        p_generation_id: GENERATION_ID,
        p_payment_id: null,
        p_metadata: {
          code: "DESIGN_SCHEMA_INVALID",
          stage: "structured_output_schema",
          manual: true,
        },
      },
    );
    if (refundError) {
      console.error("Refund failed", refundError);
      process.exit(1);
    }
    console.log(JSON.stringify({ refundResult }));
  }

  await admin
    .from("ai_generations")
    .update({
      status: "failed",
      error_code: "DESIGN_SCHEMA_INVALID",
      error_message:
        "Design generation is temporarily unavailable. Your credits were restored.",
      completed_at: new Date().toISOString(),
    })
    .eq("id", GENERATION_ID);

  const { data: profileAfter } = await admin
    .from("profiles")
    .select("credit_balance")
    .eq("id", gen.user_id)
    .single();

  console.log(
    JSON.stringify({
      action: amount > 0 ? "refunded" : "marked_failed_no_charge",
      balanceBefore: profileBefore?.credit_balance ?? null,
      balanceAfter: profileAfter?.credit_balance ?? null,
      amount,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
