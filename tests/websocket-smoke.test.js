import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer as createNetServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket from 'ws'
import { decodePacket, encodeInput } from '../shared/network-protocol.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function getFreePort() {
  const server = createNetServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForHealth(port, child, getOutput) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${getOutput()}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await delay(100)
  }
  throw new Error(`Server did not become healthy: ${getOutput()}`)
}

function exerciseProtocol(port, protocol) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?protocol=${protocol}`)
    let joined = false
    let gotPong = false
    let gotAcknowledgedSnapshot = false
    let playerId = null
    const timeout = setTimeout(() => {
      socket.terminate()
      reject(new Error(`${protocol}: timed out waiting for joined/pong/acknowledged snapshot`))
    }, 5000)

    const finish = () => {
      if (!joined || !gotPong || !gotAcknowledgedSnapshot) return
      clearTimeout(timeout)
      socket.close()
      resolve({ protocol, joined, gotPong, gotAcknowledgedSnapshot })
    }

    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'join', name: 'Protocol test', roomId: 'training' }))
    })

    socket.on('message', (raw, isBinary) => {
      let message
      try {
        message = isBinary ? decodePacket(raw) : JSON.parse(raw.toString())
      } catch (error) {
        clearTimeout(timeout)
        socket.terminate()
        reject(error)
        return
      }

      if (message.type === 'joined') {
        joined = true
        playerId = message.playerId
        socket.send(JSON.stringify({ type: 'ping', sentAt: Math.round(performance.now()) }))
        const input = { type: 'input', seq: 1, left: false, right: false, thrust: true, brake: false }
        if (protocol === 'binary') {
          // Exercise the actual binary input path using the shared packet codec.
          socket.send(encodeInput(input))
        } else {
          socket.send(JSON.stringify(input))
        }
      } else if (message.type === 'pong') {
        gotPong = true
      } else if (message.type === 'snapshot') {
        const ownPlayer = message.players.find((player) => player.id === playerId)
        if (ownPlayer && ownPlayer.ackSeq >= 1) gotAcknowledgedSnapshot = true
      }
      finish()
    })

    socket.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}



function exerciseTwoClients(port) {
  return new Promise((resolve, reject) => {
    const clients = [
      { protocol: 'json', socket: new WebSocket(`ws://127.0.0.1:${port}/ws?protocol=json`), joined: false, id: null, sawBoth: false },
      { protocol: 'binary', socket: new WebSocket(`ws://127.0.0.1:${port}/ws?protocol=binary`), joined: false, id: null, sawBoth: false },
    ]
    let fireRelayed = false
    let fireSent = false
    const timeout = setTimeout(() => {
      for (const client of clients) client.socket.terminate()
      reject(new Error(`two-client test timed out: ${JSON.stringify({ clients: clients.map(({ protocol, joined, sawBoth }) => ({ protocol, joined, sawBoth })), fireRelayed })}`))
    }, 5000)

    const finish = () => {
      if (!clients.every((client) => client.joined && client.sawBoth) || !fireRelayed) return
      clearTimeout(timeout)
      for (const client of clients) client.socket.close()
      resolve({ bothClientsSawSnapshots: true, remoteFireRelayed: fireRelayed })
    }

    for (const client of clients) {
      client.socket.on('open', () => {
        client.socket.send(JSON.stringify({ type: 'join', name: `Pilot ${client.protocol}`, roomId: 'training' }))
      })
      client.socket.on('message', (raw, isBinary) => {
        let message
        try {
          message = isBinary ? decodePacket(raw) : JSON.parse(raw.toString())
        } catch (error) {
          clearTimeout(timeout)
          reject(error)
          return
        }
        if (message.type === 'joined') {
          client.joined = true
          client.id = message.playerId
          if (client.protocol === 'json' && !fireSent) {
            fireSent = true
            client.socket.send(JSON.stringify({ type: 'fire', homing: false }))
          }
        } else if (message.type === 'snapshot' && message.players.length >= 2) {
          client.sawBoth = clients.every((item) => item.id && message.players.some((player) => player.id === item.id))
        } else if (message.type === 'fire' && client.protocol === 'binary') {
          fireRelayed = true
        }
        finish()
      })
      client.socket.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    }
  })
}

test('WebSocket JSON and binary modes both join, pong, and acknowledge inputs', async (t) => {
  const port = await getFreePort()
  const logDir = await mkdtemp(path.join(tmpdir(), 'multiplayer-game-lab05-'))
  const child = spawn(process.execPath, ['server/src/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), LOG_DIR: logDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        delay(2500),
      ])
      if (child.exitCode === null) {
        child.kill('SIGKILL')
        await Promise.race([
          new Promise((resolve) => child.once('exit', resolve)),
          delay(1000),
        ])
      }
    }
    await rm(logDir, { recursive: true, force: true })
  })

  await waitForHealth(port, child, () => output)
  const jsonResult = await exerciseProtocol(port, 'json')
  const binaryResult = await exerciseProtocol(port, 'binary')
  const twoClientResult = await exerciseTwoClients(port)
  assert.equal(jsonResult.gotAcknowledgedSnapshot, true)
  assert.equal(binaryResult.gotAcknowledgedSnapshot, true)
  assert.deepEqual(twoClientResult, { bothClientsSawSnapshots: true, remoteFireRelayed: true })
})
