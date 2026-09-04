/*
 * 살아있는 스마트팜 — ESP32 통합 펌웨어
 *
 * 스케치 3개를 하나로 합친 것이다.
 *   smartfarm_esp32.ino  →  모터·센서·WebSocket 프로토콜 (SPEC §9-2 / §9-3)
 *   lcd_wifi.ino         →  와이파이·Supabase 폴링·1602 LCD  (동작 검증 완료)
 *   face_tft.ino         →  2.8" TFT 얼굴 애니메이션        (face_anim.h로 분리)
 *
 * ── 두 코어를 나눠 쓴다 ────────────────────────────────────────
 *   Core 1 (loop)      얼굴 애니메이션. delay()로 10초를 붙잡아도 상관없다.
 *   Core 0 (netTask)   와이파이·Supabase·WebSocket·센서·모터 안전정지.
 *
 *   둘은 전역변수 몇 개로만 대화한다(gFaceReq 등). 그래서 팀원이 만든 얼굴 코드를
 *   한 줄도 안 고치고 그대로 쓸 수 있다.
 *
 *   버스도 안 겹친다 — TFT(SPI)는 Core 1만, 1602(I2C)는 Core 0만 만진다.
 *
 * ── 필요한 라이브러리 ─────────────────────────────────────────
 *   Adafruit GFX Library      (Adafruit)
 *   Adafruit ST7789  또는  Adafruit ILI9341   ← 아래 USE_ILI9341 참고
 *   LiquidCrystal I2C         (Frank de Brabander)
 *   BH1750                    (Christopher Laws)
 *   ArduinoJson v7            (Benoit Blanchon)
 *   ESPAsyncWebServer + AsyncTCP  (me-no-dev, ESP32용)
 *
 * ── 처음 올리기 전에 ──────────────────────────────────────────
 *   1. lcd_wifi 폴더의 secrets.h를 이 폴더로 복사한다 (와이파이·Supabase 값)
 *   2. 보드: ESP32 Dev Module / Arduino-ESP32 코어 3.x
 *   3. ✓(검증) 말고 →(업로드)를 눌러야 실제로 올라간다
 */

// ---------------- 얼굴(TFT) ----------------
#include <Adafruit_GFX.h>
#include <SPI.h>
#include <math.h>

// ---------------- 네트워크 + 1602 LCD ----------------
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <BH1750.h>
#include <ArduinoJson.h>

// ---------------- WebSocket (로컬 조종) ----------------
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

#include "secrets.h"

// ============================================================
// 0. 핀 배치 — 여기만 보면 전체 배선을 알 수 있다
// ============================================================
/*
 *  겹치는 핀이 하나도 없는지 확인한 배치다. 배선을 바꾸면 여기 숫자만 고친다.
 *
 *   TFT (SPI)     CS 5 · DC 2 · RST 4 · SCK 18 · MOSI 23     VCC는 반드시 3.3V
 *   I2C 3대       SDA 21 · SCL 22    ← 1602 + BH1750 왼쪽 + BH1750 오른쪽
 *   모터          26/27/14 (왼쪽) · 32/33/25 (오른쪽) · STBY는 3.3V 직결
 *   토양습도      34   (아날로그)
 *   초음파        TRIG 16 · ECHO 19  ← ECHO는 분압 필요
 *   IR            35
 *   펌프          17   ← 4에서 옮김
 *   (미사용)      워터 39 · 홀 13    ← 아직 안 꽂음. 아래 HAS_* 참고
 *
 *  ── I2C는 선 2개에 3개를 전부 나란히 물린다 ──
 *    1602      0x27 (또는 0x3F)   VCC 5V
 *    BH1750 L  0x23   ADDR핀 → GND
 *    BH1750 R  0x5C   ADDR핀 → 3.3V
 *    SDA끼리 전부 21번에, SCL끼리 전부 22번에 함께 묶는다. 주소가 달라서 안 싸운다.
 *
 *  ⚠ GPIO 4를 TFT RESET과 수중펌프가 같이 쓰기로 돼 있었다. 그대로 두면 화면이
 *    리셋될 때마다 펌프가 튄다. 화면은 이미 4번으로 배선해서 잘 나오고 있고
 *    펌프는 아직 안 꽂았으므로, **펌프 쪽을 17번으로** 옮겼다.
 *    → TFT 배선은 손대지 않는다. 펌프 릴레이 신호선만 GPIO 17에 꽂는다.
 *
 *    17번을 고른 이유: 스트래핑 핀이 아니고, ADC2(와이파이 켜면 못 씀)도 아니다.
 *    단, WROVER 계열 보드는 16/17을 PSRAM이 쓴다. 그런 보드면 19번으로 옮긴다
 *    (19는 SPI MISO지만 TFT의 SDO를 안 꽂았으므로 비어 있다).
 */

// ---------------- TFT ----------------
#define TFT_CS    5
#define TFT_DC    2
#define TFT_RST   4     // 지금 배선 그대로. 대신 펌프를 17로 옮겼다.
#define TFT_SCLK  18
#define TFT_MOSI  23

/*
 * 드라이버 칩 전환 스위치.
 *
 * 실물 보드(빨간 기판 + 터치칩 + SD슬롯 + 2.8")는 ILI9341일 가능성이 높다.
 * 지금 화면 색이 전부 반대로 나와서 PANEL_COLOR_COMPLEMENT로 소프트웨어 보정을
 * 하고 있는데, 이게 바로 "ST7789 초기화를 ILI9341 패널에 쓸 때" 나오는 증상이다.
 *
 * 확인하는 법: 아래 0을 1로 바꾸고 올려본다.
 *   색이 정상으로 나오면 → ILI9341 확정. 그대로 두면 되고 소프트웨어 보정도 꺼진다.
 *   색이 이상해지면    → 다시 0으로. 지금 상태가 맞는 것이다.
 */
#define USE_ILI9341 0

#if USE_ILI9341
  #include <Adafruit_ILI9341.h>
  Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);
  // ILI9341로 제대로 잡히면 색 반전 보정이 필요 없어진다.
  constexpr bool PANEL_COLOR_COMPLEMENT = false;
#else
  #include <Adafruit_ST7789.h>
  Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_RST);
  constexpr bool PANEL_COLOR_COMPLEMENT = true;
#endif

/** 드라이버마다 초기화 함수 이름이 다르다. 이 한 곳에서 흡수한다. */
void tftBegin() {
#if USE_ILI9341
  tft.begin();
#else
  tft.init(240, 320);
#endif
  tft.setRotation(1);
}

// 팀원이 만든 얼굴 애니메이션 전부. 위의 tft/핀/보정값을 쓰므로 반드시 이 아래에서 include.
#include "face_anim.h"

// ---------------- 1602 LCD (I2C) ----------------
constexpr int PIN_SDA = 21;
constexpr int PIN_SCL = 22;

// ---------------- 모터 (TB6612FNG / L298N) ----------------
constexpr int L_IN1 = 26;
constexpr int L_IN2 = 27;
constexpr int L_PWM = 14;
constexpr int R_IN1 = 32;
constexpr int R_IN2 = 33;
constexpr int R_PWM = 25;
/*
 * TB6612의 STBY는 GPIO를 안 쓰고 **3.3V에 직결**한다. 그래서 -1이다.
 *
 * 원래 12번에 물리려 했는데, 12번은 부팅할 때 상태를 읽는 핀이라 여기에 뭔가
 * 물려 있으면 보드가 아예 안 켜질 수 있다. STBY는 켜고 끌 일이 없으니
 * 그냥 3.3V에 붙여서 항상 켜두는 게 낫다.
 *
 * 굳이 코드로 껐다 켜고 싶으면 15번을 주고 아래를 15로 바꾼다.
 * L298N을 쓴다면 STBY 자체가 없으므로 -1 그대로 두면 된다.
 */
constexpr int STBY  = -1;

// ---------------- 센서 · 펌프 ----------------
/*
 * 조도는 아날로그 CDS를 걷어내고 BH1750(I2C) 2개로 갔다. 그래서 34번이 비었고
 * 거기에 IR을 넣었다. 34/35/36/39는 입력 전용 핀이라 센서에만 쓸 수 있다
 * (출력·내부풀업 불가). IR 모듈과 토양센서는 스스로 신호를 밀어주므로 문제없다.
 */
constexpr int PIN_SOIL  = 34;   // 토양 수분 (ADC1) — 팀원이 이미 34에 꽂고 기준값까지 잡았다
constexpr int PIN_IR    = 35;   // IR 감지 (조도센서가 비운 자리)
constexpr int PIN_TRIG  = 16;   // 초음파 송신
constexpr int PIN_ECHO  = 19;   // 초음파 수신 ⚠ 5V로 나온다. 분압 저항 필수
constexpr int PIN_PUMP  = 17;   // 수중펌프 릴레이 (4번은 TFT RESET이 쓴다)
constexpr int PIN_WATER = 39;   // 스테이션 워터 센서 (아직 안 꽂음)
constexpr int PIN_HALL  = 13;   // 도킹 감지 홀센서 (아직 안 꽂음)

