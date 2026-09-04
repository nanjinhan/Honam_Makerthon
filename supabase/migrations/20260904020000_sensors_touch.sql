-- robot_sensors.updated_at 을 DB가 스스로 갱신하게 한다.
--
-- default now() 는 INSERT 때만 먹는다. ESP32는 같은 행(id=1)을 계속 upsert하므로
-- 실제로는 UPDATE가 되고, 그러면 updated_at이 처음 만든 시각에 멈춰 있는다.
-- 웹은 이 시각을 보고 "실측이 아직 살아있나"를 판단하는데, 멈춰 있으면 늘
-- "오래된 값"으로 보여 목업으로 되돌아가 버린다.
--
-- ESP32에는 시계가 없어서 스스로 시각을 못 채운다. DB가 찍는 게 맞다.

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists robot_sensors_touch on robot_sensors;
create trigger robot_sensors_touch
  before insert or update on robot_sensors
  for each row execute function touch_updated_at();
