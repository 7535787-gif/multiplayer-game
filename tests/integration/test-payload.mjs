import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

test("Oversized payload is rejected", async () => {
  const ws = new WebSocket(
    "ws://localhost:3000/ws?protocol=json",
    { origin: "http://localhost:3000" }
  );

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Payload limit was not enforced"));
    }, 5000);

    ws.once("open", () => {
      ws.send("A".repeat(5000));
    });

    ws.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });

    ws.once("error", reject);
  });

  assert.equal(result, 1009);
});