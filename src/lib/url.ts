// 배포 경로(base) 대응 URL 헬퍼 — GitHub Pages(/repo/) 등 하위 경로 배포 시 링크·QR이 깨지지 않도록 함

/** 앱 내부 절대 경로 (base 접두 포함). 예: appUrl('/rank') → '/allin-one/rank' */
export const appUrl = (path: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + path

/** 외부 공유용 전체 URL. 예: absUrl('/rank') → 'https://…/allin-one/rank' */
export const absUrl = (path: string) => location.origin + appUrl(path)
