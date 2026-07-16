-- V22.3 optional NLU operations schema
-- Default Worker settings keep all persistent logging OFF.
-- Apply only when you want aggregate metrics or redacted failure samples.

create table if not exists public.nlu_intent_metrics_hourly (
  bucket_start timestamptz not null,
  intent text not null,
  result text not null check (result in ('ok','fallback','clarify','error')),
  version text not null default '',
  request_count bigint not null default 0,
  latency_sum_ms bigint not null default 0,
  latency_max_ms integer not null default 0,
  primary key (bucket_start, intent, result)
);
alter table public.nlu_intent_metrics_hourly add column if not exists version text not null default '';
create index if not exists idx_nlu_metrics_bucket on public.nlu_intent_metrics_hourly(bucket_start desc);

create or replace function public.record_nlu_metric(
  p_bucket_start timestamptz,
  p_intent text,
  p_result text,
  p_latency_ms integer,
  p_version text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.nlu_intent_metrics_hourly(bucket_start,intent,result,version,request_count,latency_sum_ms,latency_max_ms)
  values (date_trunc('hour',p_bucket_start),left(coalesce(p_intent,'UNKNOWN'),80),left(coalesce(p_result,'error'),20),left(coalesce(p_version,''),100),1,greatest(coalesce(p_latency_ms,0),0),greatest(coalesce(p_latency_ms,0),0))
  on conflict (bucket_start,intent,result)
  do update set
    request_count = public.nlu_intent_metrics_hourly.request_count + 1,
    latency_sum_ms = public.nlu_intent_metrics_hourly.latency_sum_ms + greatest(coalesce(excluded.latency_sum_ms,0),0),
    latency_max_ms = greatest(public.nlu_intent_metrics_hourly.latency_max_ms, excluded.latency_max_ms),
    version = excluded.version;
end;
$$;

create table if not exists public.nlu_failure_samples (
  sample_hash text primary key,
  redacted_sample text,
  intent text not null default 'UNKNOWN',
  result text not null check (result in ('fallback','clarify','error')),
  reason text not null default '',
  version text not null default '',
  hit_count bigint not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists idx_nlu_failure_last_seen on public.nlu_failure_samples(last_seen desc);
create index if not exists idx_nlu_failure_hit_count on public.nlu_failure_samples(hit_count desc);

create or replace function public.record_nlu_failure_sample(
  p_sample_hash text,
  p_redacted_sample text,
  p_intent text,
  p_result text,
  p_reason text,
  p_version text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.nlu_failure_samples(sample_hash,redacted_sample,intent,result,reason,version,hit_count,first_seen,last_seen)
  values (left(coalesce(p_sample_hash,''),80),nullif(left(coalesce(p_redacted_sample,''),180),''),left(coalesce(p_intent,'UNKNOWN'),80),left(coalesce(p_result,'error'),20),left(coalesce(p_reason,''),120),left(coalesce(p_version,''),100),1,now(),now())
  on conflict (sample_hash)
  do update set
    redacted_sample = coalesce(excluded.redacted_sample, public.nlu_failure_samples.redacted_sample),
    intent = excluded.intent,
    result = excluded.result,
    reason = excluded.reason,
    version = excluded.version,
    hit_count = public.nlu_failure_samples.hit_count + 1,
    last_seen = now();
end;
$$;

comment on table public.nlu_intent_metrics_hourly is 'Hourly aggregate NLU metrics. No user key or raw utterance.';
comment on table public.nlu_failure_samples is 'Optional deduplicated redacted fallback/clarification/error samples. No user key.';
