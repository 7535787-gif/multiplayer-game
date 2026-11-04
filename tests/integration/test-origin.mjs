import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

const URL = "ws://localhost:3000/ws?protocol=json";

function connect(origin) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL, { origin });

    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Connection timeout"));
    }, 5000);

    ws.once("open", () => {
      clearTimeout(timer);
      ws.close();
      resolve("accepted");
    });

    ws.once("unexpected-response", (req, res) => {
      clearTimeout(timer);
      resolve(res.statusCode);
    });

    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test("Origin validation", async () => {
  assert.equal(await connect("http://localhost:3000"), "accepted");
  assert.equal(await connect("http://evil.example"), 403);
});