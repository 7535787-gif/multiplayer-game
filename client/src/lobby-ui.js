export class LobbyUI extends EventTarget {
    constructor(container) {
      super()
  
      this.element = document.createElement('section')
      this.element.className = 'lobby-screen'
      this.element.id = 'lobbyScreen'
      this.element.hidden = true
  
      this.element.innerHTML = `
        <div class="lobby-card">
          <p class="lobby-kicker">DEEP SPACE / MULTIPLAYER</p>
  
          <h1 class="lobby-title">FLIGHT LOBBY</h1>
  
          <p class="lobby-description">
            Введи ім'я, обери кімнату та підготуйся до польоту.
          </p>
  
          <form class="lobby-form" id="lobbyForm">
            <label class="lobby-label" for="lobbyPlayerName">
              Ім'я гравця
            </label>
  
            <input
              class="lobby-input"
              id="lobbyPlayerName"
              name="playerName"
              type="text"
              maxlength="24"
              autocomplete="nickname"
              placeholder="Введи своє ім'я"
              required
            />
  
            <label class="lobby-label" for="lobbyRoom">
              Ігрова кімната
            </label>
  
            <select
              class="lobby-input"
              id="lobbyRoom"
              name="roomId"
              required
            >
              <option value="">Завантаження кімнат...</option>
            </select>
  
            <p
              class="lobby-status"
              id="lobbyStatus"
              role="status"
              aria-live="polite"
            >
              Завантажуємо список кімнат...
            </p>
  
            <button
              class="lobby-join-button"
              id="lobbyJoinButton"
              type="submit"
              disabled
            >
              ПРИЄДНАТИСЯ
            </button>
          </form>
        </div>
      `
  
      container.appendChild(this.element)
  
      this.form = this.element.querySelector('#lobbyForm')
      this.nameInput = this.element.querySelector('#lobbyPlayerName')
      this.roomSelect = this.element.querySelector('#lobbyRoom')
      this.statusElement = this.element.querySelector('#lobbyStatus')
      this.joinButton = this.element.querySelector('#lobbyJoinButton')
  
      this.roomsAvailable = false
  
      this.form.addEventListener('submit', (event) => {
        event.preventDefault()
  
        const playerName = this.nameInput.value.trim()
        const roomId = this.roomSelect.value
  
        if (!playerName) {
          this.setStatus('Введи ім’я гравця.', 'error')
          this.nameInput.focus()
          return
        }
  
        if (!roomId || !this.roomsAvailable) {
          this.setStatus('Спочатку обери доступну кімнату.', 'error')
          return
        }
  
        this.dispatchEvent(
          new CustomEvent('join-request', {
            detail: {
              playerName,
              roomId,
            },
          })
        )
      })
    }
  
    show() {
      this.element.hidden = false
    }
  
    hide() {
      this.element.hidden = true
    }
  
    setRooms(rooms) {
      const previousRoomId = this.roomSelect.value
  
      this.roomSelect.replaceChildren()
  
      this.roomsAvailable = Array.isArray(rooms) && rooms.length > 0
  
      if (!this.roomsAvailable) {
        const option = document.createElement('option')
        option.value = ''
        option.textContent = 'Немає доступних кімнат'
        this.roomSelect.appendChild(option)
  
        this.roomSelect.disabled = true
        this.joinButton.disabled = true
        this.setStatus('Наразі немає доступних кімнат.', 'error')
  
        return
      }
  
      for (const room of rooms) {
        const option = document.createElement('option')
        option.value = room.id
  
        const playerCount = room.players ?? 0
        const maxPlayers = room.maxPlayers ?? '?'
  
        option.textContent =
          `${room.name} — ${playerCount}/${maxPlayers} гравців`
  
        this.roomSelect.appendChild(option)
      }
  
      this.roomSelect.disabled = false
  
      const previousRoomExists = rooms.some(
        (room) => room.id === previousRoomId
      )
  
      this.roomSelect.value = previousRoomExists
        ? previousRoomId
        : rooms[0].id
  
      this.joinButton.disabled = false
  
      this.setStatus(
        `Доступно кімнат: ${rooms.length}`,
        'info'
      )
    }
  
    setStatus(message, type = 'info') {
      this.statusElement.textContent = message
      this.statusElement.dataset.state = type
    }
  
    setBusy(busy) {
      this.joinButton.disabled = busy || !this.roomsAvailable
  
      this.joinButton.textContent = busy
        ? 'ПРИЄДНАННЯ...'
        : 'ПРИЄДНАТИСЯ'
    }
  }