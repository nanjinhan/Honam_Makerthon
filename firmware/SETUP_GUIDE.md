# 순서대로 따라하기 — ESP32 와이파이 + Vercel + Supabase + LCD

처음 하시는 거라 순서대로만 따라가면 되게 정리했습니다. 중간에 막히면 그 단계 이름을
그대로 저한테 알려주세요.

## 지금 상황 정리 (왜 이 순서인지)

지금까지 앱은 **ESP32가 와이파이 공유기 역할(SoftAP)**을 하고, 폰이 거기 붙어서
`ws://192.168.4.1`로 직접 대화하는 구조였습니다. 인터넷이 필요 없는 대신, ESP32 반경
밖에서는 안 됩니다.

**LCD 기능은 이것과 반대 방향**입니다 — 웹사이트에 글자를 치면, 그게 인터넷을 건너
ESP32까지 가야 합니다. 그러려면 ESP32가 SoftAP가 아니라 **일반 와이파이(공유기)에
접속**해야 인터넷에 닿습니다. 그래서 1번이 "와이파이 연동"입니다.

DB는 **Supabase**를 씁니다. 이유는 LCD 문구 하나만 저장할 게 아니라 센서 이력·로봇
행동 로그·로봇 현재 상태까지 실제로 쌓고 싶다고 하셔서입니다. Supabase는 진짜 테이블이
있는 DB(Postgres)라 이런 여러 종류의 데이터를 구조 있게 담을 수 있고, ESP32가 REST API로
직접 읽을 수도 있어서 별도 서버 코드 없이 연결됩니다.

두 구조는 같이 씁니다. 로봇 조종(D-패드 등)은 지금처럼 SoftAP+WebSocket으로,
LCD·센서 이력·로그·상태 동기화는 별도로 인터넷+Supabase를 씁니다.

```
[로봇 조종]     브라우저 ──ws://192.168.4.1── ESP32(SoftAP)          ← 인터넷 불필요, 지금 그대로
[LCD·이력·상태] 브라우저 ──Supabase(HTTPS)──┬── ESP32(집 와이파이, LCD만 읽음)
                                          └── DB 테이블 4개 (기록/조회용)
```

**브라우저만 Supabase에 씁니다.** ESP32는 LCD 문구 하나만 읽어갑니다. 센서·로그·로봇
상태는 브라우저가 이미 다 들고 있어서(목업이든 실제 ESP32에서 WebSocket으로 받은 값이든)
거기서 바로 Supabase로 올라갑니다 — ESP32가 따로 DB에 쓸 필요가 없습니다.

---

## 1단계 — Supabase 프로젝트 만들기

1. https://supabase.com → 우측 상단 **Start your project** → GitHub 계정으로 로그인
2. **New project** → 조직 선택(처음이면 자동 생성됨) → 프로젝트 이름(`smartfarm` 등),
   DB 비밀번호(아무거나 기억할 값), 리전은 **Northeast Asia (Seoul)** 선택 → Create
3. 1~2분 기다리면 프로젝트가 만들어집니다

**확인:** 왼쪽 메뉴에 Table Editor, SQL Editor 등이 보이면 성공.

---

## 2단계 — 테이블 만들기 (SQL 한 번 실행)

1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 이 프로젝트의 `supabase/schema.sql` 파일을 열어 **전체 내용을 복사**해서 붙여넣기
3. 우측 하단 **Run** (또는 Ctrl+Enter)

테이블 4개(`robot_state`, `sensor_readings`, `robot_logs`, `lcd_state`)가 만들어집니다.

**확인:** 왼쪽 메뉴 **Table Editor**에서 저 4개 테이블이 보이면 성공.

---

## 3단계 — API 키 확인

왼쪽 메뉴 **Project Settings**(톱니바퀴) → **Data API**:

- **Project URL** — `https://xxxxxxxx.supabase.co` 형태. 이걸 **적어두세요.**
- **anon public** 키 — `eyJ...`로 시작하는 긴 문자열. 이것도 **적어두세요.**

