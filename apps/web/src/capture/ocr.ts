import type { Worker } from "tesseract.js";

/**
 * The app CSP restricts scripts, workers, and fetches to same-origin, so the
 * tesseract.js CDN defaults cannot load. These paths are vendored into
 * public/tesseract by scripts/vendor-tesseract.mjs.
 */
const TESSERACT_PATHS = {
  workerPath: "/tesseract/worker.min.js",
  corePath: "/tesseract/",
  langPath: "/tesseract/lang"
};

let workerPromise: Promise<Worker> | null = null;

export function createOcrError(cause: unknown) {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const error = new Error(
    "The on-device OCR engine could not start. Rebuild the web app so the local Tesseract assets are served."
  ) as Error & { code: string; technicalDetails: string };
  error.code = "WEB_OCR_ENGINE_UNAVAILABLE";
  error.technicalDetails = detail;
  return error;
}

export function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return await createWorker("eng", 1, TESSERACT_PATHS);
    })().catch((cause) => {
      workerPromise = null;
      throw createOcrError(cause);
    });
  }
  return workerPromise;
}

export async function recognizeCanvas(canvas: HTMLCanvasElement) {
  const worker = await getOcrWorker();
  const recognized = await worker.recognize(canvas);
  return recognized.data.text.trim();
}

export async function releaseOcrWorker() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) {
    return;
  }
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    /* worker never started */
  }
}
