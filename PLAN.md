# 진행 계획 — 살아있는 스마트팜 웹 데모

요구사항 원본: `C:\Users\wlsgk\Downloads\SPEC.md`
이 파일은 그 스펙을 12단계 실행 순서로 쪼갠 것. 단계 끝날 때마다 체크한다.

| 단계 | 내용 | 화면에 보임 | 상태 |
|---|---|---|---|
| 0 | 사전 결정 (위치 / Tailwind 3 / 라우터 없음) | — | ✅ |
| 1 | 스캐폴딩 + `@/*` alias + `host:true` | — | ✅ |
| 2 | shadcn init + 기본 컴포넌트 9종 | △ | ✅ |
| 3 | cult-ui Dynamic Island 하나만 설치·검증 | ⭕ | ✅ |
| 4 | cult-ui 나머지 12개 일괄 설치 | ❌ 파일만 | ✅ |
| 5 | 디자인 토큰(딥그린 다크) + Pretendard | △ 색만 | ✅ |
| 6 | 데이터 레이어 — floorplan / store / status | ❌ 콘솔 | ✅ |
| 7 | 시뮬레이션 엔진 — mockEngine (**최난이도**) | ❌ 콘솔 | ✅ |
| 8 | 셸 — 아일랜드 + 헤더 + 탭바 | ⭕ **앱 모양 시작** | ✅ |
| 9 | 자체 컴포넌트 3종 — GaugeCard / LogList / FloorPlanSVG | ⭕ | ✅ |
| 10 | 화면 4개 — 홈 / 맵 / 조종 / 기록 | ⭕ | ✅ |
| 11 | WebSocket 레이어 (ESP32 연동) | ⭕ | ✅ |
| 12 | SPEC §14 체크리스트 + 발표 대비 | — | 🔶 대부분 |

## 단계별 상세

**4단계** — lightboard / color-picker / dock / floating-panel / expandable / texture-button /
neumorph-button / bg-animate-button / popover-form / distorted-glass / gradient-heading / shift-card.
검증: 파일 12개 생성 + TS 에러 0 + 빌드 통과.

**5단계** — `src/index.css` `:root` 딥그린 다크 HSL, `tailwind.config.js`에 sun/water/nutri/temp/glow +
Pretendard + `borderRadius.card/btn`, `<html lang="ko" class="dark">`, Pretendard CDN.
검증: 아일랜드가 초록 다크 톤으로 바뀜.

**6단계** — `src/data/floorplan.ts` (ROOMS/WINDOWS/STATION/ENTRY/WAYPOINTS + BFS),
`src/store/robotStore.ts` (SPEC §6 타입 전체 + setMode/pushLog/applySensor/manualInput),
`src/lib/status.ts` (§6-1 상태 라벨 + §7-1 판단 근거 문자열).
검증: `bfs('station','bed3')` 경로가 복도를 거쳐 나옴.

**7단계** — `src/sim/mockEngine.ts` — 200ms 틱, 센서 드리프트, 위치 기반 lux 가우시안(§8-2),
이동/heading 보간, §7 우선순위 상태머신(급수 중 greet 보류 규칙 포함), `DEMO_SPEED`.
검증: 콘솔 로그만으로 90초 안에 patrol → seek_light → go_water → docking → watering → returning 완주.

**8단계** — `App.tsx`: 아일랜드 상단 고정 + 인사말 헤더(🔔 / 👤 탭 = 주인 감지 트리거) + Dock 4탭 + 빈 화면 4개.

**9단계** — GaugeCard(300ms 보간, tabular-nums, 구간별 색) / LogList(kind별 좌측 보더, `19:26:09`) /
FloorPlanSVG(1000×760, 방+가구 실루엣, radialGradient 히트맵 screen 블렌드, 경로선, heading 회전 로봇).

**10단계** — 홈 / 맵 / 조종 / 기록. 검증: 아무 버튼 난타해도 안 깨지고 10초 후 자율 복귀.

**11단계** — `src/net/ws.ts` — `ws://192.168.4.1/ws` 기본, 3초 자동 재시도, 실패해도 목업 유지, `pos`는 항상 시뮬 값.

**12단계** — 인터넷 차단 테스트, 폰트 `public/fonts/` 로컬 전환, 폰 접속(`--host`), reduced-motion, 동시 접속.

## 진행 중 내린 판단 (스펙과 다른 부분)

