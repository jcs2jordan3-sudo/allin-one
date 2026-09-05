/** RP 내림차순 정렬된 목록에 경쟁 순위(동점자는 같은 순위, 다음 순위 건너뜀)를 붙인다. 콘솔·공개 랭킹·회원 페이지 공용 */
export function withCompetitionRanks<T extends { rp: number }>(sorted: T[]): { item: T; rank: number }[] {
  let lastRp: number | null = null
  let lastRank = 0
  return sorted.map((item, i) => {
    const rank = item.rp === lastRp ? lastRank : i + 1
    lastRp = item.rp
    lastRank = rank
    return { item, rank }
  })
}
