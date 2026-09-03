/*
 * 얼굴 애니메이션 — 팀원 작성 코드 (face_tft.ino) 그대로.
 *
 * 이 파일은 손대지 않는다. 새 표정을 추가하고 싶으면 여기 anim*() 함수를 하나 더
 * 만들고, smartfarm_robot.ino의 playFace()에 한 줄 연결하면 된다.
 *
 * delay()가 잔뜩 들어있는데 그대로 둬도 된다 — 이 코드는 Core 1의 loop()에서만
 * 돌고, 네트워크·모터는 Core 0의 별도 태스크에서 돌기 때문에 서로 안 막는다.
 *
 * 이 파일이 기대하는 것 (smartfarm_robot.ino가 먼저 정의해준다):
 *   - tft 객체, TFT_* 핀, PANEL_COLOR_COMPLEMENT
 *   - Adafruit_GFX / SPI / math.h
 */
#pragma once


// ---------------- SCREEN ----------------
constexpr int SCREEN_W = 320;
constexpr int SCREEN_H = 240;

// ---------------- FACE BUFFERS ----------------
constexpr int EYE_BUF_W = 96;
constexpr int EYE_BUF_H = 94;

constexpr int MOUTH_BUF_W = 96;
constexpr int MOUTH_BUF_H = 76;

constexpr int BUBBLE_BUF_W = 104;
constexpr int BUBBLE_BUF_H = 54;

constexpr int LEFT_EYE_SCREEN_X  = 48;
constexpr int RIGHT_EYE_SCREEN_X = 176;
constexpr int EYE_SCREEN_Y       = 52;

constexpr int MOUTH_SCREEN_X = 112;
constexpr int MOUTH_SCREEN_Y = 152;

constexpr int BUBBLE_SCREEN_X = 108;
constexpr int BUBBLE_SCREEN_Y = 0;

GFXcanvas16 leftEyeBuf(EYE_BUF_W, EYE_BUF_H);
GFXcanvas16 rightEyeBuf(EYE_BUF_W, EYE_BUF_H);
GFXcanvas16 mouthBuf(MOUTH_BUF_W, MOUTH_BUF_H);
GFXcanvas16 bubbleBuf(BUBBLE_BUF_W, BUBBLE_BUF_H);

// ---------------- COLORS ----------------
uint16_t C_BLACK;
uint16_t C_WHITE;
uint16_t C_PINK;
uint16_t C_PINK_DARK;
uint16_t C_CYAN;
uint16_t C_CYAN_SOFT;
uint16_t C_YELLOW;

constexpr int FRAME_MS = 36;

uint16_t panel565(uint8_t r, uint8_t g, uint8_t b) {
  if (PANEL_COLOR_COMPLEMENT) {
    r = 255 - r;
    g = 255 - g;
    b = 255 - b;
  }
  return tft.color565(r, g, b);
}

float clamp01(float v) {
  if (v < 0.0f) return 0.0f;
  if (v > 1.0f) return 1.0f;
  return v;
}

float smoothStep(float t) {
  t = clamp01(t);
  return t * t * (3.0f - 2.0f * t);
}

float rad(float deg) {
  return deg * 0.01745329251994329577f;
}

void fillEllipse(GFXcanvas16 &c,
                 int cx, int cy,
                 int rx, int ry,
                 uint16_t color) {
  if (rx <= 0 || ry <= 0) return;

  for (int y = -ry; y <= ry; y++) {
    float fy = (float)y / (float)ry;
    float q = 1.0f - fy * fy;
    if (q < 0.0f) q = 0.0f;

    int x = (int)roundf(rx * sqrtf(q));
    c.drawFastHLine(cx - x, cy + y, x * 2 + 1, color);
  }
}

void ellipseRing(GFXcanvas16 &c,
                 int cx, int cy,
                 int outerRX, int outerRY,
                 int innerRX, int innerRY,
                 uint16_t color,
                 int innerOffsetX = 0,
                 int innerOffsetY = 0) {
  fillEllipse(c, cx, cy, outerRX, outerRY, color);
  fillEllipse(c,
              cx + innerOffsetX,
              cy + innerOffsetY,
              innerRX, innerRY,
              C_BLACK);
}

