import type { Game } from '../types'
import type { StoreState } from './types'

export const selMemberById = (st: StoreState, id: string) => st.members.find((m) => m.id === id)

export const selPlayingCount = (st: StoreState) =>
  st.games
    .filter((g) => g.status !== 'ended')
    .reduce((acc, g) => acc + g.entries.filter((e) => e.status === 'playing').length, 0)

export const selTotalChips = (g: Game) =>
  g.buyins.reduce((acc, b) => acc + b.chips + (b.earlyBirdChips ?? 0), 0) +
  (g.chipCorrection ?? 0) +
  (g.addonChips ?? 0)
