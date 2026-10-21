-- =============================================================================
-- ReelSpark: Professional Video & Audio Clipping Studio Schema
-- Migration: 20261020000000_create_clipping_studio_schema.sql
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. CLIPPING PROJECTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clipping_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID, -- Optional foreign key to auth.users if Supabase Auth is enabled
    name VARCHAR(255) NOT NULL,
    description TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_clipping_projects_user_id ON clipping_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_clipping_projects_updated_at ON clipping_projects(updated_at DESC);

-- -----------------------------------------------------------------------------
-- 2. MEDIA ASSETS (Locally processed media reference)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES clipping_projects(id) ON DELETE CASCADE,
    filename VARCHAR(512) NOT NULL,
    local_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    duration_ms BIGINT NOT NULL DEFAULT 0,
    width INT,
    height INT,
    fps NUMERIC(6, 2),
    format VARCHAR(64) NOT NULL,
    has_video BOOLEAN NOT NULL DEFAULT true,
    has_audio BOOLEAN NOT NULL DEFAULT true,
    video_codec VARCHAR(64),
    audio_codec VARCHAR(64),
    stream_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_media_assets_project_id ON media_assets(project_id);

-- -----------------------------------------------------------------------------
-- 3. CLIPS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES clipping_projects(id) ON DELETE CASCADE,
    media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    start_ms BIGINT NOT NULL CHECK (start_ms >= 0),
    end_ms BIGINT NOT NULL CHECK (end_ms > start_ms),
    duration_ms BIGINT NOT NULL GENERATED ALWAYS AS (end_ms - start_ms) STORED,
    order_index INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_clips_project_id ON clips(project_id);
CREATE INDEX IF NOT EXISTS idx_clips_media_asset_id ON clips(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_clips_order ON clips(project_id, order_index ASC);

-- -----------------------------------------------------------------------------
-- 4. MERGE RECIPES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merge_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES clipping_projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    output_format VARCHAR(32) NOT NULL DEFAULT 'mp4',
    target_resolution VARCHAR(32) NOT NULL DEFAULT 'source',
    normalize_audio BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_merge_recipes_project_id ON merge_recipes(project_id);

-- -----------------------------------------------------------------------------
-- 5. MERGE RECIPE ITEMS (Ordered sequence of clip references in a recipe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merge_recipe_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID NOT NULL REFERENCES merge_recipes(id) ON DELETE CASCADE,
    clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    order_index INT NOT NULL DEFAULT 0,
    transition VARCHAR(32) NOT NULL DEFAULT 'none',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_merge_recipe_items_recipe ON merge_recipe_items(recipe_id, order_index ASC);
CREATE INDEX IF NOT EXISTS idx_merge_recipe_items_clip ON merge_recipe_items(clip_id);

-- -----------------------------------------------------------------------------
-- 6. EXPORT JOBS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS export_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES clipping_projects(id) ON DELETE CASCADE,
    job_type VARCHAR(64) NOT NULL CHECK (job_type IN ('single_clip', 'selected_clips', 'all_clips', 'merge_recipe')),
    target_id TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    progress_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    output_path TEXT,
    error_message TEXT,
    settings_json JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_project_status ON export_jobs(project_id, status);

-- -----------------------------------------------------------------------------
-- 7. EXPORT SOURCE MAPPINGS (Full Bidirectional Lineage / Provenance)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS export_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    export_job_id UUID NOT NULL REFERENCES export_jobs(id) ON DELETE CASCADE,
    clip_id UUID REFERENCES clips(id) ON DELETE SET NULL,
    source_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    start_ms BIGINT NOT NULL,
    end_ms BIGINT NOT NULL,
    sequence_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_export_sources_job ON export_sources(export_job_id, sequence_index ASC);
CREATE INDEX IF NOT EXISTS idx_export_sources_clip ON export_sources(clip_id);
CREATE INDEX IF NOT EXISTS idx_export_sources_asset ON export_sources(source_asset_id);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE clipping_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE merge_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE merge_recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_sources ENABLE ROW LEVEL SECURITY;

-- Allow full access for local desktop development / anon access when auth is not configured:
CREATE POLICY "Allow anon read/write for local desktop clipping" ON clipping_projects
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon read/write for media_assets" ON media_assets
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon read/write for clips" ON clips
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon read/write for merge_recipes" ON merge_recipes
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon read/write for merge_recipe_items" ON merge_recipe_items
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon read/write for export_jobs" ON export_jobs
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon read/write for export_sources" ON export_sources
    FOR ALL USING (true) WITH CHECK (true);
