function runtimePlatform() {
  const processValue = Reflect.get(globalThis, "process");
  if (!processValue || typeof processValue !== "object") {
    return "";
  }
  return String(Reflect.get(processValue, "platform") || "");
}

export function detectMobileSdkCapabilities(env = {}) {
  const platform = runtimePlatform();
  return {
    android: {
      available: Boolean(env["ANDROID_HOME"] || env["ANDROID_SDK_ROOT"]),
      detail: env["ANDROID_HOME"] || env["ANDROID_SDK_ROOT"] || "Android SDK not configured"
    },
    ios: {
      available: platform === "darwin" && Boolean(env["XCODE_VERSION_ACTUAL"]),
      detail: platform === "darwin" ? "Xcode detection placeholder" : "Xcode unavailable on this platform"
    }
  };
}
