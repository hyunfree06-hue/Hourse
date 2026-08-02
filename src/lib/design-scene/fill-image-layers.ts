import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { createImageProvider } from "@/lib/ai/provider";
import { getServerEnv } from "@/lib/validation/env.server";
import { resolveOpenAiImageModel } from "@/lib/ai/size";
import {
  assertNotRawBase64OrJsonText,
  validateGeneratedImageBytes,
} from "@/lib/ai/decode-generated-image";
import { resolveProviderResultImage } from "@/lib/ai/bfl-provider";
import type { EditableDesignScene, EditableImageObject } from "@/lib/design-scene/schema";
import { logServerError, logServerInfo } from "@/lib/utils/errors";

type Admin = ReturnType<typeof createServiceClient>;

/**
 * Generate optional raster layers for image placeholders.
 * Failed layers are removed so the rest of the design still inserts.
 */
export async function fillDesignImagePlaceholders(input: {
  admin: Admin;
  userId: string;
  projectId: string;
  generationId: string;
  scene: EditableDesignScene;
  quality: "fast" | "standard" | "high";
  requestId: string;
}): Promise<{
  scene: EditableDesignScene;
  imageAssets: Record<string, { assetId: string; signedUrl: string | null; bucket: string; path: string }>;
}> {
  const images = input.scene.objects.filter(
    (o): o is EditableImageObject => o.type === "image",
  );
  if (images.length === 0) {
    return { scene: input.scene, imageAssets: {} };
  }

  const availability = {
    openai: Boolean(getServerEnv().OPENAI_API_KEY),
    bfl: Boolean(getServerEnv().BFL_API_KEY),
  };
  const providerId = availability.openai ? "openai" : availability.bfl ? "bfl" : null;
  if (!providerId) {
    return {
      scene: {
        ...input.scene,
        objects: input.scene.objects.filter((o) => o.type !== "image"),
      },
      imageAssets: {},
    };
  }

  const provider = createImageProvider(providerId);
  const env = getServerEnv();
  const model =
    providerId === "openai"
      ? resolveOpenAiImageModel(env.OPENAI_IMAGE_MODEL)
      : env.BFL_MODEL;

  const imageAssets: Record<
    string,
    { assetId: string; signedUrl: string | null; bucket: string; path: string }
  > = {};
  const kept = [...input.scene.objects];

  for (const img of images) {
    try {
      const result = await provider.generate({
        prompt: img.prompt,
        width: Math.max(64, Math.round(img.width)),
        height: Math.max(64, Math.round(img.height)),
        quality: input.quality,
        model,
        fit: img.fit,
      });

      if (result.status !== "completed") {
        throw new Error(result.errorMessage ?? "image layer failed");
      }

      const raw = await resolveProviderResultImage(
        result,
        img.width,
        img.height,
        img.fit,
      );
      assertNotRawBase64OrJsonText(raw);
      const validated = await validateGeneratedImageBytes(raw);
      const path = `${input.userId}/${input.projectId}/${randomUUID()}.${validated.extension}`;
      const bytes = validated.uploadBody;

      const { error: uploadError } = await input.admin.storage
        .from("generated-assets")
        .upload(path, bytes, {
          contentType: validated.mime,
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: asset, error: assetError } = await input.admin
        .from("assets")
        .insert({
          user_id: input.userId,
          project_id: input.projectId,
          asset_type: "generated",
          storage_bucket: "generated-assets",
          storage_path: path,
          mime_type: validated.mime,
          file_size: validated.byteLength,
          width: Math.round(img.width),
          height: Math.round(img.height),
        })
        .select("*")
        .single();
      if (assetError || !asset) throw assetError ?? new Error("asset insert failed");

      const { data: signed } = await input.admin.storage
        .from("generated-assets")
        .createSignedUrl(path, 60 * 10);

      imageAssets[img.id] = {
        assetId: asset.id,
        signedUrl: signed?.signedUrl ?? null,
        bucket: "generated-assets",
        path,
      };

      const idx = kept.findIndex((o) => o.id === img.id);
      if (idx >= 0) {
        kept[idx] = { ...img, assetId: asset.id };
      }

      logServerInfo({
        requestId: input.requestId,
        route: "fillDesignImagePlaceholders",
        stage: "image_layer_ok",
        generationId: input.generationId,
        message: img.id,
      });
    } catch (error) {
      logServerError({
        requestId: input.requestId,
        route: "fillDesignImagePlaceholders",
        stage: "image_layer_failed",
        generationId: input.generationId,
        message: error instanceof Error ? error.message : "failed",
      });
      // Remove failed placeholder safely
      const idx = kept.findIndex((o) => o.id === img.id);
      if (idx >= 0) kept.splice(idx, 1);
    }
  }

  return {
    scene: { ...input.scene, objects: kept },
    imageAssets,
  };
}