void thickLine(GFXcanvas16 &c,
               int x1, int y1,
               int x2, int y2,
               int thickness,
               uint16_t color) {
  float dx = x2 - x1;
  float dy = y2 - y1;
  float len = sqrtf(dx * dx + dy * dy);

  if (len < 0.1f) {
    c.fillCircle(x1, y1, max(1, thickness / 2), color);
    return;
  }

  float nx = -dy / len;
  float ny = dx / len;
  int half = thickness / 2;

  for (int i = -half; i <= half; i++) {
    int ox = (int)roundf(nx * i);
    int oy = (int)roundf(ny * i);

    c.drawLine(
      x1 + ox, y1 + oy,
      x2 + ox, y2 + oy,
      color
    );
  }

  c.fillCircle(x1, y1, half, color);
  c.fillCircle(x2, y2, half, color);
}

void arcEllipse(GFXcanvas16 &c,
                int cx, int cy,
                int rx, int ry,
                float startDeg,
                float endDeg,
                int thickness,
                uint16_t color) {
  constexpr int SEG = 28;

  for (int i = 0; i < SEG; i++) {
    float p1 = (float)i / SEG;
    float p2 = (float)(i + 1) / SEG;

    float a1 = startDeg + (endDeg - startDeg) * p1;
    float a2 = startDeg + (endDeg - startDeg) * p2;

    int x1 = cx + (int)roundf(cosf(rad(a1)) * rx);
    int y1 = cy + (int)roundf(sinf(rad(a1)) * ry);

    int x2 = cx + (int)roundf(cosf(rad(a2)) * rx);
    int y2 = cy + (int)roundf(sinf(rad(a2)) * ry);

    thickLine(c, x1, y1, x2, y2, thickness, color);
  }
}

void drawWaterDrop(GFXcanvas16 &c,
                   int cx, int cy,
                   int size,
                   uint16_t color) {
  c.fillCircle(cx, cy + size / 3, size, color);
  c.fillTriangle(
    cx,
    cy - size - size / 2,
    cx - size + 1,
    cy + size / 3,
    cx + size - 1,
    cy + size / 3,
    color
  );
}

void pushLeftEye() {
  tft.drawRGBBitmap(
    LEFT_EYE_SCREEN_X,
    EYE_SCREEN_Y,
    leftEyeBuf.getBuffer(),
    EYE_BUF_W,
    EYE_BUF_H
  );
}

void pushRightEye() {
  tft.drawRGBBitmap(
    RIGHT_EYE_SCREEN_X,
    EYE_SCREEN_Y,
    rightEyeBuf.getBuffer(),
    EYE_BUF_W,
    EYE_BUF_H
  );
}

void pushMouth() {
  tft.drawRGBBitmap(
    MOUTH_SCREEN_X,
    MOUTH_SCREEN_Y,
    mouthBuf.getBuffer(),
    MOUTH_BUF_W,
    MOUTH_BUF_H
  );
}

void pushBubble() {
  tft.drawRGBBitmap(
    BUBBLE_SCREEN_X,
    BUBBLE_SCREEN_Y,
    bubbleBuf.getBuffer(),
    BUBBLE_BUF_W,
    BUBBLE_BUF_H
  );
}

void pushFace() {
  pushLeftEye();
  pushRightEye();
  pushMouth();
}

void hideBubble() {
  bubbleBuf.fillScreen(C_BLACK);
  pushBubble();
}

enum EyeType : int {
  EYE_RING,
  EYE_CHEVRON,
  EYE_CLOSED,
  EYE_HAPPY,
  EYE_SLEEPY,
  EYE_TIRED,
  EYE_SPIRAL,
  EYE_ANNOYED,
  EYE_NARROW
};

void clearEyeBuffers() {
  leftEyeBuf.fillScreen(C_BLACK);
  rightEyeBuf.fillScreen(C_BLACK);
}

