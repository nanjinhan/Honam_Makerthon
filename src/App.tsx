import { useEffect, useState } from 'react'

import { Header } from '@/components/shell/Header'
import { IslandBar } from '@/components/shell/IslandBar'
import { TabBar, type TabId } from '@/components/shell/TabBar'
import { ControlScreen } from '@/screens/ControlScreen'
import { HomeScreen } from '@/screens/HomeScreen'
import { LogScreen } from '@/screens/LogScreen'
import { MapScreen } from '@/screens/MapScreen'
import { startCloudSync } from '@/net/cloudSync'
import { startEngine } from '@/sim/mockEngine'

export default function App() {
  const [tab, setTab] = useState<TabId>('home')

  // 목업 엔진은 앱이 사는 내내 돈다. ESP32가 붙어도 위치는 계속 여기서 나온다.
  useEffect(() => startEngine(), [])
  // Supabase가 연결 안 돼 있으면 아무것도 안 하고 조용히 빠진다.
  useEffect(() => startCloudSync(), [])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background text-foreground">
      <IslandBar />
      <Header onOpenLogs={() => setTab('log')} />

      <main className="flex-1 pb-28">
        {tab === 'home' && (
          <HomeScreen onSeeRooms={() => setTab('map')} onSeeLogs={() => setTab('log')} />
        )}
        {tab === 'map' && <MapScreen />}
        {tab === 'control' && <ControlScreen onGoMap={() => setTab('map')} />}
        {tab === 'log' && <LogScreen />}
      </main>

      <TabBar value={tab} onChange={setTab} />
    </div>
  )
}
