import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = path.join(root, "server-dist", "server", "src", "index.js");
const port = 3000;
const baseUrl = `http://127.0.0.1:${port}`;
const logDir = await mkdtemp(path.join(os.tmpdir(), "multiplayer-integration-"));

let server;
let testProcess;
let exitCode = 1;

function waitForExit(child, timeout = 5000) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve(true);

    const timer = setTimeout(() => resolve(false), timeout);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function waitForHealth(child) {
  const deadline = Date.now() + 15000;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Server did not become healthy: ${lastError ?? "timeout"}`);
}

try {
  console.log("Building server...");
  const build = spawn("npm", ["run", "build:server"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const buildFinished = await waitForExit(build, 120000);
  if (!buildFinished || build.exitCode !== 0) {
    throw new Error("Server build failed");
  }

  console.log(`Starting integration server on port ${port}...`);

  server = spawn(process.execPath, [serverEntry], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      LOG_DIR: logDir,
      ALLOWED_ORIGINS: `http://localhost:${port},http://127.0.0.1:${port}`,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  await waitForHealth(server);
  console.log("Server is healthy. Running integration tests...");

  const files = (await readdir(path.join(root, "tests", "integration")))
    .filter((file) => file.endsWith(".mjs"))
    .sort()
    .map((file) => path.join(root, "tests", "integration", file));

  testProcess = spawn(
    process.execPath,
    ["--test", "--test-concurrency=1", ...files],
    { cwd: root, stdio: "inherit" },
  );

  await new Promise((resolve, reject) => {
    testProcess.once("error", reject);
    testProcess.once("exit", (code) => {
      exitCode = code ?? 1;
      resolve();
    });
  });
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  if (testProcess && testProcess.exitCode === null) {
    testProcess.kill();
    await waitForExit(testProcess);
  }

  if (server && server.exitCode === null) {
    console.log("Stopping integration server...");
    server.kill("SIGTERM");

    if (!(await waitForExit(server, 8000))) {
      console.error("Server did not stop gracefully; forcing termination.");
      server.kill("SIGKILL");
      await waitForExit(server);
    }
  }

  await rm(logDir, { recursive: true, force: true });
}

process.exitCode = exitCode;