void drawRingEye(GFXcanvas16 &c,
                 float scaleY = 1.0f,
                 int gazeX = 0,
                 int gazeY = 0) {
  int cx = EYE_BUF_W / 2;
  int cy = EYE_BUF_H / 2;

  int outerRX = 34;
  int outerRY = max(4, (int)roundf(37.0f * scaleY));

  int innerRX = 19;
  int innerRY = max(2, (int)roundf(23.0f * scaleY));

  gazeX = constrain(gazeX, -8, 8);
  gazeY = constrain(gazeY, -6, 6);

  ellipseRing(
    c,
    cx, cy,
    outerRX, outerRY,
    innerRX, innerRY,
    C_WHITE,
    gazeX, gazeY
  );
}

void drawChevronEye(GFXcanvas16 &c, bool leftSide) {
  int cx = EYE_BUF_W / 2;
  int cy = EYE_BUF_H / 2;

  if (leftSide) {
    thickLine(c, cx - 25, cy - 18, cx + 12, cy, 9, C_WHITE);
    thickLine(c, cx + 12, cy, cx - 25, cy + 18, 9, C_WHITE);
  } else {
    thickLine(c, cx + 25, cy - 18, cx - 12, cy, 9, C_WHITE);
    thickLine(c, cx - 12, cy, cx + 25, cy + 18, 9, C_WHITE);
  }
}

void drawClosedEye(GFXcanvas16 &c) {
  int cx = EYE_BUF_W / 2;
  int cy = EYE_BUF_H / 2;

  arcEllipse(c, cx, cy + 9, 31, 18, 205, 335, 8, C_WHITE);
}

void drawHappyEye(GFXcanvas16 &c) {
  int cx = EYE_BUF_W / 2;
  int cy = EYE_BUF_H / 2;

  arcEllipse(c, cx, cy + 10, 30, 20, 205, 335, 9, C_WHITE);
}

void drawSleepyEye(GFXcanvas16 &c) {
  int cx = EYE_BUF_W / 2;
  int cy = EYE_BUF_H / 2;

  ellipseRing(c, cx, cy, 33, 11, 28, 6, C_WHITE);

  thickLine(c, cx - 18, cy + 8, cx - 18, cy + 17, 4, C_WHITE);
  thickLine(c, cx - 7,  cy + 8, cx - 7,  cy + 15, 4, C_WHITE);
  thickLine(c, cx + 17, cy + 8, cx + 17, cy + 16, 4, C_WHITE);
}

void drawTiredEye(GFXcanvas16 &c) {
  int cx = EYE_BUF_W / 2;
  int cy = EYE_BUF_H / 2;

  c.fillRoundRect(cx - 30, cy - 7, 60, 13, 6, C_WHITE);
  c.fillRoundRect(cx - 9, cy + 3, 18, 14, 5, C_WHITE);
}

void drawNarrowEye(GFXcanvas16 &c, int gazeX = 0) {
  int cx = EYE_BUF_W / 2;
  int cy = EYE_BUF_H / 2;

  ellipseRing(
    c,
    cx, cy,
    34, 15,
    24, 7,
    C_WHITE,
    constrain(gazeX, -7, 7), 0
  );
}

void drawAnnoyedEye(GFXcanvas16 &c, bool leftSide) {
  int cx = EYE_BUF_W / 2;
  int cy = EYE_BUF_H / 2 + 5;

  fillEllipse(c, cx, cy, 34, 15, C_WHITE);

  int pupilOffset = leftSide ? 5 : -5;
  fillEllipse(c, cx + pupilOffset, cy + 3, 23, 7, C_BLACK);

  if (leftSide) {
    thickLine(c, 14, 25, 80, 40, 9, C_BLACK);
    thickLine(c, 15, 23, 78, 38, 5, C_WHITE);
  } else {
    thickLine(c, 82, 25, 16, 40, 9, C_BLACK);
    thickLine(c, 81, 23, 18, 38, 5, C_WHITE);
  }
}

