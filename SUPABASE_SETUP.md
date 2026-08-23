# Supabase 연동 설정 (5분)

키를 설정하기 전까지 앱은 **로컬 모드**(브라우저 localStorage)로 동작합니다.
설정을 마치면 헤더에 "클라우드 동기화" 배지가 켜지고, 콘솔 PC와 TV 전광판이 같은 데이터를 실시간으로 공유합니다.

## 1. 프로젝트 만들기

1. https://supabase.com 접속 → 가입/로그인 (무료 플랜이면 충분)
2. **New Project** → 이름 아무거나(예: `allinone`), Region은 **Northeast Asia (Seoul)** 권장 → 생성 대기 (~2분)

## 2. 테이블 만들기

1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 이 폴더의 `supabase/setup.sql` 파일 내용 전체를 붙여넣고 **Run**
   - `app_state` 테이블 생성 + Realtime 활성화 + 데모용 접근 정책이 설정됩니다

## 3. 키 연결

1. 왼쪽 메뉴 **Project Settings → API**
2. `Project URL`과 `anon public` 키를 복사
3. 이 폴더(`app/`)에서 `.env.local.example`을 복사해 `.env.local` 파일을 만들고 값 입력:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

4. 개발 서버 재시작: 터미널에서 Ctrl+C 후 `npm run dev`

## 4. 확인

- 헤더 매장명 옆에 초록 점 **"클라우드 동기화"** 가 표시되면 성공
- 기존 로컬 데이터는 첫 연결 때 자동으로 클라우드에 업로드됩니다
- 다른 기기/브라우저에서 같은 주소를 열어 게임을 추가해보면 양쪽에 즉시 반영됩니다

## 주의사항

- `.env.local`은 git에 올리지 마세요 (anon 키가 노출됩니다)
- 현재 정책은 **데모용**(anon 키 소지자 전원 읽기/쓰기)입니다. 실서비스 전에는
  Supabase Auth 로그인 + 역할별 정책으로 교체해야 합니다 — 기획서 §7(RLS)·§8 참조
- 현재 구조는 상태 스냅샷 동기화 방식입니다. 실서비스 전환 시 기획서의
  정규화 스키마(원장 RPC·불변식)로 마이그레이션합니다
