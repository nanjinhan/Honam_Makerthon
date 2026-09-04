/**
 * 도면 데이터 — SPEC §12
 *
 * 좌표계는 viewBox="0 0 1000 760". 이미지를 깔지 않고 SVG로 직접 그리므로
 * 히트맵·경로·충돌 판정이 전부 이 좌표계 하나에서 처리된다.
 */

export interface Point {
  x: number
  y: number
}

export const VIEW_W = 1000
export const VIEW_H = 760

/** 도면 1000px을 실내 폭 12m로 본다. 통계의 이동거리(m) 환산에 쓴다. */
export const PX_PER_M = VIEW_W / 12

export const ROOMS = [
  { id: 'living', name: '거실', x: 40, y: 40, w: 300, h: 260 },
  { id: 'dining', name: '다이닝', x: 340, y: 40, w: 320, h: 260 },
  { id: 'kitchen', name: '주방', x: 660, y: 40, w: 300, h: 260 },
  { id: 'mbath', name: '욕실', x: 40, y: 300, w: 260, h: 170 },
  { id: 'mbed', name: '안방', x: 40, y: 470, w: 260, h: 250 },
  { id: 'hall', name: '복도', x: 300, y: 300, w: 220, h: 420 },
  { id: 'bed2', name: '침실 2', x: 660, y: 300, w: 300, h: 200 },
  { id: 'bath2', name: '욕실 2', x: 520, y: 300, w: 140, h: 200 },
  { id: 'bed3', name: '침실 3', x: 520, y: 500, w: 440, h: 220 },
] as const

export type RoomId = (typeof ROOMS)[number]['id']
export type Room = (typeof ROOMS)[number]

/**
 * 가구 — SPEC §12-1. 단순 사각형 실루엣만. 디테일은 필요 없다.
 * 장애물 회피가 시각적으로 설명되는 게 목적이라, 웨이포인트와 겹치지 않게 배치했다.
 */
export const FURNITURE = [
  { room: 'living', name: '소파', x: 112, y: 220, w: 140, h: 50 },
  { room: 'living', name: '테이블', x: 80, y: 140, w: 90, h: 50 },
  { room: 'dining', name: '식탁', x: 355, y: 105, w: 130, h: 85 },
  { room: 'kitchen', name: '조리대', x: 680, y: 60, w: 260, h: 45 },
  { room: 'kitchen', name: '아일랜드', x: 740, y: 180, w: 180, h: 55 },
  { room: 'mbath', name: '욕조', x: 60, y: 320, w: 90, h: 130 },
  { room: 'mbed', name: '침대', x: 60, y: 490, w: 90, h: 190 },
  { room: 'bed2', name: '침대', x: 680, y: 320, w: 110, h: 130 },
  { room: 'bath2', name: '욕조', x: 530, y: 315, w: 55, h: 105 },
  { room: 'bed3', name: '침대', x: 560, y: 540, w: 150, h: 150 },
  { room: 'bed3', name: '책상', x: 800, y: 530, w: 120, h: 50 },
] as const

export const WINDOWS = [
  { x: 190, y: 40, strength: 900 }, // 거실 창 — 명당
  { x: 500, y: 40, strength: 820 },
  { x: 810, y: 40, strength: 700 },
  { x: 960, y: 400, strength: 560 },
] as const

/** 급수 겸 충전 덱 */
export const STATION: Point = { x: 70, y: 250 }
/** 현관 — 주인 진입점 */
export const ENTRY: Point = { x: 410, y: 700 }

/**
 * 웨이포인트 그래프 — 방 중심과 문 위치가 노드. 링크는 반드시 양방향으로 맞춰둔다.
 * A*는 필요 없다. 노드가 12개뿐이라 BFS로 충분하다.
 */
export const WAYPOINTS = {
  living: { x: 190, y: 170, links: ['dining', 'station', 'hall_n'] },
  dining: { x: 500, y: 170, links: ['living', 'kitchen', 'hall_n'] },
  kitchen: { x: 810, y: 170, links: ['dining', 'bed2'] },
  hall_n: { x: 410, y: 380, links: ['living', 'dining', 'mbath', 'bath2', 'hall_s'] },
  hall_s: { x: 410, y: 600, links: ['hall_n', 'mbed', 'bed3', 'entry'] },
  mbath: { x: 170, y: 385, links: ['hall_n', 'mbed'] },
  mbed: { x: 170, y: 595, links: ['mbath', 'hall_s'] },
  bath2: { x: 590, y: 400, links: ['hall_n', 'bed3'] },
  bed2: { x: 810, y: 400, links: ['kitchen', 'bed3'] },
  bed3: { x: 740, y: 610, links: ['bath2', 'bed2', 'hall_s'] },
  station: { x: 70, y: 250, links: ['living'] },
  entry: { x: 410, y: 700, links: ['hall_s'] },
} as const satisfies Record<string, { x: number; y: number; links: readonly string[] }>

