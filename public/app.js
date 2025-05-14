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