/*
 * ── 꽂은 것만 켠다 ──────────────────────────────────────────
 * 아직 안 꽂은 핀을 읽으면 값이 둥둥 떠서(플로팅) 웹에 헛것이 올라간다.
 * 특히 39번은 내부 풀업이 없어서 안 꽂으면 물탱크 수치가 80↔15로 계속 튄다.
 *
 * 센서를 하나씩 꽂아가며 확인할 때도 이걸로 끄고 켜면 원인 찾기가 쉽다.
 */
#define HAS_SOIL    1
#define HAS_BH1750  1
#define HAS_SONIC   1
#define HAS_IR      0   // 아직 안 꽂음 — 꽂으면 1로
#define HAS_WATER   0   // 스테이션 워터 센서 — 꽂으면 1로
#define HAS_HALL    0   // 도킹 홀센서 — 꽂으면 1로
#define HAS_MOTOR   1   // L298N 연결 완료

/*
 * 켜두면 2초마다 센서값을 시리얼에 한 줄로 찍는다.
 * 배선이 맞는지 눈으로 확인하는 용도다. 다 확인되면 0으로 꺼도 된다.
 */
#define SENSOR_DEBUG 1

/*
 * ── 모터 자가진단 ────────────────────────────────────────────────
 * 1로 두면 **부팅하자마자** 모터를 순서대로 돌려본다. 와이파이도 웹도 폰도
 * 필요 없다. 전원만 넣으면 8초 안에 결과가 나온다.
 *
 * "모터가 안 도는" 원인이 배선/전원/드라이버인지, 아니면 웹→명령 경로인지를
 * 가르는 용도다. 이게 돌면 하드웨어는 무죄고 웹 쪽만 보면 된다.
 *
 * ⚠ 바퀴를 띄워놓고(책 위 등) 테스트할 것. 바닥에 두면 로봇이 달려나간다.
 *
 * 지금은 배선이 잡혀서 꺼둔다. 나중에 모터가 또 말을 안 들으면 1로 켜서
 * "배선 문제냐 명령 경로 문제냐"부터 가르면 된다 — 그거 가리는 데 한참 걸렸다.
 */
#define MOTOR_SELFTEST 0

/*
 * ── 표정 데모 ────────────────────────────────────────────────────
 * 1로 두면 **네트워크와 무관하게** 표정을 계속 랜덤으로 바꿔 재생한다.
 *
 * "표정이 안 바뀐다"의 원인이 TFT/애니메이션 쪽인지, 아니면 명령이 안 오는
 * 쪽인지를 가르는 용도다. 이걸 켰는데도 얼굴이 그대로면 TFT 문제고,
 * 잘 바뀌면 화면은 멀쩡하고 Supabase에서 표정이 안 오는 것이다.
 *
 * 웹에서 온 표정 요청은 여전히 우선한다 — 눌러본 게 반영되는지도 같이 보인다.
 * 확인이 끝나면 0으로 꺼라. 안 끄면 표정이 계속 제멋대로 바뀐다.
 */
#define FACE_DEMO 0

/*
 * 0보다 크면 이 간격(ms)마다 자가진단을 **계속 반복**한다.
 *
 * 부팅 때 한 번만 돌면, 배선을 고칠 때마다 재부팅해야 해서 확인이 느리다.
 * 게다가 "부팅 직후라서 안 되는 것 아니냐"는 의심을 못 걷어낸다. 반복해서
 * 돌려보면 그 가설이 바로 정리된다 — 선을 만지는 즉시 결과가 보인다.
 *
 * 배선이 잡히면 0으로 꺼라. 안 끄면 8초마다 로봇이 혼자 움직인다.
 */
#define MOTOR_SELFTEST_REPEAT_MS 15000

// ============================================================
// 1. 두 코어가 주고받는 값 — 이게 전부다
// ============================================================
/*
 * Core 0(네트워크)이 쓰고, Core 1(얼굴)이 읽는다. int 하나라서 원자적으로
 * 읽고 쓰이므로 뮤텍스가 필요 없다.
 *
 * gFaceReq에 값이 들어오면 얼굴 쪽이 그걸 한 번 재생하고 다시 FACE_NONE으로
 * 되돌린다. "요청함 → 처리함"을 이 한 변수로 표현한다.
 */
enum FaceId : int {
  FACE_NONE = -1,   // 요청 없음 (평소 상태)
  FACE_NEUTRAL,
  FACE_HAPPY,
  FACE_THIRSTY,
  FACE_SLEEPY,
  FACE_LOVE,
  FACE_EXCITED,
  FACE_DRINKING,    // 웹에는 없는 표정. ACT drink일 때 로봇이 스스로 짓는다.
  FACE_DIZZY
};

volatile int gFaceReq = FACE_NONE;

/** 시리얼 로그용 이름. 화면에 나온 얼굴과 로그를 대조할 수 있어야 디버깅이 된다. */
const char* faceName(int id) {
  switch (id) {
    case FACE_NEUTRAL:  return "neutral";
    case FACE_HAPPY:    return "happy";
    case FACE_THIRSTY:  return "thirsty";
    case FACE_SLEEPY:   return "sleepy";
    case FACE_LOVE:     return "love";
    case FACE_EXCITED:  return "excited";
    case FACE_DRINKING: return "drinking";
    case FACE_DIZZY:    return "dizzy";
    default:            return "none";
  }
}

/** SPEC §9-2의 face 문자열 → 얼굴 애니메이션 번호 */
int parseFace(const char* v) {
  if (!strcmp(v, "happy"))    return FACE_HAPPY;
  if (!strcmp(v, "thirsty"))  return FACE_THIRSTY;
  if (!strcmp(v, "sleepy"))   return FACE_SLEEPY;
  if (!strcmp(v, "love"))     return FACE_LOVE;
  if (!strcmp(v, "excited"))  return FACE_EXCITED;
  if (!strcmp(v, "neutral"))  return FACE_NEUTRAL;
  return FACE_NONE;   // 모르는 값이면 평소 표정을 안 건드린다
}

/** 네트워크 쪽 어디서든 이걸 부르면 얼굴이 바뀐다. 즉시 반환한다(안 기다린다). */
void requestFace(int id) {
  if (id != FACE_NONE) gFaceReq = id;
}

// ============================================================
// 2. 모터 (smartfarm_esp32.ino 그대로)
// ============================================================

constexpr int PWM_FREQ = 20000;  // 20kHz. 가청 대역이면 모터가 삑삑거린다.
constexpr int PWM_BITS = 8;      // 0-255 — 웹이 보내는 spd 범위와 그대로 맞춘다

/*
 * 작은 DC모터는 PWM이 낮으면 아예 안 돈다. 정지 마찰을 못 이기고 소리만 난다.
 * 그래서 웹의 0-255를 그대로 쓰지 않고 MIN_DUTY 위로 다시 매핑한다.
 * 모터를 바꾸면 이 값을 다시 잡아야 한다 — 천천히 올리며 도는 최소값 + 10 정도.
 */
constexpr int MIN_DUTY = 70;
constexpr int MAX_DUTY = 255;

/*
 * 안전장치. 웹은 버튼을 누르는 동안 150ms마다 MOVE를 보낸다.
 * 폰이 꺼지거나 와이파이가 끊기면 마지막 MOVE 상태로 로봇이 계속 달린다.
 * 이 시간 동안 새 명령이 없으면 무조건 멈춘다.
 */
constexpr unsigned long CMD_TIMEOUT_MS = 400;

unsigned long lastCmdAt = 0;
bool moving = false;

void setupPwm() {
  // Arduino-ESP32 코어 3.x
  ledcAttach(L_PWM, PWM_FREQ, PWM_BITS);
  ledcAttach(R_PWM, PWM_FREQ, PWM_BITS);

  // 코어 2.x라면 위 두 줄 대신:
  //   ledcSetup(0, PWM_FREQ, PWM_BITS); ledcAttachPin(L_PWM, 0);
  //   ledcSetup(1, PWM_FREQ, PWM_BITS); ledcAttachPin(R_PWM, 1);
  //   그리고 아래 ledcWrite(핀, duty)를 ledcWrite(채널, duty)로 바꾼다.
}

/** spd(웹에서 온 0-255) → 실제로 도는 PWM 구간으로 매핑 */
int toDuty(int spd) {
  if (spd <= 0) return 0;
  if (spd > 255) spd = 255;
  return map(spd, 1, 255, MIN_DUTY, MAX_DUTY);
}