export type WaypointId = keyof typeof WAYPOINTS

export const WAYPOINT_IDS = Object.keys(WAYPOINTS) as WaypointId[]

/** 웨이포인트 → 그 노드가 속한 방. 로그 문구("거실 → 발코니 이동")에 쓴다. */
export const WAYPOINT_ROOM: Record<WaypointId, string> = {
  living: '거실',
  dining: '다이닝',
  kitchen: '주방',
  hall_n: '복도',
  hall_s: '복도',
  mbath: '욕실',
  mbed: '안방',
  bath2: '욕실 2',
  bed2: '침실 2',
  bed3: '침실 3',
  station: '급수 스테이션',
  entry: '현관',
}

export function pointOf(id: WaypointId): Point {
  const w = WAYPOINTS[id]
  return { x: w.x, y: w.y }
}

function linksOf(id: WaypointId): readonly WaypointId[] {
  return WAYPOINTS[id].links as readonly WaypointId[]
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 웨이포인트 그래프 BFS 최단경로. 양끝 포함. 도달 불가면 빈 배열. */
export function bfs(from: WaypointId, to: WaypointId): WaypointId[] {
  if (from === to) return [from]

  const prev = new Map<WaypointId, WaypointId>()
  const seen = new Set<WaypointId>([from])
  const queue: WaypointId[] = [from]

  while (queue.length > 0) {
    const cur = queue.shift() as WaypointId
    for (const next of linksOf(cur)) {
      if (seen.has(next)) continue
      seen.add(next)
      prev.set(next, cur)
      if (next === to) {
        const path: WaypointId[] = [to]
        let node: WaypointId = to
        while (node !== from) {
          node = prev.get(node) as WaypointId
          path.unshift(node)
        }
        return path
      }
      queue.push(next)
    }
  }
  return []
}

export function nearestWaypoint(p: Point): WaypointId {
  let best: WaypointId = WAYPOINT_IDS[0]
  let bestD = Infinity
  for (const id of WAYPOINT_IDS) {
    const d = dist(p, pointOf(id))
    if (d < bestD) {
      bestD = d
      best = id
    }
  }
  return best
}

/** 현재 좌표에서 목표 웨이포인트까지의 통과 좌표 목록. 첫 노드(현재 위치)는 뺀다. */
export function pathFrom(p: Point, to: WaypointId): Point[] {
  const start = nearestWaypoint(p)
  const nodes = bfs(start, to)
  if (nodes.length === 0) return [pointOf(to)]
  // 이미 시작 노드 위에 서 있으면 그 노드는 건너뛴다
  const rest = dist(p, pointOf(start)) < 1 ? nodes.slice(1) : nodes
  return rest.map(pointOf)
}

export const AMBIENT_LUX = 120
export const LUX_SPREAD = 180

/**
 * 위치 기반 조도 — SPEC §8-2.
 * 창문마다 가우시안을 깔고 더한다. 창가로 갈수록 숫자가 실제로 올라가는 게
 * "위치 기반 센싱"의 설득력 전부다.
 */
export function luxAt(p: Point): number {
  let sum = AMBIENT_LUX
  for (const w of WINDOWS) {
    const d = dist(p, w)
    sum += w.strength * Math.exp(-(d * d) / (2 * LUX_SPREAD * LUX_SPREAD))
  }
  return Math.round(sum)
}

/** 조도가 가장 높은 웨이포인트 = 창가 명당. seek_light의 목표. */
export function brightestWaypoint(): WaypointId {
  let best: WaypointId = WAYPOINT_IDS[0]
  let bestLux = -1
  for (const id of WAYPOINT_IDS) {
    const l = luxAt(pointOf(id))
    if (l > bestLux) {
      bestLux = l
      best = id
    }
  }
  return best
}

/** 방 → 그 방의 대표 웨이포인트. 방 카드의 조도·이동 목표에 쓴다. */
export const ROOM_WAYPOINT: Record<RoomId, WaypointId> = {
  living: 'living',
  dining: 'dining',
  kitchen: 'kitchen',
  mbath: 'mbath',
  mbed: 'mbed',
  hall: 'hall_n',
  bed2: 'bed2',
  bath2: 'bath2',
  bed3: 'bed3',
}

export function roomLux(id: RoomId): number {
  return luxAt(pointOf(ROOM_WAYPOINT[id]))
}

export function roomAt(p: Point): Room | undefined {
  return ROOMS.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
}

/*
 * ── 벽과 문 ──────────────────────────────────────────────────────
 *
 * 문 위치는 원래 FloorPlanSVG 안에 "그림용"으로만 있었다. 수동 조종이 벽을 못
 * 뚫게 하려면 **판정에도 같은 값**이 필요한데, 그림과 판정이 서로 다른 표를 보면
 * 언젠가 어긋난다 — 화면에는 문이 뚫려 있는데 로봇은 못 지나가는 식으로.
 * 그래서 여기 한 곳에 두고 SVG가 이걸 가져다 그린다.
 */
export const WALL_W = 10
export const DOOR_W = 74

/** 벽을 지워 문을 낸다. 세로벽(v)은 x가, 가로벽(h)은 y가 벽의 중심선이다. */
export const DOORS = [
  { x: 340, y: 160, dir: "v" }, // 거실 ↔ 다이닝
  { x: 660, y: 160, dir: "v" }, // 다이닝 ↔ 주방
  { x: 300, y: 340, dir: "v" }, // 욕실 ↔ 복도
  { x: 300, y: 540, dir: "v" }, // 안방 ↔ 복도
  { x: 520, y: 330, dir: "v" }, // 욕실2 ↔ 복도
  { x: 520, y: 560, dir: "v" }, // 침실3 ↔ 복도
  { x: 400, y: 300, dir: "h" }, // 다이닝 ↔ 복도
  { x: 780, y: 300, dir: "h" }, // 주방 ↔ 침실2
  { x: 780, y: 500, dir: "h" }, // 침실2 ↔ 침실3
  { x: 150, y: 470, dir: "h" }, // 욕실 ↔ 안방
  { x: 375, y: 720, dir: "h" }, // 현관
] as const

/** 로봇 반지름. 벽에서 이만큼은 떨어져 있어야 한다. */
export const ROBOT_R = 16

/** 이 자리에 로봇이 서 있을 수 있나 — 방 안이거나 문 개구부 안이어야 한다. */
export function canStand(p: Point): boolean {
  // 방 안쪽. 벽에 붙지 않게 ROBOT_R만큼 줄여서 본다.
  for (const r of ROOMS) {
    if (
      p.x >= r.x + ROBOT_R &&
      p.x <= r.x + r.w - ROBOT_R &&
      p.y >= r.y + ROBOT_R &&
      p.y <= r.y + r.h - ROBOT_R
    ) {
      return true
    }
  }

  /*
   * 문 개구부. 문은 벽 위에 있어서 위의 "방 안쪽" 판정에서 반드시 빠진다.
   * 그래서 따로 봐줘야 방과 방 사이를 지나갈 수 있다.
   */
  const pad = ROBOT_R / 2                 // 문틀에 어깨가 끼지 않게
  const reach = WALL_W / 2 + ROBOT_R      // 벽 두께를 건너가는 동안도 허용
  for (const d of DOORS) {
    if (d.dir === "v") {
      if (Math.abs(p.x - d.x) <= reach && p.y >= d.y + pad && p.y <= d.y + DOOR_W - pad) return true
    } else {
      if (Math.abs(p.y - d.y) <= reach && p.x >= d.x + pad && p.x <= d.x + DOOR_W - pad) return true
    }
  }

  return false
}

/**
 * from에서 to로 가되, 벽에 막히면 갈 수 있는 데까지만 간다.
 *
 * 한 번에 목적지를 검사하면 안 된다 — 걸음이 벽 두께보다 크면 벽을 **건너뛰어**
 * 반대편에 착지해버린다. 4px씩 잘게 나아가며 확인한다.
 */
export function moveWithWalls(from: Point, to: Point): Point {
  // 이미 설 수 없는 자리에 있으면(자율주행이 벽 모서리를 스치고 지나간 뒤 등)
  // 가두지 않는다. 못 움직이면 영영 못 빠져나온다.
  if (!canStand(from)) return to

  const steps = Math.max(1, Math.ceil(dist(from, to) / 4))
  let last = from
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
    if (!canStand(p)) return last
    last = p
  }
  return last
}
