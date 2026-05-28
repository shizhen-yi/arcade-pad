import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import express from 'express';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3000;

function lanIP() {
  const ifs = networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const net of ifs[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

const app = express();
app.get('/lan-ip', (_req, res) => res.json({ ip: lanIP(), port: PORT }));
app.get('/pad', (_req, res) => {
  const latestRoomId = Array.from(rooms.keys()).at(-1);
  const url = latestRoomId
    ? `http://${lanIP()}:5174/?room=${latestRoomId}&player=2&signal=${encodeURIComponent(`http://${lanIP()}:${PORT}`)}`
    : `http://${lanIP()}:5174/`;
  res.redirect(url);
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

/** roomId -> { hostId: string, pads: Map<string, string> } */
const rooms = new Map();

function newRoomId() {
  let id;
  do { id = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(id));
  return id;
}

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  socket.on('host:create', (_, ack) => {
    const roomId = newRoomId();
    rooms.set(roomId, { hostId: socket.id, pads: new Map() });
    socket.join(roomId);
    socket.data.role = 'host';
    socket.data.roomId = roomId;
    console.log(`[host] ${socket.id} created room ${roomId}`);
    ack?.({ ok: true, roomId, lanIP: lanIP(), port: PORT });
  });

  socket.on('pad:join', ({ roomId, player }, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ ok: false, error: 'room_not_found' });

    const requestedPlayer = Number(player);
    const playerNo = requestedPlayer === 1 || requestedPlayer === 2
      ? requestedPlayer
      : (!room.pads.has('1') ? 1 : !room.pads.has('2') ? 2 : 0);

    if (!playerNo) return ack?.({ ok: false, error: 'room_full' });
    const seatKey = String(playerNo);
    const occupiedBy = room.pads.get(seatKey);
    if (occupiedBy && occupiedBy !== socket.id) {
      return ack?.({ ok: false, error: 'seat_taken', player: playerNo });
    }

    room.pads.set(seatKey, socket.id);
    socket.join(roomId);
    socket.data.role = 'pad';
    socket.data.roomId = roomId;
    socket.data.player = playerNo;
    console.log(`[pad]  ${socket.id} joined room ${roomId} as P${playerNo}`);
    io.to(room.hostId).emit('pad:joined', { padId: socket.id, player: playerNo });
    ack?.({ ok: true, hostId: room.hostId, player: playerNo });
  });

  socket.on('signal', ({ to, data }) => {
    if (!to) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    const { role, roomId } = socket.data;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (role === 'host') {
      console.log(`[host] ${socket.id} left, closing room ${roomId}`);
      for (const padId of room.pads.values()) io.to(padId).emit('host:closed');
      rooms.delete(roomId);
    } else if (role === 'pad') {
      const player = socket.data.player;
      if (player) room.pads.delete(String(player));
      io.to(room.hostId).emit('pad:left', { padId: socket.id, player });
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  VirtualPad signaling on:`);
  console.log(`    http://localhost:${PORT}`);
  console.log(`    http://${lanIP()}:${PORT}  ← 手机连这个\n`);
});