/** 한쪽 바퀴. speed는 -255..255, 음수면 역방향. */
void driveWheel(int in1, int in2, int pwmPin, int speed) {
#if !HAS_MOTOR
  // 드라이버를 안 꽂았을 때 핀을 흔들지 않는다. (이 플래그는 예전엔 선언만 되고
  // 아무 데서도 안 쓰여서, 0으로 꺼놔도 모터가 그대로 돌던 상태였다.)
  (void)in1; (void)in2; (void)pwmPin; (void)speed;
  return;
#endif
  bool forward = speed >= 0;
  int duty = toDuty(abs(speed));

  digitalWrite(in1, forward ? HIGH : LOW);
  digitalWrite(in2, forward ? LOW : HIGH);
  ledcWrite(pwmPin, duty);
}

void drive(int leftSpeed, int rightSpeed) {
  driveWheel(L_IN1, L_IN2, L_PWM, leftSpeed);
  driveWheel(R_IN1, R_IN2, R_PWM, rightSpeed);
  moving = (leftSpeed != 0 || rightSpeed != 0);
}

void stopMotors() {
  digitalWrite(L_IN1, LOW);
  digitalWrite(L_IN2, LOW);
  digitalWrite(R_IN1, LOW);
  digitalWrite(R_IN2, LOW);
  ledcWrite(L_PWM, 0);
  ledcWrite(R_PWM, 0);
  moving = false;
}

/*
 * 부팅 직후 모터를 하나씩 돌려본다. 어느 바퀴가 어느 방향으로 도는지 눈으로
 * 확인하려는 것이므로, 한 번에 한쪽씩 돌린다.
 *
 * 여기서 안 돌면 웹·와이파이·명령 경로는 볼 필요도 없다. 전원(VM에 배터리),
 * GND 공통, ENA/ENB 점퍼, OUT 단자 나사 — 이 넷 중 하나다.
 */
void motorSelfTest() {
#if MOTOR_SELFTEST
  Serial.println("[모터진단] 시작 — 바퀴를 띄워두세요");

  struct Step { const char* name; int l; int r; };
  const Step steps[] = {
    { "왼쪽 바퀴 앞으로",   255,    0 },
    { "왼쪽 바퀴 뒤로",    -255,    0 },
    { "오른쪽 바퀴 앞으로",   0,  255 },
    { "오른쪽 바퀴 뒤로",     0, -255 },
    { "양쪽 다 앞으로",     255,  255 },
  };

  for (const Step& s : steps) {
    Serial.printf("[모터진단] %s\n", s.name);
    drive(s.l, s.r);
    delay(1200);
    stopMotors();
    delay(400);
  }

  Serial.println("[모터진단] 끝. 하나도 안 돌았으면 전원(VM)·GND공통·ENA/ENB점퍼·OUT나사 확인");
#endif
}

/*
 * ── 앞이 막히면 전진을 막는다 ─────────────────────────────────
 *
 * 초음파가 잰 앞쪽 거리. netTask가 200ms마다 갱신하고 -1이면 "안 잡힘"이다.
 * 모터 코드가 이 값을 봐야 해서 여기(모터 구역)에 둔다.
 *
 * 막는 건 **전진뿐이다.** 후진과 회전은 그대로 살려둔다 — 안 그러면 벽에
 * 코를 박은 로봇이 영영 못 빠져나온다.
 */
volatile float gDistanceCm = -1.0f;

// 지금 곧장 앞으로 가는 중인가. 장애물이 튀어나왔을 때 **전진만** 끊으려면
// 방향을 알아야 한다 — 이게 없으면 벽에서 물러나는 후진까지 같이 끊긴다.
volatile bool gGoingForward = false;

constexpr float OBSTACLE_NEAR_CM = 20.0f;   // 이 안쪽이면 장애물
constexpr float OBSTACLE_FAR_CM  = 30.0f;   // 이 밖으로 나가야 해제

/*
 * ⚠ 지금은 꺼둔다. 초음파를 3.3V로 돌리는 동안은 이걸 켜면 안 된다.
 *
 * 실측 로그에서 앞이 뻥 뚫려 있는데도 "거리 6cm / 9.6cm"가 계속 올라왔다.
 * 3.3V라 송신 출력이 약해서 자기가 쏜 소리를 자기 수신부가 되받는 것이다.
 * 그 헛값 하나가 20cm 임계에 걸리면 **전진 명령이 통째로 씹힌다.** 그것도
 * 시리얼에 아무 말 없이 조용히 — 모터가 안 도는데 원인을 알 수가 없었다.
 *
 * 초음파를 5V + 분압저항으로 제대로 올리고 나서 다시 1로 켜면 된다.
 * 그때까지는 후진·회전만 막지 않는 게 아니라 아예 안 막는 쪽이 낫다.
 */
#define OBSTACLE_AUTOSTOP 0

bool blockedAhead() {
#if OBSTACLE_AUTOSTOP
  return gDistanceCm > 0 && gDistanceCm < OBSTACLE_NEAR_CM;
#else
  return false;
#endif
}

/*
 * SPEC §9-2의 dir 값을 차동구동으로 푼다.
 *   F/B   전진·후진
 *   L/R   달리면서 도는 완만한 선회 (안쪽 바퀴를 40%로)
 *   SL/SR 제자리 회전 (양 바퀴 반대로)
 */
void applyMove(const char* dir, int spd) {
  gGoingForward = !strcmp(dir, "F");

  if (gGoingForward && blockedAhead()) {
    // 예전엔 여기서 조용히 return했다. 모터가 안 도는데 시리얼에 아무 흔적도
    // 안 남아서 원인을 찾을 수가 없었다. 씹었으면 씹었다고 말해야 한다.
    Serial.printf("[모터] 전진 차단 — 앞 %.1fcm (임계 %.0fcm)\n",
                  gDistanceCm, OBSTACLE_NEAR_CM);
    stopMotors();          // 전진 명령만 씹는다. 나머지 방향은 아래로 내려간다
    lastCmdAt = millis();
    return;
  }

  Serial.printf("[모터] %s spd=%d\n", dir, spd);

  if (!strcmp(dir, "F"))       drive(spd, spd);
  else if (!strcmp(dir, "B"))  drive(-spd, -spd);
  else if (!strcmp(dir, "L"))  drive(spd * 0.4, spd);
  else if (!strcmp(dir, "R"))  drive(spd, spd * 0.4);
  else if (!strcmp(dir, "SL")) drive(-spd, spd);
  else if (!strcmp(dir, "SR")) drive(spd, -spd);
  else                         stopMotors();   // "STOP" 및 알 수 없는 값

  lastCmdAt = millis();
}

// ============================================================
// 3. 1602 LCD (lcd_wifi.ino 그대로 — 동작 검증 완료)
// ============================================================

LiquidCrystal_I2C* lcd = nullptr;

/*
 * ⚠ 예전에는 "스캔해서 제일 먼저 나온 주소"를 LCD로 썼다. I2C에 LCD 하나만
 *   있을 땐 맞았지만, 지금은 BH1750이 0x23·0x5C에 같이 붙어 있다. 0x23이
 *   0x27보다 먼저 나오므로 **조도센서를 LCD로 착각해서 글자가 안 뜬다.**
 *
 *   그래서 아무 주소나 쓰지 않고 PCF8574 백팩이 쓰는 주소대(0x20~0x27,
 *   0x38~0x3F)에 있는 것만 LCD로 인정한다. 스캔 결과는 전부 찍어주므로
 *   BH1750 2개가 제대로 붙었는지도 이 로그 한 번으로 같이 확인된다.
 */
bool isLcdAddress(uint8_t a) {
  // BH1750 왼쪽(0x23)이 하필 PCF8574 대역(0x20~0x27) 안에 들어간다.
  // 실측으로 드러난 문제: 스캔이 0x23을 0x27보다 먼저 만나서 조도센서를
  // LCD로 착각해버렸다. 두 BH1750 주소는 확실히 LCD가 아니므로 먼저 걸러낸다.
  if (a == 0x23 || a == 0x5C) return false;
  return (a >= 0x20 && a <= 0x27) || (a >= 0x38 && a <= 0x3F);
}

const char* i2cDeviceName(uint8_t a) {
  if (a == 0x23) return "BH1750 왼쪽";
  if (a == 0x5C) return "BH1750 오른쪽";
  if (isLcdAddress(a)) return "1602 LCD";
  return "???";
}

