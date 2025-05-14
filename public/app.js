(async () => {
  // --- Variabler ---
  let socket;
  let me = null;
  let currentRoom = null;
  let timerInterval = null;
  const TIMER_DURATION = 10; // sekunder

  // --- DOM-element ---
  const authDiv       = document.getElementById('auth');
  const lobbyDiv      = document.getElementById('lobby');
  const gameDiv       = document.getElementById('game');
  const btnRegister   = document.getElementById('btnRegister');
  const btnLogin      = document.getElementById('btnLogin');
  const usernameEl    = document.getElementById('username');
  const passwordEl    = document.getElementById('password');
  const emailEl       = document.getElementById('email');
  const btnJoin       = document.getElementById('btnJoin');
  const maxPlayersEl  = document.getElementById('maxPlayers');
  const roomNameEl    = document.getElementById('roomName');
  const playersDiv    = document.getElementById('players');
  const pileDiv       = document.getElementById('pile');
  const handDiv       = document.getElementById('hand');
  const btnReady      = document.getElementById('btnReady');
  const confirmBtn    = document.getElementById('btnConfirmDiscard');
  const timerEl       = document.getElementById('timer');
  const chatLog       = document.getElementById('chatLog');
  const chatMsgEl     = document.getElementById('chatMsg');
  const btnSend       = document.getElementById('btnSend');
  const avatarEl      = document.getElementById('avatar');
  const userLabelEl   = document.getElementById('userLabel');
  const fileAvatar    = document.getElementById('fileAvatar');
  const bgMusic       = document.getElementById('bgMusic');
  const btnMusicToggle = document.getElementById('btnMusicToggle');
  const btnMicToggle   = document.getElementById('btnMicToggle');
  const soundCard     = document.getElementById('soundCard');
  const soundPass     = document.getElementById('soundPass');
  const soundWin      = document.getElementById('soundWin');

  // --- Hjälpfunktioner ---
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }
  function vibrate() { navigator.vibrate && navigator.vibrate(200); }
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
    return `${c.suit}_${c.rank}`;
  }

  // --- Renderfunktioner ---
  function renderPlayers(players, readySet) {
    playersDiv.innerHTML = '';
    players.forEach(p => {
      const d = document.createElement('div');
      d.className = 'player';
      const img = document.createElement('img');
      img.src = p.img || 'cards/back.png';
      img.width = 40;
      const lbl = document.createElement('span');
      lbl.textContent = p.username + (readySet.has(p.id) ? ' ✅' : '');
      d.append(img, lbl);
      playersDiv.appendChild(d);
    });
  }
  function renderPile(card) {
    pileDiv.style.backgroundImage = card
      ? `url('cards/${formatCard(card)}.png')`
      : '';
  }
  function renderHand(hand) {
    handDiv.innerHTML = '';
    hand.forEach(c => {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.backgroundImage = `url('cards/${formatCard(c)}.png')`;
      handDiv.appendChild(el);
    });
  }
  function addChat(user, msg) {
    const ln = document.createElement('div');
    ln.innerHTML = `<strong>${user}:</strong> ${msg}`;
    chatLog.appendChild(ln);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  // --- Auth: Registrera ---
  btnRegister.onclick = async () => {
    const payload = {
      username: usernameEl.value,
      password: passwordEl.value,
      email:    emailEl.value
    };
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if (res.ok) alert('Registrerad! Logga in nu.');
    else {
      const { error } = await res.json().catch(()=>({}));
      alert('Fel vid registrering: ' + (error||res.status));
    }
  };

  // --- Auth: Logga in ---
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
    const { user } = await res.json();
    me = user;
    hide(authDiv); show(lobbyDiv);
    userLabelEl.textContent = me.username;
    if (me.img) avatarEl.src = me.img;
    socket = io({ auth: { userId: me.id } });
    setupSocketHandlers();
  };

  // --- Profilbild ---
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

  // --- Gå med i rum ---
  btnJoin.onclick = () => {
    const room = roomNameEl.value.trim();
    const maxP = parseInt(maxPlayersEl.value);
    if (!room) return alert('Ange ett rumsnamn');
    currentRoom = room;
    hide(lobbyDiv); show(gameDiv);
    socket.emit('joinRoom', { roomName: room, maxPlayers: maxP });
  };

  // --- Socket.IO handlers ---
  function setupSocketHandlers() {
    socket.on('roomUpdate', game => {
      renderPlayers(game.players, new Set(game.ready || []));
    });
    socket.on('playerReady', readyList => {
      renderPlayers( [], new Set(readyList)); // game.players should be in closure if needed
    });
    socket.on('roundStart', ({ hands, pile }) => {
      renderHand(hands[me.id]);
      renderPile(pile);
      // markera bytbara kort
      [...handDiv.children].forEach((el, i) => {
        el.onclick = () => el.classList.toggle('selected');
      });
      show(confirmBtn);
      resetTimer(); startTimer();
    });
    socket.on('handUpdate', hand => {
      renderHand(hand);
    });
    socket.on('potUpdate', pot => console.log('Pot:', pot));
    socket.on('cardPlayed', ({ userId, card }) => {
      renderPile(card);
      soundCard.play(); vibrate();
      resetTimer(); startTimer();
    });
    socket.on('playerPass', userId => { soundPass.play(); });
    socket.on('roundEnd', ({ winner, pot }) => {
      if (winner === me.id) { alert('Grattis! Du vann potten på ' + pot); soundWin.play(); vibrate(); }
      else alert('Spelare ' + winner + ' vann.');
      resetTimer();
    });
    socket.on('chatMessage', ({ userId, msg }) => addChat(userId, msg));
  }

  // --- Spelkontroller ---
  btnReady.onclick = () => {
    socket.emit('ready');
    btnReady.disabled = true;
  };
  confirmBtn.onclick = () => {
    const indices = [...handDiv.children]
      .map((c, i) => c.classList.contains('selected') ? i : null)
      .filter(i => i !== null);
    socket.emit('exchange', { indices });
    hide(confirmBtn);
  };
  btnSend.onclick = () => {
    const m = chatMsgEl.value.trim();
    if (!m) return;
    socket.emit('chatMessage', m);
    chatMsgEl.value = '';
  };
  btnMusicToggle.onclick = () => bgMusic.paused ? bgMusic.play() : bgMusic.pause();
  btnMicToggle.onclick = () => bgMusic.pause();

  // Visa auth-form
  show(authDiv);
})();
