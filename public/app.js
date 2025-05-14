```js
(async()=>{
  const socket = io({ auth:{ userId:null }});
  let me;

  // Auth handlers
  document.getElementById('btnRegister').onclick = async()=>{
    const u=...
  };
  // ... implement AJAX register, login, then show lobby

  // Lobby
  document.getElementById('btnJoin').onclick=()=>{
    const room=document.getElementById('roomName').value;
    socket.auth.userId=me.id;
    socket.emit('joinRoom',{roomName:room});
    document.getElementById('game').classList.remove('hidden');
  };

  // Socket events: roomUpdate, roundStart, cardPlayed, playerPass, roundEnd, chatMessage, etc.
  // UI updates: render players, hand, pile, chat.
  // Controls: playCard, pass, exchange, ready
  // Timer: setInterval 10s, show countdown
  // Sound: soundCard.play(), navigator.vibrate(), etc.
  // Music toggle and mic toggle
})();
```
(async () => {
  // Socket.io kopplas först efter inloggning
  let socket;
  let me = null;
  let currentRoom = null;
  let timerInterval = null;
  const TIMER_DURATION = 10; // sekunder

  // DOM-element
  const authDiv    = document.getElementById('auth');
  const lobbyDiv   = document.getElementById('lobby');
  const gameDiv    = document.getElementById('game');
  const btnRegister = document.getElementById('btnRegister');
  const btnLogin    = document.getElementById('btnLogin');
  const usernameEl  = document.getElementById('username');
  const passwordEl  = document.getElementById('password');
  const emailEl     = document.getElementById('email');
  const btnJoin     = document.getElementById('btnJoin');
  const roomNameEl  = document.getElementById('roomName');
  const playersDiv  = document.getElementById('players');
  const pileDiv     = document.getElementById('pile');
  const handDiv     = document.getElementById('hand');
  const btnReady    = document.getElementById('btnReady');
  const btnExchange = document.getElementById('btnExchange');
  const timerEl     = document.getElementById('timer');
  const chatLog     = document.getElementById('chatLog');
  const chatMsgEl   = document.getElementById('chatMsg');
  const btnSend     = document.getElementById('btnSend');
  const avatarEl    = document.getElementById('avatar');
  const userLabelEl = document.getElementById('userLabel');
  const fileAvatar  = document.getElementById('fileAvatar');
  const bgMusic     = document.getElementById('bgMusic');
  const btnMusicToggle = document.getElementById('btnMusicToggle');
  const btnMicToggle   = document.getElementById('btnMicToggle');
  const soundCard   = document.getElementById('soundCard');
  const soundPass   = document.getElementById('soundPass');
  const soundWin    = document.getElementById('soundWin');

  // Hjälpfunktioner
  function show(div)   { div.classList.remove('hidden'); }
  function hide(div)   { div.classList.add('hidden'); }
  function vibrate()   { if (navigator.vibrate) navigator.vibrate(200); }
  function resetTimer() {
    clearInterval(timerInterval);
    timerEl.textContent = '';
  }
  function startTimer() {
    let t = TIMER_DURATION;
    timerEl.textContent = t;
    timerInterval = setInterval(() => {
      t--;
      if (t <= 0) {
        clearInterval(timerInterval);
        socket.emit('pass');
      } else {
        timerEl.textContent = t;
      }
    }, 1000);
  }
  function formatCard(c) {
    // Ex: { suit: 'hearts', rank: 'A' } ⇒ 'hearts_A'
    return `${c.suit}_${c.rank}`;
  }

  // Render-funktioner
  function renderPlayers(players, readySet) {
    playersDiv.innerHTML = '';
    players.forEach(p => {
      const div = document.createElement('div');
      div.classList.add('player');
      const img = document.createElement('img');
      img.src = p.img || 'cards/back.png';
      img.width = 40;
      const lbl = document.createElement('span');
      lbl.textContent = p.username + (readySet.has(p.id) ? ' ✅' : '');
      div.append(img, lbl);
      playersDiv.appendChild(div);
    });
  }

  function renderPile(card) {
    if (!card) return;
    pileDiv.style.backgroundImage = `url('cards/${formatCard(card)}.png')`;
  }

  function renderHand(hand) {
    handDiv.innerHTML = '';
    hand.forEach((c, idx) => {
      const cardEl = document.createElement('div');
      cardEl.classList.add('card');
      cardEl.style.backgroundImage = `url('cards/${formatCard(c)}.png')`;
      cardEl.onclick = () => {
        socket.emit('playCard', { card: c });
      };
      handDiv.appendChild(cardEl);
    });
  }

  function addChatMessage(user, msg) {
    const line = document.createElement('div');
    line.innerHTML = `<strong>${user.username}:</strong> ${msg}`;
    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  // Autentisering
  btnRegister.onclick = async () => {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        username: usernameEl.value,
        password: passwordEl.value,
        email:    emailEl.value
      })
    });
    if (res.ok) alert('Registrerad! Logga in nu.');
    else alert('Fel vid registrering.');
  };

  btnLogin.onclick = async () => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        username: usernameEl.value,
        password: passwordEl.value
      })
    });
    if (!res.ok) { alert('Inloggning misslyckades'); return; }
    me = await res.json().then(r => r.user);
    // Visa lobby
    hide(authDiv);
    show(lobbyDiv);
    userLabelEl.textContent = me.username;
    if (me.img) avatarEl.src = me.img;
    // Initiera socket
    socket = io({ auth: { userId: me.id } });
    setupSocketHandlers();
  };

  // Filuppladdning profilbild
  fileAvatar.onchange = async () => {
    const f = fileAvatar.files[0];
    const fd = new FormData();
    fd.append('avatar', f);
    const res = await fetch('/api/uploadProfile', { method:'POST', body:fd });
    if (res.ok) {
      const { img } = await res.json();
      avatarEl.src = img;
    }
  };

  // Anslutning till rum
  btnJoin.onclick = () => {
    const room = roomNameEl.value.trim();
    if (!room) return alert('Ange rum');
    currentRoom = room;
    hide(lobbyDiv);
    show(gameDiv);
    socket.emit('joinRoom', { roomName: room });
  };

  // Socket-hanterare
  function setupSocketHandlers() {
    // När spelrum uppdateras
    socket.on('roomUpdate', game => {
      renderPlayers(game.players, new Set(game.ready || []));
    });

    socket.on('playerReady', readyList => {
      renderPlayers(game.players, new Set(readyList));
    });

    // När alla är redo – starta runda
    socket.on('roundStart', ({ hands, pile, pot }) => {
      renderHand(hands[me.id]);
      renderPile(pile);
      // visa eventuell pott (valfritt: i UI)
      resetTimer();
      startTimer();
    });

    socket.on('handUpdate', hand => {
      renderHand(hand);
    });

    socket.on('potUpdate', pot => {
      console.log('Pot:', pot);
    });

    socket.on('cardPlayed', ({ userId, card }) => {
      renderPile(card);
      soundCard.play();
      vibrate();
      resetTimer();
      startTimer();
    });

    socket.on('playerPass', userId => {
      soundPass.play();
      // visa PASS-overlay (kan implementeras)
    });

    socket.on('roundEnd', ({ winner, pot }) => {
      if (winner === me.id) {
        alert(`Grattis, du vann potten på ${pot} poäng!`);
        soundWin.play();
        vibrate();
      } else {
        alert(`Spelaren ${winner} vann ronden.`);
      }
      resetTimer();
    });

    socket.on('chatMessage', async ({ userId, msg }) => {
      // Hitta användarnamn via game.players
      // För enkelhet, visa bara ID
      addChatMessage({ username: userId }, msg);
    });
  }

  // Knapphändelser i spelet
  btnReady.onclick = () => {
    socket.emit('ready');
    btnReady.disabled = true;
  };

  btnExchange.onclick = () => {
    const s = prompt('Vilka kortindex (0–4) vill du byta? Skriv kommaseparerat, max 3.');
    if (!s) return;
    const indices = s.split(',').map(x => parseInt(x)).filter(n => !isNaN(n));
    socket.emit('exchange', { indices });
  };

  btnSend.onclick = () => {
    const msg = chatMsgEl.value.trim();
    if (!msg) return;
    socket.emit('chatMessage', msg);
    chatMsgEl.value = '';
  };

  // Musik och mikrofon
  btnMusicToggle.onclick = () => {
    if (bgMusic.paused) bgMusic.play();
    else bgMusic.pause();
  };
  btnMicToggle.onclick = () => {
    bgMusic.pause();
  };
})();
