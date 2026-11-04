import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverEntry = path.join(projectRoot, "server-dist", "server", "src", "index.js");

async function getFreePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine an available TCP port");
  }
  const { port } = address;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 15000;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Test server did not become healthy: ${lastError ?? "timeout"}`);
}

test("Room creation limit is enforced in an isolated server", async () => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logDir = await mkdtemp(path.join(os.tmpdir(), "multiplayer-room-limit-"));
  const child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      MAX_ROOMS: "5",
      LOG_DIR: logDir,
      ALLOWED_ORIGINS: `http://localhost:${port},http://127.0.0.1:${port}`,
    },
    stdio: "ignore",
  });

  try {
    await waitForHealth(baseUrl, child);

    const initialResponse = await fetch(`${baseUrl}/api/rooms`);
    assert.equal(initialResponse.status, 200);
    const initialData = await initialResponse.json();
    const initialCount = initialData.rooms.length;

    // The server starts with three persistent rooms. With MAX_ROOMS=5,
    // exactly two additional rooms should be accepted.
    assert.equal(initialCount, 3, "Expected three predefined rooms at startup");

    for (let i = 1; i <= 2; i++) {
      const response = await fetch(`${baseUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `LimitTest${i}`, maxPlayers: 2 }),
      });
      assert.equal(response.status, 201, `Room ${i} should be created`);
    }

    const fullResponse = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "LimitTestOverflow", maxPlayers: 2 }),
    });
    assert.equal(fullResponse.status, 409);
    assert.deepEqual(await fullResponse.json(), { error: "Room limit reached" });

    const finalResponse = await fetch(`${baseUrl}/api/rooms`);
    const finalData = await finalResponse.json();
    assert.equal(finalData.rooms.length, 5);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    await rm(logDir, { recursive: true, force: true });
  }
});
