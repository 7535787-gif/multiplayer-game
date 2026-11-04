import WebSocket from "ws";
import { setTimeout as delay } from "node:timers/promises";

const BASE = "http://127.0.0.1:3000";
const WS_URL = "ws://127.0.0.1:3000/ws?protocol=json";

async function metrics() {
  const r = await fetch(`${BASE}/metrics`);
  if (!r.ok) throw new Error(`Metrics HTTP ${r.status}`);
  return r.json();
}

async function room(name, maxPlayers = 8) {
  const r = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, maxPlayers })
  });
  if (!r.ok) throw new Error(`Room HTTP ${r.status}`);
  return (await r.json()).room.id;
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      origin: "http://localhost:3000"
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Connection timeout"));
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
  await delay(400);
}

// --------------------------------------------------
// TEST 1: LOAD 128 CLIENTS
// --------------------------------------------------

async function load128() {
  console.log("\n========== LOAD 128 ==========");

  const sockets = [];
  const samples = [];
  const started = Date.now();
  let timer;

  try {
    const rooms = [];
    for (let i = 0; i < 16; i++) {
      rooms.push(await room(`M2 Final Load ${i}`, 8));
    }

    for (let i = 0; i < 128; i++) {
      const ws = await connect();
      sockets.push(ws);
      ws.send(JSON.stringify({
        type: "join",
        roomId: rooms[Math.floor(i / 8)],
        name: `Load128-${i}`
      }));
    }

    await delay(1000);

    timer = setInterval(async () => {
      try {
        samples.push(await metrics());
      } catch {}
    }, 500);

    const inputTimer = setInterval(() => {
      for (let i = 0; i < sockets.length; i++) {
        const ws = sockets[i];
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "input",
            seq: Date.now() + i,
            left: i % 2 === 0,
            right: i % 2 !== 0,
            thrust: true,
            brake: false
          }));
        }
      }
    }, 100);

    await delay(8000);
    clearInterval(inputTimer);

  } finally {
    clearInterval(timer);
    for (const ws of sockets) {
      try { ws.close(); } catch {}
    }
    await delay(2000);
  }

  const p99 = samples.map(x => x.tickP99Ms).filter(Number.isFinite);
  const maxP99 = p99.length ? Math.max(...p99) : null;
  const last = samples.at(-1);

  console.log(JSON.stringify({
    test: "LOAD 128",
    clientsConnected: sockets.length,
    durationSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    samples: samples.length,
    maxObservedTickP99Ms: maxP99,
    within33msBudget: maxP99 !== null && maxP99 <= 33,
    rssMB: last ? Number((last.rssBytes / 1048576).toFixed(1)) : null
  }, null, 2));
}

// --------------------------------------------------
// TEST 2: SLOW CLIENT — SERVER OUTBOUND BUFFER
// --------------------------------------------------

async function slowClient() {
  console.log("\n========== SLOW CLIENT ==========");

  const roomId = await room("M2 Slow Client Final", 8);
  const slow = await connect();
  const senders = [];

  await join(slow, roomId, "Slow-Reader");

  // Stop reading incoming TCP data from this client.
  slow._socket.pause();

  for (let i = 0; i < 7; i++) {
    const ws = await connect();
    senders.push(ws);
    await join(ws, roomId, `Sender-${i}`);
  }

  const before = await metrics();
  const started = Date.now();

  let closeCode = null;
  slow.on("close", code => { closeCode = code; });

  // Each sender emits approximately 100 chat messages/sec.
  // Every message is broadcast to all clients in this room.
  const text = "X".repeat(500);

  const intervals = senders.map((ws, index) =>
    setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: "chat",
        text: `${index}-${text}`
      }));
    }, 10)
  );

  // Allow enough time for TCP backpressure and heartbeat check.
  await delay(30000);

  for (const interval of intervals) clearInterval(interval);

  const after = await metrics();

  const beforeCount = before.rejectedConnections?.["slow-client"] ?? 0;
  const afterCount = after.rejectedConnections?.["slow-client"] ?? 0;

  console.log(JSON.stringify({
    test: "SLOW CLIENT",
    durationSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    slowClientRejectionsBefore: beforeCount,
    slowClientRejectionsAfter: afterCount,
    slowClientRejectionsDelta: afterCount - beforeCount,
    clientCloseCode: closeCode,
    serverDetectedSlowClient: afterCount > beforeCount
  }, null, 2));

  try { slow.terminate(); } catch {}
  for (const ws of senders) {
    try { ws.close(); } catch {}
  }

  await delay(1500);
}

try {
  await load128();
} catch (error) {
  console.error("LOAD 128 FAILED:", error.message);
}

try {
  await slowClient();
} catch (error) {
  console.error("SLOW CLIENT FAILED:", error.message);
}

console.log("\n========== FINAL METRICS ==========");
console.log(JSON.stringify(await metrics(), null, 2));
