-- ============================================================
-- HoneypotAI — Supabase Migration: attack_context table
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- Enable UUID extension (already enabled in Supabase by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop old tables if migrating (OPTIONAL — comment out if you want to keep old data)
-- DROP TABLE IF EXISTS public.ai_results CASCADE;
-- DROP TABLE IF EXISTS public.event_logs CASCADE;
-- DROP TABLE IF EXISTS public.attack_events CASCADE;

-- ============================================================
-- attack_context: main session-level attack tracking table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.attack_context (
    attack_id      VARCHAR(36)  PRIMARY KEY,
    src_ip         VARCHAR(45)  NOT NULL,
    attack_type    VARCHAR(50)  NOT NULL,
    attack_status  VARCHAR(20)  NOT NULL DEFAULT 'new',
    severity       VARCHAR(20)  NOT NULL DEFAULT 'Low',
    connection_count  INT       NOT NULL DEFAULT 0,
    failed_count      INT       NOT NULL DEFAULT 0,
    success_count     INT       NOT NULL DEFAULT 0,
    unique_passwords  INT       NOT NULL DEFAULT 0,
    command_count     INT       NOT NULL DEFAULT 0,
    suspicious_cmds   INT       NOT NULL DEFAULT 0,
    start_time        TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_time    TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_time        TIMESTAMP NULL
);

-- Index on src_ip for fast lookups
CREATE INDEX IF NOT EXISTS idx_attack_context_src_ip
    ON public.attack_context (src_ip);

-- Index on attack_status for filtering active attacks
CREATE INDEX IF NOT EXISTS idx_attack_context_status
    ON public.attack_context (attack_status);

-- Index on last_seen_time for ordering
CREATE INDEX IF NOT EXISTS idx_attack_context_last_seen
    ON public.attack_context (last_seen_time DESC);

-- ============================================================
-- Row Level Security (RLS)
-- Supabase requires RLS to be enabled. For backend access via
-- service_role key, RLS policies are bypassed automatically.
-- ============================================================
ALTER TABLE public.attack_context ENABLE ROW LEVEL SECURITY;

-- Allow authenticated service_role full access (backend uses service key)
CREATE POLICY "Allow service role full access" ON public.attack_context
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Allow anonymous read (for frontend direct reads if needed)
CREATE POLICY "Allow anon read" ON public.attack_context
    FOR SELECT
    USING (true);

-- ============================================================
-- Keep old tables for backward compatibility (optional)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.attack_events (
    event_id TEXT PRIMARY KEY,
    pipeline_id TEXT,
    chunk_index INTEGER,
    source_ip INET,
    destination_ip INET,
    destination_port INTEGER,
    attack_vector TEXT,
    severity TEXT,
    risk_score DOUBLE PRECISION,
    first_seen TIMESTAMPTZ,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.event_logs (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(event_id, stage)
);

CREATE TABLE IF NOT EXISTS public.ai_results (
    event_id TEXT PRIMARY KEY,
    model_version TEXT,
    threat_level TEXT,
    risk_score DOUBLE PRECISION,
    confidence DOUBLE PRECISION,
    summary TEXT,
    prediction_payload JSONB,
    processed_at TIMESTAMPTZ
);

-- Enable RLS on legacy tables too
ALTER TABLE public.attack_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_attack_events" ON public.attack_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_event_logs" ON public.event_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_ai_results" ON public.ai_results FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "anon_read_attack_events" ON public.attack_events FOR SELECT USING (true);
CREATE POLICY "anon_read_event_logs" ON public.event_logs FOR SELECT USING (true);
CREATE POLICY "anon_read_ai_results" ON public.ai_results FOR SELECT USING (true);
