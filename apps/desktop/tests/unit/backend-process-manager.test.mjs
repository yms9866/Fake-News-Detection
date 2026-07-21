import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { BackendProcessManager } from "../../dist/electron/main/backend-process-manager.js";

function childProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 4242;
  child.killCalled = false;
  child.kill = () => {
    child.killCalled = true;
    child.emit("exit", 0, null);
  };
  return child;
}

test("existing backend detection does not spawn a process", async () => {
  let spawned = false;
  const manager = new BackendProcessManager({
    backendOrigin: "http://127.0.0.1:8000",
    fetchImpl: async () => ({ ok: true }),
    spawnImpl: () => {
      spawned = true;
      return childProcess();
    }
  });
  assert.equal(await manager.detectExisting(), true);
  assert.equal(manager.getStatus().state, "connected-existing");
  assert.equal(spawned, false);
});

test("backend starts once and preserves owned process id", async () => {
  let liveCalls = 0;
  let spawnCount = 0;
  const manager = new BackendProcessManager({
    backendOrigin: "http://127.0.0.1:8000",
    fetchImpl: async (url) => {
      if (String(url).includes("/ready")) {
        return { ok: true };
      }
      liveCalls += 1;
      return { ok: liveCalls > 1 };
    },
    spawnImpl: () => {
      spawnCount += 1;
      return childProcess();
    }
  });
  const first = await manager.start({ startupTimeoutMs: 1000 });
  const second = await manager.start({ startupTimeoutMs: 1000 });
  assert.equal(first.pid, 4242);
  assert.equal(second.pid, 4242);
  assert.equal(spawnCount, 1);
  assert.equal(second.owned, true);
});

test("backend startup timeout returns structured failure", async () => {
  let now = 0;
  const manager = new BackendProcessManager({
    backendOrigin: "http://127.0.0.1:8000",
    fetchImpl: async () => ({ ok: false }),
    spawnImpl: () => childProcess(),
    clock: () => {
      now += 500;
      return now;
    },
    sleep: async () => {}
  });
  const status = await manager.start({ startupTimeoutMs: 1000 });
  assert.equal(status.state, "failed");
  assert.equal(status.error.code, "DESKTOP_BACKEND_TIMEOUT");
});

test("stop only kills an owned process", async () => {
  let child;
  let now = 0;
  const manager = new BackendProcessManager({
    backendOrigin: "http://127.0.0.1:8000",
    fetchImpl: async () => ({ ok: false }),
    spawnImpl: () => {
      child = childProcess();
      return child;
    },
    clock: () => {
      now += 2;
      return now;
    },
    sleep: async () => {}
  });
  await manager.start({ startupTimeoutMs: 1 });
  await manager.stop();
  assert.equal(child.killCalled, true);
  assert.equal(manager.getStatus().owned, false);
});

test("unexpected backend exit is surfaced safely", async () => {
  let child;
  let liveCalls = 0;
  const manager = new BackendProcessManager({
    backendOrigin: "http://127.0.0.1:8000",
    fetchImpl: async () => {
      liveCalls += 1;
      return { ok: liveCalls > 1 };
    },
    spawnImpl: () => {
      child = childProcess();
      return child;
    }
  });
  await manager.start({ startupTimeoutMs: 1000 });
  child.emit("exit", 9, null);
  assert.equal(manager.getStatus().state, "exited");
  assert.equal(manager.getStatus().error.code, "DESKTOP_BACKEND_EXITED");
});

test("backend logs redact token-like values", () => {
  const manager = new BackendProcessManager({ backendOrigin: "http://127.0.0.1:8000", fetchImpl: async () => ({ ok: false }) });
  manager.appendLog("pairing_token=secret-value token: another-secret");
  assert.equal(manager.getLogs()[0].includes("secret-value"), false);
  assert.equal(manager.getLogs()[0].includes("another-secret"), false);
});