uint8_t findLcdAddress() {
  Serial.println("[3] I2C 스캔...");
  uint8_t lcdAddr = 0;
  int count = 0;

  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() != 0) continue;

    count++;
    Serial.printf("    0x%02X  %s\n", addr, i2cDeviceName(addr));
    if (lcdAddr == 0 && isLcdAddress(addr)) lcdAddr = addr;
  }

  if (count == 0) {
    Serial.println("[3] I2C에 아무것도 없음 — SDA=21 SCL=22, 전원, GND 공통 확인");
  }
  if (lcdAddr == 0) {
    Serial.println("[3] LCD를 못 찾음 (0x20~0x27 / 0x38~0x3F 아님). 일단 0x27로 시도.");
    return 0x27;
  }

  Serial.printf("[3] LCD 주소: 0x%02X\n", lcdAddr);
  return lcdAddr;
}

/** 16칸을 넘기면 둘째 줄로 넘긴다. 한글은 웹 쪽에서 걸러 보낸다. */
void showOnLcd(const String& text) {
  if (!lcd) return;
  lcd->clear();
  lcd->setCursor(0, 0);
  lcd->print(text.substring(0, 16));
  if (text.length() > 16) {
    lcd->setCursor(0, 1);
    lcd->print(text.substring(16, 32));
  }
}

// ============================================================
// 3-2. 센서 — BH1750 ×2 · 토양습도 · 초음파 · IR
// ============================================================

/*
 * 조도계가 둘인 이유: 좌우 밝기를 비교하면 "어느 쪽이 더 밝은지"를 알 수 있다.
 * 그게 이 로봇의 핵심 동작(빛 드는 자리로 이동)의 입력이 된다.
 * 지금은 값만 읽어둔다 — 자율주행을 붙일 때 gLuxL/gLuxR을 그대로 쓰면 된다.
 *
 * 주소는 ADDR 핀으로 정해진다. GND에 물리면 0x23, 3.3V에 물리면 0x5C.
 * 둘 다 GND에 물리면 주소가 같아져서 한 대로만 보인다 — 반드시 하나는 3.3V로.
 */
BH1750 luxLeft;
BH1750 luxRight;
bool luxLeftOK  = false;
bool luxRightOK = false;

float gLuxL = 0.0f;   // 왼쪽 lux
float gLuxR = 0.0f;   // 오른쪽 lux

void setupLightSensors() {
#if HAS_BH1750
  luxLeftOK  = luxLeft.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire);
  delay(200);
  luxRightOK = luxRight.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x5C, &Wire);
  Serial.printf("    BH1750 왼쪽(0x23) %s / 오른쪽(0x5C) %s\n",
                luxLeftOK ? "OK" : "실패", luxRightOK ? "OK" : "실패");
#endif
}

void readLightSensors() {
#if HAS_BH1750
  // readLightLevel()은 실패하면 음수를 준다. 그때는 직전 값을 유지한다 —
  // 순간적인 I2C 오류로 웹의 조도 그래프가 0으로 곤두박질치면 안 된다.
  if (luxLeftOK) {
    float v = luxLeft.readLightLevel();
    if (v >= 0) gLuxL = v;
  }
  if (luxRightOK) {
    float v = luxRight.readLightLevel();
    if (v >= 0) gLuxR = v;
  }
#endif
}

/*
 * 토양수분 — 팀원이 실제로 재서 잡은 기준값이다. 추측값이 아니므로 그대로 쓴다.
 * 센서 특성상 **젖을수록 값이 내려간다.**
 *   3300 이상  바싹 마름 (물 필요)
 *   2900~      마름
 *   2200~      보통
 *   1800~      젖음
 *   1800 미만  흠뻑
 * 웹은 0~100%를 원하므로 3300을 0%, 1800을 100%로 펴서 보낸다.
 */
constexpr int SOIL_VERY_DRY = 3300;
constexpr int SOIL_DRY      = 2900;
constexpr int SOIL_NORMAL   = 2200;
constexpr int SOIL_WET      = 1800;

int soilPercent(int raw) {
  return map(constrain(raw, SOIL_WET, SOIL_VERY_DRY), SOIL_VERY_DRY, SOIL_WET, 0, 100);
}


/*
 * ── 토양 상태를 "값"이 아니라 "상태"로 다룬다 ────────────────────
 *
 * 지금까지는 매번 analogRead 한 번 찍어서 라벨만 뽑아 썼다. 두 가지가 아쉬웠다.
 *
 *  1. ADC 한 번 값은 꽤 튄다. 실측 로그에서 1726 ↔ 1793처럼 계속 흔들렸다.
 *     여러 번 읽어 평균을 내면 화면 숫자가 안정된다.
 *  2. 경계값(예: 1800) 근처에서 값이 떨리면 WET ↔ VERY WET이 초당 몇 번씩
 *     번갈아 바뀐다. 그때마다 로그를 찍거나 표정을 바꾸면 난리가 난다.
 *     그래서 상태를 바꿀 때 여유(SOIL_MARGIN)를 둔다 — 한 번 들어간 상태에서
 *     나오려면 경계를 그만큼 더 넘어야 한다.
 *
 * 상태로 다루면 "바뀌는 순간"을 잡을 수 있고, 그 순간에만 반응하면 된다.
 */
/* sendEvent의 정의는 아래 WebSocket 구역에 있다. 여기서 먼저 쓰므로 선언만 미리 둔다. */
void sendEvent(const char* kind, const char* msg);

enum SoilState : int {
  SOIL_S_VERY_WET = 0,
  SOIL_S_WET,
  SOIL_S_NORMAL,
  SOIL_S_DRY,
  SOIL_S_VERY_DRY
};

/** 경계에서 값이 떨릴 때 상태가 왔다갔다 하는 걸 막는 여유값 */
constexpr int SOIL_MARGIN = 60;

/** 오름차순 경계. i번째를 넘으면 상태가 i+1이 된다. */
const int SOIL_EDGES[4] = { SOIL_WET, SOIL_NORMAL, SOIL_DRY, SOIL_VERY_DRY };

const char* SOIL_TEXT[5] = { "VERY WET", "WET", "NORMAL", "DRY", "VERY DRY" };

int   gSoilRaw   = 0;               // 평균 낸 ADC 값
int   gSoilState = SOIL_S_NORMAL;   // 지금 상태

/** ADC를 여러 번 읽어 평균. 한 번 값은 너무 튄다. */
int readSoilRaw() {
  long sum = 0;
  for (int i = 0; i < 8; i++) {
    sum += analogRead(PIN_SOIL);
    delayMicroseconds(300);
  }
  return (int)(sum / 8);
}

/**
 * 지금 상태(cur)를 알고 있을 때의 새 상태. 히스테리시스가 들어간다.
 *
 * 이미 건조한 쪽에 있으면 경계를 낮춰 잡아서 쉽게 안 빠져나오고,
 * 젖은 쪽에 있으면 경계를 높여 잡아서 쉽게 안 넘어간다.
 */
int soilStateOf(int raw, int cur) {
  int s = 0;
  for (int i = 0; i < 4; i++) {
    int edge = SOIL_EDGES[i] + (cur > i ? -SOIL_MARGIN : SOIL_MARGIN);
    if (raw >= edge) s = i + 1;
  }
  return s;
}

/*
 * 토양을 읽고, 상태가 바뀐 순간에만 반응한다.
 *
 * 바싹 마르면 로봇이 스스로 "물 달라" 표정을 짓는다. 웹에서 표정을 눌러줘야만
 * 목마른 얼굴이 나오던 걸, 실제 흙 상태가 직접 얼굴을 바꾸게 연결한 것이다.
 * 이게 이 로봇에서 센서가 행동으로 이어지는 제일 눈에 띄는 고리다.
 */
void updateSoil() {
#if HAS_SOIL
  gSoilRaw = readSoilRaw();

  int next = soilStateOf(gSoilRaw, gSoilState);
  if (next == gSoilState) return;

  bool gotDrier = next > gSoilState;
  gSoilState = next;

  Serial.printf("[토양] %s (raw %d)\n", SOIL_TEXT[next], gSoilRaw);
  sendEvent(next >= SOIL_S_DRY ? "soil_dry" : "soil_ok", SOIL_TEXT[next]);

  if (next == SOIL_S_VERY_DRY) {
    requestFace(FACE_THIRSTY);          // 말풍선에 "물"이 뜬다
  } else if (!gotDrier && next <= SOIL_S_WET) {
    requestFace(FACE_HAPPY);            // 물을 먹어서 젖었다 → 좋아함
  }
#endif
}

/*
 * 초음파(HC-SR04). 10us 펄스를 쏘고 메아리가 돌아오는 시간을 잰다.
 * 소리가 왕복하므로 거리(cm) = 시간(us) / 58.
 *
 * pulseIn은 메아리가 안 올 때까지 기다리므로 반드시 시간 제한을 준다.
 * 25ms면 약 4m — 그보다 멀면 "장애물 없음"으로 친다. 이 25ms 동안 Core 0이
 * 잡혀 있으니 매 틱마다 재지 않고 아래 netTask에서 200ms에 한 번만 잰다.
 */
