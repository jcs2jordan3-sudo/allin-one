import { useEffect, useState } from 'react'
import type { BlindLevel, Game } from '../types'

/** 게임 경과 시간(ms) — 일시정지 구간 제외, 서버 기준시각 방식과 동일한 계산 */
export function gameElapsedMs(g: Game, now: number): number {
  const end = g.status === 'ended' && g.endedAt ? g.endedAt : g.status === 'paused' && g.pausedAt ? g.pausedAt : now
  return Math.max(0, end - g.startedAt - g.pausedTotal)
}

/** 예약 상태 여부 — 시작 시각이 아직 오지 않은 게임 */
export function isScheduled(g: Game, now: number): boolean {
  return g.status !== 'ended' && now < g.startedAt
}

/** 레벨 시작 시점(경과 ms 기준) */
export function levelStartMs(levels: BlindLevel[], idx: number): number {
  let acc = 0
  for (let i = 0; i < idx && i < levels.length; i++) acc += levels[i].durationMin * 60_000
  return acc
}

export interface LevelPos {
  idx: number
  level: BlindLevel
  remainMs: number // 현재 레벨 잔여 (무제한 레벨은 Infinity)
  intoMs: number
}

/** 경과 시간으로 현재 레벨 위치 계산. durationMin 0 = 무제한 레벨 */
export function levelAt(levels: BlindLevel[], elapsed: number): LevelPos {
  let acc = 0
  for (let i = 0; i < levels.length; i++) {
    const dur = levels[i].durationMin * 60_000
    if (levels[i].durationMin === 0) {
      return { idx: i, level: levels[i], remainMs: Infinity, intoMs: elapsed - acc }
    }
    if (elapsed < acc + dur) {
      return { idx: i, level: levels[i], remainMs: acc + dur - elapsed, intoMs: elapsed - acc }
    }
    acc += dur
  }
  const last = levels.length - 1
  return { idx: last, level: levels[last], remainMs: 0, intoMs: elapsed - levelStartMs(levels, last) }
}

/** 다음 레벨 (없으면 null) */
export function nextLevel(levels: BlindLevel[], idx: number): BlindLevel | null {
  return idx + 1 < levels.length ? levels[idx + 1] : null
}

/** 레지 마감 여부 */
export function isRegClosed(g: Game, now: number): boolean {
  if (g.regClosedManual) return true
  const elapsed = gameElapsedMs(g, now)
  const pos = levelAt(g.snapshot.levels, elapsed)
  return pos.idx >= g.snapshot.regCloseLevelIndex
}

/** 레지 마감까지 잔여 ms (마감됐으면 0) */
export function regCloseRemainMs(g: Game, now: number): number {
  if (g.regClosedManual) return 0
  const elapsed = gameElapsedMs(g, now)
  const target = levelStartMs(g.snapshot.levels, g.snapshot.regCloseLevelIndex)
  return Math.max(0, target - elapsed)
}

/** 다음 브레이크까지 잔여 ms (없으면 null) */
export function nextBreakRemainMs(levels: BlindLevel[], elapsed: number): number | null {
  const pos = levelAt(levels, elapsed)
  for (let i = pos.idx; i < levels.length; i++) {
    if (levels[i].type === 'break' && i > pos.idx) {
      return levelStartMs(levels, i) - elapsed
    }
    if (levels[i].type === 'break' && i === pos.idx) return 0
  }
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** HH:MM:SS (시간 무제한 자릿수) */
export function fmtClock(ms: number): string {
  if (!isFinite(ms)) return '--:--:--'
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  return `${pad(h)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** MM:SS (레벨 카운트다운용, 60분 이상이면 H:MM:SS) */
export function fmtCountdown(ms: number): string {
  if (!isFinite(ms)) return '∞'
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  if (m >= 60) return `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(s % 60)}`
  return `${pad(m)}:${pad(s % 60)}`
}

/** 주기적 리렌더용 현재 시각 훅 */
export function useNow(intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
