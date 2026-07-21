export const MOBILE_SCREENS = [
  "TextAnalysis",
  "UrlAnalysis",
  "CameraImage",
  "GalleryImage",
  "MicrophoneRecording",
  "AudioSelection",
  "VideoRecording",
  "VideoSelection",
  "ScreenshotAnalysis",
  "ShareIntent",
  "ShareExtension",
  "UploadProgress",
  "ResultEvidence",
  "History",
  "SecureSettings",
  "Auth",
  "DeepLinks",
  "OfflineQueue"
];

export function createMobileAppShell() {
  return {
    screens: [...MOBILE_SCREENS],
    localFirst: true,
    noOfflineVerificationPromise: true,
    providerSecretsInBundle: false
  };
}
