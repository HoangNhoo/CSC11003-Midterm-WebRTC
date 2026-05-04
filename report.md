# Bao cao WebRTC TURN + Room + Group Call

## 1. Kien truc he thong

He thong gom 3 thanh phan chinh:
- `server/server.js`: signaling server dung `Node.js + HTTPS + WebSocket`
- `public/index.html`: client HTML/CSS/JS, lay camera/mic bang `getUserMedia()` va tao `RTCPeerConnection`
- TURN server: dung dich vu Metered de cap ICE credentials dong

Luong tong quat:
1. Client mo WebSocket den signaling server.
2. Client dang ky nickname va tao/vao room.
3. Server quan ly room bang `Map<roomId, Map<name, WebSocket>>`.
4. Khi bat dau group call, moi client tao `n-1` peer connections theo mo hinh mesh.
5. WebRTC tu thuong luong ICE voi STUN/TURN de tim duong ket noi phu hop.

## 2. Signaling protocol

### Client -> Server

```json
{ "type": "register", "name": "alice" }
{ "type": "createRoom", "roomId": "room-1", "name": "alice" }
{ "type": "joinRoom", "roomId": "room-1", "name": "bob" }
{ "type": "offer", "roomId": "room-1", "sender": "alice", "target": "bob", "offer": { "type": "offer", "sdp": "..." } }
{ "type": "answer", "roomId": "room-1", "sender": "bob", "target": "alice", "answer": { "type": "answer", "sdp": "..." } }
{ "type": "candidate", "roomId": "room-1", "sender": "alice", "target": "bob", "candidate": { "candidate": "..." } }
{ "type": "leaveRoom", "roomId": "room-1", "sender": "alice" }
{ "type": "endCall", "roomId": "room-1", "sender": "alice" }
```

### Server -> Client

```json
{ "type": "roomJoined", "roomId": "room-1", "name": "alice" }
{ "type": "roomMembers", "roomId": "room-1", "members": ["alice", "bob"] }
{ "type": "memberLeft", "roomId": "room-1", "sender": "bob" }
{ "type": "error", "message": "Phong da ton tai" }
```

Ghi chu:
- `roomJoined` duoc them de client chi chuyen UI sang man hinh room sau khi server xac nhan thanh cong.
- `memberLeft` dung truong `sender` de dong nhat voi `offer/answer/candidate/endCall`.

## 3. Thiet ke room va group call

### Room

- Nguoi dung co 2 thao tac: `Tao phong` va `Vao phong`.
- `createRoom` se fail neu `roomId` da ton tai.
- `joinRoom` se fail neu phong chua duoc tao truoc.
- Nickname phai duy nhat trong tung room; neu trung ten, server tra `error`.
- Moi thay doi thanh vien deu broadcast lai `roomMembers` cho ca phong.

### Group call mesh

- Khi nhan `Bat dau goi`, client lay danh sach thanh vien trong room.
- Moi peer khac se duoc tao 1 `RTCPeerConnection` rieng.
- Local stream duoc add vao tung peer connection bang `addTrack`.
- Moi remote peer se co 1 o video rieng trong `#video-grid`.

## 4. STUN/TURN va fallback

### ICE servers

Client co STUN mac dinh:

```javascript
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' }
];
```

Client goi endpoint noi bo tren signaling server de lay TURN credentials tu `.env`:

```javascript
const res = await fetch('/api/ice-servers');
```

Bo ICE servers tra ve tu server can bao gom cac dang sau:
- `turn:HOST:PORT?transport=udp`
- `turn:HOST:PORT?transport=tcp`

### Fallback

- Moi peer connection duoc dat timer 12 giay.
- Neu sau 12 giay van chua `connected`, UI log: `P2P failed, trying TURN...`.
- Ngoai ra, khi `iceConnectionState === 'failed'`, client cung log thong bao nay.
- Danh sach `iceServers` da chua TURN nen browser se tiep tuc thu relay candidate trong qua trinh ICE.

## 5. Trang thai va thong ke

Client hien thi:
- `connectionState`: `new`, `connecting`, `connected`, `disconnected`, `failed`
- `iceConnectionState`: log tren UI va console
- loai candidate thanh cong qua `getStats()`: `host`, `srflx`, `relay`

UI log tren man hinh gom:
- thoi diem bat dau cuoc goi
- thoi diem ket thuc cuoc goi
- message signaling gui/nhan
- candidate type sau khi ket noi thanh cong

## 6. Xu ly roi phong va hangup

- Khi mot thanh vien roi phong, server gui `memberLeft` va cap nhat `roomMembers`.
- Client nhan `memberLeft` se dong peer connection tuong ung va xoa video.
- Nhan `Dung` se dong toan bo peer connections, dung local stream, reset UI, va cho phep goi lai.
- Neu dang co nhieu nguoi trong phong, nut `Dung` hien hop thoai xac nhan truoc khi ket thuc.

## 7. Kiem thu (bo sung log/anh that khi nop)

### 7.1 LAN

Can bo sung khi test that:
- [ ] Anh chup room 2 nguoi cung LAN
- [ ] Log candidate type = `host`
- [ ] Log `connected`

### 7.2 Khac mang / 4G

Can bo sung khi test that:
- [ ] Anh chup 2 thiet bi khac mang
- [ ] Log `P2P failed, trying TURN...` neu xuat hien
- [ ] Log candidate type = `relay` hoac `srflx`

### 7.3 Group call 3-4 nguoi

Can bo sung khi test that:
- [ ] Anh chup grid 3-4 video
- [ ] Log join/leave room realtime
- [ ] Log hangup xong goi lai duoc

## 8. Han che va huong phat trien

Han che hien tai:
- Mesh topology ton bang thong theo `O(n^2)` khi tang so nguoi
- Chua co persistence cho room khi server restart
- CREDENTIAL TURN dang duoc lay truc tiep tu client, chua dua vao server/env an toan hon

Huong phat trien:
- Tach JS client ra file rieng (`public/app.js`)
- Dua TURN credentials ve server-side config
- Chuyen tu mesh sang SFU neu muon ho tro nhieu nguoi hon
- Them retry/reconnect tot hon khi WebSocket bi ngat

## 9. Cach chay

```bash
npm install
node server/server.js
```

Mo trinh duyet tai:

```text
https://localhost:3000
```

Neu dung self-signed certificate, can chap nhan canh bao HTTPS tren trinh duyet.
