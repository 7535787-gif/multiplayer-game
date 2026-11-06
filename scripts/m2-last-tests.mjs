import WebSocket from "ws";
import { setTimeout as delay } from "node:timers/promises";

const BASE = "http://127.0.0.1:3001";
const WS = "ws://127.0.0.1:3001/ws?protocol=json";
const ORIGIN = "http://localhost:3000";
const suffix = Date.now();

async function metrics() {
  const r = await fetch(`${BASE}/metrics`);
  if (!r.ok) throw new Error(`Metrics HTTP ${r.status}`);
  return r.json();
}

async function room(name) {
  const r = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `${name}-${suffix}`, maxPlayers: 8 })
  });
  if (!r.ok) throw new Error(`Room HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()).room.id;
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS, { origin: ORIGIN });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Connection timeout"));
    }, 10000);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once("error", reject);
  });
}

async function join(ws, roomId, name) {
  ws.send(JSON.stringify({ type: "join", roomId, name }));
  await delay(400);
}

async function slowClientTest() {
  console.log("\n=== SLOW CLIENT ===");

  const roomId = await room("M2-Slow");
  const slow = await connect();
  const senders = [];

  await join(slow, roomId, "Slow-Reader");
  slow._socket.pause();

  for (let i = 0; i < 7; i++) {
    const ws = await connect();
    senders.push(ws);
    await join(ws, roomId, `Sender-${i}`);
  }

  const before = await metrics();
  const start = Date.now();
  const samples = [];

  const monitor = setInterval(async () => {
    try {
      const m = await metrics();
      samples.push(m.rejectedConnections?.["slow-client"] ?? 0);
    } catch {}
  }, 250);

  const text = "X".repeat(490);
  const sendIntervals = senders.map((ws, i) =>
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "chat",
          text: `${i}-${text}`
        }));
      }
    }, 10)
  );

  while (Date.now() - start < 30000) {
    const current = await metrics();
    const count = current.rejectedConnections?.["slow-client"] ?? 0;
    const initial = before.rejectedConnections?.["slow-client"] ?? 0;
    if (count > initial) break;
    await delay(250);
  }

  for (const timer of sendIntervals) clearInterval(timer);
  clearInterval(monitor);

  const after = await metrics();
  const initial = before.rejectedConnections?.["slow-client"] ?? 0;
  const final = after.rejectedConnections?.["slow-client"] ?? 0;

  console.log(JSON.stringify({
    test: "SLOW CLIENT",
    durationSeconds: Number(((Date.now() - start) / 1000).toFixed(1)),
    slowClientRejectionsBefore: initial,
    slowClientRejectionsAfter: final,
    serverDetectedSlowClient: final > initial,
    tickP99Ms: after.tickP99Ms
  }, null, 2));

  slow.terminate();
  for (const ws of senders) ws.close();
  await delay(1000);
}

async function garbageTest() {
  console.log("\n=== GARBAGE ATTACK ===");

  const attackRoom = await room("M2-Attack");
  const healthyRoom = await room("M2-Healthy");

  const attacker = await connect();
  const receiver = await connect();
  const sender = await connect();

  let healthyMessages = 0;
  receiver.on("message", () => healthyMessages++);

  await join(attacker, attackRoom, "Attacker");
  await join(receiver, healthyRoom, "Healthy-Receiver");
  await join(sender, healthyRoom, "Healthy-Sender");

  const before = await metrics();
  const baselineMessages = healthyMessages;
  const tickSamples = [];

  const monitor = setInterval(async () => {
    try {
      const m = await metrics();
      if (Number.isFinite(m.tickP99Ms)) tickSamples.push(m.tickP99Ms);
    } catch {}
  }, 100);

  const healthyTraffic = setInterval(() => {
    if (sender.readyState === WebSocket.OPEN) {
      sender.send(JSON.stringify({ type: "chat", text: "healthy traffic" }));
    }
  }, 20);

  await delay(200);

  const started = Date.now();
  let sent = 0;

  for (let i = 0; i < 1000; i++) {
    if (attacker.readyState !== WebSocket.OPEN) break;
    attacker.send("{invalid-json");
    sent++;
  }

  const close = await new Promise(resolve => {
    if (attacker.readyState === WebSocket.CLOSED) return resolve("already closed");
    const timer = setTimeout(() => resolve("timeout"), 5000);
    attacker.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });

  await delay(1500);

  clearInterval(healthyTraffic);
  clearInterval(monitor);

  const after = await metrics();

  console.log(JSON.stringify({
    test: "GARBAGE ATTACK",
    attemptedFrames: 1000,
    framesSent: sent,
    sendDurationMs: Date.now() - started,
    attackerClose: close,
    invalidJsonBefore: before.rejectedConnections?.["invalid-json"] ?? 0,
    invalidJsonAfter: after.rejectedConnections?.["invalid-json"] ?? 0,
    rateLimitAfter: after.rejectedConnections?.["rate-limit"] ?? 0,
    healthyRoomReceivedDuringAttack: healthyMessages > baselineMessages,
    healthyMessagesReceived: healthyMessages - baselineMessages,
    maxTickP99DuringAttackMs: tickSamples.length ? Math.max(...tickSamples) : null
  }, null, 2));

  attacker.terminate();
  receiver.close();
  sender.close();
  await delay(1000);
}

try {
  await slowClientTest();
} catch (e) {
  console.error("SLOW CLIENT FAILED:", e.message);
}

try {
  await garbageTest();
} catch (e) {
  console.error("GARBAGE ATTACK FAILED:", e.message);
}