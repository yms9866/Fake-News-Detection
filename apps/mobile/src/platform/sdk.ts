export function detectMobileSdkCapabilities(env = process.env) {
  return {
    android: {
      available: Boolean(env.ANDROID_HOME || env.ANDROID_SDK_ROOT),
      detail: env.ANDROID_HOME || env.ANDROID_SDK_ROOT || "Android SDK not configured"
    },
    ios: {
      available: process.platform === "darwin" && Boolean(env.XCODE_VERSION_ACTUAL),
      detail: process.platform === "darwin" ? "Xcode detection placeholder" : "Xcode unavailable on this platform"
    }
  };
}
