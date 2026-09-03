/**
 * ESP32 접속 주소 편집 — SPEC §9-1
 *
 * 주소를 틀리게 넣어도 앱은 멈추지 않는다. 연결에 실패하면 3초마다 재시도하면서
 * 그동안 목업으로 계속 돈다.
 */
import { useState } from 'react'

import { PopoverForm } from '@/components/ui/popover-form'
import { DEFAULT_WS_URL, connect, disconnect, getWsUrl } from '@/net/ws'
import { useRobotStore } from '@/store/robotStore'

export function ConnectionForm() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(getWsUrl() || DEFAULT_WS_URL)
  const [done, setDone] = useState(false)
  const conn = useRobotStore((s) => s.conn)

  return (
    <PopoverForm
      title={
        conn === 'live'
          ? '실데이터'
          : conn === 'connecting'
            ? '연결 중'
            : conn === 'error'
              ? '연결 실패 · 목업'
              : '목업 모드'
      }
      open={open}
      setOpen={setOpen}
      showSuccess={done}
      width="300px"
      height="176px"
      openChild={
        <form
          className="space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            connect(url.trim())
            setDone(true)
            setTimeout(() => {
              setDone(false)
              setOpen(false)
            }, 1200)
          }}
        >
          <label className="block text-[12px] text-muted-foreground" htmlFor="ws-url">
            ESP32 WebSocket 주소
          </label>
          <input
            id="ws-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="num w-full rounded-btn border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-btn bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground"
            >
              연결
            </button>
            <button
              type="button"
              onClick={() => {
                disconnect()
                setOpen(false)
              }}
              className="rounded-btn border border-border px-3 py-2 text-[13px] text-muted-foreground"
            >
              목업
            </button>
          </div>
        </form>
      }
    />
  )
}
