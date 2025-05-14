const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { v4: uuid } = require('uuid');
const multer = require('multer');
const basicAuth = require('basic-auth');

// lowdb setup
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const adapter = new JSONFile(path.join(__dirname, 'db.json'));
const db = new Low(adapter);

(async () => {
  await db.read();
  db.data ||= { users: [], history: [] };
  await db.write();
})();

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

// Middleware
app.use(bodyParser.json());
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true
}));
app.use(express.static(path.join(__dirname, 'public')));

// File upload for profile images
const upload = multer({ dest: path.join(__dirname, 'public/uploads/') });

// Authentication routes
app.post('/api/register', async (req, res) => {
  const { username, password, email } = req.body;
  await db.read();
  if (db.data.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Användare finns redan' });
  }
  const hash = await bcrypt.hash(password, 10);
  db.data.users.push({ id: uuid(), username, password: hash, email, img: null, points: 0 });
  await db.write();
  res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  await db.read();
  const user = db.data.users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Fel användarnamn/lösen' });
  }
  req.session.userId = user.id;
  res.json({ success: true, user: { id: user.id, username, img: user.img } });
});

app.post('/api/uploadProfile', upload.single('avatar'), async (req, res) => {
  if (!req.session.userId) return res.status(401).end();
  await db.read();
  const user = db.data.users.find(u => u.id === req.session.userId);
  user.img = '/uploads/' + req.file.filename;
  await db.write();
  res.json({ img: user.img });
});

app.get('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', async (req, res) => {
  await db.read();
  const user = db.data.users.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).end();
  res.json({ id: user.id, username: user.username, img: user.img });
});

// Admin basic auth middleware
const adminAuth = (req, res, next) => {
  const creds = basicAuth(req);
  if (!creds || creds.name !== process.env.ADMIN_USER || creds.pass !== process.env.ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).end();
  }
  next();
};

app.get('/api/admin/history', adminAuth, async (req, res) => {
  await db.read();
  res.json(db.data.history);
});

app.post('/api/admin/markPaid', adminAuth, async (req, res) => {
  const { gameId, userId } = req.body;
  await db.read();
  const record = db.data.history.find(h => h.id === gameId && h.userId === userId);
  if (record) record.paid = true;
  await db.write();
  res.json({ success: true });
});

// Game logic
class Game {
  constructor(name) {
    this.id = name;
    this.players = [];
    this.deck = [];
    this.pile = null;
    this.hands = {};
    this.ready = new Set();
    this.turnIndex = 0;
    this.pot = 0;
    this.eliminated = new Set();
    this.omme = false;
  }
  resetDeck() {
    const suits = ['hearts','diamonds','clubs','spades'];
    const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    this.deck = [];
    for (let s of suits) {
      for (let r of ranks) {
        this.deck.push({ suit: s, rank: r });
      }
    }
    this.deck.sort(() => Math.random() - 0.5);
  }
}

const rooms = {};

io.on('connection', socket => {
  let currentRoom;
  const userId = socket.handshake.auth.userId;

  socket.on('joinRoom', ({ roomName }) => {
    currentRoom = roomName;
    socket.join(roomName);
    if (!rooms[roomName]) rooms[roomName] = new Game(roomName);
    const game = rooms[roomName];
    if (!game.players.includes(userId)) game.players.push(userId);
    io.to(roomName).emit('roomUpdate', game);
  });

  socket.on('ready', () => {
    const game = rooms[currentRoom];
    game.ready.add(userId);
    io.to(currentRoom).emit('playerReady', [...game.ready]);
    if (game.ready.size === game.players.length) {
      // start round
      game.resetDeck();
      game.pile = game.deck.pop();
      for (let pid of game.players) {
        game.hands[pid] = game.deck.splice(0, 5);
      }
      io.to(currentRoom).emit('roundStart', {
        hands: game.hands,
        pile: game.pile,
        pot: game.pot
      });
    }
  });

  socket.on('exchange', ({ indices }) => {
    const game = rooms[currentRoom];
    if (!Array.isArray(indices) || indices.length > 3) return;
    game.pot += indices.length;
    const hand = game.hands[userId];
    for (let i of indices) {
      game.deck.push(hand[i]);
      hand[i] = game.deck.pop();
    }
    io.to(socket.id).emit('handUpdate', hand);
    io.to(currentRoom).emit('potUpdate', game.pot);
  });

  socket.on('playCard', ({ card }) => {
    const game = rooms[currentRoom];
    const hand = game.hands[userId];
    const valid = hand.find(c => c.suit === card.suit && c.rank === card.rank);
    if (!valid) return;
    hand.splice(hand.indexOf(valid), 1);
    game.pile = valid;
    io.to(currentRoom).emit('cardPlayed', { userId, card });
    if (hand.length === 0) {
      // round end
      const losers = game.players.filter(pid => game.hands[pid].length > 0);
      losers.forEach(pid => {
        const pts = game.hands[pid].length;
        const user = db.data.users.find(u => u.id === pid);
        if (user) user.points += pts;
      });
      // save history
      db.data.history.push({
        id: uuid(),
        gameId: game.id,
        winner: userId,
        pot: game.pot,
        time: Date.now(),
        paid: false
      });
      db.write();
      io.to(currentRoom).emit('roundEnd', { winner: userId, pot: game.pot });
    }
  });

  socket.on('pass', () => {
    io.to(currentRoom).emit('playerPass', userId);
  });

  socket.on('chatMessage', msg => {
    io.to(currentRoom).emit('chatMessage', { userId, msg });
  });

  socket.on('disconnect', () => {
    if (currentRoom) socket.leave(currentRoom);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, function() {
  console.log('Server up on ' + PORT);
});
