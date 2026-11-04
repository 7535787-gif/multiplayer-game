import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

test("Client that does not join is disconnected", async () => {
  const ws = new WebSocket(
    "ws://localhost:3000/ws?protocol=json",
    { origin: "http://localhost:3000" }
  );

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