constexpr unsigned long ECHO_TIMEOUT_US = 25000;

float readDistanceCm() {
#if HAS_SONIC
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(3);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long us = pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);
  if (us == 0) return -1.0f;        // 시간 초과 = 앞이 비었다
  return us / 58.0f;
#else
  return -1.0f;
#endif
}

/*
 * ── 헛값 걸러내기 ────────────────────────────────────────────
 *
 * 3.3V로 돌리면 HC-SR04가 가끔 "3cm"처럼 말도 안 되게 짧은 값을 뱉는다.
 * 송신 출력이 약해서 자기가 쏜 소리를 자기 수신부가 되받는 것이다.
 * 이 헛값 한 번이 로봇을 그 자리에 세워버린다.
 *
 * 헛값이 **항상 짧은 쪽으로만 튄다**는 성질을 쓴다. 최근 3번 중 제일 먼 값을
 * 고르면, 진짜 앞이 막혔을 땐 3번 다 짧게 나오니 그대로 짧게 잡히고,
 * 헛값 한두 번은 묻힌다.
 *
 * 근본 해결은 5V + 분압저항이다. 이건 그때까지 버티는 용도다.
 */
constexpr int DIST_HISTORY = 3;
float distHistory[DIST_HISTORY] = { -1.0f, -1.0f, -1.0f };
int   distIdx = 0;

float filteredDistance(float fresh) {
  // 2cm 미만은 HC-SR04의 측정 하한 밖이다. 무조건 헛값이므로 버린다.
  distHistory[distIdx] = (fresh >= 2.0f) ? fresh : -1.0f;
  distIdx = (distIdx + 1) % DIST_HISTORY;

  float far = -1.0f;
  for (int i = 0; i < DIST_HISTORY; i++) {
    if (distHistory[i] > far) far = distHistory[i];
  }
  return far;
}

/*
 * IR 장애물/근접 센서. 흔한 FC-51류는 감지하면 출력이 LOW로 떨어진다.
 * 반대로 동작하는 모듈이면 이 값을 0으로 바꾼다.
 */
#define IR_ACTIVE_LOW 1

bool irDetected() {
#if HAS_IR
  int v = digitalRead(PIN_IR);
  return IR_ACTIVE_LOW ? (v == LOW) : (v == HIGH);
#else
  return false;
#endif
}

// ============================================================
// 4. 와이파이 — AP와 STA를 동시에 켠다
// ============================================================
/*
 * 두 경로를 다 살려야 한다.
 *   STA  에그(공유기)에 붙는다 → 인터넷 → Supabase(LCD 문구·표정)
 *   AP   ESP32가 공유기 노릇   → 인터넷 없어도 폰이 직접 붙어서 조종 가능
 *
 * ⚠ AP_STA에서는 SoftAP의 채널이 STA가 붙은 채널로 끌려간다. 정상 동작이고
 *   폰이 AP에 붙는 데는 문제가 없다. 다만 STA가 붙은 뒤에 AP 채널이 한 번
 *   바뀌므로, 그 순간 AP에 붙어있던 기기는 잠깐 끊겼다 다시 붙는다.
 *
 * ⚠ 에그가 없는 곳에서도 반드시 부팅이 끝나야 한다. 그래서 STA 연결을
 *   기다리는 데 시간 제한을 뒀다 — 원래 코드는 여기서 영원히 돌았고,
 *   그러면 setup()이 안 끝나서 얼굴 애니메이션도 시작을 못 한다.
 */
constexpr unsigned long WIFI_TIMEOUT_MS = 15000;

const char* AP_SSID = "SmartFarm";
const char* AP_PASS = "smartfarm1234";

bool staConnected = false;

