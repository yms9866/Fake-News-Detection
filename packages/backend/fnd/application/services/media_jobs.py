"""Application services for Slice 3 media analysis jobs."""

from __future__ import annotations

from dataclasses import dataclass, replace
import hashlib
import json
import logging
from time import perf_counter
from uuid import uuid4

from packages.backend.fnd.application.workflows.analyze_content import (
    AnalyzeContentWorkflow,
)
from packages.backend.fnd.application.services.forensics import ForensicPluginRegistry
from packages.backend.fnd.config.settings import Settings
from packages.backend.fnd.domain.entities import ExtractedDocument, normalize_text
from packages.backend.fnd.domain.forensics import ForensicPluginResult
from packages.backend.fnd.domain.enums import InputType, JobStatus, MediaType
from packages.backend.fnd.domain.errors import (
    FndError,
    JobCancelledError,
    JobNotFoundError,
    MediaValidationError,
)
from packages.backend.fnd.domain.media import (
    AnalysisJob,
    ExtractionMetadata,
    JobError,
    MediaAnalysisAccepted,
    MediaAnalysisJobCommand,
    MediaMetadata,
    StoredArtifact,
)
from packages.backend.fnd.ports.media import (
    AnalysisResultRepository,
    ArtifactStore,
    IdempotencyRepository,
    JobEventRepository,
    JobQueue,
    JobRepository,
    MediaPreprocessor,
    MediaProbe,
)

logger = logging.getLogger(__name__)

UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE"
MEDIA_SIGNATURE_MISMATCH = "MEDIA_SIGNATURE_MISMATCH"
MEDIA_TOO_LARGE = "MEDIA_TOO_LARGE"
MEDIA_TOO_LONG = "MEDIA_TOO_LONG"
MEDIA_CORRUPTED = "MEDIA_CORRUPTED"
NO_TEXT_EXTRACTED = "NO_TEXT_EXTRACTED"
IDEMPOTENCY_KEY_CONFLICT = "IDEMPOTENCY_KEY_CONFLICT"
JOB_EXECUTION_FAILED = "JOB_EXECUTION_FAILED"


def _log_job_event(event: str, **fields: object) -> None:
    logger.info(json.dumps({"event": event, **fields}, ensure_ascii=True))


@dataclass(frozen=True)
class MediaUploadCommand:
    media_type: MediaType
    content: bytes
    original_filename: str
    mime_type: str
    deep_check: bool
    max_length: int | None
    endpoint: str
    request_id: str
    trace_id: str
    idempotency_key: str | None = None
    client_context: str = "anonymous"