void drawSpiralEye(GFXcanvas16 &c, float phase) {
  int cx = EYE_BUF_W / 2;
  int cy = EYE_BUF_H / 2;

  constexpr int POINTS = 52;
  constexpr float MAX_R = 30.0f;
  constexpr float TURNS = 2.2f;

  int px = cx;
  int py = cy;

  for (int i = 0; i < POINTS; i++) {
    float p = (float)i / (POINTS - 1);
    float rr = MAX_R * (1.0f - 0.78f * p);
    float a = p * TURNS * 2.0f * PI + phase;

    int x = cx + (int)roundf(cosf(a) * rr);
    int y = cy + (int)roundf(sinf(a) * rr * 0.90f);

    if (i > 0) {
      thickLine(c, px, py, x, y, 6, C_WHITE);
    }

    px = x;
    py = y;
  }
}

void drawOneEye(GFXcanvas16 &c,
                EyeType type,
                bool leftSide,
                float scaleY,
                int gazeX,
                int gazeY,
                float spiralPhase) {
  switch (type) {
    case EYE_RING:
      drawRingEye(c, scaleY, gazeX, gazeY);
      break;

    case EYE_CHEVRON:
      drawChevronEye(c, leftSide);
      break;

    case EYE_CLOSED:
      drawClosedEye(c);
      break;

    case EYE_HAPPY:
      drawHappyEye(c);
      break;

    case EYE_SLEEPY:
      drawSleepyEye(c);
      break;

    case EYE_TIRED:
      drawTiredEye(c);
      break;

    case EYE_SPIRAL:
      drawSpiralEye(c, leftSide ? spiralPhase : -spiralPhase);
      break;

    case EYE_ANNOYED:
      drawAnnoyedEye(c, leftSide);
      break;

    case EYE_NARROW:
      drawNarrowEye(c, gazeX);
      break;
  }
}

void renderEyes(EyeType leftType,
                EyeType rightType,
                float leftScaleY = 1.0f,
                float rightScaleY = 1.0f,
                int gazeX = 0,
                int gazeY = 0,
                float spiralPhase = 0.0f) {

  clearEyeBuffers();

  drawOneEye(
    leftEyeBuf,
    leftType,
    true,
    leftScaleY,
    gazeX,
    gazeY,
    spiralPhase
  );

  drawOneEye(
    rightEyeBuf,
    rightType,
    false,
    rightScaleY,
    gazeX,
    gazeY,
    spiralPhase
  );
}

enum MouthType : int {
  MOUTH_SMILE,
  MOUTH_BIG_SMILE,
  MOUTH_DOT,
  MOUTH_TONGUE,
  MOUTH_LONG,
  MOUTH_TRIANGLE,
  MOUTH_O,
  MOUTH_KISS,
  MOUTH_FLAT,
  MOUTH_CROOKED
};

void clearMouth() {
  mouthBuf.fillScreen(C_BLACK);
}

void mouthSmile() {
  int cx = MOUTH_BUF_W / 2;
  arcEllipse(mouthBuf, cx, 25, 14, 9, 18, 162, 5, C_PINK);
}

void mouthBigSmile() {
  int cx = MOUTH_BUF_W / 2;

  arcEllipse(mouthBuf, cx, 28, 22, 14, 15, 165, 7, C_PINK);
  fillEllipse(mouthBuf, cx, 38, 9, 4, C_PINK_DARK);
}

void mouthDot() {
  fillEllipse(mouthBuf, MOUTH_BUF_W / 2, 28, 7, 5, C_PINK);
}

void mouthTongue() {
  int cx = MOUTH_BUF_W / 2;
  int cy = 23;

  mouthBuf.fillCircle(cx, cy - 3, 9, C_PINK);
  mouthBuf.fillRect(cx - 9, cy - 3, 18, 18, C_PINK);

  mouthBuf.fillTriangle(
    cx - 9, cy + 15,
    cx + 9, cy + 15,
    cx, cy + 24,
    C_PINK
  );

  thickLine(mouthBuf, cx, cy + 12, cx, cy + 19, 2, C_PINK_DARK);
}

