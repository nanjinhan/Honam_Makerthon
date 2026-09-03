/**
 * 표정 도트 매트릭스 — 실물 OLED와 같은 그림을 화면에도 띄운다.
 *
 * SPEC §3-3은 이 자리에 cult-ui Light Board를 배정했지만, 그 컴포넌트는
 * A–Z 텍스트를 흘려보내는 스크롤 마퀴다(폰트 테이블에 알파벳만 있다).
 * 정지된 표정을 그릴 수 없어서 여기만 직접 만든다. Light Board는 상태 티커로 쓴다.
 */
import { cn } from '@/lib/utils'
import type { Face } from '@/store/robotStore'

const W = 12
const H = 7

/** 각 행은 12칸. '#'가 켜진 픽셀. */
const FACES: Record<Face, string[]> = {
  neutral: [
    '............',
    '..##....##..',
    '..##....##..',
    '............',
    '............',
    '...######...',
    '............',
  ],
  happy: [
    '............',
    '..##....##..',
    '..##....##..',
    '............',
    '..#......#..',
    '..########..',
    '............',
  ],
  thirsty: [
    '............',
    '..##....##..',
    '..##....##..',
    '............',
    '...######...',
    '..#......#..',
    '............',
  ],
  sleepy: [
    '............',
    '............',
    '..####..####',
    '............',
    '............',
    '....####....',
    '............',
  ],
  // ㅇvㅇ — 실물 OLED가 띄우는 얼굴
  love: [
    '............',
    '..##....##..',
    '.#..#..#..#.',
    '..##....##..',
    '.....##.....',
    '......#.....',
    '............',
  ],
  excited: [
    '..#......#..',
    '.###....###.',
    '..#......#..',
    '............',
    '..########..',
    '.##......##.',
    '............',
  ],
}

const TONE: Record<Face, string> = {
  neutral: 'bg-foreground',
  happy: 'bg-primary',
  thirsty: 'bg-primary',
  sleepy: 'bg-muted-foreground',
  love: 'bg-primary',
  excited: 'bg-primary',
}

export function FaceDots({ face, className }: { face: Face; className?: string }) {
  const rows = FACES[face]

  return (
    <div
      className={cn('grid gap-[3px]', className)}
      style={{ gridTemplateColumns: `repeat(${W}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`표정: ${face}`}
    >
      {Array.from({ length: H }, (_, y) =>
        Array.from({ length: W }, (_, x) => {
          const on = rows[y]?.[x] === '#'
          return (
            <span
              key={`${x}-${y}`}
              className={cn(
                'aspect-square rounded-[2px] transition-colors duration-300',
                on ? TONE[face] : 'bg-muted',
                on && 'shadow-[0_0_6px_-1px_currentColor]',
              )}
            />
          )
        }),
      )}
    </div>
  )
}
