/**
 * 상단 고정 Dynamic Island — SPEC §5, §7-1
 *
 * 엔진의 behavior가 바뀌면 크기와 문구가 따라 바뀐다. 발표자가 말하지 않아도
 * 화면이 지금 무슨 판단을 하고 있는지 설명하는 자리.
 */
import { useEffect, useRef } from 'react'
import { Droplets, Leaf, Plug, Sprout, Sun } from 'lucide-react'

import {
  DynamicContainer,
  DynamicDescription,
  DynamicIsland,
  DynamicIslandProvider,
  DynamicTitle,
  type SizePresets,
  useDynamicIslandSize,
} from '@/components/ui/dynamic-island'
import { BEHAVIOR_TEXT, reasonOf } from '@/lib/status'
import { useRobotStore, type Behavior } from '@/store/robotStore'

const SIZE_FOR: Record<Behavior, SizePresets> = {
  idle: 'compact',
  patrol: 'compact',
  seek_light: 'long',
  go_water: 'long',
  docking: 'long',
  watering: 'large',
  greet: 'long',
  returning: 'long',
}

function IconFor({ behavior }: { behavior: Behavior }) {
  switch (behavior) {
    case 'watering':
    case 'docking':
    case 'go_water':
      return <Droplets className="h-5 w-5 shrink-0 text-primary" />
    case 'greet':
      return <Leaf className="h-5 w-5 shrink-0 text-primary" />
    case 'seek_light':
    case 'returning':
      return <Sun className="h-5 w-5 shrink-0 text-primary" />
    default:
      return <Sprout className="h-4 w-4 shrink-0 text-primary" />
  }
}

function IslandScene() {
  const behavior = useRobotStore((s) => s.behavior)
  const conn = useRobotStore((s) => s.conn)
  // 객체를 만들어 반환하면 매 틱 새 참조가 되어 무한 렌더가 된다. 문자열로만 고른다.
  const reason = useRobotStore((s) => reasonOf(s))

  const { dispatch, state } = useDynamicIslandSize()
  const target = SIZE_FOR[behavior]
  const current = state.size

  /**
   * cult-ui 크기 전환에 함정이 둘 있다.
   *
   * 1. setSize()는 previousSize === newSize인 호출을 막아서, 두 상태를 왕복
   *    토글하면 두 번째 전환이 씹힌다. 그래서 dispatch를 직접 쓴다.
   * 2. 그런데 SET_SIZE를 같은 값으로 두 번 보내면 previousSize === size가 되고,
   *    DynamicTitle/DynamicDescription은 그 경우 opacity 0으로 렌더된다(=글자가 사라짐).
   *    렌더 중에 dispatch하면 StrictMode 이중 렌더가 같은 전환을 두 번 보내서 정확히
   *    이 상태가 된다. ref로 마지막에 보낸 크기를 기억해 한 번만 보낸다.
   */
  const sent = useRef<SizePresets | null>(null)
  useEffect(() => {
    if (sent.current === target || current === target) return
    sent.current = target
    dispatch({ type: 'SET_SIZE', newSize: target })
  }, [target, current, dispatch])

  const title = BEHAVIOR_TEXT[behavior]

  if (target === 'large') {
    return (
      <DynamicContainer className="flex h-full w-full items-center justify-center gap-3 px-6 text-white">
        <Droplets className="h-8 w-8 shrink-0 animate-pulse text-primary" />
        <div className="text-left">
          <DynamicTitle className="text-2xl font-semibold tracking-tight text-white">
            {title}
          </DynamicTitle>
          <DynamicDescription className="text-sm text-neutral-400">{reason}</DynamicDescription>
        </div>
      </DynamicContainer>
    )
  }

  if (target === 'long') {
    return (
      <DynamicContainer className="flex h-full w-full items-center gap-2 px-4 text-white">
        <IconFor behavior={behavior} />
        <DynamicTitle className="truncate text-base font-medium text-white">{title}</DynamicTitle>
        <span className="ml-auto truncate text-xs text-neutral-400">{reason}</span>
      </DynamicContainer>
    )
  }

  return (
    <DynamicContainer className="flex h-full w-full items-center justify-between px-3 text-white">
      <IconFor behavior={behavior} />
      <DynamicTitle className="text-sm font-medium text-white">{title}</DynamicTitle>
      {conn === 'live' ? (
        <Plug className="h-3.5 w-3.5 text-primary" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />
      )}
    </DynamicContainer>
  )
}

export function IslandBar() {
  return (
    // 배경이 없으면 스크롤할 때 헤더 글자가 검정 알약 뒤로 비쳐 지저분해진다
    <div className="sticky top-0 z-30 flex justify-center bg-background pt-3 pb-1">
      <DynamicIslandProvider initialSize="compact">
        <DynamicIsland id="robot-island">
          <IslandScene />
        </DynamicIsland>
      </DynamicIslandProvider>
    </div>
  )
}