void connectWifi() {
  WiFi.mode(WIFI_AP_STA);

  WiFi.softAP(AP_SSID, AP_PASS);
  Serial.printf("[4] SoftAP \"%s\" 켬 → ws://%s/ws\n",
                AP_SSID, WiFi.softAPIP().toString().c_str());

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[4] 에그 연결 시도 (%s)", WIFI_SSID);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();

  staConnected = (WiFi.status() == WL_CONNECTED);
  if (staConnected) {
    Serial.printf("[4] 연결됨. 같은 와이파이의 폰은 이 주소로: ws://%s/ws\n",
                  WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[4] 에그 연결 실패 — Supabase(LCD·표정)는 못 쓴다.");
    Serial.println("    조종은 SoftAP로 그대로 된다. 나중에 자동으로 다시 시도한다.");
  }
}

// ============================================================
// 5. Supabase 폴링 — LCD 문구 + 표정
// ============================================================
/*
 * 3초마다 두 테이블을 읽는다.
 *
 *   lcd_state.text    조종 탭에서 친 글자        → 1602 LCD
 *   robot_state.face  웹이 2초마다 올리는 표정   → TFT 얼굴
 *
 * 표정까지 여기서 읽는 게 핵심이다. WebSocket은 폰과 ESP32가 같은 와이파이에
 * 있어야만 되는데, 이 경로는 인터넷만 있으면 되므로 심사위원이 자기 폰의
 * LTE로 배포된 웹앱을 열어도 로봇 얼굴이 따라 바뀐다.
 *
 * 매번 반영하지 않고 "값이 바뀌었을 때만" 반영한다. 안 그러면 3초마다 표정이
 * 다시 재생되면서 WebSocket으로 준 명령을 계속 덮어쓴다.
 */
const unsigned long POLL_MS = 3000;

/*
 * 센서 실측을 클라우드로 올리는 주기. 조종 명령(0.3초)만큼 급하지 않고,
 * 게이지 숫자가 3초 늦게 갱신되는 건 눈에 안 띈다. 너무 자주 쓰면 Supabase
 * 쓰기만 늘어난다.
 */
const unsigned long SENSOR_PUSH_MS = 3000;

String lastLcdUpdatedAt = "";
String lastDbFace = "";

/*
 * ── TLS 연결을 하나만 열어두고 계속 쓴다 ──────────────────────────
 *
 * 예전에는 이 함수 안에서 WiFiClientSecure를 매번 새로 만들었다. 그러면 요청
 * 한 번마다 TLS 핸드셰이크가 통째로 일어난다 — 300~800ms가 걸리고 힙을 40KB쯤
 * 먹는다. 3초에 한 번(LCD 문구) 부를 때는 그럭저럭 버텼지만, **조종 명령을
 * 0.3초마다 가져오려면 절대 못 버틴다.**
 *
 * setReuse(true)로 keep-alive를 켜면 두 번째 요청부터는 핸드셰이크 없이
 * 기존 연결에 얹혀 간다. 이게 클라우드 조종이 실용 속도로 도는 근거다.
 *
 * netTask(Core 0) 한 곳에서만 부르므로 락은 필요 없다.
 */
WiFiClientSecure gTls;
HTTPClient gHttp;
bool gTlsReady = false;

/** Supabase REST GET 한 번. 성공하면 body를 채우고 true. */
/**
 * Supabase REST POST(upsert). 같은 TLS 연결을 GET과 나눠 쓴다.
 *
 * Prefer: resolution=merge-duplicates 가 upsert를 만든다 — id=1 행이 이미 있으면
 * 새로 만들지 않고 덮어쓴다. 이력이 아니라 "지금 값" 한 줄만 필요하기 때문이다.
 */
bool supabasePost(const String& table, const String& json) {
  if (WiFi.status() != WL_CONNECTED) return false;

  if (!gTlsReady) {
    gTls.setInsecure();
    gHttp.setReuse(true);
    gTlsReady = true;
  }

  gHttp.setTimeout(4000);
  if (!gHttp.begin(gTls, String(SUPABASE_URL) + "/rest/v1/" + table)) return false;
  gHttp.addHeader("apikey", SUPABASE_ANON_KEY);
  gHttp.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  gHttp.addHeader("Content-Type", "application/json");
  gHttp.addHeader("Prefer", "resolution=merge-duplicates");

  int code = gHttp.POST(json);
  bool ok = (code >= 200 && code < 300);
  if (!ok) {
    Serial.printf("[supabase] POST %s 실패 HTTP %d\n", table.c_str(), code);
    gHttp.end();
    gTls.stop();   // 상한 연결일 수 있다. 끊어서 다음에 새로 붙게 한다.
    return false;
  }

  gHttp.end();
  return true;
}

bool supabaseGet(const String& query, String& body) {
  if (WiFi.status() != WL_CONNECTED) return false;

  if (!gTlsReady) {
    // 루트 인증서를 기기에 심는 대신 검증을 건너뛴다. 해커톤 범위의 타협이다 —
    // 오가는 게 LCD 문구·표정·조종 명령뿐이라 감수한다. 제대로 하려면 setCACert().
    gTls.setInsecure();
    gHttp.setReuse(true);
    gTlsReady = true;
  }

  gHttp.setTimeout(4000);   // 응답이 없을 때 이 태스크가 오래 잡혀있지 않게
  if (!gHttp.begin(gTls, String(SUPABASE_URL) + "/rest/v1/" + query)) return false;
  gHttp.addHeader("apikey", SUPABASE_ANON_KEY);
  gHttp.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  int code = gHttp.GET();
  if (code != 200) {
    Serial.printf("[supabase] HTTP %d (%s)\n", code, query.c_str());
    // 실패한 연결은 상해 있을 수 있다. 끊어서 다음 번에 새로 붙게 한다.
    gHttp.end();
    gTls.stop();
    return false;
  }

  body = gHttp.getString();
  gHttp.end();   // setReuse(true)라 실제 소켓은 살려둔 채 요청만 끝낸다
  return true;
}

/** lcd_state → 1602 */
void pollLcdText() {
  String body;
  if (!supabaseGet("lcd_state?select=text,updated_at&id=eq.1", body)) return;

  // PostgREST는 배열로 답한다: [{"text":"...", "updated_at":"..."}]
  JsonDocument doc;
  if (deserializeJson(doc, body) || !doc.is<JsonArray>() || doc.size() == 0) return;

  JsonObject row = doc[0];
  const char* text = row["text"] | "";
  const char* updatedAt = row["updated_at"] | "";

  // updated_at이 그대로면 안 건드린다 — 매번 다시 찍으면 눈에 띄게 깜빡인다.
  if (lastLcdUpdatedAt != updatedAt) {
    lastLcdUpdatedAt = updatedAt;
    Serial.printf("[supabase] 새 문구: %s\n", text);
    showOnLcd(String(text));
  }
}

/** robot_state.face → TFT 얼굴 */
void pollFace() {
  String body;
  if (!supabaseGet("robot_state?select=face&id=eq.1", body)) return;

  JsonDocument doc;
  if (deserializeJson(doc, body) || !doc.is<JsonArray>() || doc.size() == 0) return;

  const char* face = doc[0]["face"] | "";
  if (!face[0]) return;

  if (lastDbFace != face) {
    lastDbFace = face;
    Serial.printf("[supabase] 표정 → %s\n", face);
    requestFace(parseFace(face));
  }
}

// ============================================================
// 5-2. 클라우드 조종 — 인터넷만 있으면 어디서든 조종된다
// ============================================================
/*
 * WebSocket 조종(아래 6번)은 폰과 ESP32가 **같은 와이파이**에 있어야만 된다.
 * 게다가 배포된 https 사이트에서는 브라우저가 ws:// 연결 자체를 막아버린다.
 *
 * 그래서 LCD 문구와 똑같은 경로를 하나 더 뒀다 — 웹이 robot_command 행에 명령을
 * 써두면 ESP32가 가지러 온다. ESP32가 밖으로 나가는 방향이라 https도 방화벽도
 * 상관없다. 심사위원이 자기 폰 LTE로 배포 주소를 열어도 조종이 된다.
 *
 * 두 경로는 공존한다. 같은 와이파이면 WebSocket이 더 빠르게 먹고, 아니면 이쪽이
 * 받는다. 어느 쪽이 막혀도 나머지 하나로 조종이 살아 있다.
 */
const unsigned long CMD_POLL_MS = 300;

/*
 * ── 데드맨 스위치 ────────────────────────────────────────────────
 * 폰이 꺼지거나 브라우저가 죽으면 robot_command에는 마지막 명령(예: 전진)이
 * 그대로 남는다. 그것만 보고 달리면 로봇이 영영 안 멈춘다.
 *
 * 웹은 버튼을 누르는 동안 seq를 계속 올린다. seq가 이 시간 동안 안 올라가면
 * "조종하던 사람이 사라졌다"로 보고 세운다.
 */
const unsigned long CLOUD_DEADMAN_MS = 1200;

/*
 * seq는 웹이 보내는 Date.now() 밀리초라 1.78e12쯤 된다 — int(최대 21억)를
 * 훌쩍 넘는다. ArduinoJson에서 기본값 0으로 읽으면 int로 해석돼 값이 0이 나오고,
 * 그러면 "안 바뀌었다"고 판단해 **첫 명령 이후 영원히 아무것도 안 먹는다.**
 * 실제로 시리얼에 [모터] STOP 하나만 찍히고 끝났던 게 이 때문이다.
 * double은 2^53까지 정수를 정확히 담으므로 안전하다.
 */
double gCloudSeq = -1;        // 마지막으로 본 seq
unsigned long gCloudSeqAt = 0;   // 그 seq를 처음 본 시각
bool gCloudDriving = false;   // 지금 클라우드 명령으로 달리는 중인가

void pollCommand() {
  String body;
  if (!supabaseGet("robot_command?select=dir,spd,seq&id=eq.1", body)) return;

  JsonDocument doc;
  if (deserializeJson(doc, body) || !doc.is<JsonArray>() || doc.size() == 0) return;

  const char* dir = doc[0]["dir"] | "STOP";
  int spd          = doc[0]["spd"] | 0;
  double seq       = doc[0]["seq"] | 0.0;

  unsigned long now = millis();

  if (seq != gCloudSeq) {
    // 새 명령이 왔다
    bool first = (gCloudSeq < 0);
    gCloudSeq   = seq;
    gCloudSeqAt = now;
    gCloudDriving = strcmp(dir, "STOP") != 0;
    if (first) Serial.println("[cloud] 조종 명령 수신 시작 — 클라우드 경로 정상");
    Serial.printf("[cloud] %s spd=%d seq=%.0f\n", dir, spd, seq);
    applyMove(dir, spd);
    return;
  }

  // seq가 그대로다 — 버튼을 계속 누르고 있는 중일 수도, 웹이 죽었을 수도 있다
  if (!gCloudDriving) return;

  if (now - gCloudSeqAt > CLOUD_DEADMAN_MS) {
    gCloudDriving = false;
    stopMotors();
    Serial.println("[cloud] 명령이 끊겼다 — 정지");
  } else {
    // 아직 살아있는 명령이다. 400ms 안전정지 타이머만 갱신해서 계속 달리게 한다.
    // (여기서 applyMove를 다시 부르면 같은 명령이 매번 재실행돼 로그가 지저분해진다)
    lastCmdAt = now;
  }
}

// ============================================================
// 6. WebSocket — 같은 와이파이일 때의 빠른 경로 (SPEC §9-2 / §9-3)
// ============================================================

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

void applyFace(const char* face) {
  requestFace(parseFace(face));
  Serial.printf("FACE %s\n", face);
}

void applyLed(int r, int g, int b, const char* mode) {
  // TODO: 네오픽셀 링 — solid|breathe|rainbow|off
  Serial.printf("LED %d,%d,%d %s\n", r, g, b, mode);
}

void applyAct(const char* act) {
  // greet|drink|sound|spin
  if (!strcmp(act, "spin")) {
    requestFace(FACE_EXCITED);
    drive(200, -200);
    delay(600);          // Core 0에서만 도는 코드라 얼굴을 안 막는다
    stopMotors();
  } else if (!strcmp(act, "drink")) {
    requestFace(FACE_DRINKING);
    digitalWrite(PIN_PUMP, HIGH);
    delay(1500);
    digitalWrite(PIN_PUMP, LOW);
  } else if (!strcmp(act, "greet")) {
    requestFace(FACE_HAPPY);
  }
  Serial.printf("ACT %s\n", act);
}

void sendSensors() {
  JsonDocument doc;
  doc["type"] = "sensor";

#if HAS_SOIL
  // analogRead를 여기서 또 하지 않는다. updateSoil()이 평균 내둔 값을 쓴다 —
  // 화면 숫자와 시리얼 로그가 같은 값을 보게 하려는 것이다.
  doc["moisture"] = soilPercent(gSoilRaw);
  doc["soilRaw"]  = gSoilRaw;
  doc["soil"]     = SOIL_TEXT[gSoilState];
#else
  doc["moisture"] = 50;
#endif

  // 좌우 조도계의 평균을 대표값으로 보낸다. 좌우 차이는 gLuxL/gLuxR로 따로 남아
  // 있어서 자율주행이 그걸 쓴다.
  doc["lux"]       = (gLuxL + gLuxR) / 2.0f;

  /*
   * ── 여기부터가 실제로 배선된 센서들 ──────────────────────────
   * 웹 홈 화면의 게이지 4개가 이 값들을 그대로 쓴다. 아래 fake 블록과 달리
   * 이건 전부 실측이다.
   *   luxL/luxR  BH1750 두 대 (0x23 / 0x5C)
   *   distance   초음파. 앞이 비었으면 -1이 간다 (웹이 "열림"으로 표시)
   *   ir         HAS_IR가 0이면 항상 false
   */
  doc["luxL"]      = gLuxL;
  doc["luxR"]      = gLuxR;
  doc["distance"]  = gDistanceCm;
  doc["ir"]        = irDetected();

  /*
   * ── 전용 센서가 없어서 고정값으로 나가는 것들 ────────────────
   * 웹은 이제 이 값들을 게이지에 안 띄운다(실측만 띄운다). 그래도 계속 보내는
   * 이유는 목업 엔진의 행동 판단(배터리 임계 등)이 이 필드를 보기 때문이다.
   * 나중에 진짜 센서를 달면 이 줄만 실측으로 바꾸면 웹은 손댈 게 없다.
   */
  doc["nutrient"]  = 72;    // 전용 센서 없음 — 고정값
  doc["temp"]      = 24.2;  // TODO: DHT/SHT 센서
  doc["humidity"]  = 48;    // TODO
  doc["battery"]   = 88;    // TODO: 전압 분배 후 ADC

#if HAS_WATER
  doc["waterTank"] = digitalRead(PIN_WATER) ? 80 : 15;
#else
  doc["waterTank"] = 64;    // 아직 안 꽂음 — 안 읽으면 값이 둥둥 떠서 화면이 요동친다
#endif

  String out;
  serializeJson(doc, out);
  ws.textAll(out);
}

/*
 * 센서 실측을 Supabase에 올린다.
 *
 * sendSensors()는 WebSocket으로만 쏜다 — 폰이 같은 와이파이에 있어야 하고,
 * 배포된 https 사이트에서는 브라우저가 ws:// 를 막아서 아예 못 받는다.
 * 그래서 웹의 게이지가 전부 목업 숫자를 띄우고 있었다.
 *
 * 이 경로는 ESP32가 밖으로 나가서 쓰기만 하므로 어디서 열어도 실측이 보인다.
 * robot_command(웹 -> 로봇)의 정반대 방향이다.
 */
void pushSensorsToCloud() {
  JsonDocument doc;
  doc["id"]       = 1;
  doc["moisture"] = soilPercent(gSoilRaw);
  doc["soil"]     = SOIL_TEXT[gSoilState];
  doc["soil_raw"] = gSoilRaw;
  doc["lux"]      = (gLuxL + gLuxR) / 2.0f;
  doc["lux_l"]    = gLuxL;
  doc["lux_r"]    = gLuxR;
  doc["distance"] = gDistanceCm;
  doc["ir"]       = irDetected();

  // updated_at은 안 보낸다. ESP32에 시계가 없어서 못 채운다 — DB 트리거가 찍는다.

  String out;
  serializeJson(doc, out);
  supabasePost("robot_sensors", out);
}

void sendEvent(const char* kind, const char* msg) {
  JsonDocument doc;
  doc["type"] = "event";
  doc["kind"] = kind;
  doc["msg"]  = msg;
  String out;
  serializeJson(doc, out);
  ws.textAll(out);
}

void handleMessage(const char* payload) {
  JsonDocument doc;
  if (deserializeJson(doc, payload)) return;   // 깨진 프레임 하나로 죽으면 안 된다

  const char* cmd = doc["cmd"] | "";

  if (!strcmp(cmd, "MOVE")) {
    applyMove(doc["dir"] | "STOP", doc["spd"] | 0);
  } else if (!strcmp(cmd, "FACE")) {
    applyFace(doc["v"] | "neutral");
  } else if (!strcmp(cmd, "LED")) {
    applyLed(doc["r"] | 0, doc["g"] | 0, doc["b"] | 0, doc["mode"] | "solid");
  } else if (!strcmp(cmd, "ACT")) {
    applyAct(doc["v"] | "");
  } else if (!strcmp(cmd, "MODE")) {
    Serial.printf("MODE %s\n", doc["v"] | "auto");
  }
  // PING은 받기만 하면 된다
}

void onWsEvent(AsyncWebSocket*, AsyncWebSocketClient* client, AwsEventType type,
               void*, uint8_t* data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("웹 연결됨 #%u\n", client->id());
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.println("웹 끊김 — 안전을 위해 정지");
    stopMotors();   // 조종하던 중에 끊기면 반드시 멈춘다
  } else if (type == WS_EVT_DATA) {
    // 짧은 JSON만 오므로 단일 프레임으로 처리한다
    static char buf[512];
    size_t n = len < sizeof(buf) - 1 ? len : sizeof(buf) - 1;
    memcpy(buf, data, n);
    buf[n] = '\0';
    handleMessage(buf);
  }
}

