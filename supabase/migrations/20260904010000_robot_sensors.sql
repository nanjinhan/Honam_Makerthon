-- ESP32가 올리는 센서 실측값 — 웹이 어디서 열든 진짜 숫자를 보게 한다.
--
-- 왜 필요한가:
--   센서는 지금까지 WebSocket으로만 올라갔다. 그건 폰과 ESP32가 같은 와이파이에
--   있어야 하고, 배포된 https 사이트에서는 브라우저가 ws:// 연결을 막는다.
--   그래서 Vercel 주소로 열면 게이지 숫자가 전부 목업이었다 — 조도 좌/우도,
--   "수분 바싹 마름"도 실제 흙이 아니라 시뮬레이션 값이었다.
--
--   robot_command가 웹 -> ESP32 방향이라면, 이 표는 그 반대 방향이다.
--   ESP32가 밖으로 나가서 쓰기만 하므로 https도 방화벽도 상관없다.
--
-- 이력은 안 쌓는다. "지금 값" 한 줄만 계속 덮어쓴다(id=1).
-- 이력이 필요하면 웹이 쓰는 sensor_readings가 이미 있다.

create table if not exists robot_sensors (
  id smallint primary key default 1,

  -- 실제로 배선된 센서만 둔다. 온도·습도·영양·배터리는 전용 센서가 없다.
  moisture real not null default 0,      -- 0~100%로 편 값
  soil      text not null default '',    -- VERY WET / WET / NORMAL / DRY / VERY DRY
  soil_raw  integer not null default 0,  -- 토양 ADC 원본 (젖을수록 내려간다)

  lux   real not null default 0,         -- 좌우 평균
  lux_l real not null default 0,         -- BH1750 왼쪽 (0x23)
  lux_r real not null default 0,         -- BH1750 오른쪽 (0x5C)

  -- 초음파. -1은 "앞이 비었음"이지 0cm가 아니다.
  distance real not null default -1,
  ir boolean not null default false,

  /*
   * 웹은 이 시각을 보고 "실측이 살아있나"를 판단한다. 값이 오래됐으면
   * ESP32가 꺼진 것으로 보고 목업으로 되돌아간다 — 화면이 죽은 숫자를
   * 실시간인 척 띄우고 있으면 안 된다.
   */
  updated_at timestamptz not null default now(),

  constraint robot_sensors_singleton check (id = 1)
);

alter table robot_sensors enable row level security;

drop policy if exists "anon full access" on robot_sensors;
create policy "anon full access" on robot_sensors for all using (true) with check (true);

insert into robot_sensors (id) values (1) on conflict (id) do nothing;