void mouthLong(int height = 52) {
  int cx = MOUTH_BUF_W / 2;
  int cy = MOUTH_BUF_H / 2;

  height = constrain(height, 22, 58);

  int w = 20;
  int r = w / 2;
  int body = max(0, height - w);

  mouthBuf.fillRect(cx - r, cy - body / 2, w, body, C_PINK);
  mouthBuf.fillCircle(cx, cy - body / 2, r, C_PINK);
  mouthBuf.fillCircle(cx, cy + body / 2, r, C_PINK);

  fillEllipse(
    mouthBuf,
    cx,
    cy + height / 4,
    7, 4,
    C_PINK_DARK
  );
}

void mouthTriangle() {
  int cx = MOUTH_BUF_W / 2;
  int cy = 27;

  mouthBuf.fillTriangle(
    cx, cy - 10,
    cx - 14, cy + 8,
    cx + 14, cy + 8,
    C_PINK
  );
}

void mouthO() {
  ellipseRing(
    mouthBuf,
    MOUTH_BUF_W / 2,
    29,
    9, 13,
    4, 7,
    C_PINK
  );
}

void mouthKiss() {
  int cx = MOUTH_BUF_W / 2;
  int cy = 27;

  arcEllipse(mouthBuf, cx - 2, cy - 6, 8, 8, 280, 80, 4, C_PINK);
  arcEllipse(mouthBuf, cx - 2, cy + 7, 8, 8, 280, 80, 4, C_PINK);
}

void mouthFlat() {
  int cx = MOUTH_BUF_W / 2;
  thickLine(mouthBuf, cx - 15, 30, cx + 15, 30, 5, C_PINK);
}

void mouthCrooked() {
  int cx = MOUTH_BUF_W / 2;

  thickLine(mouthBuf, cx - 18, 27, cx - 2, 24, 5, C_PINK);
  thickLine(mouthBuf, cx - 2, 24, cx + 16, 31, 5, C_PINK);
}

void renderMouth(MouthType type, int param = 52) {
  clearMouth();

  switch (type) {
    case MOUTH_SMILE:      mouthSmile(); break;
    case MOUTH_BIG_SMILE:  mouthBigSmile(); break;
    case MOUTH_DOT:        mouthDot(); break;
    case MOUTH_TONGUE:     mouthTongue(); break;
    case MOUTH_LONG:       mouthLong(param); break;
    case MOUTH_TRIANGLE:   mouthTriangle(); break;
    case MOUTH_O:          mouthO(); break;
    case MOUTH_KISS:       mouthKiss(); break;
    case MOUTH_FLAT:       mouthFlat(); break;
    case MOUTH_CROOKED:    mouthCrooked(); break;
  }
}

void renderSipMouth(int dropY, bool openWide) {
  clearMouth();

  int cx = MOUTH_BUF_W / 2;

  if (dropY >= 0) {
    drawWaterDrop(
      mouthBuf,
      cx,
      dropY,
      6,
      C_CYAN
    );
  }

  if (openWide) {
    ellipseRing(
      mouthBuf,
      cx,
      48,
      10, 12,
      4, 6,
      C_PINK
    );
  } else {
    ellipseRing(
      mouthBuf,
      cx,
      48,
      7, 9,
      3, 4,
      C_PINK
    );
  }
}

void drawHangulMul(GFXcanvas16 &c) {
  const int x = 61;
  const int y = 7;
  const int T = 3;

  // ㅁ
  thickLine(c, x,      y,      x + 24, y,      T, C_CYAN);
  thickLine(c, x,      y,      x,      y + 14, T, C_CYAN);
  thickLine(c, x + 24, y,      x + 24, y + 14, T, C_CYAN);
  thickLine(c, x,      y + 14, x + 24, y + 14, T, C_CYAN);

  // ㅜ
  thickLine(c, x - 2,  y + 23, x + 26, y + 23, T, C_CYAN);
  thickLine(c, x + 12, y + 23, x + 12, y + 31, T, C_CYAN);

  // ㄹ
  thickLine(c, x,      y + 38, x + 24, y + 38, T, C_CYAN);
  thickLine(c, x,      y + 38, x,      y + 43, T, C_CYAN);
  thickLine(c, x,      y + 43, x + 24, y + 43, T, C_CYAN);
  thickLine(c, x + 24, y + 43, x + 24, y + 48, T, C_CYAN);
  thickLine(c, x,      y + 48, x + 24, y + 48, T, C_CYAN);
}

