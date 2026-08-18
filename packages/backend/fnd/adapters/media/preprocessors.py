"""Local media preprocessing adapters for Slice 3 development."""

from __future__ import annotations

import importlib.util
import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import shutil
import subprocess
from tempfile import mkdtemp
from threading import Lock
from time import perf_counter

from packages.backend.fnd.application.services.media_text import (
    deduplicate_segments,
    merge_media_text_channels,
)
from packages.backend.fnd.config.settings import Settings
from packages.backend.fnd.domain.entities import ExtractedDocument, normalize_text
from packages.backend.fnd.domain.enums import InputType, MediaType
from packages.backend.fnd.domain.errors import FndError, JobCancelledError
from packages.backend.fnd.domain.media import (
    ExtractionMetadata,
    MediaMetadata,
    StoredArtifact,
)
from packages.backend.fnd.ports.media import CancellationToken

logger = logging.getLogger(__name__)


class TesseractOcrProvider:
    def __init__(self, language: str = "eng") -> None:
        self.language = language

    def capabilities(self) -> dict[str, object]:
        return {
            "available": importlib.util.find_spec("pytesseract") is not None,
            "provider": "tesseract",
        }

    def extract_text(self, path: Path) -> str:
        try:
            from PIL import Image, ImageOps
            import pytesseract

            with Image.open(path) as image:
                oriented = ImageOps.exif_transpose(image)
                return normalize_text(
                    pytesseract.image_to_string(oriented, lang=self.language)
                )
        except Exception as exc:
            raise FndError("OCR failed.", code="OCR_FAILED") from exc


class WhisperTranscriptionProvider:
    def __init__(self, model_size: str) -> None:
        self.model_size = model_size
        self.initialization_count = 0
        self.last_initialization_duration_ms: float | None = None
        self._model: object | None = None
        self._lock = Lock()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def capabilities(self) -> dict[str, object]:
        return {
            "available": importlib.util.find_spec("whisper") is not None,
            "provider": "whisper",
            "loaded": self.loaded,
            "model_size": self.model_size,
        }

    def transcribe(self, path: Path) -> dict[str, object]:
        model = self._load_once()
        try:
            return dict(model.transcribe(str(path)))  # type: ignore[attr-defined]
        except Exception as exc:
            raise FndError(
                "Transcription failed.", code="TRANSCRIPTION_FAILED"
            ) from exc

    def _load_once(self) -> object:
        if self._model is not None:
            return self._model

        with self._lock:
            if self._model is None:
                start = perf_counter()
                try:
                    import whisper

                    self._model = whisper.load_model(self.model_size)
                    self.initialization_count += 1
                    self.last_initialization_duration_ms = (
                        perf_counter() - start
                    ) * 1000
                except Exception as exc:
                    raise FndError(
                        "Whisper transcription provider is unavailable.",
                        code="TRANSCRIPTION_FAILED",
                    ) from exc
        return self._model