1. **shadcn CLI 2.10.0 고정** — `@latest`는 Tailwind 4 세대라 SPEC §2-1 경고에 걸림. style은 `new-york`.
2. **cult-ui 레지스트리 우회** — `cult-ui.com/r/*.json`이 429. GitHub raw로 JSON 받아 로컬 설치:
   `curl -o _registry/X.json https://raw.githubusercontent.com/nolly-studio/cult-ui/main/apps/www/public/r/X.json`
   → `npx shadcn@2.10.0 add -y -o ./_registry/X.json` (**상대경로 필수**)
3. **이름 다른 컴포넌트 2개** — `bg-animated-button` → `bg-animate-button`, `glass-effect` → `distorted-glass`.
4. **`verbatimModuleSyntax: false`** — cult-ui 소스가 `import { ReactNode }` 형태.
5. **cult-ui `setSize()` 버그** — `previousSize === newSize`면 무시해서 두 상태 왕복 토글이 씹힘. `dispatch` 직접 호출로 우회.
6. **4단계 추가 설치** — color-picker가 shadcn `input`/`label`/`popover`를, expandable이 `react-use-measure`를 요구.
7. **Next 전용 문법 제거** — `distorted-glass`의 `<style jsx>` → 일반 `<style>`. (`next/image`·`next/link`는 없었음)
8. **테마** — 인포그래픽(크림색 하드웨어)과 딥그린 다크가 안 맞지만, 토큰만 바꾸면 되는 일이라 스펙대로 다크로 두고 나중에 판단.
9. **스토어는 zustand vanilla** — `createStore` + `useStore` 래퍼. 엔진이 React 밖에서 돌아야
   `npx tsx scripts/sim-check.ts`로 화면 없이 시나리오를 검증할 수 있다.
10. **엔진은 틱 카운터 기반** — `setInterval` 없이 `tick()`을 직접 몰아 호출할 수 있게 했다.
   90초 시나리오를 실시간으로 기다리지 않고 즉시 검증한다.
11. **수분 드리프트 0.06 → 0.075** — SPEC §8-1의 0.06이면 한 사이클이 100초를 넘는다.
   §8-5가 요구한 "약 90초"에 맞춘 값. 검증 결과 82.8초에 복귀 단계 진입.
12. **`ownerNearUntil` 필드 추가** — SPEC §6 타입에는 없지만, §8-4의 "3초 유지"를
   `setTimeout` 없이 처리하려면 만료 시각이 필요하다. `manualHoldUntil`과 같은 패턴.

13. **cult-ui Dock을 탭바에 안 썼다** — SPEC §3-3은 Dock → 하단 탭바로 배정했지만, 그 컴포넌트는
   마우스 호버 확대가 핵심인 macOS 독이다. 아이콘이 `<img src>` 필수, 선택 상태 개념 없음,
   `absolute bottom-4 left-3/4` 고정 배치. 심사위원이 폰으로 만질 화면에는 호버가 없어서
   [TabBar.tsx](src/components/shell/TabBar.tsx)로 직접 만들었다.
14. **DynamicTitle이 안 보이는 함정** — cult-ui는 `size === previousSize`면 제목/설명을
   `opacity: 0`으로 렌더한다. 렌더 도중 `dispatch`하면 StrictMode 이중 렌더가 같은 전환을
   두 번 보내 정확히 그 상태가 된다. `useEffect` + ref로 한 번만 보내도록 고쳤다.
   → [IslandBar.tsx](src/components/shell/IslandBar.tsx)

## 레퍼런스 디자인 적용 (10단계)

사용자가 준 IoT 스마트홈 앱 레퍼런스의 **레이아웃 언어**를 따랐다:
히어로 카드(날씨 카드 자리 → 식물 상태) → 세그먼트 토글(자율/수동) → 이미지 카드 2×2 그리드
(방 카드) → 리스트(최근 알림), 하단 탭바는 활성 탭만 알약으로 채움.
톤은 SPEC §4-1의 딥그린 다크를 유지했다(히트맵이 어두운 바탕에서만 살아나므로).

**방 카드 썸네일은 사진이 아니라 그 방의 도면 조각 + 히트맵이다.** 이유:
(1) §14가 인터넷 차단 상태 동작을 요구한다 — 원격 이미지는 그때 전부 깨진다,
(2) 저작권 없는 방 사진 9장을 구할 방법이 없다, (3) 사진보다 제품을 잘 설명한다.
실제 사진이 생기면 [RoomCard.tsx](src/components/RoomCard.tsx)의 `<RoomThumb/>`만 `<img/>`로 바꾸면 된다.