void renderWaterBubble(bool pulse = false) {
  bubbleBuf.fillScreen(C_BLACK);

  uint16_t border = pulse ? C_CYAN : C_WHITE;

  bubbleBuf.drawRoundRect(
    4, 3,
    BUBBLE_BUF_W - 9,
    BUBBLE_BUF_H - 13,
    11,
    border
  );

  bubbleBuf.drawRoundRect(
    6, 5,
    BUBBLE_BUF_W - 13,
    BUBBLE_BUF_H - 17,
    9,
    border
  );

  bubbleBuf.fillTriangle(
    45, 41,
    57, 41,
    51, 52,
    border
  );

  bubbleBuf.fillTriangle(
    48, 40,
    54, 40,
    51, 47,
    C_BLACK
  );

  drawWaterDrop(
    bubbleBuf,
    29, 25,
    pulse ? 10 : 8,
    C_CYAN
  );

  drawHangulMul(bubbleBuf);
}

void showIdle(int waitMs = FRAME_MS, int gazeX = 0, int gazeY = 0) {
  renderEyes(EYE_RING, EYE_RING, 1.0f, 1.0f, gazeX, gazeY);
  renderMouth(MOUTH_SMILE);
  pushFace();
  delay(waitMs);
}

void showHappy(int waitMs = FRAME_MS) {
  renderEyes(EYE_HAPPY, EYE_HAPPY);
  renderMouth(MOUTH_BIG_SMILE);
  pushFace();
  delay(waitMs);
}

void showAnnoyed(int waitMs = FRAME_MS) {
  renderEyes(EYE_ANNOYED, EYE_ANNOYED);
  renderMouth(MOUTH_CROOKED);
  pushFace();
  delay(waitMs);
}

void showSurprised(int waitMs = FRAME_MS) {
  renderEyes(EYE_RING, EYE_RING, 1.08f, 1.08f);
  renderMouth(MOUTH_O);
  pushFace();
  delay(waitMs);
}

void showSleepy(int waitMs = FRAME_MS) {
  renderEyes(EYE_SLEEPY, EYE_SLEEPY);
  renderMouth(MOUTH_TRIANGLE);
  pushFace();
  delay(waitMs);
}

void showTired(int waitMs = FRAME_MS) {
  renderEyes(EYE_TIRED, EYE_TIRED);
  renderMouth(MOUTH_FLAT);
  pushFace();
  delay(waitMs);
}

void blinkOnce() {
  constexpr int N = 6;

  for (int i = 0; i < N; i++) {
    float t = smoothStep((float)i / (N - 1));
    float sy = 1.0f - 0.84f * t;

    renderEyes(EYE_RING, EYE_RING, sy, sy);
    renderMouth(MOUTH_SMILE);
    pushFace();

    delay(27);
  }

  for (int i = N - 1; i >= 0; i--) {
    float t = smoothStep((float)i / (N - 1));
    float sy = 1.0f - 0.84f * t;

    renderEyes(EYE_RING, EYE_RING, sy, sy);
    renderMouth(MOUTH_SMILE);
    pushFace();

    delay(27);
  }
}

void animLookAround() {
  showIdle(220);

  for (int x = 0; x >= -8; x -= 2) {
    showIdle(48, x, 0);
  }
  delay(380);

  for (int x = -8; x <= 8; x += 2) {
    showIdle(45, x, 0);
  }
  delay(380);

  for (int y = 0; y >= -5; y--) {
    showIdle(42, 4, y);
  }
  delay(260);

  for (int y = -5; y <= 0; y++) {
    showIdle(42, 0, y);
  }

  showIdle(180);
}

