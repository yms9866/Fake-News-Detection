# Mobile App

This package is a real Expo entry point for the fake-news analysis API.

## Run

From the repository root:

```powershell
pnpm install
pnpm --filter mobile backend
pnpm --filter mobile emulator
```

Use `pnpm --filter mobile android` or `pnpm --filter mobile emulator` for an Android emulator. The launcher adds Expo localhost routing and uses `http://10.0.2.2:8000` for the API backend.

Use `pnpm --filter mobile phone` for a physical phone on the same Wi-Fi. The launcher uses your LAN IP for Metro and sets `EXPO_PUBLIC_BACKEND_ORIGIN` to `http://<LAN_IP>:8000`.

If the wrong LAN IP is chosen, set it explicitly:

```powershell
$env:MOBILE_LAN_IP="172.23.1.41"
pnpm --filter mobile phone
```

If same-Wi-Fi LAN mode cannot reach your phone, use tunnel mode:

```powershell
pnpm --filter mobile tunnel
```

The dev launcher defaults to Expo offline mode only when no host mode is selected. Host modes such as emulator, phone, LAN, localhost, and tunnel use Expo's normal online checks.

The launcher sets the app's default backend URL for the target: Android emulators use `http://10.0.2.2:8000`, and physical devices use your computer's LAN URL. For physical phones, start the API with `pnpm --filter mobile backend`, which binds to `0.0.0.0`, and allow port `8000` through Windows Firewall.

## Troubleshooting

### Emulator cannot load the app

1. Start the Android emulator before running `pnpm --filter mobile emulator`.
2. Make sure the API is running: `pnpm --filter mobile backend`.
3. If Metro says port `8081` is busy, the launcher now picks the next free port automatically.
4. If Expo cannot find `adb`, install Android platform-tools or set `ANDROID_HOME`. The launcher adds the default SDK path when it exists.

### Phone cannot connect

1. Start the phone-friendly backend: `pnpm --filter mobile backend`.
2. Confirm your PC and phone are on the same Wi-Fi.
3. Set the correct LAN IP if auto-detection is wrong:

```powershell
$env:MOBILE_LAN_IP="172.23.1.41"
pnpm --filter mobile phone
```

4. Allow Windows Firewall access for Python/Node on ports `8000` and `8081`.
5. If LAN mode still fails, use tunnel mode: `pnpm --filter mobile tunnel`.

### Backend check fails inside the app

Open the app, confirm the Backend URL, and tap **Check Backend**.

- Emulator default: `http://10.0.2.2:8000`
- Phone default: `http://<your-lan-ip>:8000`

If the app loads but backend checks fail, the API is usually still bound to `127.0.0.1`. Restart it with `pnpm --filter mobile backend`.
