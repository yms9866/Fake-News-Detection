import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("mobile build contains app and adapter entry points", () => {
  assert.equal(existsSync(new URL("../../dist/App.js", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../dist/api/client.js", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../dist/media/mobile-media.js", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../app.json", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../index.js", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../metro.config.cjs", import.meta.url)), true);
});

test("app shell lists required mobile screens", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  for (const screen of ["TextAnalysis", "UrlAnalysis", "CameraImage", "GalleryImage", "MicrophoneRecording", "VideoRecording", "ScreenshotAnalysis", "ShareIntent", "ShareExtension", "UploadProgress", "ResultEvidence", "History", "SecureSettings", "Auth", "DeepLinks", "OfflineQueue"]) {
    assert.equal(app.includes(screen), true);
  }
});

test("mobile source does not bundle provider secrets", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  assert.equal(app.includes("GEMINI" + "_API_KEY"), false);
  assert.equal(app.includes("GOOGLE" + "_API_KEY"), false);
});

test("mobile dev starts Expo instead of the adapter placeholder", async () => {
  const devScript = await readFile(new URL("../../scripts/dev.mjs", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(devScript.includes("Mobile Slice 8 provides React Native-shaped adapters"), false);
  assert.equal(devScript.includes("expo/bin/cli"), true);
  assert.equal(devScript.includes("--offline"), true);
  assert.equal(devScript.includes("--online"), true);
  assert.equal(devScript.includes("--phone"), true);
  assert.equal(devScript.includes("--localhost"), true);
  assert.equal(devScript.includes("MOBILE_LAN_IP"), true);
  assert.equal(devScript.includes("REACT_NATIVE_PACKAGER_HOSTNAME"), true);
  assert.equal(devScript.includes("EXPO_PUBLIC_BACKEND_ORIGIN"), true);
  assert.equal(devScript.includes("resolveAndroidPlatformTools"), true);
  assert.equal(devScript.includes("resolveMetroPort"), true);
  assert.equal(packageJson.scripts.android, "node scripts/dev.mjs --android");
  assert.equal(packageJson.scripts.emulator, "node scripts/dev.mjs --emulator");
  assert.equal(packageJson.scripts.phone, "node scripts/dev.mjs --phone");
  assert.equal(packageJson.scripts.backend, "node scripts/backend.mjs");
  assert.equal(packageJson.scripts.tunnel, "node scripts/dev.mjs --phone --tunnel --online");
  assert.equal(packageJson.dependencies["@babel/runtime"], "7.29.7");
  assert.equal(packageJson.dependencies["@react-native/assets-registry"], "0.74.87");
  assert.equal(packageJson.dependencies.expo.startsWith("^51."), true);
  assert.equal(packageJson.dependencies["expo-asset"], "~10.0.10");
  assert.equal(packageJson.dependencies["expo-build-properties"], "~0.12.5");
  assert.equal(packageJson.dependencies.react, "18.2.0");
  assert.equal(packageJson.dependencies["react-native"], "0.74.5");
  assert.equal(packageJson.devDependencies["@types/react"], "~18.2.45");
  assert.equal(packageJson.devDependencies["babel-preset-expo"], "11.0.15");
  assert.equal(packageJson.devDependencies.typescript, "~5.3.3");
});

test("mobile source does not implement verdict policy", async () => {
  const result = await readFile(new URL("../../src/components/result-view.ts", import.meta.url), "utf8");
  assert.equal(/final_verdict\s*=\s*["']REAL/u.test(result), false);
  assert.equal(/final_verdict\s*=\s*["']FAKE/u.test(result), false);
});

test("mobile app accepts an Expo public backend origin", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  assert.equal(app.includes("EXPO_PUBLIC_BACKEND_ORIGIN"), true);
  assert.equal(app.includes("10.0.2.2:8000"), true);
});

test("mobile app config allows local HTTP backend on Android", async () => {
  const appConfig = JSON.parse(await readFile(new URL("../../app.json", import.meta.url), "utf8"));
  const plugin = (appConfig.expo.plugins || []).find((entry) => Array.isArray(entry) && entry[0] === "expo-build-properties");
  assert.equal(Boolean(plugin), true);
  assert.equal(plugin[1].android.usesCleartextTraffic, true);
});

test("Metro is configured for pnpm workspace resolution", async () => {
  const metroConfig = await readFile(new URL("../../metro.config.cjs", import.meta.url), "utf8");
  assert.equal(metroConfig.includes("expo/metro-config"), true);
  assert.equal(metroConfig.includes("watchFolders"), true);
  assert.equal(metroConfig.includes("nodeModulesPaths"), true);
  assert.equal(metroConfig.includes("unstable_enableSymlinks"), true);
});