void animHappyBounce() {
  for (int i = 0; i < 5; i++) {
    float t = smoothStep((float)i / 4.0f);
    float sy = 1.0f - 0.80f * t;

    renderEyes(EYE_RING, EYE_RING, sy, sy);

    if (i < 2) renderMouth(MOUTH_SMILE);
    else renderMouth(MOUTH_BIG_SMILE);

    pushFace();
    delay(35);
  }

  for (int i = 0; i < 26; i++) {
    showHappy(45);
  }

  for (int i = 0; i < 6; i++) {
    float t = smoothStep((float)i / 5.0f);
    float sy = 0.18f + 0.82f * t;

    renderEyes(EYE_RING, EYE_RING, sy, sy);

    if (i < 3) renderMouth(MOUTH_BIG_SMILE);
    else renderMouth(MOUTH_SMILE);

    pushFace();
    delay(35);
  }
}

void animWink() {
  for (int i = 0; i < 6; i++) {
    float t = smoothStep((float)i / 5.0f);
    float sy = 1.0f - 0.84f * t;

    renderEyes(EYE_RING, EYE_RING, sy, 1.0f);

    if (i < 3) renderMouth(MOUTH_SMILE);
    else renderMouth(MOUTH_TONGUE);

    pushFace();
    delay(32);
  }

  for (int i = 0; i < 22; i++) {
    renderEyes(EYE_CHEVRON, EYE_RING);
    renderMouth(MOUTH_TONGUE);
    pushFace();
    delay(46);
  }

  for (int i = 0; i < 6; i++) {
    float t = smoothStep((float)i / 5.0f);
    float sy = 0.18f + 0.82f * t;

    renderEyes(EYE_RING, EYE_RING, sy, 1.0f);

    if (i < 3) renderMouth(MOUTH_TONGUE);
    else renderMouth(MOUTH_SMILE);

    pushFace();
    delay(32);
  }
}

void animKiss() {
  for (int i = 0; i < 6; i++) {
    float t = smoothStep((float)i / 5.0f);
    float sy = 1.0f - 0.84f * t;

    renderEyes(EYE_RING, EYE_RING, sy, 1.0f);

    if (i < 3) renderMouth(MOUTH_SMILE);
    else renderMouth(MOUTH_KISS);

    pushFace();
    delay(34);
  }

  for (int i = 0; i < 25; i++) {
    renderEyes(EYE_CLOSED, EYE_RING);
    renderMouth(MOUTH_KISS);
    pushFace();
    delay(48);
  }

  showIdle(180);
}

void animSurprise() {
  showSurprised(550);

  blinkOnce();

  showSurprised(420);
  showIdle(180);
}

void animSmug() {
  for (int i = 0; i < 22; i++) {
    renderEyes(EYE_NARROW, EYE_NARROW, 1, 1, 4, 0);
    renderMouth(MOUTH_CROOKED);
    pushFace();
    delay(48);
  }

  for (int gx = 5; gx >= -5; gx--) {
    renderEyes(EYE_NARROW, EYE_NARROW, 1, 1, gx, 0);
    renderMouth(MOUTH_CROOKED);
    pushFace();
    delay(40);
  }

  showIdle(180);
}

void animSleepy() {
  for (int i = 0; i < 6; i++) {
    float t = smoothStep((float)i / 5.0f);
    float sy = 1.0f - 0.80f * t;

    renderEyes(EYE_RING, EYE_RING, sy, sy);

    if (i < 3) renderMouth(MOUTH_SMILE);
    else renderMouth(MOUTH_TRIANGLE);

    pushFace();
    delay(36);
  }

  for (int i = 0; i < 28; i++) {
    showSleepy(50);
  }

  showIdle(180);
}

void animNeedWater() {
  hideBubble();

  for (int i = 0; i < 8; i++) {
    float t = smoothStep((float)i / 7.0f);

    if (i < 4) {
      renderEyes(
        EYE_RING,
        EYE_RING,
        1.0f - 0.58f * t,
        1.0f - 0.58f * t,
        0, 2
      );
      renderMouth(MOUTH_FLAT);
    } else {
      renderEyes(EYE_ANNOYED, EYE_ANNOYED);
      renderMouth(MOUTH_CROOKED);
    }

    pushFace();
    delay(50);
  }

  for (int i = 0; i < 3; i++) {
    renderWaterBubble(i % 2 == 0);
    pushBubble();
    showAnnoyed(180);
  }

  for (int i = 0; i < 30; i++) {
    bool pulse = ((i / 6) % 2) == 0;

    renderWaterBubble(pulse);
    pushBubble();

    if ((i / 8) % 2 == 0) {
      renderEyes(EYE_ANNOYED, EYE_ANNOYED);
    } else {
      renderEyes(EYE_NARROW, EYE_NARROW, 1, 1, 4, 0);
    }

    renderMouth(MOUTH_CROOKED);
    pushFace();

    delay(65);
  }

  hideBubble();   // 애니메이션 끝나면 말풍선도 같이 지운다 — 안 그러면 idle로 돌아가도 화면에 계속 남는다
}

