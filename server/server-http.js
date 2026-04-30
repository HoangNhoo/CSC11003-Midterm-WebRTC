require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

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
  broadcast(roomId, { type: 'memberLeft', roomId, name });
  broadcast(roomId, { type: 'roomMembers', roomId, members: getRoomMembers(roomId) });
}

wss.on('connection', (ws) => {
  let currentName = null;
  let currentRoom = null;

  console.log('Client kết nối');

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const { type, roomId, name, target, offer, answer, candidate } = msg;

    switch (type) {

      case 'register':
        currentName = name;
        console.log(`Đăng ký: ${name}`);
        break;

      case 'createRoom':
      case 'joinRoom': {
        if (currentRoom) leaveRoom(currentRoom, currentName);

        currentName = name || currentName;
        currentRoom = roomId;

        if (!rooms.has(roomId)) rooms.set(roomId, new Map());
        rooms.get(roomId).set(currentName, ws);

        console.log(`${currentName} vào phòng ${roomId}`);

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

server.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});