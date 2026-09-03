-- 클라우드 경유 조종 — 웹이 여기 쓰고, ESP32가 0.3초마다 가지러 간다.
--
-- 왜 필요한가:
--   기존 조종은 브라우저 → ESP32로 **직접** WebSocket(ws://)을 연결했다. 이건 폰과
--   ESP32가 같은 와이파이에 있어야만 되고, 배포된 https 사이트에서는 브라우저가
--   ws:// 연결 자체를 막는다.
--   이 테이블을 거치면 LCD 문구(lcd_state)와 똑같은 경로가 된다 — ESP32가 인터넷으로
--   가지러 가기만 하므로, 폰이 LTE든 심사위원 폰이든 어디서 열어도 조종이 된다.
--
-- 행은 언제나 하나(id=1)만 두고 계속 덮어쓴다.

create table if not exists robot_command (
  id smallint primary key default 1,

  -- SPEC §9-2의 dir 값: F/B/L/R/SL/SR/STOP
  dir text not null default 'STOP',
  -- 0-255. 펌웨어가 MIN_DUTY 위로 다시 매핑한다
  spd smallint not null default 0,

  /*
   * ── 데드맨 스위치 ──────────────────────────────────────────────
   * 웹은 버튼을 누르고 있는 동안 계속 새 seq로 덮어쓴다. 브라우저가 죽거나
   * 폰이 꺼지면 seq가 더 이상 안 올라간다.
   *
   * ESP32는 "seq가 마지막으로 바뀐 시각"을 재서, 일정 시간 그대로면 무조건 멈춘다.
   * 이게 없으면 폰이 꺼진 순간의 마지막 명령(예: 전진)으로 로봇이 계속 달린다.
   *
   * 시각(updated_at) 대신 숫자를 쓰는 이유는 ESP32에 정확한 시계가 없어서다.
   * "값이 바뀌었나"만 보면 시계가 필요 없다.
   */
  seq bigint not null default 0,

  updated_at timestamptz not null default now(),
  constraint robot_command_singleton check (id = 1)
);

alter table robot_command enable row level security;

-- 해커톤 데모 범위라 anon 키로 열어둔다. lcd_state와 같은 정책이다.
drop policy if exists "anon full access" on robot_command;
create policy "anon full access" on robot_command for all using (true) with check (true);

-- upsert로 계속 덮어쓰므로 시작할 때 행이 하나 있어야 한다.
insert into robot_command (id, dir, spd, seq) values (1, 'STOP', 0, 0)
on conflict (id) do nothing;
