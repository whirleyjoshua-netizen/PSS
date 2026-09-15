-- Consultation questionnaire: what the customer tells us after the form, and the one-day key that lets them.
-- Every statement is safe to re-run.

alter table leads add column if not exists window_count_exact smallint;

alter table leads drop constraint if exists leads_window_count_exact_check;

alter table leads add constraint leads_window_count_exact_check check (window_count_exact is null or window_count_exact between 1 and 31);

alter table leads add column if not exists treatment_types text[] not null default '{}';

alter table leads drop constraint if exists leads_treatment_types_check;

alter table leads add constraint leads_treatment_types_check check (treatment_types <@ array['horizontal_blinds', 'vertical_blinds', 'shutters', 'cellular_shades', 'roller_shades', 'roman_shades', 'sheer_shadings', 'not_sure']::text[]);

alter table leads add column if not exists motorized boolean not null default false;

alter table leads add column if not exists gate_code text;

alter table leads drop constraint if exists leads_gate_code_check;

alter table leads add constraint leads_gate_code_check check (gate_code is null or char_length(gate_code) <= 40);

alter table leads add column if not exists finish text;

alter table leads drop constraint if exists leads_finish_check;

alter table leads add constraint leads_finish_check check (finish is null or finish in ('essential', 'designer', 'luxury', 'not_sure'));

alter table leads add column if not exists questionnaire_token_hash text;

alter table leads add column if not exists questionnaire_expires_at timestamptz;

create unique index if not exists leads_questionnaire_token_hash_idx on leads (questionnaire_token_hash) where questionnaire_token_hash is not null;
