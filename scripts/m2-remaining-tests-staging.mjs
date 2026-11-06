import WebSocket from "ws";
import { setTimeout as delay } from "node:timers/promises";

const BASE = "http://127.0.0.1:3001";
const WS_URL = "ws://127.0.0.1:3001/ws?protocol=json";

const results = [];

function log(name, data) {
  const result = { test: name, ...data };
  results.push(result);
  console.log(JSON.stringify(result));
}

async function metrics() {
  const r = await fetch(`${BASE}/metrics`);
  if (!r.ok) throw new Error(`Metrics HTTP ${r.status}`);
  return r.json();
}

async function createRoom(name, maxPlayers = 8) {
  const r = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, maxPlayers })
  });
  if (!r.ok) throw new Error(`Room creation failed: HTTP ${r.status}`);
  const data = await r.json();
  return data.room.id;
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, { origin: "http://localhost:3000" });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("WebSocket connection timeout"));
    }, 10000);

    ws.once("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once("error", err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function join(ws, roomId, name) {
  ws.send(JSON.stringify({ type: "join", roomId, name }));
  await delay(300);
}

async function waitForClose(ws, timeout = 8000) {
  if (ws.readyState === WebSocket.CLOSED) return null;
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve("TIMEOUT"), timeout);
    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

async function waitForPlayers(expected, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const m = await metrics();
    if (m.players === expected) return true;
    await delay(250);
  }
  return false;
}

// ------------------------------------------------------------
// TEST 1: LOAD — 8, 32, 64, 128 CLIENTS
// ------------------------------------------------------------

async function loadTest(count) {
  const sockets = [];
  const tick = [];
  const samples = [];
  let snapshots = 0;
  let inputTimer;
  let metricTimer;

  const started = Date.now();

  try {
    const roomIds = [];
    for (let i = 0; i < Math.ceil(count / 8); i++) {
      roomIds.push(await createRoom(`M2 Load ${count} ${i}`, 8));
    }

    for (let i = 0; i < count; i++) {
      const ws = await connect();
      sockets.push(ws);
      ws.on("message", () => snapshots++);
      ws.send(JSON.stringify({
        type: "join",
        roomId: roomIds[Math.floor(i / 8)],
        name: `Load-${count}-${i}`
      }));
    }

    await delay(1000);

    metricTimer = setInterval(async () => {
      try {
        const m = await metrics();
        if (typeof m.tickP99Ms === "number") tick.push(m.tickP99Ms);
        samples.push(m);
      } catch {}
    }, 250);

    inputTimer = setInterval(() => {
      for (let i = 0; i < sockets.length; i++) {
        const ws = sockets[i];
        if (ws.readyState !== WebSocket.OPEN) continue;
        ws.send(JSON.stringify({
          type: "input",
          seq: Date.now(),
          left: i % 2 === 0,
          right: i % 2 !== 0,
          thrust: true,
          brake: false
        }));
      }
    }, 100);

    await delay(8000);
  } finally {
    clearInterval(inputTimer);
    clearInterval(metricTimer);
    for (const ws of sockets) {
      try { ws.close(); } catch {}
    }
    await delay(1500);
  }

  const elapsed = (Date.now() - started) / 1000;
  const sorted = [...tick].sort((a, b) => a - b);
  const maxTickP99 = sorted.length
    ? sorted[sorted.length - 1]
    : null;
  const last = samples.at(-1);

  log(`LOAD ${count}`, {
    durationSeconds: Number(elapsed.toFixed(1)),
    metricSamples: samples.length,
    maxObservedTickP99Ms: maxTickP99,
    over33msBudget: maxTickP99 == null ? null : maxTickP99 > 33,
    rssMB: last ? Number((last.rssBytes / 1048576).toFixed(1)) : null,
    eventLoopUtilization: last?.eventLoopUtilization ?? null,
    snapshotsReceived: snapshots
  });
}

// ------------------------------------------------------------
// TEST 2: CLIENT DISCONNECTS DURING MATCH
// ------------------------------------------------------------

async function clientDisconnectTest() {
  const before = await metrics();
  const room = await createRoom("M2 Client Disconnect", 4);
  const ws = await connect();

  await join(ws, room, "Disconnect-Test");
  const connected = await metrics();

  ws.terminate();
  await delay(1500);

  const after = await metrics();

  log("CLIENT DISCONNECT", {
    playersBefore: before.players,
    playersAfterJoin: connected.players,
    playersAfterDisconnect: after.players,
    playerRemoved: after.players < connected.players
  });
}

