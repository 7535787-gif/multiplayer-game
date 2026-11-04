import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

test("Per-IP connection limit", async () => {
  const sockets = [];

  function connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(
        "ws://localhost:3000/ws?protocol=json",
        { origin: "http://localhost:3000" }
      );

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