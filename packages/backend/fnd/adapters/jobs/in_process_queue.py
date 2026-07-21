"""Lightweight in-process development queue."""

from __future__ import annotations

from collections.abc import Callable
import logging
from queue import Empty, Queue
from threading import Event, Lock, Thread

from packages.backend.fnd.domain.media import MediaAnalysisJobCommand

logger = logging.getLogger(__name__)


class InProcessJobQueue:
    def __init__(
        self,
        *,
        handler: Callable[[MediaAnalysisJobCommand], None],
        concurrency: int = 1,
    ) -> None:
        self._handler = handler
        self._concurrency = max(1, concurrency)
        self._queue: Queue[MediaAnalysisJobCommand | None] = Queue()
        self._stop = Event()
        self._threads: list[Thread] = []
        self._lock = Lock()

    @property
    def concurrency(self) -> int:
        return self._concurrency

    def start(self) -> None:
        with self._lock:
            if self._threads:
                return
            self._stop.clear()
            for index in range(self._concurrency):
                thread = Thread(
                    target=self._run,
                    name=f"fnd-media-worker-{index + 1}",
                    daemon=True,
                )
                thread.start()
                self._threads.append(thread)

    def stop(self) -> None:
        with self._lock:
            if not self._threads:
                return
            self._stop.set()
            for _ in self._threads:
                self._queue.put(None)
            threads = list(self._threads)
            self._threads.clear()

        for thread in threads:
            thread.join(timeout=5)

    def enqueue(self, command: MediaAnalysisJobCommand) -> None:
        self.start()
        self._queue.put(command)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                command = self._queue.get(timeout=0.2)
            except Empty:
                continue

            try:
                if command is None:
                    return
                self._handler(command)
            except Exception:
                logger.exception("Media job handler raised unexpectedly.")
            finally:
                self._queue.task_done()


class SynchronousJobQueue:
    """Deterministic queue useful for tests and local smoke checks."""

    def __init__(self, handler: Callable[[MediaAnalysisJobCommand], None]) -> None:
        self._handler = handler
        self.enqueued: list[MediaAnalysisJobCommand] = []

    def start(self) -> None:
        return

    def stop(self) -> None:
        return

    def enqueue(self, command: MediaAnalysisJobCommand) -> None:
        self.enqueued.append(command)
        self._handler(command)