// ------------------------------------------------------------
// TEST 3: SLOW CLIENT
// ------------------------------------------------------------

async function slowClientTest() {
  const room = await createRoom("M2 Slow Client", 8);
  const slow = await connect();
  const normal = [];

  await join(slow, room, "Slow-Reader");

  // Pause reading from the slow client's TCP socket.
  // This lets the server's outbound queue grow if traffic is sufficient.
  if (slow._socket?.pause) slow._socket.pause();

  for (let i = 0; i < 7; i++) {
    const ws = await connect();
    normal.push(ws);
    await join(ws, room, `Normal-${i}`);
  }

  for (let i = 0; i < 7; i++) {
    normal[i].on("message", () => {});
  }

  const start = Date.now();
  let closeResult = null;

  const sender = setInterval(() => {
    for (const ws of normal) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "input",
          seq: Date.now(),
          left: true,
          right: false,
          thrust: true,
          brake: false
        }));
      }
    }
  }, 50);

  while (Date.now() - start < 15000) {
    if (slow.readyState === WebSocket.CLOSED) break;
    await delay(250);
  }

  clearInterval(sender);

  if (slow.readyState === WebSocket.CLOSED) {
    closeResult = "CLOSED";
  } else {
    closeResult = "NOT_TRIGGERED";
  }

  const queuedBytes = slow.bufferedAmount;

  try { slow.terminate(); } catch {}
  for (const ws of normal) {
    try { ws.close(); } catch {}
  }

  await delay(1000);

  log("SLOW CLIENT", {
    result: closeResult,
    clientBufferedBytesAtEnd: queuedBytes,
    note: closeResult === "NOT_TRIGGERED"
      ? "The 1 MB threshold was not reached; this test does not prove slow-client rejection."
      : "Client was disconnected during the test."
  });
}

// ------------------------------------------------------------
// TEST 4: GARBAGE MESSAGES — 1000 FRAMES + HEALTHY ROOM
// ------------------------------------------------------------

async function garbageTest() {
  const attackerRoom = await createRoom("M2 Garbage Room", 4);
  const healthyRoom = await createRoom("M2 Healthy Room", 4);

  const healthy = await connect();
  const attacker = await connect();

  let healthyMessages = 0;
  healthy.on("message", () => healthyMessages++);

  await join(healthy, healthyRoom, "Healthy-Client");
  await join(attacker, attackerRoom, "Garbage-Client");

  const before = await metrics();
  const healthyBefore = healthyMessages;

  let sent = 0;
  const started = Date.now();

  // Send up to 1000 malformed protocol messages as quickly as possible.
  for (let i = 0; i < 1000; i++) {
    if (attacker.readyState !== WebSocket.OPEN) break;
    attacker.send("{invalid-json");
    sent++;
  }

  const close = await waitForClose(attacker, 5000);
  await delay(1500);

  const after = await metrics();

  log("GARBAGE FRAMES", {
    attemptedFrames: 1000,
    framesSent: sent,
    durationMs: Date.now() - started,
    attackerClose: close,
    healthyRoomMessagesBefore: healthyBefore,
    healthyRoomMessagesAfter: healthyMessages,
    healthyRoomReceivedDuringTest: healthyMessages > healthyBefore,
    rejectedConnectionsBefore: before.rejectedConnections,
    rejectedConnectionsAfter: after.rejectedConnections
  });

  try { attacker.terminate(); } catch {}
  try { healthy.close(); } catch {}
  await delay(1000);
}

// ------------------------------------------------------------
// RUN
// ------------------------------------------------------------

console.log("M2 REMAINING TESTS STARTED");

for (const count of [8, 32, 64, 128]) {
  try {
    await loadTest(count);
  } catch (err) {
    log(`LOAD ${count} FAILED`, { error: err.message });
    break;
  }
}

for (const [name, fn] of [
  ["CLIENT DISCONNECT", clientDisconnectTest],
  ["SLOW CLIENT", slowClientTest],
  ["GARBAGE FRAMES", garbageTest]
]) {
  try {
    await fn();
  } catch (err) {
    log(`${name} FAILED`, { error: err.message });
  }
}

console.log("\n========== M2 TEST SUMMARY ==========");
console.log(JSON.stringify(results, null, 2));

