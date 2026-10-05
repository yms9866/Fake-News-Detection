import React from "react";
import { Platform } from "react-native";

type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  blob: Blob;
};

async function fetchAsBlob(uri: string, mimeType: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  if (!blob.type && mimeType) {
    return new Blob([blob], { type: mimeType });
  }
  return blob;
}

export async function pickMediaFile(kind: "image" | "audio" | "video"): Promise<PickedFile> {
  try {
    // Optional native modules — present in Expo Go / native builds when installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DocumentPicker = require("expo-document-picker");
    const type =
      kind === "image" ? "image/*" : kind === "audio" ? "audio/*" : "video/*";
    const result = await DocumentPicker.getDocumentAsync({
      type,
      copyToCacheDirectory: true,
      multiple: false
    });
    if (result.canceled || !result.assets?.length) {
      throw new Error("File selection was cancelled.");
    }
    const asset = result.assets[0];
    const mimeType = asset.mimeType || `${kind}/*`;
    const blob = await fetchAsBlob(asset.uri, mimeType);
    return {
      uri: asset.uri,
      name: asset.name || `upload.${kind === "image" ? "jpg" : kind === "audio" ? "wav" : "mp4"}`,
      mimeType,
      blob
    };
  } catch (error) {
    if (error instanceof Error && /cancelled/i.test(error.message)) {
      throw error;
    }
    throw new Error(
      Platform.OS === "web"
        ? "File picking is unavailable in this runtime."
        : `Install expo-document-picker to select ${kind} files, or use Capture actions when available.`
    );
  }
}

export async function pickImageFromLibrary(): Promise<PickedFile> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImagePicker = require("expo-image-picker");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Gallery permission was denied.");
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9
    });
    if (result.canceled || !result.assets?.length) {
      throw new Error("Image selection was cancelled.");
    }
    const asset = result.assets[0];
    const mimeType = asset.mimeType || "image/jpeg";
    const blob = await fetchAsBlob(asset.uri, mimeType);
    return {
      uri: asset.uri,
      name: asset.fileName || "gallery.jpg",
      mimeType,
      blob
    };
  } catch (error) {
    if (error instanceof Error && /cancelled|denied/i.test(error.message)) {
      throw error;
    }
    return pickMediaFile("image");
  }
}

export async function captureCameraStill(): Promise<PickedFile> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImagePicker = require("expo-image-picker");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Camera permission was denied.");
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9
    });
    if (result.canceled || !result.assets?.length) {
      throw new Error("Camera capture was cancelled.");
    }
    const asset = result.assets[0];
    const mimeType = asset.mimeType || "image/jpeg";
    const blob = await fetchAsBlob(asset.uri, mimeType);
    return {
      uri: asset.uri,
      name: asset.fileName || "camera.jpg",
      mimeType,
      blob
    };
  } catch (error) {
    if (error instanceof Error && /cancelled|denied/i.test(error.message)) {
      throw error;
    }
    throw new Error("Camera capture requires expo-image-picker in this build.");
  }
}

export async function uploadFromRemoteUrl(url: string, kind: "image" | "audio" | "video"): Promise<PickedFile> {
  const trimmed = String(url || "").trim();
  if (!trimmed) {
    throw new Error("A media URL is required.");
  }
  const response = await fetch(trimmed);
  if (!response.ok) {
    throw new Error(`Could not download media (${response.status}).`);
  }
  const blob = await response.blob();
  const extension = kind === "image" ? "jpg" : kind === "audio" ? "wav" : "mp4";
  return {
    uri: trimmed,
    name: `remote.${extension}`,
    mimeType: blob.type || `${kind}/*`,
    blob
  };
}
