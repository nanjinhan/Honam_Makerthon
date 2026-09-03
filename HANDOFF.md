# 인수인계 — 지금까지 한 것 / 앞으로 할 것

> 새 대화창에서 이어서 작업할 때 **이 파일부터 읽으면** 상황 파악이 됩니다.
> 마지막 업데이트: 2026-09-03

---

## 이 프로젝트가 뭔지

**자율주행 화분 로봇 컨트롤 웹앱.** 기술창업 메이커톤 출품작.
센서로 자기 상태를 파악해 빛 드는 자리로 이동하고, 목마르면 급수 스테이션에 가서
물을 받고, 주인이 오면 반겨주는 화분 로봇 — 그 로봇을 조종/모니터링하는 웹앱.

- 요구사항 원본: `C:\Users\wlsgk\Downloads\SPEC (1).md` (**v3**. v2 내용은 폐기됨)
- 개발 이력·판단 근거: `PLAN.md` (길지만 "왜 이렇게 했는지"가 전부 적혀 있음)
- 하드웨어 연결 가이드: `firmware/SETUP_GUIDE.md`

---

## 지금 동작하는 것 (전부 실제로 확인 완료)

### 웹앱 — 배포됨
**https://smartfarm-web-gules.vercel.app**

화면 4개 전부 동작:
| 탭 | 내용 |
|---|---|
| 홈 | 표정 도트 + 상태 라벨 + 링 게이지 4개 + 방 카드 + 최근 알림 |
| 맵 | 평면도(히트맵/경로) + D-패드 + 속도 + 인사/물 버튼 |
| 조종 | 표정 6개 / LED 색·모드 / **LCD 문구** / 동작 버튼 4개 |
| 기록 | 누적 통계 + 로그 필터 |

목업 시뮬레이션 엔진이 돌아서 **ESP32 없이도 100% 동작**함 (약 28초에 한 사이클:
광원탐색 → 급수 → 복귀). `npm run sim`으로 화면 없이 검증 가능.

### LCD — 웹에서 보낸 글자가 실제로 LCD에 뜸 ✅
```
브라우저 → Supabase(lcd_state 테이블) → ESP32가 3초마다 읽음 → LCD 표시
```
조종 탭의 **LCD 문구 입력창**과 **동작 버튼 4개**(인사/물/소리/빙글) 둘 다 동작.

### 클라우드
- **Vercel**: CLI 로그인·링크 완료. 배포는 `vercel --prod --yes` (자동배포 아님)
- **Supabase**: `Honam_Makerthon` (ref `xzfylltdbolulhtyufvh`, Seoul)
  - 테이블 4개: `robot_state` / `sensor_readings` / `robot_logs` / `lcd_state`
  - CLI 링크 완료 → `npm run db:push`, `npm run db:types`
  - **브라우저가 유일한 writer.** ESP32는 `lcd_state`만 읽음
  - 웹앱 켜두면 센서 5초/회, 로봇상태 2초/회, 로그는 생길 때마다 자동 저장
- **GitHub**: https://github.com/nanjinhan/Honam_Makerthon

---

## ⚠️ 다음에 할 일 (여기부터가 남은 작업)

### 결정된 사항: **ESP32 보드 1개로 전부 처리**

그래서 지금 나뉘어 있는 두 스케치를 **하나로 합쳐야 합니다.**

| 스케치 | 통신 방식 | 상태 |
|---|---|---|
| `firmware/smartfarm_esp32/smartfarm_esp32.ino` | WebSocket (같은 와이파이, 즉시) | 뼈대만 있음, 미업로드 |
| `firmware/lcd_wifi/lcd_wifi.ino` | Supabase REST (인터넷, 3초) | **동작 확인 완료**, 현재 보드에 올라가 있음 |

**합치는 방향**: `smartfarm_esp32.ino`를 본체로 삼고, `lcd_wifi.ino`의 폴링 로직
(`pollOnce()` + LCD 초기화)을 그 `loop()`에 넣는다.

> 주의: `smartfarm_esp32.ino`는 **SoftAP 모드**(ESP32가 공유기 역할)이고
> `lcd_wifi.ino`는 **STA 모드**(에그에 접속)다. 합칠 때 이 충돌을 해결해야 함.
> ESP32는 `WIFI_AP_STA` 모드로 둘 다 동시에 가능하지만 검증 안 해봄.

