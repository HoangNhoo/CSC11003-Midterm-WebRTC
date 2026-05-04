# Báo cáo WebRTC TURN + Room + Group Call

## 1. Mô tả kiến trúc hệ thống

Hệ thống gồm 3 thành phần chính:

- **Signaling Server** (`server/server.js`): Node.js + HTTPS + WebSocket.
- **Client** (`public/index.html`): HTML/CSS/JS, dùng `getUserMedia()` và `RTCPeerConnection`.
- **TURN Server**: coturn self-host trên Azure VM.

Luồng tổng quát:

1. Client mở WebSocket đến signaling server.
2. Client đăng ký nickname và tạo/vào room.
3. Server quản lý room bằng `Map<roomId, Map<name, WebSocket>>`.
4. Khi bắt đầu gọi nhóm, mỗi client tạo `n-1` peer connections (mesh topology).
5. WebRTC dùng ICE (STUN/TURN) để tìm đường media tối ưu.

## 2. Signaling protocol

### 2.1 Client -> Server

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

### 2.2 Server -> Client

```json
{ "type": "roomJoined", "roomId": "room-1", "name": "alice" }
{ "type": "roomMembers", "roomId": "room-1", "members": ["alice", "bob"] }
{ "type": "memberLeft", "roomId": "room-1", "sender": "bob" }
{ "type": "error", "message": "Phòng đã tồn tại" }
```

Ghi chú:

- `roomJoined` được thêm để client chỉ chuyển UI sang room sau khi server xác nhận thành công.
- `memberLeft` dùng trường `sender` để đồng nhất với `offer/answer/candidate/endCall`.

## 3. Thiết kế room và group call

### 3.1 Room management

- Người dùng có 2 thao tác: **Tạo phòng** và **Vào phòng**.
- `createRoom` fail nếu room đã tồn tại.
- `joinRoom` fail nếu room chưa tồn tại.
- Nickname phải duy nhất trong từng room.
- Mỗi thay đổi thành viên đều broadcast lại `roomMembers`.

### 3.2 Group call mesh

- Khi bấm **Bắt đầu gọi**, client tạo `RTCPeerConnection` đến từng peer còn lại.
- Local stream được add vào mỗi peer connection bằng `addTrack`.
- Mỗi remote peer có một video element riêng trên grid.

### 3.3 Rời phòng và dừng cuộc gọi

- `leaveRoom`: chỉ người rời thoát phòng, không kết thúc cuộc gọi của cả room.
- `endCall`: broadcast kết thúc cuộc gọi cho các peer còn lại.

## 4. TURN (coturn self-host trên Azure VM)

### 4.1 Cấu hình

Thông tin trong `.env`:

```env
TURN_HOST=20.2.88.224
TURN_USERNAME=...
TURN_CREDENTIAL=...
```

Server expose endpoint:

- `GET /api/ice-servers`

Response ICE servers:

- `stun:${TURN_HOST}:3478`
- `turn:${TURN_HOST}:3478?transport=udp`
- `turn:${TURN_HOST}:3478?transport=tcp`

### 4.2 Fallback logic

- Mỗi peer connection đặt timer 12 giây.
- Nếu chưa `connected`, UI log: `P2P failed, trying TURN...`.
- Khi `iceConnectionState === failed`, tiếp tục log thông báo fallback.

### 4.3 Relay mode

Client có toggle **Relay mode (force TURN)**:

- bật: `iceTransportPolicy = relay`
- tắt: `iceTransportPolicy = all`

Chế độ này dùng để demo/minh chứng TURN rõ ràng trong báo cáo.

## 5. Trạng thái và thống kê

Client ghi log:

- thời điểm bắt đầu / kết thúc cuộc gọi
- signaling messages gửi/nhận
- `connectionState`
- `iceConnectionState`
- candidate type từ `getStats()` (`host`, `srflx`, `relay`)

## 6. Kết quả kiểm thử (bổ sung ảnh/log thật trước khi nộp)

### 6.1 Test LAN

Checklist:

- [ ] Ảnh chụp 2 thiết bị cùng LAN
- [ ] Log `connected`
- [ ] Candidate type thường là `host` hoặc `srflx`

### 6.2 Test khác mạng / 4G

Checklist:

- [ ] Ảnh chụp 2 thiết bị khác mạng
- [ ] Log `connectionState`, `iceConnectionState`
- [ ] Candidate type `srflx` hoặc `relay`

### 6.3 Test nhóm 3-4 người

Checklist:

- [ ] Ảnh chụp grid đủ 3-4 video
- [ ] Log join/leave room realtime
- [ ] Dừng xong gọi lại được

## 7. Hạn chế và hướng phát triển

Hạn chế hiện tại:

- Mesh topology tăng tải theo `O(n^2)` khi số người tăng.
- Chưa có persistence room khi server restart.
- Chưa có cơ chế auth tài khoản.

Hướng phát triển:

- Tách JS client ra file riêng (`public/app.js`).
- Chuyển từ mesh sang SFU khi cần scale nhiều người.
- Thêm reconnect strategy tốt hơn khi WS mất kết nối.

## 8. Cách chạy nhanh

```bash
npm install
node server/server.js
```

Mở:

```text
https://localhost:3000
```

Nếu dùng self-signed certificate, chấp nhận cảnh báo HTTPS trên trình duyệt.