이 두 값을 5단계(웹)와 9단계(아두이노)에서 그대로 씁니다.

---

## 4단계 — Vercel CLI 설치 + 로그인 + 프로젝트 연결

터미널(PowerShell)에서, 프로젝트 폴더(`C:\Users\wlsgk\smartfarm-web`)로 이동 후:

```powershell
npm i -g vercel
vercel login
vercel link
```

`vercel link` 질문들:
- `Set up and deploy?` → **Y**
- `Which scope?` → 본인 계정
- `Link to existing project?` → **N**
- 나머지는 그냥 엔터(기본값)

**확인:** `vercel ls`에 프로젝트 이름이 보이면 성공.

---

## 5단계 — 웹앱에 Supabase 키 넣기

프로젝트 루트에 `.env.local` 파일을 새로 만들고 (없으면 새로 만드는 것):

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...여기에-3단계에서-적어둔-anon-key
```

**로컬에서 확인:**

```powershell
npm run dev
```

브라우저로 열어서 개발자 도구(F12) → Console에 `[supabase] ... 건너뜁니다` 안내가
**안 뜨면** 연결된 겁니다. 조종 탭 맨 아래 "LCD" 섹션이 입력 가능한 카드로 보이면 성공.

**Vercel에도 같은 값 등록** (배포본에서도 쓰려면 필요):

```powershell
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
```

각각 값 붙여넣기 요청하면 위에서 적어둔 값을 넣습니다.

---

## 6단계 — 배포

```powershell
vercel --prod
```

`https://smartfarm-web-xxxx.vercel.app` 같은 주소가 나옵니다. 이 앱은 정적 웹앱이라
Vercel은 그냥 호스팅 용도입니다(서버 API는 이제 없습니다 — Supabase가 DB를 직접
맡습니다).

**확인:** 그 주소를 브라우저로 열어서 앱이 뜨고, 조종 탭 LCD 카드가 활성화돼 있으면 성공.

---

## 7단계 — 동작 확인 (웹 → DB)

웹앱을 잠시 켜두고(홈 화면이든 아무 탭이든 열려 있기만 하면 `cloudSync`가 돕니다),
Supabase 대시보드 **Table Editor**에서:

- `sensor_readings` — 5초에 한 줄씩 쌓이는지
- `robot_logs` — 로봇이 행동을 바꿀 때마다(예: "물 받는 중" 등) 줄이 추가되는지
- `robot_state` — 행 하나(`id=1`)의 `updated_at`이 계속 갱신되는지

**확인:** 셋 다 값이 들어오고 있으면 성공. 여기까지는 ESP32 없이도 전부 확인됩니다.

---

## 8단계 — 아두이노 IDE 준비