## cult-ui에서 쓰지 못한 컴포넌트 4개

전부 **데스크톱 마케팅 페이지용**이라 폰 화면에서 제 역할을 못 한다. 억지로 쓰면 데모가 깨진다.

| 컴포넌트 | 원래 배정(§3-3) | 못 쓴 이유 | 대신 |
|---|---|---|---|
| Dock | 하단 탭바 | 마우스 호버 확대가 핵심. 아이콘 `<img src>` 필수, 선택 상태 개념 없음 | [TabBar.tsx](src/components/shell/TabBar.tsx) |
| Light Board | 표정 | 폰트 테이블이 **A–Z뿐**(숫자·기호·한글 없음). 정지 표정을 못 그리는 스크롤 마퀴 | [FaceDots.tsx](src/components/FaceDots.tsx) |
| Glass Effect (distorted-glass) | 맵 오버레이 토글 | 폭 고정 + `hidden xl:block` — 폰에서 아예 렌더 안 됨 | backdrop-blur 칩 |
| Shift Card | 기록 통계 | 확장이 hover 전용. 터치는 onClick이 열고 onTap이 즉시 닫음. 폭 280px 고정 | 항상 펼친 통계 카드 |

Gradient Heading도 상태별 색을 못 낸다(중립 회색 그라디언트가 내부 span에 하드코딩). 직접 칠했다.
Popover Form은 데모용 `min-h-[300px] w-full` 센터링이 박혀 있어 벤더 소스를 고쳐 썼다.

## 12단계 진행 상황

- [x] Dynamic Island 먼저 설치·확인
- [x] **인터넷 없이 동작** — 외부 요청 0개 확인(폰트를 `public/fonts`로 내려 로컬 `@font-face` 전환)
- [x] 90초 자동 시나리오 완주 — `npm run sim`
- [x] WebSocket 주소 틀리게 입력 → 앱 안 멈추고 목업 유지(조도 갱신 계속, 페이지 에러 0)
- [x] 게이지 tabular-nums, 로그 종류별 색 구분
- [x] `prefers-reduced-motion` — [index.css](src/index.css)에서 전역 처리
- [ ] **실제 폰 접속 확인** (노트북 IP:5173) — 사람이 직접 해야 함
- [ ] **노트북 + 폰 동시 접속**
- [ ] 연결 중 ESP32 전원 차단 → 자동 재연결 (실기기 필요)

## 검증 방법

```bash
npm run sim     # 6단계 BFS·조도 + 7단계 90초 시나리오 + 급수/인사 충돌 규칙
npm run shot    # dev 서버가 떠 있을 때, 탭 4개 스크린샷 + 가로 넘침·콘솔 에러 점검
npx tsc -b && npx vite build
```

8·9단계 확인 결과: 폰 폭 390px에서 가로 넘침 0, 콘솔 에러 0.
급수 씬에서 아일랜드가 large로 확장되며 "물 받는 중 · 수분 26% → 92%까지 보충" 표시,
수분 게이지 빨강 전환, 로그 좌측 보더 색 구분 모두 육안 확인.

---

# v3 개정 (SPEC v3 적용)

