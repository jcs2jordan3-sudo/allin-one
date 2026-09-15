// Android 디버그 APK 빌드: JAVA_HOME(Android Studio JBR)·ANDROID_HOME을 잡고 gradlew assembleDebug 실행.
// 사용: npm run native:apk  (먼저 npm run native:build && npm run native:sync)
// 결과: android/app/build/outputs/apk/debug/app-debug.apk
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const android = join(root, 'android')
const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
const javaHome = process.env.JAVA_HOME || 'C:\Program Files\Android\Android Studio\jbr'
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(home, 'AppData', 'Local', 'Android', 'Sdk')
if (!existsSync(javaHome)) throw new Error(`JAVA_HOME 없음: ${javaHome}`)
if (!existsSync(sdk)) throw new Error(`Android SDK 없음: ${sdk}`)

const task = process.argv[2] ?? 'assembleDebug'
// .bat는 shell 없이 실행할 수 없으므로(Node 보안 제한) 절대 경로를 따옴표로 감싸 cmd로 넘긴다
const gradlew = process.platform === 'win32' ? `"${join(android, 'gradlew.bat')}"` : './gradlew'
const r = spawnSync(gradlew, [task, '--console=plain'], {
  cwd: android,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
})
if (r.status !== 0) process.exit(r.status ?? 1)
console.log('\nAPK:', join(android, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'))
