-- 살아있는 스마트팜 — Supabase 스키마 (마이그레이션)
--
-- 적용하는 방법 두 가지. 어느 쪽이든 결과는 같다.
--   1) CLI:      npm run db:push
--   2) 대시보드: SQL Editor → New query → 이 파일 전체를 붙여넣고 Run
--
-- 두 번 실행해도 안전하게 짜여 있다(if not exists / drop policy if exists).
--
-- 테이블 4개. 전부 브라우저(웹앱)가 쓴다. ESP32는 lcd_state만 읽는다.
--   robot_state     현재 상태 스냅샷 — 행 하나만 계속 덮어쓴다 (id=1 고정)
--   sensor_readings 센서 이력 — 5초마다 한 줄씩 쌓인다
--   robot_logs      행동 로그 이력 — LogList에 뜨는 것과 같은 내용
--   lcd_state       LCD에 띄울 문구 — 행 하나만 계속 덮어쓴다 (id=1 고정)

create table if not exists robot_state (
  id smallint primary key default 1,
  mode text not null,
  behavior text not null,
  face text not null,
  pos_x real not null,
  pos_y real not null,
  heading real not null,
  led_r smallint not null,
  led_g smallint not null,
  led_b smallint not null,
  led_mode text not null,
  conn text not null,
  updated_at timestamptz not null default now(),
  constraint robot_state_singleton check (id = 1)
);

create table if not exists sensor_readings (
  id bigint generated always as identity primary key,
  moisture real not null,
  nutrient real not null,
  lux real not null,
  temp real not null,
  humidity real not null,
  battery real not null,
  water_tank real not null,
  created_at timestamptz not null default now()
);

create table if not exists robot_logs (
  id bigint generated always as identity primary key,
  kind text not null,
  msg text not null,
  created_at timestamptz not null default now()
);

create table if not exists lcd_state (
  id smallint primary key default 1,
  text text not null default '',
  updated_at timestamptz not null default now(),
  constraint lcd_state_singleton check (id = 1)
);

-- ── 접근 권한 ─────────────────────────────────────────────────────
-- 해커톤 데모 범위라 anon 키로 전부 읽고 쓸 수 있게 열어둔다.
-- 로그인 기능을 붙이게 되면 이 정책부터 좁혀야 한다 (지금은 누구나 쓸 수 있음).

alter table robot_state     enable row level security;
alter table sensor_readings enable row level security;
alter table robot_logs      enable row level security;
alter table lcd_state       enable row level security;

-- drop 후 create — 이 파일을 두 번 실행해도(실수로 다시 눌러도) 에러 없이 넘어간다.
drop policy if exists "anon full access" on robot_state;
drop policy if exists "anon full access" on sensor_readings;
drop policy if exists "anon full access" on robot_logs;
drop policy if exists "anon full access" on lcd_state;

create policy "anon full access" on robot_state     for all using (true) with check (true);
create policy "anon full access" on sensor_readings for all using (true) with check (true);
create policy "anon full access" on robot_logs      for all using (true) with check (true);
create policy "anon full access" on lcd_state       for all using (true) with check (true);

-- ── 초기 행 ───────────────────────────────────────────────────────
-- robot_state / lcd_state는 upsert로 계속 덮어쓰므로, 시작할 때 한 번은 행이 있어야 한다.

insert into lcd_state (id, text) values (1, '') on conflict (id) do nothing;
insert into robot_state (id, mode, behavior, face, pos_x, pos_y, heading, led_r, led_g, led_b, led_mode, conn)
values (1, 'auto', 'idle', 'neutral', 0, 0, 0, 47, 107, 234, 'breathe', 'mock')
on conflict (id) do nothing;

-- ── 오래된 이력 자동 정리 (선택) ───────────────────────────────────
-- 데모 내내 5초마다 쌓이는 sensor_readings가 무료 티어 용량을 넘지 않도록,
-- 7일 지난 행은 지운다. Supabase 대시보드 → Database → Cron Jobs 에서
-- 아래를 매일 한 번 실행하도록 등록하면 된다 (안 해도 무료 티어 500MB로 몇 달은 간다).
--
--   delete from sensor_readings where created_at < now() - interval '7 days';