요구사항 원본이 v3로 교체됐다 → `C:\Users\wlsgk\Downloads\SPEC (1).md`
**위쪽 문서의 다크 테마·네온 그린(#3DDC97) 관련 내용은 전부 폐기된 기록이다.**
§0-1대로 §6~§9(상태·엔진·통신)와 §12(도면 데이터)는 건드리지 않았다.

## 한 일

- **§3** cult-ui 재설치. 신규 4개(family-drawer / family-button / morph-surface / timer) 설치,
  `gradient-heading` 제거(§3-2 미설치 목록). `use-toast`는 cult-ui 레지스트리에 없어(404)
  shadcn `toast`로 대체. cult-ui.com은 여전히 429라 GitHub raw 우회 유지.
- **§3-4** 전 컴포넌트를 pristine으로 재설치한 뒤 `dark:` 클래스 117개 제거
  (Dynamic Island는 §3-4 예외라 검정 유지). 남은 `bg-black`·`text-white`·네온 하드코딩을 토큰으로 치환.
- **§4** index.css / tailwind.config.js 토큰 전면 교체. `<html class="dark">` 제거.
  ok/warn/alert/track, shadow-card/float, radius 20/14/12px, 굵기 700 제거.
- **§10-1** 막대 GaugeCard 삭제 → `RingGauge` 신규. 색 기준은 `src/lib/gauge.ts`(§4-3).
- **§10-2** 히트맵 `screen` → `multiply`, 흰 도면·회색 벽·primary 로봇으로 전환.
- **§10-3** LogList 라이트 색(좌측 보더 3px).
- **§11-1** 홈 재구성 — 표정 카드 최상단, 상태 라벨 검정 26px(색 없음), 링 게이지 가로 4개,
  방 카드는 회색 플레이스홀더 + primary 보더(글로우 없음).
- LED 기본색 #3DDC97 → #2F6BEA (§14 "형광 초록 없음"에 걸려서).

## 맵 화면 재구성 (사용자 피드백)

- **컨트롤러를 팝오버 → 붙박이로.** Floating Panel은 열리는 순간 도면을 가리고 배경을
  흐리게 만들어서, 정작 로봇이 어디로 가는지 못 보면서 조종하게 된다. 아래가 잘리기도 했다.
  도면 바로 아래에 컨트롤러 카드를 고정으로 놓고, 도면은 `sticky`로 스크롤해도 계속 보이게 했다.
- **도면을 실제 평면도처럼.** 두꺼운 벽(10px 다크 슬레이트) + 문 개구부 11곳 +
  가구 실루엣(침대 베개 / 소파 등받이 / 식탁 의자 / 욕조 내곽).
  문 위치는 보여주기용 값이라 §12를 건드리지 않고 `FloorPlanSVG.tsx`에 뒀다.
- **바닥은 우드톤으로 안 갔다.** 레퍼런스는 따뜻한 원목 바닥이지만, 그렇게 깔면
  주황(#FFB020) 햇빛 히트맵이 바닥색에 묻혀 이 앱의 핵심이 안 보인다. §10-2의 밝은 중성색 유지.

## 시연 공간에 맞춘 호흡 조정 (사용자 피드백)

**실제 시연 공간이 길어야 1m다.** 화면에서 90초짜리 여정을 보여주면 실물과 호흡이 어긋난다.

- **한 사이클 90초 → 28초.** 수분 드리프트 0.075 → 0.35, 급수 1.2 → 2.5/틱,
  도킹 2초 → 1초, 인사 5초 → 4초, 이동 속도 45 → 75px/s.
- **순찰을 옆방까지만.** 웨이포인트 인접 노드 중에서만 고른다. 먼 방까지 가면
  호흡이 늘어지고 급수 타이밍도 놓쳐서, 90초 안에 사이클을 못 끝내는 경우가 20% 있었다.
- **복귀 목표를 "가장 밝은 곳" → "충분히 밝으면서 가장 가까운 곳"으로.**
  절대 최대 지점으로 가면 스테이션에서 다이닝까지 가로지르느라 복귀에만 10초가 걸렸다.
- 검증 기준도 90초 → 40초로 바꿨다. **6회 연속 완주 확인.**

측정된 흐름: `광원 탐색 0s → 자리 유지 3s → 짧은 순찰 11s → 급수 출발 12s →
도킹 19s → 급수 20s → 복귀 26s → 자리 유지 28s`

## 탭 역할 정리

- **맵 = 주행.** 도면 + D-패드 + 속도 + 인사/물. 도면은 `sticky`라 스크롤해도 보인다.
- **조종 = 표정 / LED / 동작.** 주행을 빼고 "주행은 맵에서" 안내 버튼을 뒀다.
  같은 기능이 두 곳에 있으면 심사위원이 어느 쪽을 잡아도 헷갈린다.

## ESP32 펌웨어 (신규)

`firmware/smartfarm_esp32/smartfarm_esp32.ino` + `firmware/README.md`.
SPEC §9-2/§9-3 프로토콜 그대로. **슬라이더 값이 중간 변환 없이 모터 PWM이 된다.**

```
슬라이더(60~255) → sendMove(dir, spd) → {"cmd":"MOVE","dir":"F","spd":180}
                 → applyMove() → drive() → ledcWrite(핀, toDuty(180))
```

로컬 WebSocket 서버를 ESP32 대신 세워 **실제 프레임을 검증**했다:
`{"cmd":"MOVE","dir":"F","spd":180}` 반복 → 떼면 `{"dir":"STOP","spd":0}`.
반대로 서버가 §9-3 sensor 프레임을 보내면 배지가 "실데이터"로 전환되는 것까지 확인.

펌웨어 쪽 주의 두 가지:
- **`MIN_DUTY`(기본 70)** — 작은 DC모터는 듀티가 낮으면 정지 마찰을 못 이기고 소리만 난다.
  모터를 바꾸면 다시 잡아야 한다.
- **명령 타임아웃 400ms + 연결 끊김 시 즉시 정지** — 폰이 꺼져도 로봇이 계속 달리면 안 된다.

## 클라우드 연동 — Supabase (신규, LCD에서 확장)

처음엔 Upstash Redis + Vercel API 라우트로 LCD 문구만 저장했으나, 사용자가 센서 이력·
로봇 로그·로봇 상태까지 실제로 DB에 쌓고 싶다고 해서 **Supabase로 교체**했다.
`api/lcd.ts`와 `@upstash/redis`는 제거. Vercel은 이제 정적 호스팅 용도로만 쓴다.

**설계 원칙 — 브라우저만 Supabase에 쓴다.** 목업이든 실제 ESP32(WebSocket) 데이터든
결국 `robotStore`를 거치므로, store 하나만 구독하면 출처를 안 가리고 클라우드로
흘려보낼 수 있다. ESP32는 `lcd_state` 테이블 하나만 읽는다 — 쓰기 권한을 ESP32에
줄 필요가 없어서 firmware 쪽 인증이 훨씬 단순해진다.

```
robotStore 변화 → src/net/cloudSync.ts (구독 + 스로틀) → Supabase 4개 테이블
                                                              ↓
                                          lcd_state만 ESP32가 3초마다 GET
```

- **`supabase/schema.sql`** — 테이블 4개(`robot_state`/`sensor_readings`/`robot_logs`/`lcd_state`)
  + RLS 정책(해커톤 범위라 anon 키에 전체 허용) + 초기 행. SQL Editor에 붙여넣고 실행.
- **`src/lib/supabaseClient.ts`** — env 없으면 `supabase`가 `null`. 호출부가 전부 스킵해서
  SPEC §0-3(인터넷 없이 100% 동작)을 안 깬다. 실제로 env 없이 페이지 에러 0 확인.
- **`src/net/cloudSync.ts`** — `robotStore.subscribe()` 하나로 3종류를 스로틀링해서 보낸다:
  센서 5초/회, 로봇 상태(단일 행 upsert) 2초/회, 로그는 새로 생긴 것만 즉시.
  200ms 틱마다 그대로 썼으면 무료 티어를 금방 태웠을 것.
- **`src/components/LcdSender.tsx`** — `fetch('/api/lcd')` → `supabase.from('lcd_state')`
  직접 호출로 교체. 1602 LCD가 한글을 못 찍어 영문·숫자만 필터링(`sanitize()`)은 유지.
- **`firmware/lcd_wifi/lcd_wifi.ino`** — Vercel API 대신 Supabase REST(`/rest/v1/lcd_state`)를
  `apikey`/`Authorization` 헤더로 직접 호출. HTTPS라 `WiFiClientSecure` 필요 —
  루트 인증서 대신 `setInsecure()`로 검증 생략(해커톤 타협, 코드 주석에 이유 명시).
- **`firmware/SETUP_GUIDE.md`** — Supabase 프로젝트 생성부터 10단계로 재작성.
  "다음에 할 수 있는 것" 절에 이력을 다시 화면으로 보여주는 건 아직 안 만들었다고 명시.

**주의**: 이 기능에서 ESP32는 SoftAP가 아니라 **일반 와이파이(공유기)에 접속**해야
인터넷에 닿는다. 로봇 조종용 SoftAP+WebSocket 구조와는 별개로 공존한다.

## v3에서도 쓰지 못한 cult-ui

- **Light Board**(표정) — 폰트 테이블이 A–Z뿐이라 정지 표정을 못 그린다. `FaceDots` 유지
- **Morph Surface**(자율/수동) — 피드백 폼 위젯. renderTrigger를 줘도 자체 dock UI
  ("Morph Surface" 라벨)가 함께 렌더돼 폰에서 가로로 넘친다. `ModeSwitch` 토글로 대체
- **Dock**(탭바) / **Shift Card**(통계) / **Glass Effect** — 호버 전용·고정폭 문제로 v2와 동일하게 제외
