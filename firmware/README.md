# ESP32 펌웨어

이 폴더에는 스케치가 두 개 있다. 역할이 다르다.

| 스케치 | 통신 방식 | 하는 일 |
|---|---|---|
| `smartfarm_esp32/` (이 문서) | WebSocket, ESP32가 SoftAP | D-패드·표정·LED·동작 — 로봇 조종 전체 |
| `lcd_wifi/` | Supabase REST, ESP32가 일반 와이파이 | LCD에 웹에서 보낸 문구 띄우기만. 별도 안내는 `SETUP_GUIDE.md` |

둘은 별개 보드에 올려도 되고, 확인되면 `lcd_wifi`의 폴링 로직을 이 스케치의
`loop()`에 합쳐도 된다. 아래 내용은 `smartfarm_esp32.ino`(로봇 조종) 기준이다.

---

웹앱과 짝을 이루는 ESP32 스케치. SPEC §9-2 / §9-3 프로토콜을 그대로 구현한다.

## 속도 제어가 어떻게 이어지는가

웹의 속도 슬라이더 값이 그대로 모터 PWM이 된다. 중간에 변환이 없다.

```
맵 화면 슬라이더 (60~255)
  └ sendMove(dir, spd)                    src/net/commands.ts
      └ { "cmd":"MOVE", "dir":"F", "spd":180 }   WebSocket
          └ applyMove("F", 180)           smartfarm_esp32.ino
              └ drive(180, 180)
                  └ ledcWrite(핀, toDuty(180))   ← 실제 PWM 듀티
```

**슬라이더 최소값이 60인 이유**가 여기 있다. 작은 DC모터는 듀티가 낮으면 정지 마찰을
못 이기고 소리만 난다. 펌웨어의 `MIN_DUTY`(기본 70)가 한 번 더 바닥을 깔아준다.
모터를 바꾸면 **`MIN_DUTY`를 다시 잡아야 한다** — 천천히 올리며 실제로 도는 최소값 + 10 정도.

## 필요한 것

라이브러리 매니저에서:

- `ESPAsyncWebServer` (me-no-dev)
- `AsyncTCP` (me-no-dev, ESP32용)
- `ArduinoJson` v7 (bblanchon)

보드는 ESP32 Dev Module. **Arduino-ESP32 코어 3.x 기준**으로 작성했다.
코어 2.x를 쓰면 `ledc` API가 달라서 `setupPwm()` 주석대로 바꿔야 한다.

## 배선

`.ino` 상단의 핀 상수만 실제 배선에 맞게 고치면 된다. 기본값은 TB6612FNG 기준
(방향 2핀 + PWM 1핀 per 모터 + STBY). L298N이면 `STBY` 관련 두 줄을 지우고
`ENA`/`ENB`를 `L_PWM`/`R_PWM`에 물리면 그대로 동작한다.

## 현장 연결 순서

1. ESP32 전원 ON → SoftAP `SmartFarm` 생성 (비밀번호 `smartfarm1234`)
2. 노트북·폰을 그 와이파이에 연결 → `192.168.4.x` 할당
3. 노트북에서 `npm run dev -- --host`
4. 웹앱 헤더의 상태 배지를 눌러 `ws://192.168.4.1/ws` 입력 → 연결
5. 배지가 "목업 모드" → "실데이터"로 바뀌면 성공

연결이 실패하거나 중간에 끊겨도 **웹은 멈추지 않는다.** 3초마다 재시도하면서
그동안 목업으로 계속 돈다. 발표 중 ESP32가 죽어도 데모는 이어진다.

## 안전장치 두 개

1. **명령 타임아웃 400ms** — 웹은 버튼을 누르는 동안 150ms마다 MOVE를 보낸다.
   폰이 꺼지거나 와이파이가 끊기면 마지막 명령대로 계속 달리게 되므로,
   400ms 안에 새 명령이 없으면 무조건 정지한다.
2. **연결 끊김 시 즉시 정지** — `WS_EVT_DISCONNECT`에서 `stopMotors()`.

## 아직 비어 있는 곳

`applyFace()` / `applyLed()`의 본문(OLED·네오픽셀)과 온습도·배터리 센서 읽기는
`TODO`로 두었다. 프로토콜 진입점은 다 열려 있으므로 그 안만 채우면 된다.

**위치(`pos`)는 ESP32에서 보내지 않는다.** 도면 위 위치는 계속 웹 시뮬레이션 값을 쓴다
(SPEC §13). 발표에서 이 부분은 숨기지 말고 먼저 밝히는 것이 스펙의 지침이다.
