/*
 * 살아있는 스마트팜 — ESP32 펌웨어
 * SPEC §9-2 / §9-3 프로토콜 그대로 구현. 웹앱과 짝을 이룬다.
 *
 * 필요한 라이브러리 (라이브러리 매니저에서 설치)
 *   - ESPAsyncWebServer   (me-no-dev)
 *   - AsyncTCP            (me-no-dev, ESP32용)
 *   - ArduinoJson         (bblanchon) v7
 *
 * 보드: ESP32 Dev Module. Arduino-ESP32 코어 3.x 기준으로 썼다.
 *       코어 2.x를 쓰면 ledc API가 다르다 — setupPwm() 주석 참고.
 *
 * 접속: 전원을 켜면 SoftAP "SmartFarm"이 뜬다. 폰/노트북을 여기 연결하면
 *       192.168.4.1 을 받고, 웹앱의 WebSocket 주소칸에 ws://192.168.4.1/ws 를 넣으면 붙는다.
 */

#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

// ─── 핀 배치 ────────────────────────────────────────────────────
// TB6612FNG / L298N 공통 형태: 방향 2핀 + PWM 1핀 per 모터.
// 실제 배선에 맞게 이 숫자만 고치면 된다.
constexpr int L_IN1 = 26;
constexpr int L_IN2 = 27;
constexpr int L_PWM = 14;   // 왼쪽 모터 속도
constexpr int R_IN1 = 32;
constexpr int R_IN2 = 33;
constexpr int R_PWM = 25;   // 오른쪽 모터 속도
constexpr int STBY  = 12;   // TB6612 STBY. L298N이면 이 줄과 관련 코드를 지운다.

constexpr int PIN_CDS      = 34;  // 조도 (ADC1, 입력 전용 핀)
constexpr int PIN_SOIL     = 35;  // 토양 수분 (ADC1)
constexpr int PIN_WATER    = 39;  // 스테이션 워터 센서
constexpr int PIN_HALL     = 13;  // 도킹 감지 홀센서
constexpr int PIN_PUMP     = 4;   // 수중펌프 릴레이

// ─── PWM 설정 ───────────────────────────────────────────────────
constexpr int PWM_FREQ = 20000;  // 20kHz. 가청 대역(수 kHz)이면 모터가 삑삑거린다.
constexpr int PWM_BITS = 8;      // 0-255 — 웹이 보내는 spd 범위와 그대로 맞춘다

/*
 * **작은 DC모터는 PWM이 낮으면 아예 안 돈다.** 정지 마찰을 못 이기고 소리만 난다.
 * 그래서 웹의 0-255를 그대로 쓰지 않고 MIN_DUTY 위로 다시 매핑한다.
 * 모터를 바꾸면 이 값을 다시 잡아야 한다 — 천천히 올리며 도는 최소값 + 10 정도.
 */
constexpr int MIN_DUTY = 70;
constexpr int MAX_DUTY = 255;

/*
 * **안전장치.** 웹은 버튼을 누르는 동안 150ms마다 MOVE를 보낸다.
 * 폰이 꺼지거나 와이파이가 끊기면 마지막 MOVE 상태로 로봇이 계속 달린다.
 * 이 시간 동안 새 명령이 없으면 무조건 멈춘다.
 */
constexpr unsigned long CMD_TIMEOUT_MS = 400;

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

unsigned long lastCmdAt = 0;
bool moving = false;
unsigned long lastSensorAt = 0;
constexpr unsigned long SENSOR_PERIOD_MS = 500;

// ─── 모터 ───────────────────────────────────────────────────────

