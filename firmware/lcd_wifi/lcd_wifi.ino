/*
 * 웹 → Supabase → ESP32 → LCD
 *
 * 이 스케치 하나만 보면 전체 그림이 이해되게 짰다. 큰 로봇 펌웨어(smartfarm_esp32.ino)와는
 * 별개다 — 먼저 이것부터 따로 띄워서 "웹에서 글자 보내면 LCD에 뜬다"를 확인한 다음,
 * 확인되면 이 폴링 로직을 큰 펌웨어의 loop()에 합치면 된다.
 *
 * ── 필요한 라이브러리 (라이브러리 매니저에서 검색해 설치) ──────────
 *   1. "ArduinoJson"          by Benoit Blanchon   (v7)
 *   2. "LiquidCrystal I2C"    by Frank de Brabander (I2C 1602 LCD용)
 *      ※ 배선이 I2C가 아니라 병렬(RS/E/D4-D7)이면 대신 내장 "LiquidCrystal"을 쓴다.
 *
 * ── 배선 (I2C 1602, PCF8574 백팩 기준) ──────────────────────────
 *   LCD VCC → 5V,  GND → GND,  SDA → GPIO21,  SCL → GPIO22
 *   I2C 주소(0x27 / 0x3F 등)는 스케치가 알아서 찾는다. 따로 스캐너를 돌릴 필요 없다.
 *
 * ── 이 스케치가 하는 일 ────────────────────────────────────────
 *   1. 집 와이파이(공유기)에 접속한다 — ESP32가 SoftAP를 켜는 게 아니라
 *      일반 기기처럼 와이파이에 붙는다. 그래야 인터넷 건너 Supabase에 닿는다.
 *   2. 3초마다 Supabase의 lcd_state 테이블을 REST API로 조회한다.
 *      GET https://<프로젝트>.supabase.co/rest/v1/lcd_state?select=text,updated_at&id=eq.1
 *   3. updated_at이 마지막으로 본 값과 다르면 → 새 글자가 온 것 → LCD에 찍는다.
 *      매번 새로 찍지 않는 이유: LCD를 계속 지웠다 쓰면 눈에 띄게 깜빡인다.
 *
 * Supabase 인증은 "anon key"라는 공개용 API 키 하나만 있으면 된다. 로그인 절차 없음.
 * (schema.sql에서 anon 키에 읽기/쓰기를 열어뒀다 — 해커톤 데모 범위의 설정이다.)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// 와이파이 비밀번호·Supabase 키는 이 파일에 직접 안 적는다 — 여기 적으면 git에
// 그대로 커밋돼서 공개 저장소에 비밀번호가 노출된다. 같은 폴더의 secrets.h
// (.gitignore로 제외됨)에 실제 값이 있고, 없으면 secrets.h.example을 복사해서 만든다.
#include "secrets.h"

/**
 * LCD의 I2C 주소는 모듈마다 다르다(대부분 0x27, 일부 0x3F).
 * 틀리면 아무것도 안 뜨거나 글자가 깨지는데, 초보가 원인 찾기 제일 어려운 지점이라
 * 스케치가 직접 I2C 버스를 훑어서 찾는다. 못 찾으면 0x27로 시도한다.
 * → 별도 I2C Scanner 예제를 돌릴 필요가 없다.
 */
LiquidCrystal_I2C* lcd = nullptr;

uint8_t findLcdAddress() {
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("I2C 장치 발견: 0x%02X\n", addr);
      return addr;
    }
  }
  Serial.println("I2C 장치를 못 찾음 — 배선(SDA=21, SCL=22) 확인 필요. 0x27로 시도합니다.");
  return 0x27;
}

unsigned long lastPoll = 0;
const unsigned long POLL_MS = 3000;   // 너무 자주 부르면 무료 API 호출 한도를 금방 쓴다
String lastUpdatedAt = "";

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("와이파이 연결 중");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("연결됨. IP: ");
  Serial.println(WiFi.localIP());
}

/** LCD 16칸을 넘기면 잘라서 보여준다. 한글은 애초에 웹 쪽에서 걸러 보낸다. */
void showOnLcd(const String& text) {
  lcd->clear();
  lcd->setCursor(0, 0);
  lcd->print(text.substring(0, 16));
  if (text.length() > 16) {
    lcd->setCursor(0, 1);
    lcd->print(text.substring(16, 32));
  }
}

void pollOnce() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
    return;
  }

  WiFiClientSecure client;
  // Supabase 루트 인증서를 기기에 심는 대신 인증서 검증을 건너뛴다.
  // 해커톤/취미 프로젝트에서 흔한 타협이다 — 중간자 공격 방어는 안 되지만
  // (a) 여기서 오가는 데이터가 LCD 문구뿐이고 (b) 배선 검증이 목적이라 감수한다.
  // 제대로 하려면 Supabase의 루트 CA를 받아 setCACert()로 박아야 한다.
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/lcd_state?select=text,updated_at&id=eq.1";
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  int code = http.GET();

  if (code == 200) {
    String body = http.getString();

    // PostgREST는 배열로 응답한다: [{"text":"...", "updated_at":"..."}]
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);
    if (!err && doc.is<JsonArray>() && doc.size() > 0) {
      JsonObject row = doc[0];
      const char* text = row["text"] | "";
      const char* updatedAt = row["updated_at"] | "";

      if (lastUpdatedAt != updatedAt) {
        lastUpdatedAt = updatedAt;
        Serial.printf("새 문구: %s\n", text);
        showOnLcd(String(text));
      }
    } else {
      Serial.println("JSON 파싱 실패 — 응답 형식이 이상함");
    }
  } else {
    Serial.printf("Supabase 호출 실패, HTTP %d\n", code);
    if (code < 0) Serial.println(http.errorToString(code));
  }

  http.end();
}

void setup() {
  Serial.begin(115200);

  Wire.begin();          // 기본 SDA=21, SCL=22. 핀을 바꿨다면 Wire.begin(SDA, SCL)로.
  delay(50);             // I2C 백팩이 깨어날 시간

  lcd = new LiquidCrystal_I2C(findLcdAddress(), 16, 2);
  lcd->init();
  lcd->backlight();
  lcd->setCursor(0, 0);
  lcd->print("Connecting...");

  connectWifi();

  lcd->clear();
  lcd->setCursor(0, 0);
  lcd->print("Ready");
}

void loop() {
  if (millis() - lastPoll >= POLL_MS) {
    lastPoll = millis();
    pollOnce();
  }
}