// ============================================================
// 7. Core 0 — 네트워크·센서·모터안전 태스크
// ============================================================
/*
 * 원래 loop()가 하던 일을 전부 여기로 옮겼다. 50ms마다 깨어나서 각자의 주기가
 * 됐는지 확인하는 방식이라, 3초짜리 Supabase 폴링이 400ms짜리 모터 안전정지를
 * 늦추지 않는다.
 */
constexpr unsigned long TICK_MS          = 50;
constexpr unsigned long SENSOR_PERIOD_MS = 500;
constexpr unsigned long RANGE_PERIOD_MS  = 200;   // 초음파는 한 번에 최대 25ms를 잡는다

void netTask(void*) {
  unsigned long lastPoll = 0;
  unsigned long lastCmdPoll = 0;
  unsigned long lastSensorPush = 0;
  unsigned long lastSensorAt = 0;
  unsigned long lastRangeAt = 0;
  unsigned long lastWifiTry = 0;
  unsigned long lastDebugAt = 0;
  bool wasDocked = false;
  bool obstacleNow = false;   // 20cm 안으로 들어왔을 때만 한 번 알린다
  bool irWas = false;

  unsigned long lastSelfTest = millis();

  for (;;) {
    unsigned long now = millis();

#if MOTOR_SELFTEST && MOTOR_SELFTEST_REPEAT_MS > 0
    /*
     * 배선 잡는 동안 계속 돌려본다.
     *
     * 반드시 이 태스크(Core 0) 안에서 돌아야 한다. 얼굴 쪽(Core 1)에서 돌리면
     * 바로 아래 "400ms 안전정지"가 여기서 돌면서 진단 중인 모터를 꺼버린다.
     * 여기서 돌리면 진단이 끝날 때까지 이 루프 자체가 멈춰 있으므로 안 꺼진다.
     */
    if (now - lastSelfTest >= MOTOR_SELFTEST_REPEAT_MS) {
      motorSelfTest();
      lastSelfTest = millis();
      continue;
    }
#endif

    // 명령이 끊기면 정지 — 폰이 꺼져도 로봇이 계속 달리면 안 된다
    if (moving && now - lastCmdAt > CMD_TIMEOUT_MS) {
      stopMotors();
    }

#if HAS_HALL
    // 도킹 감지 → 웹에 알림
    bool docked = digitalRead(PIN_HALL) == LOW;
    if (docked && !wasDocked) sendEvent("docked", "스테이션 도킹 완료");
    wasDocked = docked;
#else
    (void)wasDocked;
#endif

    // IR로 사람이 다가온 것 → 반겨준다
    bool ir = irDetected();
    if (ir && !irWas) {
      sendEvent("owner_near", "주인 감지");
      requestFace(FACE_HAPPY);
    }
    irWas = ir;

    // 초음파 — 20cm 안으로 들어오면 장애물, 30cm 밖으로 나가면 해제.
    // 경계값을 둘로 나눈 이유는 딱 20cm에서 값이 떨릴 때 이벤트가 쏟아지기 때문이다.
    if (now - lastRangeAt >= RANGE_PERIOD_MS) {
      lastRangeAt = now;
      float cm = filteredDistance(readDistanceCm());
      gDistanceCm = cm;          // applyMove가 이걸 보고 전진을 막는다

      if (cm > 0) {
        if (!obstacleNow && cm < OBSTACLE_NEAR_CM) {
          obstacleNow = true;
          sendEvent("obstacle", "앞이 막힘");

          // 앞으로 달리는 중에 뭔가 튀어나온 경우. 다음 MOVE를 기다리지 않고 즉시 세운다.
          // 후진·회전 중이면 건드리지 않는다 — 그게 빠져나오는 동작이다.
          if (moving && gGoingForward) {
            stopMotors();
            Serial.printf("장애물 %.0fcm — 정지\n", cm);
          }
        } else if (obstacleNow && cm > OBSTACLE_FAR_CM) {
          obstacleNow = false;
        }
      }
    }

    if (now - lastSensorAt >= SENSOR_PERIOD_MS) {
      lastSensorAt = now;
      readLightSensors();
      updateSoil();          // 상태가 바뀐 순간에만 로그·이벤트·표정이 나간다
      ws.cleanupClients();
      sendSensors();
    }

#if SENSOR_DEBUG
    // 배선 확인용. 값이 안 변하거나 이상하면 그 센서만 다시 보면 된다.
    if (now - lastDebugAt >= 2000) {
      lastDebugAt = now;
      int raw = gSoilRaw;
      Serial.printf("토양 %4d(%-8s) | 조도 L %6.0f  R %6.0f lx | 거리 %5.1f cm | IR %s | 힙 %u\n",
                    raw, SOIL_TEXT[gSoilState], gLuxL, gLuxR, gDistanceCm,
                    irDetected() ? "감지" : "  - ", ESP.getFreeHeap());
    }
#endif

    // 조종 명령은 자주 가지러 간다. LCD 문구·표정(3초)과 주기가 다르다 —
    // 문구는 몇 초 늦어도 되지만 조종은 손가락에 붙어야 한다.
    if (now - lastCmdPoll >= CMD_POLL_MS) {
      lastCmdPoll = now;
      pollCommand();
    }

    // 실측을 클라우드로. 이게 있어야 배포된 웹에서도 진짜 숫자가 보인다.
    if (now - lastSensorPush >= SENSOR_PUSH_MS) {
      lastSensorPush = now;
      pushSensorsToCloud();
    }

    if (now - lastPoll >= POLL_MS) {
      lastPoll = now;
      pollLcdText();
      pollFace();
    }

    // 에그가 나갔다 들어오면 알아서 다시 붙는다 (30초에 한 번만 시도)
    if (WiFi.status() != WL_CONNECTED && now - lastWifiTry > 30000) {
      lastWifiTry = now;
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }

    vTaskDelay(pdMS_TO_TICKS(TICK_MS));
  }
}