void setupPwm() {
  // Arduino-ESP32 코어 3.x
  ledcAttach(L_PWM, PWM_FREQ, PWM_BITS);
  ledcAttach(R_PWM, PWM_FREQ, PWM_BITS);

  // 코어 2.x라면 위 두 줄 대신 아래를 쓴다:
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
 * SPEC §9-2의 dir 값을 차동구동으로 푼다.
 *   F/B  전진·후진
 *   L/R  달리면서 도는 완만한 선회 (안쪽 바퀴를 40%로)
 *   SL/SR 제자리 회전 (양 바퀴 반대로)
 */
void applyMove(const char* dir, int spd) {
  if (!strcmp(dir, "F"))       drive(spd, spd);
  else if (!strcmp(dir, "B"))  drive(-spd, -spd);
  else if (!strcmp(dir, "L"))  drive(spd * 0.4, spd);
  else if (!strcmp(dir, "R"))  drive(spd, spd * 0.4);
  else if (!strcmp(dir, "SL")) drive(-spd, spd);
  else if (!strcmp(dir, "SR")) drive(spd, -spd);
  else                         stopMotors();   // "STOP" 및 알 수 없는 값

  lastCmdAt = millis();
}

// ─── 표정 / LED / 동작 ──────────────────────────────────────────
// OLED와 네오픽셀은 담당자가 채운다. 프로토콜 진입점만 열어둔다.

void applyFace(const char* face) {
  // TODO: OLED에 표정 그리기 — neutral|happy|thirsty|sleepy|love|excited
  Serial.printf("FACE %s\n", face);
}

void applyLed(int r, int g, int b, const char* mode) {
  // TODO: 네오픽셀 링 — solid|breathe|rainbow|off
  Serial.printf("LED %d,%d,%d %s\n", r, g, b, mode);
}

void applyAct(const char* act) {
  // greet|drink|sound|spin
  if (!strcmp(act, "spin")) {
    drive(200, -200);
    delay(600);          // 짧은 동작이라 delay로 충분하다
    stopMotors();
  } else if (!strcmp(act, "drink")) {
    digitalWrite(PIN_PUMP, HIGH);
    delay(1500);
    digitalWrite(PIN_PUMP, LOW);
  }
  Serial.printf("ACT %s\n", act);
}

// ─── 센서 송신 (SPEC §9-3) ──────────────────────────────────────

void sendSensors() {
  // 아날로그 원시값을 %로. 실제 센서 특성에 맞게 보정 구간을 잡아야 한다.
  int soilRaw = analogRead(PIN_SOIL);
  int cdsRaw  = analogRead(PIN_CDS);

  JsonDocument doc;
  doc["type"]      = "sensor";
  doc["moisture"]  = map(constrain(soilRaw, 1200, 3200), 3200, 1200, 0, 100);  // 젖을수록 값 하강
  doc["nutrient"]  = 72;                       // 전용 센서 없음 — 고정값
  doc["lux"]       = map(cdsRaw, 0, 4095, 0, 2000);
  doc["temp"]      = 24.2;                     // TODO: DHT/SHT 센서 값
  doc["humidity"]  = 48;                       // TODO
  doc["battery"]   = 88;                       // TODO: 전압 분배 후 ADC
  doc["waterTank"] = digitalRead(PIN_WATER) ? 80 : 15;

  String out;
  serializeJson(doc, out);
  ws.textAll(out);
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

// ─── WebSocket 수신 (SPEC §9-2) ─────────────────────────────────

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
    // 자율/수동 전환. 자율 로직을 ESP32에 둘 거면 여기서 플래그를 잡는다.
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

// ─── 셋업 / 루프 ────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);

  pinMode(L_IN1, OUTPUT); pinMode(L_IN2, OUTPUT);
  pinMode(R_IN1, OUTPUT); pinMode(R_IN2, OUTPUT);
  pinMode(STBY, OUTPUT);  digitalWrite(STBY, HIGH);   // TB6612 활성화
  pinMode(PIN_PUMP, OUTPUT); digitalWrite(PIN_PUMP, LOW);
  pinMode(PIN_HALL, INPUT_PULLUP);
  pinMode(PIN_WATER, INPUT);

  setupPwm();
  stopMotors();

  // 현장에 인터넷이 없어도 되도록 SoftAP로 뜬다 (SPEC §16)
  WiFi.softAP("SmartFarm", "smartfarm1234");
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());   // 보통 192.168.4.1

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);
  server.begin();
}

void loop() {
  ws.cleanupClients();

  // 명령이 끊기면 정지 — 폰이 꺼져도 로봇이 계속 달리면 안 된다
  if (moving && millis() - lastCmdAt > CMD_TIMEOUT_MS) {
    stopMotors();
  }

  if (millis() - lastSensorAt > SENSOR_PERIOD_MS) {
    lastSensorAt = millis();
    sendSensors();
  }

  // 도킹 감지 → 웹에 알림
  static bool wasDocked = false;
  bool docked = digitalRead(PIN_HALL) == LOW;
  if (docked && !wasDocked) sendEvent("docked", "스테이션 도킹 완료");
  wasDocked = docked;
}
