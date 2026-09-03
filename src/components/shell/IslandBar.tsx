/**
 * 상단 Dynamic Island — SPEC §5, §7-1 (v4에서 역할을 바꿨다)
 *
 * ── 예전 ──
 * 섬이 **항상** 떠 있으면서 behavior가 바뀔 때마다 크기와 문구가 따라 바뀌었다.
 * 문제는 "대기 중"처럼 아무 일도 아닌 상태까지 화면 맨 위 검은 알약이 차지하고
 * 앉아 있었다는 것이다. 늘 떠 있으니 아무도 안 보게 되고, 정작 진짜 알릴 일이
 * 생겨도 평소와 똑같이 생겨서 눈에 안 띄었다.
 *
 * ── 지금 ──
 * 평상시 행동("지금 무슨 행동 중")은 홈 카드 안으로 내렸다. 섬은 **놀랄 일에만**
 * 내려온다. 안 뜰 때는 DOM에서 통째로 빠지므로 자리도 안 먹는다.
 *
 *   앞이 막힘   초음파가 20cm 안에서 뭔가를 잡음 → 6초 뜬 뒤 스스로 사라짐
 *   물이 급함   수분이 임계(30%) 아래 → 해결될 때까지 계속 떠 있음
 *
 * 크기 전환(dispatch)을 아예 안 쓴다. 긴급 상황은 한 가지 크기('long')로만 뜨고,
 * 뜰 때마다 Provider가 새로 마운트되기 때문이다. 덕분에 cult-ui의 setSize 왕복
 * 토글 버그(이전 버전 주석 참고)를 만날 일 자체가 없어졌다.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Droplets } from 'lucide-react'

import {
  DynamicContainer,
  DynamicIsland,
  DynamicIslandProvider,
  DynamicTitle,
} from '@/components/ui/dynamic-island'
import { MOISTURE_CRITICAL } from '@/lib/status'
import { useRobotStore } from '@/store/robotStore'

interface Urgent {
  icon: 'obstacle' | 'water'
  title: string
  desc: string
}

export function IslandBar() {
  const alert = useRobotStore((s) => s.alert)
  const moisture = useRobotStore((s) => s.sensors.moisture)

  /*
   * 순간 이벤트(부딪힘)가 지속 상태(목마름)보다 먼저다. 방금 벌어진 일이
   * 화면에 안 뜨는 게 제일 이상하기 때문이다. 목마름은 해결될 때까지 계속 뜬다.
   */
  let urgent: Urgent | null = null

  if (alert?.kind === 'obstacle') {
    urgent = { icon: 'obstacle', title: '앞이 막혔어요', desc: alert.msg }
  } else if (moisture < MOISTURE_CRITICAL) {
    urgent = {
      icon: 'water',
      title: '물이 급해요',
      desc: `수분 ${Math.round(moisture)}% · 임계 ${MOISTURE_CRITICAL}% 미만`,
    }
  }

  /*
   * 평상시엔 DOM에서 통째로 빠진다. 다만 그냥 넣었다 뺐다 하면 섬이 뜰 때마다
   * 아래 화면 전체가 70px씩 위아래로 튄다 — 데모에서 물 사이클마다 반복되면
   * 눈에 확 거슬린다. 높이를 애니메이션해서 밀려나게 한다.
   */
  return (
    <AnimatePresence initial={false}>
      {urgent && (
        <motion.div
          key="urgent-island"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          // 배경이 없으면 스크롤할 때 헤더 글자가 검은 알약 뒤로 비쳐 지저분해진다
          className="sticky top-0 z-30 overflow-hidden bg-background"
        >
          <div className="flex justify-center pt-3 pb-2">
            <DynamicIslandProvider initialSize="long">
              <DynamicIsland id="robot-island">
                <DynamicContainer className="flex h-full w-full items-center gap-2 px-4 text-white">
                  {urgent.icon === 'obstacle' ? (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-warn" />
                  ) : (
                    <Droplets className="h-5 w-5 shrink-0 animate-pulse text-primary" />
                  )}
                  <DynamicTitle className="truncate text-base font-medium text-white">
                    {urgent.title}
                  </DynamicTitle>
                  <span className="ml-auto truncate text-xs text-neutral-400">{urgent.desc}</span>
                </DynamicContainer>
              </DynamicIsland>
            </DynamicIslandProvider>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
