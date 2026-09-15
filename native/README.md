# 네이티브 앱 (Capacitor)

웹 앱(Vite 빌드)을 그대로 담은 Android 앱. iOS는 맥(Xcode)이 있어야 빌드할 수 있어 아직 미착수.

## 한 번에 빌드
```powershell
npm run native:build   # 웹 번들 (base '/', dist/)
npm run native:sync    # dist → android/app/src/main/assets/public, 플러그인 동기화
npm run native:apk     # android/app/build/outputs/apk/debug/app-debug.apk
```
- `native:apk`는 JAVA_HOME(Android Studio 내장 JBR)·ANDROID_HOME(%LOCALAPPDATA%\Android\Sdk)을 자동으로 잡는다.
- 에뮬레이터/폰 설치: `adb install -r android\app\build\outputs\apk\debug\app-debug.apk`
- 폰에 직접 넣으려면 APK 파일을 카톡/드라이브로 보내 열면 된다(출처를 알 수 없는 앱 허용 필요).

## 아이콘·스플래시
`npm run native:icons` — `native/make-icons.mjs`가 PWA 아이콘과 같은 디자인의 1024px 원본을 `resources/`에 그리고(Playwright),
`@capacitor/assets`가 android 각 해상도로 변환한다. 디자인을 바꾸려면 make-icons.mjs의 SVG를 고치면 된다.

## 앱 안에서 다른 점
- `src/native.ts`: `isNative`(Capacitor 안이면 true), Android 뒤로 가기(이력 있으면 뒤로, 첫 화면이면 종료).
- 네이티브에서는 서비스워커(PWA)를 등록하지 않고, 헤더의 "앱 설치" 버튼을 숨긴다.
- 시스템 바: `capacitor.config.ts`의 SystemBars(insetsHandling native + viewport-fit=cover) → `env(safe-area-inset-*)`로 여백.
  Android 테마(`android/app/src/main/res/values/styles.xml`)는 항상 다크, 스플래시 배경 `#07090e`.
- `android/gradle.properties`의 `android.overridePathCheck=true`: 프로젝트 경로에 한글이 있어 필요.

## 실서버 화면을 앱 껍데기로 (선택)
```powershell
$env:CAP_SERVER_URL='https://jcs2jordan3-sudo.github.io/allin-one/'; npm run native:sync; npm run native:apk
```
이렇게 만든 APK는 웹 배포(gh-pages)만 하면 앱도 같이 바뀐다. 스토어 제출용은 번들 방식(위)을 쓴다.

## 릴리스(스토어 제출용) 빌드
```powershell
npm run native:build; npm run native:sync
npm run native:release      # android/app/build/outputs/bundle/release/app-release.aab (Play Console 업로드용)
npm run native:release-apk  # android/app/build/outputs/apk/release/app-release.apk (폰 직접 설치용, 서명됨)
```
- 서명 키: `홀덤회원관리/keys/allinone-release.jks` (git 밖). 비밀번호는 `android/keystore.properties`(git 무시)와
  `keys/keystore.properties.backup`에 있다. **keys/ 폴더를 잃으면 같은 앱으로 업데이트를 올릴 수 없으니 반드시 따로 백업.**
- 새 버전을 올릴 때마다 `android/app/build.gradle`의 versionCode를 1씩 올리고 versionName을 맞춘다(현재 1 / 0.1.0).
- Supabase Auth 비밀번호 재설정 링크는 웹(https)으로 열리므로 앱 딥링크(App Links)는 추후.
