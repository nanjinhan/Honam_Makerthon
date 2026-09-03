/**
 * 로그 목록 — SPEC §10-2
 *
 * 종류별로 좌측 보더 색을 다르게 한다. 안 하면 전부 같은 색이라 눈으로 스캔이 안 된다.
 * 시각은 19:26:09 고정폭. "19시 26분 9초"는 자릿수가 흔들려서 세로로 못 읽는다.
 */
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LogEntry, LogKind } from '@/store/robotStore'

/** SPEC §10-3 — 좌측 보더 3px. 안 하면 전부 같은 색이라 눈으로 스캔이 안 된다. */
const BORDER: Record<LogKind, string> = {
  water: '#4CA8E0',
  light: '#E8A23C',
  greet: '#2F6BEA',
  move: '#C3CDDA',
  warn: '#DC4C4C',
  system: '#E4E9F0',
}

const KIND_TEXT: Record<LogKind, string> = {
  water: '급수',
  light: '조도',
  greet: '인사',
  move: '이동',
  warn: '경고',
  system: '시스템',
}

export function LogList({
  logs,
  limit,
  className,
}: {
  logs: LogEntry[]
  limit?: number
  className?: string
}) {
  const rows = limit ? logs.slice(0, limit) : logs

  if (rows.length === 0) {
    return <p className={cn('px-1 py-6 text-center text-sm text-muted-foreground', className)}>아직 기록이 없어요</p>
  }

  return (
    <ul className={cn('space-y-2', className)}>
      {rows.map((log) => (
        <li
          key={`${log.t}-${log.msg}`}
          className="flex items-start gap-3 rounded-nest border border-border bg-card px-3.5 py-2.5 shadow-card"
          style={{ borderLeftWidth: 3, borderLeftColor: BORDER[log.kind] }}
        >
          <span className="num shrink-0 pt-px text-[12px] font-medium text-muted-foreground">
            {formatTime(log.t)}
          </span>
          <span className="min-w-0 flex-1 text-[15px] leading-snug">{log.msg}</span>
          <span className="shrink-0 pt-0.5 text-[12px] text-muted-foreground">
            {KIND_TEXT[log.kind]}
          </span>
        </li>
      ))}
    </ul>
  )
}
