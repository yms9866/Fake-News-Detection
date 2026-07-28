# Mobile App

This package is the real Expo/React Native client for the fake-news analysis API. The mobile app renders input forms, calls the backend API, and displays results. It does not contain provider, model, extraction, or verdict policy logic.

## Setup

From the repository root:

```powershell
pnpm install
pnpm --filter mobile expo:check
pnpm --filter mobile doctor
```

On this Windows workspace, native Android builds can hit CMake path-length failures when pnpm uses the default deep virtual store. Use the same short-store install before native builds:

```powershell
pnpm install --force --config.virtual-store-dir=C:\v --config.peers-suffix-max-length=4 --config.confirmModulesPurge=false
```

Use Android Studio's bundled JDK if `JAVA_HOME` points at a missing JDK:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

## Backend URL

The app reads `EXPO_PUBLIC_API_URL`. See `apps/mobile/.env.example` for safe local values.

- Android emulator: `http://10.0.2.2:8000`
- Physical Android over USB with `adb reverse`: `http://127.0.0.1:8000`
- Physical Android on the same Wi-Fi: `http://<your-pc-lan-ip>:8000`
- Production: use HTTPS

Do not put provider keys such as Gemini or search credentials in `EXPO_PUBLIC_*` variables. Expo public variables are bundled into the client.

## Run The API

```powershell
pnpm --filter mobile backend
```

That helper starts FastAPI on `0.0.0.0:8000` so a physical phone on the same network can reach it. For emulator-only testing, a backend already running on `127.0.0.1:8000` is enough because Android maps the host through `10.0.2.2`.

## Run In Expo

Emulator:

```powershell
pnpm --filter mobile emulator
```

Physical phone on the same Wi-Fi:

```powershell
pnpm --filter mobile phone
```

If the wrong LAN IP is selected:

```powershell
$env:MOBILE_LAN_IP="192.168.1.25"
pnpm --filter mobile phone
```

Tunnel mode is available when LAN routing is blocked:

```powershell
pnpm --filter mobile tunnel
```

## Native Android Build

For a real APK that does not depend on Metro:

```powershell
cd apps/mobile
node node_modules/expo/bin/cli prebuild --platform android --no-install
cd android
$env:EXPO_PUBLIC_API_URL="http://10.0.2.2:8000"
$env:NODE_ENV="production"
.\gradlew.bat app:assembleRelease -x lint -x test --configure-on-demand --build-cache -PreactNativeArchitectures=x86_64 --console=plain
```

Install and launch on an emulator:

```powershell
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
adb shell monkey -p com.local.fakenewsdetector 1
```

For USB-connected physical Android devices, enable USB debugging and confirm the device appears in:

```powershell
adb devices
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
```

Then use `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000`.

## Checks

```powershell
pnpm --filter mobile typecheck
pnpm --filter mobile lint
pnpm --filter mobile test
pnpm --filter mobile test:static
pnpm --filter mobile test:e2e
pnpm --filter mobile build
```

`test:e2e` performs a real Expo Android export. `build` exports the Android bundle to `.expo-export/android`.

## Troubleshooting

`Cannot find module 'babel-preset-expo'`

Run `pnpm install`. The mobile package now declares `babel-preset-expo` and `expo-asset` directly for SDK 57.

`Expo Go says something went wrong`

Check the Metro terminal first. SDK 57 projects require Expo Go/dev clients that support SDK 57. When in doubt, use the native release APK flow above.

`ninja: manifest 'build.ninja' still dirty after 100 tries`

This is the Windows pnpm/CMake path-length failure seen in this workspace. Reinstall with the short virtual store command in the setup section, then rebuild.

`Unable to load script`

For debug builds, Metro must be reachable on port `8081`. Use `adb reverse tcp:8081 tcp:8081` for USB/emulator localhost routing, or use the release APK flow to avoid Metro entirely.

Backend check fails in the app

Open the app, confirm the Backend URL, and tap **Check Backend**. If a physical phone cannot reach the backend, allow Windows Firewall access for Python/Node on port `8000` and verify the API is bound to a LAN-reachable address.
