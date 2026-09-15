# 푸시 알림 검토 (2026-09-15)

보류 중이던 알림 과제(알림톡·SMS·웹푸시)를 네이티브 앱이 생긴 시점에 다시 정리한 것.

## 누가 받나
| 대상 | 쓰는 화면 | 현실적인 채널 |
|---|---|---|
| 직원(사장·매니저·딜러) | 콘솔 — 네이티브 앱 또는 PWA | **FCM(네이티브)** / 웹푸시(PWA) |
| 회원 | /me, /g/:code — 브라우저·PWA (앱 설치 안 함) | **웹푸시**, 알림톡, SMS |

회원은 앱을 깔지 않으므로 회원용 알림은 네이티브 푸시로 해결되지 않는다. 회원 알림이 목적이면 웹푸시가 먼저다.

## 채널 비교
| 채널 | 비용 | 준비물 | 제약 |
|---|---|---|---|
| 웹푸시 (VAPID) | 무료 | VAPID 키 1쌍(우리가 생성), Supabase Edge Function | iOS는 홈 화면에 추가한 PWA에서만(16.4+). 브라우저 권한 허용 필요 |
| FCM (네이티브 앱) | 무료 | **Firebase 프로젝트**(사용자가 콘솔에서 생성) → google-services.json + 서비스 계정 키 | 네이티브 앱 사용자만 |
| 카카오 알림톡 | 건당 ~8~15원 | 사업자등록, 카카오 채널, 발송 대행사, 템플릿 심사 | 심사 1~2주, 사업자 필수 |
| SMS | 건당 8~13원 | 발송 대행사 가입(개인 가능) | 도달 확실, 비용 발생 |

## 추천 순서
1. **웹푸시** 먼저 — 직원(PWA)·회원 둘 다 커버하고 Firebase 없이 시작 가능. 발송은 Supabase Edge Function(`web-push` 라이브러리) 하나.
2. **FCM** 추가 — 1의 발송 함수에서 플랫폼별 분기만 추가. Firebase 프로젝트가 있어야 하므로 사용자 작업 선행.
3. **알림톡/SMS** — 사업자등록 후. 회원 중 푸시 권한을 안 준 사람에게 보내는 보조 채널.

## 알릴 이벤트(초안)
- 회원: 게임 등록 마감 임박(예약 게임), 대기자 호출(waitlist → 착석), 좌석 이동 안내, RP 적립/시즌 종료 랭킹.
- 직원: 대기자 등록, 회원 가입, 게임 레벨 종료(블라인드 업) 같은 운영 알림.

## 구현 스케치 (공통)
- 테이블 `push_subscriptions`(store_id, member_id|staff_id, platform 'web'|'android'|'ios', endpoint/token, keys jsonb, created_at). RLS: 본인 행만.
- 클라이언트: 웹은 `PushManager.subscribe({ applicationServerKey })`, 네이티브는 `@capacitor/push-notifications`의 `register()` 토큰 → 같은 테이블에 upsert. 권한 요청은 /me 설정과 콘솔 관리 탭의 "알림 켜기" 버튼에서만(첫 진입에 묻지 않음).
- 발송: Edge Function `send-push`(service role) — 이벤트별 RPC/트리거가 `pg_net`으로 호출. 만료된 구독(410)은 삭제.
- 네이티브(FCM) 추가 시: `android/app/google-services.json` 두고 `com.google.gms.google-services` 플러그인 적용, Edge Function에 FCM v1 서비스 계정 JSON을 secret으로.

## 사용자가 해야 할 것 (FCM 단계)
1. https://console.firebase.google.com 에서 프로젝트 생성 → Android 앱 추가(패키지 `com.allinone.holdem`).
2. `google-services.json` 다운로드 → `app/android/app/`에 저장(git에 올려도 되지만 비공개 유지 권장).
3. 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성(JSON) → 전달(Supabase secret으로 등록).