### 팀원이 채워야 할 빈칸 (`smartfarm_esp32.ino`)

웹↔ESP32 **통신 규약은 이미 다 완성**돼 있음. 팀원은 웹을 몰라도 되고,
아래 함수 **안쪽만** 채우면 웹에 자동 반영됨:

```cpp
void applyMove(dir, spd)   // ✅ 완성 (모터 PWM까지)
void applyFace(face)       // ⬜ OLED 표정 — neutral|happy|thirsty|sleepy|love|excited
void applyLed(r,g,b,mode)  // ⬜ 네오픽셀 링 — solid|breathe|rainbow|off
void applyAct(act)         // 🔶 펌프·회전만 됨, 소리 등 추가 필요
void sendSensors()         // 🔶 조도·토양수분 됨 / 온습도·배터리 TODO
```

프로토콜 (SPEC §9-2 / §9-3):
```jsonc
웹 → ESP32:  {"cmd":"MOVE","dir":"F|B|L|R|SL|SR|STOP","spd":0-255}
             {"cmd":"FACE","v":"happy"}
             {"cmd":"LED","r":0-255,"g":..,"b":..,"mode":"breathe"}
             {"cmd":"ACT","v":"greet|drink|sound|spin"}

ESP32 → 웹:  {"type":"sensor","moisture":51,"nutrient":72,"lux":657,
              "temp":24.2,"humidity":48,"battery":88,"waterTank":64}
             {"type":"event","kind":"docked|watering_done|owner_near|obstacle"}
```

### 그 외 남은 것
- [ ] 실물 모터 연결 후 D-패드로 실제 주행 테스트
- [ ] 온습도 센서(DHT/SHT) 코드 작성 → `sendSensors()`에 반영
- [ ] OLED 표정 6종 구현
- [ ] 네오픽셀 LED 링 구현
- [ ] DB에 쌓인 센서 이력을 **화면에 그래프로 보여주는 기능** (아직 없음)
- [ ] 폰으로 접속 테스트 / 노트북+폰 동시 접속 (SPEC §14)

---

## 새 대화에서 이렇게 시작하세요

> **"C:\Users\wlsgk\smartfarm-web 프로젝트다. HANDOFF.md 읽고 상황 파악해줘.
> ESP32 보드 하나에 모터·센서·OLED·LCD 다 물릴 거라 두 스케치를 합쳐야 한다."**

읽으라고 할 파일 (우선순위 순):
1. **`HANDOFF.md`** ← 이 파일. 현재 상태 전체
2. `firmware/smartfarm_esp32/smartfarm_esp32.ino` ← 합칠 본체
3. `firmware/lcd_wifi/lcd_wifi.ino` ← 여기 폴링 로직을 위에 넣어야 함
4. `firmware/SETUP_GUIDE.md` ← 배선·라이브러리·연결 순서
5. `PLAN.md` ← 왜 이렇게 만들었는지 (길어서 필요할 때만)

---

## 알아둬야 할 함정들 (실제로 겪은 것)

- **아두이노 IDE**: ✓(검증)는 보드에 안 올라감. **→(업로드)** 눌러야 함.
  `Hash of data verified` 나와야 진짜 올라간 것
- **`WARNING: library LiquidCrystal I2C claims to run on avr`** — 무시해도 되는 경고
- **`secrets.h`** 에 와이파이 비번이 있고 `.gitignore`로 막혀 있음.
  `.ino`에 직접 적으면 공개 저장소에 비번이 노출됨. 절대 옮기지 말 것
- **Supabase publishable 키는 공개돼도 안전** (RLS가 보안 담당).
  단 `service_role` 키는 절대 노출 금지
- **ESP32는 2.4GHz만** 잡음. 5GHz 와이파이 안 됨
- 현재 와이파이: **에그 `ktEgg_aac1`**
- Vercel은 **push해도 자동배포 안 됨**. `vercel --prod --yes` 직접 실행

---

## 자주 쓰는 명령

```bash
npm run dev          # 로컬 개발 서버
npm run sim          # 시뮬레이션 엔진 검증 (화면 없이)
npm run shot         # 탭 4개 스크린샷 + 가로넘침·콘솔에러 점검
npx tsc -b           # 타입 체크
vercel --prod --yes  # 배포
npm run db:push      # DB 스키마 반영
npm run db:types     # DB에서 TS 타입 재생성
```
