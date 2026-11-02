import { expect, test } from '@playwright/test'

test('two clients join the same room and receive roster and chat', async ({ browser }) => {
  const first = await browser.newContext()
  const second = await browser.newContext()
  const pageA = await first.newPage()
  const pageB = await second.newPage()

  try {
    await Promise.all([pageA.goto('/?protocol=json'), pageB.goto('/?protocol=json')])
    await Promise.all([pageA.locator('#startLoading').click(), pageB.locator('#startLoading').click()])
    await Promise.all([expect(pageA.locator('#lobbyJoinButton')).toBeVisible(), expect(pageB.locator('#lobbyJoinButton')).toBeVisible()])
    await Promise.all([
      pageA.locator('#lobbyPlayerName').fill('Pilot A'),
      pageB.locator('#lobbyPlayerName').fill('Pilot B'),
    ])
    await Promise.all([
      expect(pageA.locator('#lobbyJoinButton')).toBeEnabled(),
      expect(pageB.locator('#lobbyJoinButton')).toBeEnabled(),
    ])
    await Promise.all([
      pageA.locator('#lobbyRoom').selectOption('training'),
      pageB.locator('#lobbyRoom').selectOption('training'),
    ])
    await pageA.locator('#lobbyJoinButton').click()
    await expect(pageA.locator('#rosterList')).toContainText('Pilot A')
    await pageB.locator('#lobbyJoinButton').click()
    await expect(pageA.locator('#rosterList')).toContainText('Pilot B')
    await expect(pageB.locator('#rosterList')).toContainText('Pilot A')

    await pageA.locator('#chatInput').fill('lab07-e2e-message')
    await pageA.getByRole('button', { name: 'Надіслати' }).click()
    await expect(pageB.locator('#chatMessages')).toContainText('lab07-e2e-message')
  } finally {
    await first.close()
    await second.close()
  }
})


test('remote client receives changing authoritative snapshots while first client moves', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()
  const snapshots: Array<{ x: number; y: number }> = []
  pageB.on('websocket', (socket) => {
    socket.on('framereceived', (event) => {
      const payload = event.payload
      if (typeof payload !== 'string') return
      try {
        const message = JSON.parse(payload) as { type?: string; players?: Array<{ name: string; x: number; y: number }> }
        const pilot = message.players?.find((player) => player.name === 'Pilot A')
        if (message.type === 'snapshot' && pilot) snapshots.push({ x: pilot.x, y: pilot.y })
      } catch { /* binary frames are covered by the protocol unit tests */ }
    })
  })
  try {
    await Promise.all([pageA.goto('/?protocol=json'), pageB.goto('/?protocol=json')])
    await Promise.all([pageA.locator('#startLoading').click(), pageB.locator('#startLoading').click()])
    await Promise.all([expect(pageA.locator('#lobbyJoinButton')).toBeVisible(), expect(pageB.locator('#lobbyJoinButton')).toBeVisible()])
    await Promise.all([pageA.locator('#lobbyPlayerName').fill('Pilot A'), pageB.locator('#lobbyPlayerName').fill('Pilot B')])
    await Promise.all([pageA.locator('#lobbyRoom').selectOption('deep-space'), pageB.locator('#lobbyRoom').selectOption('deep-space')])
    await pageA.locator('#lobbyJoinButton').click()
    await pageB.locator('#lobbyJoinButton').click()
    await expect(pageB.locator('#rosterList')).toContainText('Pilot A')
    await pageA.keyboard.down('ArrowUp')
    await expect.poll(() => new Set(snapshots.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)).size, { timeout: 3000 }).toBeGreaterThan(1)
    await pageA.keyboard.up('ArrowUp')
  } finally {
    await contextA.close(); await contextB.close()
  }
})
