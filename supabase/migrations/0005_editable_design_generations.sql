-- Editable Design generation support.
-- Extends ai_generations.mode for the single Design workflow
-- and adds optional structured scene output metadata.

alter table public.ai_generations
  drop constraint if exists ai_generations_mode_check;

alter table public.ai_generations
  add constraint ai_generations_mode_check
  check (mode in ('generate', 'edit', 'replace', 'design'));

alter table public.ai_generations
  add column if not exists output_type text
    check (output_type is null or output_type in ('raster_image', 'editable_design'));

alter table public.ai_generations
  add column if not exists scene_graph_json jsonb;

alter table public.ai_generations
  add column if not exists design_version integer;

alter table public.ai_generations
  add column if not exists inserted_object_ids text[];

comment on column public.ai_generations.output_type is
  'raster_image for legacy PNG generations; editable_design for Fabric scene graphs';
comment on column public.ai_generations.scene_graph_json is
  'Validated plain JSON scene graph for editable_design outputs';