class MediaUploadValidator:
    """Validate upload size, declared MIME type, and magic bytes."""

    _allowed_mime_types: dict[MediaType, set[str]] = {
        MediaType.IMAGE: {
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/bmp",
            "image/tiff",
        },
        MediaType.AUDIO: {
            "audio/wav",
            "audio/x-wav",
            "audio/mpeg",
            "audio/mp3",
            "audio/mp4",
            "audio/x-m4a",
            "audio/flac",
            "audio/ogg",
            "audio/webm",
        },
        MediaType.VIDEO: {
            "video/mp4",
            "video/quicktime",
            "video/x-matroska",
            "video/webm",
        },
    }

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def validate_bytes(
        self,
        *,
        media_type: MediaType,
        content: bytes,
        mime_type: str,
    ) -> None:
        normalized_mime = self._normalize_mime(mime_type)
        if normalized_mime not in self._allowed_mime_types[media_type]:
            raise MediaValidationError(
                f"Unsupported {media_type.value} MIME type.",
                code=UNSUPPORTED_MEDIA_TYPE,
            )

        max_size = self._max_size_bytes(media_type)
        if len(content) > max_size:
            raise MediaValidationError(
                f"{media_type.value.title()} upload exceeds the configured size limit.",
                code=MEDIA_TOO_LARGE,
            )

        if len(content) == 0:
            raise MediaValidationError("Uploaded file is empty.", code=MEDIA_CORRUPTED)

        if self._looks_executable_or_archive(content):
            raise MediaValidationError(
                "Uploaded file signature is not allowed.",
                code=MEDIA_SIGNATURE_MISMATCH,
            )

        if not self._signature_matches(normalized_mime, content):
            raise MediaValidationError(
                "Declared MIME type does not match the uploaded file signature.",
                code=MEDIA_SIGNATURE_MISMATCH,
            )

    def validate_metadata(
        self,
        *,
        media_type: MediaType,
        metadata: MediaMetadata,
    ) -> None:
        duration = metadata.details.get("duration_seconds")
        if duration is None:
            return

        duration_seconds = float(duration)
        if media_type == MediaType.AUDIO:
            limit = self._settings.max_audio_duration_seconds
        elif media_type == MediaType.VIDEO:
            limit = self._settings.max_video_duration_seconds
        else:
            return

        if duration_seconds > limit:
            raise MediaValidationError(
                f"{media_type.value.title()} duration exceeds the configured limit.",
                code=MEDIA_TOO_LONG,
            )

    def _max_size_bytes(self, media_type: MediaType) -> int:
        if media_type == MediaType.IMAGE:
            return self._settings.max_image_size_mb * 1024 * 1024
        if media_type == MediaType.AUDIO:
            return self._settings.max_audio_size_mb * 1024 * 1024
        return self._settings.max_video_size_mb * 1024 * 1024

    def _normalize_mime(self, mime_type: str) -> str:
        return mime_type.split(";", 1)[0].strip().lower()

    def _looks_executable_or_archive(self, content: bytes) -> bool:
        signatures = (
            b"MZ",
            b"\x7fELF",
            b"PK\x03\x04",
            b"Rar!\x1a\x07",
            b"7z\xbc\xaf\x27\x1c",
        )
        return content.startswith(signatures)

    def _signature_matches(self, mime_type: str, content: bytes) -> bool:
        if mime_type == "image/png":
            return content.startswith(b"\x89PNG\r\n\x1a\n")
        if mime_type == "image/jpeg":
            return content.startswith(b"\xff\xd8\xff")
        if mime_type == "image/webp":
            return content.startswith(b"RIFF") and content[8:12] == b"WEBP"
        if mime_type == "image/bmp":
            return content.startswith(b"BM")
        if mime_type == "image/tiff":
            return content.startswith((b"II*\x00", b"MM\x00*"))
        if mime_type in {"audio/wav", "audio/x-wav"}:
            return content.startswith(b"RIFF") and content[8:12] == b"WAVE"
        if mime_type in {"audio/mpeg", "audio/mp3"}:
            return content.startswith(b"ID3") or content.startswith(
                (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")
            )
        if mime_type in {"audio/flac"}:
            return content.startswith(b"fLaC")
        if mime_type in {"audio/ogg"}:
            return content.startswith(b"OggS")
        if mime_type in {"audio/webm", "video/webm", "video/x-matroska"}:
            return content.startswith(b"\x1aE\xdf\xa3")
        if mime_type in {"audio/mp4", "audio/x-m4a", "video/mp4", "video/quicktime"}:
            return len(content) > 12 and content[4:8] == b"ftyp"
        return False


class RepositoryCancellationToken:
    def __init__(self, jobs: JobRepository, job_id: str) -> None:
        self._jobs = jobs
        self._job_id = job_id

    def throw_if_cancelled(self) -> None:
        job = self._jobs.get(self._job_id)
        if job is None:
            raise JobCancelledError("Job is no longer available.")
        if job.cancel_requested or job.status == JobStatus.CANCELLED:
            raise JobCancelledError("Job cancellation was requested.")


class MediaAnalysisSubmissionService:
    def __init__(
        self,
        *,
        settings: Settings,
        artifacts: ArtifactStore,
        jobs: JobRepository,
        events: JobEventRepository,
        idempotency: IdempotencyRepository,
        analyses: AnalysisResultRepository,
        queue: JobQueue,
        media_probe: MediaProbe,
    ) -> None:
        self._validator = MediaUploadValidator(settings)
        self._artifacts = artifacts
        self._jobs = jobs
        self._events = events
        self._idempotency = idempotency
        self._analyses = analyses
        self._queue = queue
        self._media_probe = media_probe

    def submit(self, command: MediaUploadCommand) -> MediaAnalysisAccepted:
        validation_start = perf_counter()
        content_hash = hashlib.sha256(command.content).hexdigest()

        if command.idempotency_key:
            existing = self._idempotency.get(
                client_context=command.client_context,
                endpoint=command.endpoint,
                key=command.idempotency_key,
            )
            if existing is not None:
                existing_hash, accepted = existing
                if existing_hash != content_hash:
                    raise MediaValidationError(
                        "Idempotency-Key was reused for different uploaded content.",
                        code=IDEMPOTENCY_KEY_CONFLICT,
                    )
                return accepted

        self._validator.validate_bytes(
            media_type=command.media_type,
            content=command.content,
            mime_type=command.mime_type,
        )

        artifact: StoredArtifact | None = None
        try:
            artifact = self._artifacts.save(
                media_type=command.media_type,
                content=command.content,
                original_filename=command.original_filename,
                mime_type=command.mime_type,
            )
            metadata = self._media_probe.probe(artifact)
            self._validator.validate_metadata(
                media_type=command.media_type,
                metadata=metadata,
            )

            analysis_id = str(uuid4())
            job_id = str(uuid4())
            job = AnalysisJob(
                job_id=job_id,
                analysis_id=analysis_id,
                artifact_id=artifact.artifact_id,
                media_type=command.media_type,
                request_id=command.request_id,
                trace_id=command.trace_id,
                media_metadata=metadata,
            )
            self._jobs.create(job)
            self._events.append(
                job_id=job_id,
                status=JobStatus.QUEUED,
                progress=0,
                message="Queued",
                metadata={"media_type": command.media_type.value},
            )
            self._analyses.mark_queued(
                analysis_id=analysis_id,
                job_id=job_id,
                media_type=command.media_type,
                request_id=command.request_id,
                trace_id=command.trace_id,
            )

            accepted = MediaAnalysisAccepted(
                analysis_id=analysis_id,
                job_id=job_id,
                status=JobStatus.QUEUED,
                input_type=InputType.FILE,
                media_type=command.media_type,
                request_id=command.request_id,
                trace_id=command.trace_id,
            )
            if command.idempotency_key:
                self._idempotency.save(
                    client_context=command.client_context,
                    endpoint=command.endpoint,
                    key=command.idempotency_key,
                    content_hash=content_hash,
                    accepted=accepted,
                )

            self._queue.enqueue(
                MediaAnalysisJobCommand(
                    job_id=job_id,
                    analysis_id=analysis_id,
                    artifact_id=artifact.artifact_id,
                    deep_check=command.deep_check,
                    max_length=command.max_length,
                    request_id=command.request_id,
                    trace_id=command.trace_id,
                )
            )
            _log_job_event(
                "media_upload_accepted",
                analysis_id=analysis_id,
                job_id=job_id,
                media_type=command.media_type.value,
                size_bytes=len(command.content),
                validation_duration_ms=round(
                    (perf_counter() - validation_start) * 1000,
                    3,
                ),
                trace_id=command.trace_id,
            )
            return accepted
        except Exception:
            if artifact is not None:
                self._artifacts.delete(artifact.artifact_id)
            raise


class MediaAnalysisJobService:
    def __init__(
        self,
        *,
        settings: Settings,
        workflow: AnalyzeContentWorkflow,
        artifacts: ArtifactStore,
        jobs: JobRepository,
        events: JobEventRepository,
        analyses: AnalysisResultRepository,
        media_preprocessor: MediaPreprocessor,
        forensic_plugins: ForensicPluginRegistry | None = None,
    ) -> None:
        self._settings = settings
        self._workflow = workflow
        self._artifacts = artifacts
        self._jobs = jobs
        self._events = events
        self._analyses = analyses
        self._media_preprocessor = media_preprocessor
        self._forensic_plugins = forensic_plugins or ForensicPluginRegistry()

    def cancel(self, job_id: str) -> AnalysisJob:
        job = self._jobs.get(job_id)
        if job is None:
            raise JobNotFoundError("Job was not found.", code="JOB_NOT_FOUND")

        if job.terminal:
            return job

        job.request_cancel()
        if job.status == JobStatus.QUEUED:
            job.transition(
                JobStatus.CANCELLED,
                progress=job.progress,
                message="Job cancelled before execution.",
                error=JobError(
                    code="JOB_CANCELLED",
                    message="Job was cancelled.",
                    retryable=False,
                ),
            )
            self._events.append(
                job_id=job.job_id,
                status=job.status,
                progress=job.progress,
                message=job.message,
            )
            self._artifacts.delete(job.artifact_id)
            self._analyses.mark_failed(
                analysis_id=job.analysis_id,
                error_code="JOB_CANCELLED",
                message="Job was cancelled before execution.",
                request_id=job.request_id,
                trace_id=job.trace_id,
            )
        else:
            self._events.append(
                job_id=job.job_id,
                status=job.status,
                progress=job.progress,
                message="Cancellation requested.",
            )

        self._jobs.save(job)
        return job

    def execute(self, command: MediaAnalysisJobCommand) -> None:
        job = self._jobs.get(command.job_id)
        if job is None or job.terminal:
            return

        artifact = self._artifacts.get(command.artifact_id)
        if artifact is None:
            self._fail_job(
                job,
                code="TEMPORARY_STORAGE_FAILED",
                message="Uploaded artifact is no longer available.",
                retryable=True,
            )
            return

        total_start = perf_counter()
        cancellation = RepositoryCancellationToken(self._jobs, job.job_id)

        try:
            cancellation.throw_if_cancelled()
            self._transition(job, JobStatus.VALIDATING, 5, "Validating media")
            metadata = job.media_metadata or MediaMetadata(
                media_type=artifact.media_type,
                mime_type=artifact.mime_type,
                size_bytes=artifact.size_bytes,
                sha256=artifact.sha256,
            )

            cancellation.throw_if_cancelled()
            self._transition(job, JobStatus.PREPROCESSING, 15, "Preprocessing media")

            cancellation.throw_if_cancelled()
            self._transition(job, JobStatus.EXTRACTING, 35, "Extracting media text")
            document, extraction_metadata = self._media_preprocessor.extract(
                artifact,
                metadata,
                cancellation,
            )

            cancellation.throw_if_cancelled()
            self._transition(job, JobStatus.CLEANING, 55, "Cleaning extracted text")
            forensic_results = self._forensic_plugins.analyze_artifact(
                artifact=artifact,
                metadata=metadata,
                timeout_seconds=self._settings.forensic_plugin_timeout_seconds,
            )
            document = self._document_with_media_metadata(
                document=document,
                metadata=metadata,
                extraction_metadata=extraction_metadata,
                forensic_results=forensic_results,
            )

            if not normalize_text(document.text):
                document = replace(
                    document,
                    metadata={
                        **document.metadata,
                        "extraction_warning": "No readable text was extracted.",
                        "extraction_error_code": NO_TEXT_EXTRACTED,
                    },
                )

            cancellation.throw_if_cancelled()
            self._transition(
                job,
                JobStatus.STYLE_ANALYSIS,
                70,
                "Running shared analysis workflow",
            )

            if command.deep_check and normalize_text(document.text):
                self._transition(job, JobStatus.SEARCHING, 78, "Searching evidence")
                self._transition(
                    job,
                    JobStatus.FETCHING_EVIDENCE,
                    84,
                    "Fetching evidence",
                )
                self._transition(job, JobStatus.VERIFYING, 90, "Verifying evidence")

            cancellation.throw_if_cancelled()
            self._transition(job, JobStatus.DECIDING, 95, "Applying verdict policy")
            result = self._workflow.analyze_document(
                document=document,
                deep_check=command.deep_check,
                max_length=command.max_length,
                max_search_results=self._settings.max_search_results,
            )
            self._analyses.save_result(
                analysis_id=command.analysis_id,
                result=result,
                request_id=command.request_id,
                trace_id=command.trace_id,
            )
            self._transition(job, JobStatus.COMPLETED, 100, "Analysis completed")
            if not self._settings.retain_uploaded_artifacts:
                self._artifacts.delete(artifact.artifact_id)
            _log_job_event(
                "media_job_completed",
                analysis_id=job.analysis_id,
                job_id=job.job_id,
                media_type=job.media_type.value,
                total_job_duration_ms=round((perf_counter() - total_start) * 1000, 3),
                trace_id=job.trace_id,
            )
        except JobCancelledError:
            self._cancel_running_job(job, artifact)
        except FndError as exc:
            self._fail_job(
                job,
                code=exc.code,
                message=str(exc) or "Media analysis failed.",
                retryable=False,
            )
            if not self._settings.retain_failed_artifacts:
                self._artifacts.delete(artifact.artifact_id)
        except Exception as exc:
            logger.debug(
                "Unhandled media job failure",
                extra={
                    "analysis_id": job.analysis_id,
                    "job_id": job.job_id,
                    "media_type": job.media_type.value,
                    "trace_id": job.trace_id,
                    "error_type": exc.__class__.__name__,
                },
            )
            self._fail_job(
                job,
                code=JOB_EXECUTION_FAILED,
                message="Media analysis failed during job execution.",
                retryable=True,
            )
            if not self._settings.retain_failed_artifacts:
                self._artifacts.delete(artifact.artifact_id)

    def _document_with_media_metadata(
        self,
        *,
        document: ExtractedDocument,
        metadata: MediaMetadata,
        extraction_metadata: ExtractionMetadata,
        forensic_results: list[ForensicPluginResult] | None = None,
    ) -> ExtractedDocument:
        merged_metadata = {
            **document.metadata,
            "media_type": metadata.media_type.value,
            "media_metadata": metadata.public_dict(),
            "extraction_metadata": extraction_metadata.public_dict(),
            "forensic_results": [
                result.public_dict() for result in (forensic_results or [])
            ],
        }
        return replace(
            document,
            input_type=InputType.FILE,
            source=None,
            metadata=merged_metadata,
        )

    def _transition(
        self,
        job: AnalysisJob,
        status: JobStatus,
        progress: int,
        message: str,
    ) -> None:
        job.transition(status, progress=progress, message=message)
        self._jobs.save(job)
        self._events.append(
            job_id=job.job_id,
            status=status,
            progress=job.progress,
            message=message,
        )

    def _cancel_running_job(self, job: AnalysisJob, artifact: StoredArtifact) -> None:
        if not job.terminal:
            job.transition(
                JobStatus.CANCELLED,
                progress=job.progress,
                message="Job cancelled.",
                error=JobError(
                    code="JOB_CANCELLED",
                    message="Job was cancelled.",
                    retryable=False,
                ),
            )
            self._jobs.save(job)
            self._events.append(
                job_id=job.job_id,
                status=job.status,
                progress=job.progress,
                message=job.message,
            )
        self._artifacts.delete(artifact.artifact_id)
        self._analyses.mark_failed(
            analysis_id=job.analysis_id,
            error_code="JOB_CANCELLED",
            message="Job was cancelled.",
            request_id=job.request_id,
            trace_id=job.trace_id,
        )

    def _fail_job(
        self,
        job: AnalysisJob,
        *,
        code: str,
        message: str,
        retryable: bool,
    ) -> None:
        if not job.terminal:
            job.transition(
                JobStatus.FAILED,
                progress=job.progress,
                message=message,
                error=JobError(code=code, message=message, retryable=retryable),
            )
            self._jobs.save(job)
            self._events.append(
                job_id=job.job_id,
                status=job.status,
                progress=job.progress,
                message=message,
                metadata={"error_code": code},
            )
        self._analyses.mark_failed(
            analysis_id=job.analysis_id,
            error_code=code,
            message=message,
            request_id=job.request_id,
            trace_id=job.trace_id,
        )