class FfmpegMediaAdapter:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def capabilities(self) -> dict[str, object]:
        return {
            "ffmpeg": {
                "available": shutil.which(self._settings.ffmpeg_executable) is not None,
                "path": shutil.which(self._settings.ffmpeg_executable)
                or self._settings.ffmpeg_executable,
            }
        }

    def normalize_audio(
        self,
        source: Path,
        target: Path,
        cancellation: CancellationToken,
    ) -> None:
        self._run(
            [
                "-y",
                "-i",
                str(source),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                str(target),
            ],
            cancellation,
            error_code="AUDIO_NORMALIZATION_FAILED",
        )

    def extract_video_audio(
        self,
        source: Path,
        target: Path,
        cancellation: CancellationToken,
    ) -> None:
        self._run(
            [
                "-y",
                "-i",
                str(source),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                str(target),
            ],
            cancellation,
            error_code="AUDIO_NORMALIZATION_FAILED",
        )

    def sample_video_frames(
        self,
        source: Path,
        output_directory: Path,
        *,
        max_frames: int,
        cancellation: CancellationToken,
    ) -> list[Path]:
        output_directory.mkdir(parents=True, exist_ok=True)
        output_pattern = output_directory / "frame_%04d.png"
        fps = max(1, max_frames // 10)
        self._run(
            [
                "-y",
                "-i",
                str(source),
                "-vf",
                f"fps={fps}",
                "-frames:v",
                str(max_frames),
                str(output_pattern),
            ],
            cancellation,
            error_code="FRAME_EXTRACTION_FAILED",
        )
        return sorted(output_directory.glob("frame_*.png"))[:max_frames]

    def _run(
        self,
        args: list[str],
        cancellation: CancellationToken,
        *,
        error_code: str,
    ) -> None:
        executable = shutil.which(self._settings.ffmpeg_executable)
        if executable is None:
            raise FndError("FFmpeg is unavailable.", code="FFMPEG_UNAVAILABLE")

        process = subprocess.Popen(
            [executable, *args],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        while process.poll() is None:
            try:
                cancellation.throw_if_cancelled()
            except JobCancelledError:
                process.terminate()
                raise
        _, stderr = process.communicate(timeout=2)
        if process.returncode != 0:
            logger.debug(
                "FFmpeg command failed",
                extra={"returncode": process.returncode, "stderr": stderr[-500:]},
            )
            raise FndError("FFmpeg processing failed.", code=error_code)


class LocalMediaPreprocessor:
    def __init__(
        self,
        *,
        settings: Settings,
        ocr_provider: TesseractOcrProvider | None = None,
        transcription_provider: WhisperTranscriptionProvider | None = None,
        ffmpeg: FfmpegMediaAdapter | None = None,
    ) -> None:
        self._settings = settings
        self._settings.media_temp_directory.mkdir(parents=True, exist_ok=True)
        self._ocr = ocr_provider or TesseractOcrProvider()
        self._transcription = transcription_provider or WhisperTranscriptionProvider(
            settings.whisper_model_size
        )
        self._ffmpeg = ffmpeg or FfmpegMediaAdapter(settings)

    def capabilities(self) -> dict[str, object]:
        return {
            "ocr": self._ocr.capabilities(),
            "transcription": self._transcription.capabilities(),
            "ffmpeg": self._ffmpeg.capabilities()["ffmpeg"],
            "media_worker": {
                "available": True,
                "concurrency": self._settings.media_worker_concurrency,
            },
        }

    def extract(
        self,
        artifact: StoredArtifact,
        metadata: MediaMetadata,
        cancellation: CancellationToken,
    ) -> tuple[ExtractedDocument, ExtractionMetadata]:
        if artifact.media_type == MediaType.IMAGE:
            return self._extract_image(artifact, metadata, cancellation)
        if artifact.media_type == MediaType.AUDIO:
            return self._extract_audio(artifact, metadata, cancellation)
        return self._extract_video(artifact, metadata, cancellation)

    def _extract_image(
        self,
        artifact: StoredArtifact,
        metadata: MediaMetadata,
        cancellation: CancellationToken,
    ) -> tuple[ExtractedDocument, ExtractionMetadata]:
        start = perf_counter()
        cancellation.throw_if_cancelled()
        text = self._ocr.extract_text(artifact.path)
        warnings = () if text else ("No readable text was extracted from the image.",)
        extraction = ExtractionMetadata(
            media_type=MediaType.IMAGE,
            warnings=warnings,
            channels={"ocr": {"engine": "tesseract", "language": self._ocr.language}},
            timings_ms={"ocr": round((perf_counter() - start) * 1000, 3)},
        )
        return self._document(text=text, metadata=metadata, extraction=extraction)

    def _extract_audio(
        self,
        artifact: StoredArtifact,
        metadata: MediaMetadata,
        cancellation: CancellationToken,
    ) -> tuple[ExtractedDocument, ExtractionMetadata]:
        work_dir = Path(
            mkdtemp(prefix="fnd-audio-", dir=self._settings.media_temp_directory)
        )
        try:
            normalized_path = work_dir / "audio.wav"
            preprocess_start = perf_counter()
            self._ffmpeg.normalize_audio(artifact.path, normalized_path, cancellation)
            transcription_start = perf_counter()
            result = self._transcription.transcribe(normalized_path)
            text, segments = self._transcription_text_and_segments(result)
            extraction = ExtractionMetadata(
                media_type=MediaType.AUDIO,
                warnings=(
                    ()
                    if text
                    else ("No intelligible speech was extracted from the audio.",)
                ),
                channels={
                    "transcript": {
                        "segments": segments,
                        "detected_language": result.get("language"),
                        "model": f"whisper-{self._transcription.model_size}",
                    }
                },
                timings_ms={
                    "preprocessing": round(
                        (transcription_start - preprocess_start) * 1000,
                        3,
                    ),
                    "transcription": round(
                        (perf_counter() - transcription_start) * 1000,
                        3,
                    ),
                },
            )
            return self._document(text=text, metadata=metadata, extraction=extraction)
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    def _extract_video(
        self,
        artifact: StoredArtifact,
        metadata: MediaMetadata,
        cancellation: CancellationToken,
    ) -> tuple[ExtractedDocument, ExtractionMetadata]:
        work_dir = Path(
            mkdtemp(prefix="fnd-video-", dir=self._settings.media_temp_directory)
        )
        try:
            audio_path = work_dir / "audio.wav"
            frame_dir = work_dir / "frames"
            audio_start = perf_counter()
            self._ffmpeg.extract_video_audio(artifact.path, audio_path, cancellation)
            audio_extract_ms = (perf_counter() - audio_start) * 1000

            frame_start = perf_counter()
            frames = self._ffmpeg.sample_video_frames(
                artifact.path,
                frame_dir,
                max_frames=self._settings.max_sampled_video_frames,
                cancellation=cancellation,
            )
            sample_ms = (perf_counter() - frame_start) * 1000

            transcript, transcript_ms, ocr_segments, ocr_ms = (
                self._transcribe_and_ocr_video(audio_path, frames, cancellation)
            )
            transcript_text, transcript_segments = (
                self._transcription_text_and_segments(transcript)
            )

            deduped_ocr = deduplicate_segments(ocr_segments)
            text = merge_media_text_channels(
                transcript_segments=[transcript_text],
                ocr_segments=deduped_ocr,
            )
            extraction = ExtractionMetadata(
                media_type=MediaType.VIDEO,
                warnings=(
                    ()
                    if text
                    else (
                        "No usable speech or frame text was extracted from the video.",
                    )
                ),
                channels={
                    "audio_transcript": {
                        "segments": transcript_segments,
                        "detected_language": transcript.get("language"),
                        "model": f"whisper-{self._transcription.model_size}",
                    },
                    "frame_ocr": {
                        "sampled_frame_count": len(frames),
                        "ocr_frame_count": len(deduped_ocr),
                        "segments": deduped_ocr,
                    },
                },
                timings_ms={
                    "audio_transcription": round(audio_extract_ms + transcript_ms, 3),
                    "frame_extraction_ocr": round(sample_ms + ocr_ms, 3),
                },
            )
            return self._document(text=text, metadata=metadata, extraction=extraction)
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    def _transcribe_and_ocr_video(
        self,
        audio_path: Path,
        frames: list[Path],
        cancellation: CancellationToken,
    ) -> tuple[dict[str, object], float, list[str], float]:
        cancellation.throw_if_cancelled()

        def transcribe() -> tuple[dict[str, object], float]:
            started = perf_counter()
            cancellation.throw_if_cancelled()
            result = self._transcription.transcribe(audio_path)
            return result, (perf_counter() - started) * 1000

        def ocr_frame(frame: Path) -> str:
            cancellation.throw_if_cancelled()
            return self._ocr.extract_text(frame)

        def ocr_frames() -> tuple[list[str], float]:
            started = perf_counter()
            if not frames:
                return [], 0.0
            worker_count = min(8, len(frames))
            with ThreadPoolExecutor(max_workers=worker_count) as pool:
                texts = list(pool.map(ocr_frame, frames))
            return [text for text in texts if text], (perf_counter() - started) * 1000

        with ThreadPoolExecutor(max_workers=2) as pool:
            transcript_future = pool.submit(transcribe)
            ocr_future = pool.submit(ocr_frames)
            transcript, transcript_ms = transcript_future.result()
            ocr_segments, ocr_ms = ocr_future.result()
        return transcript, transcript_ms, ocr_segments, ocr_ms

    def _transcription_text_and_segments(
        self,
        result: dict[str, object],
    ) -> tuple[str, list[dict[str, object]]]:
        raw_segments = result.get("segments")
        segments: list[dict[str, object]] = []
        segment_texts: list[str] = []
        if isinstance(raw_segments, list):
            for segment in raw_segments:
                if not isinstance(segment, dict):
                    continue
                text = normalize_text(segment.get("text", ""))
                if not text:
                    continue
                segments.append(
                    {
                        "start": segment.get("start"),
                        "end": segment.get("end"),
                        "text": text,
                    }
                )
                segment_texts.append(text)

        if not segment_texts:
            segment_texts = [normalize_text(result.get("text", ""))]

        return normalize_text(" ".join(deduplicate_segments(segment_texts))), segments

    def _document(
        self,
        *,
        text: str,
        metadata: MediaMetadata,
        extraction: ExtractionMetadata,
    ) -> tuple[ExtractedDocument, ExtractionMetadata]:
        public_metadata = {
            "media_type": metadata.media_type.value,
            "mime_type": metadata.mime_type,
            "size_bytes": metadata.size_bytes,
            "sha256": metadata.sha256,
            "extraction_warnings": list(extraction.warnings),
        }
        return (
            ExtractedDocument(
                input_type=InputType.FILE,
                text=normalize_text(text),
                source=None,
                metadata=public_metadata,
            ),
            extraction,
        )