// ============================================================
// 8. Core 1 — 얼굴
// ============================================================

/** 표정 하나를 재생한다. 애니메이션이 끝날 때까지 이 함수는 안 돌아온다. */
void playFace(int id) {
  switch (id) {
    case FACE_HAPPY:    animHappyBounce(); break;
    case FACE_THIRSTY:  animNeedWater();   break;   // 물 말풍선 포함
    case FACE_SLEEPY:   animSleepy();      break;
    case FACE_LOVE:     animKiss();        break;
    case FACE_EXCITED:  animSurprise();    break;
    case FACE_DRINKING: animDrinking();    break;
    case FACE_DIZZY:    animDizzyTired();  break;
    case FACE_NEUTRAL:
    default:            idleWithBlink(600); break;
  }
}

// ============================================================
// 9. SETUP / LOOP
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(1500);   // 없으면 첫 몇 줄이 시리얼 모니터에 안 찍히고 날아간다
  Serial.println();
  Serial.println("========== 스마트팜 통합 펌웨어 ==========");
  Serial.println("[1] 시리얼 정상");

  // --- 모터·펌프를 제일 먼저 안전한 상태로 ---
  // 화면이나 와이파이보다 먼저 해야 한다. 부팅 중에 모터가 튀면 안 된다.
  pinMode(L_IN1, OUTPUT); pinMode(L_IN2, OUTPUT);
  pinMode(R_IN1, OUTPUT); pinMode(R_IN2, OUTPUT);
  // STBY를 3.3V에 직결했으면(-1) 할 일이 없다
  if (STBY >= 0) { pinMode(STBY, OUTPUT); digitalWrite(STBY, HIGH); }
  pinMode(PIN_PUMP, OUTPUT); digitalWrite(PIN_PUMP, LOW);
  setupPwm();
  stopMotors();
  Serial.println("[2] 모터 정지 상태로 초기화");

  // 화면·와이파이보다 먼저 돌린다. 모터 배선만 보려는 건데 와이파이 연결(최대 15초)을
  // 기다릴 이유가 없다. 전원 넣고 2초 안에 결과가 나와야 디버깅이 된다.
  motorSelfTest();

  // --- 센서 핀 ---
  analogReadResolution(12);        // 0~4095. 토양센서 기준값이 이 눈금 기준이다
  pinMode(PIN_SOIL, INPUT);
  pinMode(PIN_IR, INPUT);
  pinMode(PIN_TRIG, OUTPUT); digitalWrite(PIN_TRIG, LOW);
  pinMode(PIN_ECHO, INPUT);
#if HAS_HALL
  pinMode(PIN_HALL, INPUT_PULLUP);
#endif
#if HAS_WATER
  pinMode(PIN_WATER, INPUT);
#endif

  // --- 얼굴(TFT) ---
  // 와이파이보다 먼저. 부팅하자마자 얼굴이 떠야 "켜졌구나"를 안다.
  SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
  tftBegin();

  C_BLACK     = panel565(0,   0,   0);
  C_WHITE     = panel565(255, 255, 255);
  C_PINK      = panel565(255, 88,  145);
  C_PINK_DARK = panel565(215, 45,  105);
  C_CYAN      = panel565(70,  220, 255);
  C_CYAN_SOFT = panel565(140, 235, 255);
  C_YELLOW    = panel565(255, 220, 60);

  tft.fillScreen(C_BLACK);
  randomSeed(micros());
  hideBubble();
  showIdle(0);

  // --- 1602 LCD (I2C) ---
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setTimeOut(50);   // 배선이 잘못돼도 스캔이 영원히 멈추지 않게
  delay(50);

  lcd = new LiquidCrystal_I2C(findLcdAddress(), 16, 2);
  lcd->init();
  lcd->backlight();
  lcd->setCursor(0, 0);
  lcd->print("Connecting...");

  // --- BH1750 2개 (같은 I2C 선) ---
  setupLightSensors();

  // 센서가 살아있는지 부팅 때 한 번 눈으로 확인한다
  readLightSensors();
  gSoilRaw = readSoilRaw();
  gSoilState = soilStateOf(gSoilRaw, SOIL_S_NORMAL);
  int soilRaw = gSoilRaw;
  Serial.printf("[3] 토양 %d (%s) / 조도 L %.0f lx  R %.0f lx / 거리 %.0f cm\n",
                soilRaw, SOIL_TEXT[gSoilState], gLuxL, gLuxR, readDistanceCm());

  // --- 와이파이 (AP + STA) ---
  connectWifi();

  lcd->clear();
  lcd->setCursor(0, 0);
  lcd->print(staConnected ? "Ready" : "AP only");

  // --- WebSocket 서버 ---
  ws.onEvent(onWsEvent);
  server.addHandler(&ws);
  server.begin();
  Serial.println("[5] WebSocket 서버 시작");

  /*
   * 남은 힙을 찍는다. 얼굴 캔버스 4개(약 62KB)에 TLS 핸드셰이크(약 45KB)가
   * 겹치는 순간이 이 펌웨어에서 메모리가 제일 빠듯한 지점이다.
   * 여기 숫자가 60KB 아래로 내려가 있으면 Supabase 폴링이 조용히 실패하기
   * 시작한다 — 그럴 땐 face_anim.h의 말풍선 버퍼부터 줄이면 된다.
   */
  Serial.printf("[6] 남은 힙: %u bytes\n", ESP.getFreeHeap());

  // --- 네트워크 일체를 Core 0으로. 얼굴은 loop()에 남아 Core 1에서 돈다. ---
  xTaskCreatePinnedToCore(netTask, "net", 12288, nullptr, 1, nullptr, 0);
  Serial.println("[7] 준비 완료");
}

/*
 * 얼굴만 담당한다. Core 1.
 *
 * 요청이 들어와 있으면 그 표정을 한 번 재생하고, 아무 일 없으면 눈 깜빡이며
 * 가만히 있다가 가끔 주변을 둘러본다.
 */
void loop() {
  int req = gFaceReq;

  if (req != FACE_NONE) {
    gFaceReq = FACE_NONE;   // 먼저 지운다 — 재생하는 동안 들어온 새 요청을 안 잃는다
    Serial.printf("[표정] %s\n", faceName(req));
    playFace(req);
    return;
  }

#if FACE_DEMO
  /*
   * 요청이 없을 때 가만히 있지 않고 아무 표정이나 하나 골라 재생한다.
   * 와이파이가 끊겨 있어도 얼굴은 계속 움직이므로, 화면이 살아있는지
   * 이것만 보면 안다.
   */
  static const int DEMO_FACES[] = {
    FACE_HAPPY, FACE_THIRSTY, FACE_SLEEPY, FACE_LOVE,
    FACE_EXCITED, FACE_DRINKING, FACE_DIZZY, FACE_NEUTRAL,
  };
  int pick = DEMO_FACES[random(sizeof(DEMO_FACES) / sizeof(DEMO_FACES[0]))];
  Serial.printf("[표정데모] %s\n", faceName(pick));
  playFace(pick);
  return;
#endif

  idleWithBlink(2500);

  // 가끔 두리번거려야 살아있어 보인다
  if (random(100) < 25) animLookAround();
}