1. [아두이노 IDE](https://www.arduino.cc/en/software) 설치 (이미 있으면 생략)
2. **파일 → 환경설정** → "추가 보드 관리자 URL"에 붙여넣기:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. **툴 → 보드 → 보드 매니저** → `esp32` 검색 → **espressif** 설치
4. **툴 → 보드** → `ESP32 Dev Module` 선택
5. ESP32를 USB로 연결 → **툴 → 포트**에서 COM 포트 선택
   (안 보이면 CP2102/CH340 USB 드라이버를 검색해 설치)

**라이브러리 설치** — **스케치 → 라이브러리 포함하기 → 라이브러리 관리**에서 검색 후 설치:

| 이름 | 만든 사람 | 용도 |
|---|---|---|
| `ArduinoJson` | Benoit Blanchon | JSON 파싱 (v7 선택) |
| `LiquidCrystal I2C` | Frank de Brabander | I2C 1602 LCD 제어 |

(`WiFi.h`, `HTTPClient.h`, `WiFiClientSecure.h`, `Wire.h`는 ESP32 보드 패키지에
이미 들어있어서 따로 설치할 필요 없습니다.)

---

## 9단계 — LCD 배선 + 코드에 값 채우기

**배선** (I2C 1602 LCD, 뒷면에 파란 기판 백팩이 붙은 것 기준):

```
LCD 백팩   →  ESP32
VCC        →  5V (또는 3.3V — 백팩에 적힌 대로)
GND        →  GND
SDA        →  GPIO 21
SCL        →  GPIO 22
```

I2C 주소를 모르면 **파일 → 예제 → Wire → i2c_scanner**를 먼저 돌려서 확인하세요.
보통 `0x27` 아니면 `0x3F`입니다.

**코드** — `firmware/lcd_wifi/lcd_wifi.ino`를 아두이노 IDE에서 열고, 위쪽 네 줄을
본인 값으로 바꿉니다:

```cpp
const char* WIFI_SSID = "your-wifi-name";        // 집/현장 와이파이 이름 (2.4GHz만 됨)
const char* WIFI_PASS = "your-wifi-password";
const char* SUPABASE_URL      = "https://xxxxxxxx.supabase.co";  // 3단계 Project URL
const char* SUPABASE_ANON_KEY = "eyJ...";                        // 3단계 anon public 키
```

LCD 주소가 `0x27`이 아니라면:

```cpp
LiquidCrystal_I2C lcd(0x27, 16, 2);   // 0x27을 실제 주소로
```

**업로드** 버튼(→) 클릭. 업로드 끝나면 **툴 → 시리얼 모니터**(보드레이트 115200)를 열어서
`와이파이 연결 중....` → `연결됨. IP: ...` 이 뜨는지 확인합니다.

---

## 10단계 — 전체 확인

1. LCD에 처음엔 `Ready`가 뜹니다
2. 배포한 웹앱(또는 `npm run dev`) 조종 탭에서 LCD 문구칸에 `HELLO SAESSAK` 입력 → 전송
3. **최대 3초 안에** LCD 화면이 바뀝니다 (ESP32가 3초마다 Supabase에 확인하러 가기 때문)

여기까지 되면 셋 다 끝난 겁니다.

---

## 순서 요약

```
1. Supabase 프로젝트 생성 (Seoul 리전)
2. SQL Editor에서 supabase/schema.sql 실행 → 테이블 4개 생성
3. Project URL / anon key 확인·기록
4. vercel login / link
5. .env.local + vercel env add 로 Supabase 키 등록
6. vercel --prod (배포)
7. Table Editor에서 sensor_readings·robot_logs·robot_state 쌓이는지 확인
8. 아두이노 IDE에 ESP32 보드 + 라이브러리 2개
9. LCD 배선 + lcd_wifi.ino 에 와이파이·Supabase 값 채우고 업로드
10. 웹에서 보내고 LCD에서 확인
```

## 막히면

- `vercel` 명령이 안 먹으면: 새 터미널을 열어보세요 (PATH 갱신).
- 조종 탭 LCD 카드가 계속 "연결되지 않았습니다"면: `.env.local` 오타 확인,
  `npm run dev`를 **다시 시작**했는지 확인 (env 파일은 재시작해야 반영됩니다).
- Table Editor에 값이 안 쌓이면: SQL Editor에서 3단계 정책(`anon full access`)이
  제대로 실행됐는지, `schema.sql`을 끝까지 다 붙여넣었는지 확인하세요.
- ESP32가 와이파이에 안 붙으면: SSID/비밀번호 오타, 또는 **5GHz 와이파이는 ESP32가
  못 잡습니다** — 2.4GHz망인지 확인하세요.
- ESP32 시리얼 모니터에 `Supabase 호출 실패, HTTP 401`이 뜨면: anon key를 잘못 붙여넣은
  경우입니다. 앞뒤 공백 없이 다시 확인하세요.
- LCD에 이상한 글자만 뜨면: I2C 주소가 틀렸을 확률이 높습니다 (9단계 스캐너로 재확인).

## 다음에 할 수 있는 것 (지금은 안 만듦)

DB에 쌓이는 건 지금 확인했지만, 그걸 **다시 화면에 그래프·목록으로 보여주는 화면**은
아직 없습니다. "센서 이력 그래프 화면 만들어줘" 하시면 그건 별도로 붙일 수 있습니다.
