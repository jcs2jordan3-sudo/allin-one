/**
 * 휴대폰 번호 처리 — 알림(카카오톡 알림톡 등) 발송을 위해 저장 형식을 010-1234-5678로 통일한다.
 * DB 쪽 매칭(handle_new_user)은 숫자만 비교하므로 표기 차이는 문제되지 않는다.
 */

/** 숫자만 남김. 국가번호(+82 10 …)로 들어온 경우 0으로 시작하는 국내 형식으로 바꿈 */
export function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2)
  return d
}

/** 한국 휴대폰 번호인지 — 010은 11자리, 011·016·017·018·019는 10~11자리 */
export function isKrMobile(raw: string): boolean {
  const d = phoneDigits(raw)
  return /^010\d{8}$/.test(d) || /^01[16789]\d{7,8}$/.test(d)
}

/** 010-1234-5678 형식으로 표기. 자릿수가 맞지 않으면 입력값을 그대로(공백 정리만) 돌려줌 */
export function formatPhone(raw: string): string {
  const d = phoneDigits(raw)
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return raw.trim()
}