void animDrinking() {
  hideBubble();

  for (int i = 0; i < 7; i++) {
    float t = smoothStep((float)i / 6.0f);

    if (i < 3) {
      renderEyes(EYE_ANNOYED, EYE_ANNOYED);
      renderMouth(MOUTH_CROOKED);
    } else {
      float sy = 0.45f + 0.55f * t;

      renderEyes(
        EYE_RING,
        EYE_RING,
        sy, sy,
        0, 4
      );

      renderMouth(MOUTH_O);
    }

    pushFace();
    delay(45);
  }

  for (int sip = 0; sip < 4; sip++) {

    for (int y = 5; y <= 29; y += 3) {
      renderEyes(
        EYE_RING,
        EYE_RING,
        1.0f, 1.0f,
        0, 5
      );

      renderSipMouth(y, (y > 20));
      pushFace();

      delay(42);
    }

    for (int k = 0; k < 5; k++) {
      renderEyes(
        EYE_NARROW,
        EYE_NARROW,
        1, 1,
        0, 0
      );

      renderSipMouth(-1, (k % 2 == 0));
      pushFace();

      delay(55);
    }

    showSurprised(120);
  }

  for (int i = 0; i < 8; i++) {
    float t = smoothStep((float)i / 7.0f);

    if (i < 3) {
      renderEyes(EYE_RING, EYE_RING, 1.0f, 1.0f, 0, 3);
      renderMouth(MOUTH_O);
    } else {
      renderEyes(EYE_HAPPY, EYE_HAPPY);
      renderMouth(MOUTH_BIG_SMILE);
    }

    pushFace();
    delay(45);
  }

  for (int i = 0; i < 28; i++) {
    renderEyes(EYE_HAPPY, EYE_HAPPY);

    if ((i / 7) % 2 == 0) {
      renderMouth(MOUTH_BIG_SMILE);
    } else {
      renderMouth(MOUTH_TONGUE);
    }

    pushFace();
    delay(55);
  }

  showIdle(300);
}

void animDizzyTired() {
  for (int i = 0; i < 28; i++) {
    float phase = i * 0.14f;

    renderEyes(
      EYE_SPIRAL,
      EYE_SPIRAL,
      1, 1,
      0, 0,
      phase
    );

    if ((i / 5) % 2 == 0) renderMouth(MOUTH_DOT);
    else renderMouth(MOUTH_O);

    pushFace();
    delay(48);
  }

  for (int i = 0; i < 24; i++) {
    showTired(52);
  }

  showIdle(200);
}

void idleWithBlink(unsigned long ms) {
  unsigned long start = millis();
  unsigned long nextBlink = millis() + 550;

  showIdle(0);

  while (millis() - start < ms) {
    if (millis() >= nextBlink) {
      blinkOnce();
      nextBlink = millis() + random(850, 1450);
    }

    delay(15);
  }
}

void runDemo() {
  hideBubble();

  idleWithBlink(1500);

  animLookAround();
  idleWithBlink(650);

  animHappyBounce();
  idleWithBlink(650);

  animWink();
  idleWithBlink(600);

  animSurprise();
  idleWithBlink(550);

  animKiss();
  idleWithBlink(550);

  animSmug();
  idleWithBlink(600);

  animSleepy();
  idleWithBlink(600);

  animNeedWater();

  animDrinking();

  idleWithBlink(800);

  animDizzyTired();

  idleWithBlink(1400);
}

