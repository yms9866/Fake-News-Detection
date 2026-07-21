"""Local file extraction adapter for the compatibility CLI."""

from __future__ import annotations

import os
from pathlib import Path
import platform

from packages.backend.fnd.domain.entities import ExtractedDocument, normalize_text
from packages.backend.fnd.domain.enums import InputType
from packages.backend.fnd.domain.errors import ExtractionError, UnsupportedInputError


class LocalFileExtractor:
    def extract(self, path: Path) -> ExtractedDocument:
        if not path.exists():
            raise ExtractionError(f"Input file does not exist: {path}")

        suffix = path.suffix.lower()

        if suffix in {".txt", ".csv"}:
            text = normalize_text(path.read_text(encoding="utf-8", errors="ignore"))
        elif suffix in {".png", ".jpg", ".jpeg", ".tiff", ".bmp"}:
            text = self._extract_image_text(path)
        elif suffix in {".mp3", ".wav", ".m4a", ".flac"}:
            text = self._extract_audio_text(path)
        elif suffix in {".mp4", ".avi", ".mkv", ".mov"}:
            text = self._extract_video_text(path)
        else:
            raise UnsupportedInputError(f"Unsupported file extension: {suffix}")

        if not text:
            raise ExtractionError("Extraction finished but produced empty text.")

        return ExtractedDocument(
            input_type=InputType.FILE,
            text=text,
            source=str(path),
            metadata={"suffix": suffix},
        )

    def _extract_image_text(self, image_path: Path) -> str:
        from PIL import Image
        import pytesseract

        if platform.system() == "Windows":
            pytesseract.pytesseract.tesseract_cmd = (
                r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
            )
            if not os.path.exists(pytesseract.pytesseract.tesseract_cmd):
                raise FileNotFoundError(
                    "Tesseract executable not found at "
                    f"{pytesseract.pytesseract.tesseract_cmd!r}."
                )

        image = Image.open(image_path)
        text = normalize_text(pytesseract.image_to_string(image))

        if not text:
            raise ExtractionError("OCR finished but found no readable text in the image.")

        return text

    def _extract_audio_text(self, audio_path: Path) -> str:
        import whisper

        model = whisper.load_model("base")
        result = model.transcribe(str(audio_path))
        return normalize_text(result.get("text", ""))

    def _extract_video_text(self, video_path: Path) -> str:
        import cv2
        from PIL import Image
        import pytesseract

        try:
            audio_text = self._extract_audio_text(video_path)
            if audio_text:
                return audio_text
        except Exception:
            pass

        cap = cv2.VideoCapture(str(video_path))
        frame_rate = cap.get(cv2.CAP_PROP_FPS)

        if frame_rate <= 0:
            cap.release()
            raise ExtractionError("Invalid video file or unable to read frame rate.")

        text_samples: list[str] = []
        count = 0
        sample_every = max(int(frame_rate), 1)

        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break

            if count % sample_every == 0:
                image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                frame_text = normalize_text(pytesseract.image_to_string(image))

                if frame_text and frame_text not in text_samples:
                    text_samples.append(frame_text)

            count += 1

        cap.release()

        extracted_text = normalize_text(" ".join(text_samples))
        if not extracted_text:
            raise ExtractionError("Video analysis found no usable audio or readable frame text.")

        return extracted_text
