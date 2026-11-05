import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

const port = process.env.TEST_PORT ?? "3000";
const wsUrl = `ws://127.0.0.1:${port}/ws?protocol=json`;
const origin = `http://127.0.0.1:${port}`;


test("Per-IP connection limit", async () => {
  const sockets = [];

  function connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { origin });

      sockets.push(ws);

      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error("Connection timeout"));
      }, 5000);

      ws.once("open", () => {
        clearTimeout(timer);
        resolve("accepted");
      });

      ws.once("unexpected-response", (req, res) => {
        clearTimeout(timer);
        resolve(res.statusCode);
      });

      ws.once("error", reject);
    });
  }

  try {
    const results = [];

    for (let i = 0; i < 11; i++) {
      results.push(await connect());
    }

    assert.equal(results.filter((r) => r === "accepted").length, 10);
    assert.equal(results.filter((r) => r === 429).length, 1);
  } finally {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
  }
});