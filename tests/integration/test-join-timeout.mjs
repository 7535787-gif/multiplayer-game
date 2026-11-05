import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

const port = process.env.TEST_PORT ?? "3000";
const wsUrl = `ws://127.0.0.1:${port}/ws?protocol=json`;
const origin = `http://127.0.0.1:${port}`;

test("Client that does not join is disconnected", async () => {
  const ws = new WebSocket(wsUrl, { origin });

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Join timeout was not enforced"));
    }, 10000);

    ws.once("open", () => {});

    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });

    ws.once("error", reject);
  });

  assert.equal(result.code, 1008);
  assert.match(result.reason, /join timeout/i);
});