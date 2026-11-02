import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const durationMs = 30000
const response = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Lab 7 performance run', maxPlayers: 9 }) })
if (!response.ok) throw new Error(`Room creation failed: HTTP ${response.status}`)
const { room } = await response.json()
const botResponse = await fetch(`${base}/api/rooms/${room.id}/bots`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ count: 8 }) })
if (!botResponse.ok) throw new Error(`Bot creation failed: HTTP ${botResponse.status} ${await botResponse.text()}`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
try {
  await page.goto(`${base}/?protocol=json`)
  await page.locator('#startLoading').click()
  await page.locator('#lobbyPlayerName').fill('Performance Pilot')
  await page.locator('#lobbyRoom').selectOption(room.id)
  await page.locator('#lobbyJoinButton').click()
  await page.waitForSelector('#gameUi:not([hidden])')
  await page.keyboard.down('ArrowUp')
  await page.keyboard.down('Space')
  await page.waitForTimeout(durationMs)
  await page.keyboard.up('ArrowUp')
  await page.keyboard.up('Space')
  const report = await page.evaluate(() => (window).__lab7Performance?.() ?? null)
  if (!report) throw new Error('Performance collector was not loaded in the browser build')
  const output = { roomId: room.id, bots: 8, durationSeconds: durationMs / 1000, capturedAt: new Date().toISOString(), ...report }
  await writeFile('performance-client.json', JSON.stringify(output, null, 2))
  await page.screenshot({ path: 'performance-client.png', fullPage: true })
  console.log(JSON.stringify(output, null, 2))
} finally { await browser.close() }
