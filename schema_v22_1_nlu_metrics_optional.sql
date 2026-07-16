-- V22.1 optional NLU aggregate metrics (disabled by default)
-- Stores hourly aggregate counters only; raw user utterances are not stored.
create table if not exists public.nlu_intent_metrics_hourly (
  bucket_start timestamptz not null,
  intent text not null,
  result text not null check (result in ('ok','fallback','clarify','error')),
  request_count bigint not null default 0,
  latency_sum_ms bigint not null default 0,
  latency_max_ms integer not null default 0,
  primary key (bucket_start, intent, result)
);
create index if not exists idx_nlu_metrics_bucket on public.nlu_intent_metrics_hourly(bucket_start desc);
comment on table public.nlu_intent_metrics_hourly is 'Optional aggregate-only NLU metrics. No raw utterance or user key.';
