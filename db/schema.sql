-- ============================================================
-- HydroFi database schema   (run in Supabase -> SQL Editor)
-- v1: one device, one reservoir
-- ============================================================


-- ------------------------------------------------------------
-- 1. devices
--    One row per physical HydroFi unit. Holds the device's API
--    token and the target ranges it doses against.
-- ------------------------------------------------------------
create table if not exists devices (
    id          text primary key,                       -- 'hydrofi-01'
    name        text        not null,
    api_token   text        not null unique,
    mode        text        not null default 'auto',     -- 'auto' | 'manual'

    ph_min      numeric     not null default 5.5,
    ph_max      numeric     not null default 6.5,
    tds_min     numeric     not null default 800,        -- ppm
    tds_max     numeric     not null default 1200,
    temp_min    numeric     not null default 20,         -- degrees C
    temp_max    numeric     not null default 28,

    created_at  timestamptz not null default now(),

    constraint devices_mode_check check (mode in ('auto', 'manual'))
);


-- ------------------------------------------------------------
-- 2. readings
--    Every telemetry post from the ESP32 lands here. This one
--    table drives the live dashboard, the history charts, AND
--    the pump volume totals.
--
--    nutrient_ml / ph_ml are INCREMENTAL: how much that pump
--    dispensed SINCE THE LAST POST. Almost always 0.
--      - lifetime total  -> sum(nutrient_ml)
--      - dosing history  -> rows where nutrient_ml > 0
--    This is why we don't need a separate doses table.
-- ------------------------------------------------------------
create table if not exists readings (
    id           bigserial   primary key,
    device_id    text        not null references devices(id) on delete cascade,

    ph           numeric,
    tds          numeric,                                -- ppm
    temp_c       numeric,

    nutrient_ml  numeric     not null default 0,
    ph_ml        numeric     not null default 0,

    -- set by the SERVER, never by the device (ESP32 clocks drift)
    recorded_at  timestamptz not null default now()
);

-- The dashboard always asks "latest first, for this device"
create index if not exists readings_device_time_idx
    on readings (device_id, recorded_at desc);


-- ------------------------------------------------------------
-- 3. commands
--    Outbound queue. The dashboard writes here; the ESP32 drains
--    it in the response to its next post.
--    Unused until step 5 -- defined now so the firmware never
--    needs a second schema migration.
-- ------------------------------------------------------------
create table if not exists commands (
    id            bigserial   primary key,
    device_id     text        not null references devices(id) on delete cascade,

    action        text        not null,                  -- 'dose_nutrient'
    payload       jsonb       not null default '{}'::jsonb,

    delivered_at  timestamptz,                           -- null = pending
    created_at    timestamptz not null default now()
);

create index if not exists commands_pending_idx
    on commands (device_id, created_at)
    where delivered_at is null;


-- ------------------------------------------------------------
-- 4. Lock the tables down.
--    RLS enabled with NO policies means the public/anon key can
--    read nothing at all. Only the service_role key gets through,
--    and that key lives on your server only -- never in the
--    firmware, never in browser JavaScript.
-- ------------------------------------------------------------
alter table devices  enable row level security;
alter table readings enable row level security;
alter table commands enable row level security;


-- ------------------------------------------------------------
-- 5. Seed the one device.
--    REPLACE THE TOKEN before running this. Generate one with:
--      python3 -c "import secrets; print(secrets.token_urlsafe(32))"
-- ------------------------------------------------------------
insert into devices (id, name, api_token)
values ('hydrofi-01', 'Pilot Reservoir', 'REPLACE_ME_WITH_A_RANDOM_TOKEN')
on conflict (id) do nothing;
