import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

test("Excessive message rate is limited", async () => {
  const ws = new WebSocket(
    "ws://localhost:3000/ws?protocol=json",
    { origin: "http://localhost:3000" }
  );

  let joined = false;

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Rate limit was not enforced"));
    }, 10000);

    ws.once("open", () => {
      ws.send(JSON.stringify({
        type: "join",
        roomId: "training",
        name: "RateLimitTest",
      }));
    });

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === "joined" && !joined) {
        joined = true;

        for (let i = 0; i < 200; i++) {
          if (ws.readyState !== WebSocket.OPEN) break;

          ws.send(JSON.stringify({
            type: "ping",
            sentAt: Date.now(),
          }));
        }
      }
    });

    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });

    ws.once("error", reject);
  });

  assert.equal(joined, true);
  assert.equal(result.code, 1008);
  assert.match(result.reason, /rate limit/i);
});