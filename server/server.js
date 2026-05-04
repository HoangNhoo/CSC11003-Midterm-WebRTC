require('dotenv').config();
const fs = require('fs');
const https = require('https');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── SSL ──────────────────────────────────────────────────────────────
let sslOptions;
try {
  sslOptions = {
    key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem')),
  };
} catch (e) {
  console.error('Không đọc được cert SSL:', e.message);
  process.exit(1);
}

// ── Static files ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── HTTPS server ──────────────────────────────────────────────────────
const server = https.createServer(sslOptions, app);

// ── WebSocket server ──────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

// ── State ─────────────────────────────────────────────────────────────
// rooms = Map<roomId, Map<name, WebSocket>>
const rooms = new Map();

function getRoomMembers(roomId) {
  return rooms.has(roomId) ? [...rooms.get(roomId).keys()] : [];
}

function broadcast(roomId, message, excludeName = null) {
  if (!rooms.has(roomId)) return;
  const data = JSON.stringify(message);
  rooms.get(roomId).forEach((ws, name) => {
    if (name !== excludeName && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

function sendTo(roomId, targetName, message) {
  if (!rooms.has(roomId)) return;
  const targetWs = rooms.get(roomId).get(targetName);
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(JSON.stringify(message));
  }
}

function leaveRoom(roomId, name) {
  if (!rooms.has(roomId)) return;
  rooms.get(roomId).delete(name);
  if (rooms.get(roomId).size === 0) {
    rooms.delete(roomId);
    return;
  }
  // Thông báo cho các thành viên còn lại
  broadcast(roomId, { type: 'memberLeft', roomId, sender: name });
  broadcast(roomId, { type: 'roomMembers', roomId, members: getRoomMembers(roomId) });
}

// ── Connection handler ────────────────────────────────────────────────
wss.on('connection', ws => {
  let currentName = null;
  let currentRoom = null;

  console.log('Client mới kết nối');

  ws.on('message', message => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    const { type, roomId, name, target, offer, answer, candidate } = msg;

    switch (type) {

      case 'register':
        currentName = name;
        console.log(`Đăng ký: ${name}`);
        break;

      case 'createRoom': {
        if (currentRoom) leaveRoom(currentRoom, currentName);

        currentName = name || currentName;

        if (rooms.has(roomId)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Phòng đã tồn tại' }));
          break;
        }

        currentRoom = roomId;
        rooms.set(roomId, new Map());
        rooms.get(roomId).set(currentName, ws);

        console.log(`Tạo phòng ${roomId} bởi ${currentName}`);

        ws.send(JSON.stringify({ type: 'roomJoined', roomId, name: currentName }));

        const members = getRoomMembers(roomId);
        rooms.get(roomId).forEach((clientWs) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'roomMembers', roomId, members }));
          }
        });
        break;
      }

      case 'joinRoom': {
        if (currentRoom) leaveRoom(currentRoom, currentName);

        currentName = name || currentName;

        if (!rooms.has(roomId)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Phòng chưa tồn tại' }));
          break;
        }

        if (rooms.get(roomId).has(currentName)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Tên đã được sử dụng trong phòng. Vui lòng chọn tên khác.' }));
          break;
        }

        currentRoom = roomId;
        rooms.get(roomId).set(currentName, ws);

        console.log(`${currentName} vào phòng ${roomId}`);

        ws.send(JSON.stringify({ type: 'roomJoined', roomId, name: currentName }));

        const members = getRoomMembers(roomId);
        rooms.get(roomId).forEach((clientWs) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'roomMembers', roomId, members }));
          }
        });
        break;
      }

      case 'offer':
        sendTo(roomId, target, { type: 'offer', roomId, sender: currentName, target, offer });
        break;

      case 'answer':
        sendTo(roomId, target, { type: 'answer', roomId, sender: currentName, target, answer });
        break;

      case 'candidate':
        sendTo(roomId, target, { type: 'candidate', roomId, sender: currentName, target, candidate });
        break;

      case 'leaveRoom':
        if (currentRoom) {
          leaveRoom(currentRoom, currentName);
          currentRoom = null;
        }
        break;

      case 'endCall':
        broadcast(roomId, { type: 'endCall', roomId, sender: currentName }, currentName);
        break;

      default:
        console.warn('Unknown message type:', type);
    }
  });

  ws.on('close', () => {
    console.log(`Client ngắt kết nối: ${currentName}`);
    if (currentRoom && currentName) {
      leaveRoom(currentRoom, currentName);
    }
  });

  ws.on('error', (err) => console.error('WS error:', err.message));
});

// ── Start ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Server chạy tại https://localhost:${PORT}`);
});
