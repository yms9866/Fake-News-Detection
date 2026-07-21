import { spawn as nodeSpawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  DESKTOP_ERROR_CODES,
  DesktopRuntimeError,
  normalizeBackendOrigin,
  redactSecret,
  validateTimeoutMs
} from "../../src/shared/runtime-validation.js";

export function defaultBackendCommand() {
  return {
    command: "python",
    args: [
      "-m",
      "uvicorn",
      "apps.api.app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      "8000"
    ],
    cwd: process.cwd()
  };
}

export class BackendProcessManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.spawnImpl = options.spawnImpl || nodeSpawn;
    this.clock = options.clock || (() => Date.now());
    this.sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.process = null;
    this.owned = false;
    this.logs = [];
    this.status = {
      state: "idle",
      origin: normalizeBackendOrigin(options.backendOrigin),
      owned: false,
      pid: null,
      ready: false,
      error: null
    };
  }

  getStatus() {
    return { ...this.status, logs: [...this.logs] };
  }

  getLogs() {
    return [...this.logs];
  }

  appendLog(message) {
    const line = redactSecret(message);
    this.logs.push(line);
    if (this.logs.length > 100) {
      this.logs.shift();
    }
  }

  async detectExisting(origin = this.status.origin) {
    const normalized = normalizeBackendOrigin(origin);
    const live = await this.checkLive(normalized, 1500);
    if (live) {
      this.status = {
        ...this.status,
        state: "connected-existing",
        origin: normalized,
        owned: false,
        pid: null,
        ready: await this.checkReady(normalized, 1500),
        error: null
      };
      return true;
    }
    return false;
  }

  async start(config = {}) {
    const origin = normalizeBackendOrigin(config.backendOrigin || this.status.origin);
    const startupTimeoutMs = validateTimeoutMs(config.startupTimeoutMs, 30000);
    if (this.process && this.owned) {
      return this.getStatus();
    }
    if (await this.detectExisting(origin)) {
      return this.getStatus();
    }

    const command = config.backendCommand || defaultBackendCommand();
    this.status = {
      ...this.status,
      state: "starting",
      origin,
      owned: true,
      ready: false,
      error: null
    };

    try {
      const child = this.spawnImpl(command.command, command.args || [], {
        cwd: command.cwd || process.cwd(),
        env: { ...process.env, ...(command.env || {}) },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
      this.process = child;
      this.owned = true;
      this.status = { ...this.status, pid: child.pid || null };
      this.bindProcess(child);
    } catch (error) {
      const message = error && error.message ? error.message : "Backend process could not be started.";
      this.status = {
        ...this.status,
        state: "failed",
        owned: false,
        pid: null,
        error: { code: DESKTOP_ERROR_CODES.backendUnavailable, message }
      };
      return this.getStatus();
    }

    const live = await this.waitForLive(origin, startupTimeoutMs);
    if (!live) {
      this.status = {
        ...this.status,
        state: "failed",
        ready: false,
        error: {
          code: DESKTOP_ERROR_CODES.backendTimeout,
          message: "Timed out waiting for the local backend to become live."
        }
      };
      return this.getStatus();
    }

    this.status = {
      ...this.status,
      state: "running-owned",
      ready: await this.checkReady(origin, 1500),
      error: null
    };
    return this.getStatus();
  }

  bindProcess(child) {
    if (child.stdout && child.stdout.on) {
      child.stdout.on("data", (chunk) => this.appendLog(String(chunk)));
    }
    if (child.stderr && child.stderr.on) {
      child.stderr.on("data", (chunk) => this.appendLog(String(chunk)));
    }
    if (child.on) {
      child.on("exit", (code, signal) => {
        const unexpected = this.status.state === "running-owned" || this.status.state === "starting";
        this.process = null;
        this.owned = false;
        this.status = {
          ...this.status,
          state: unexpected ? "exited" : "stopped",
          owned: false,
          pid: null,
          ready: false,
          error: unexpected
            ? {
                code: "DESKTOP_BACKEND_EXITED",
                message: `Backend exited with code ${code ?? "unknown"}${signal ? ` and signal ${signal}` : ""}.`
              }
            : null
        };
        this.emit("exit", this.status);
      });
    }
  }

  async stop() {
    if (!this.process || !this.owned) {
      this.status = { ...this.status, state: "idle", owned: false, pid: null, ready: false };
      return this.getStatus();
    }
    const child = this.process;
    this.status = { ...this.status, state: "stopping" };
    if (child.kill) {
      child.kill();
    }
    this.process = null;
    this.owned = false;
    this.status = {
      ...this.status,
      state: "stopped",
      owned: false,
      pid: null,
      ready: false,
      error: null
    };
    return this.getStatus();
  }

  async checkLive(origin = this.status.origin, timeoutMs = 1500) {
    return await this.checkJson(`${normalizeBackendOrigin(origin)}/v1/health/live`, timeoutMs);
  }

  async checkReady(origin = this.status.origin, timeoutMs = 1500) {
    return await this.checkJson(`${normalizeBackendOrigin(origin)}/v1/health/ready`, timeoutMs);
  }

  async checkJson(url, timeoutMs) {
    if (!this.fetchImpl) {
      return false;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      return Boolean(response && response.ok);
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  async waitForLive(origin, timeoutMs) {
    const deadline = this.clock() + timeoutMs;
    while (this.clock() <= deadline) {
      if (await this.checkLive(origin, 1000)) {
        return true;
      }
      await this.sleep(250);
    }
    return false;
  }

  ensureRunning() {
    if (this.status.state !== "running-owned" && this.status.state !== "connected-existing") {
      throw new DesktopRuntimeError(
        DESKTOP_ERROR_CODES.backendUnavailable,
        "The local backend is not connected."
      );
    }
  }
}
