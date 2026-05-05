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
TURN_HOST=...
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

## 6. Kết quả kiểm thử (đã đính kèm minh chứng trong báo cáo)

### 6.1 Kịch bản 1: Kiểm thử P2P (2 người)

Các bước thực hiện:

1. Thiết bị A tạo phòng `test-1`.
2. Thiết bị B nhập đúng `test-1` và nhấn **Vào phòng**.
3. A nhấn **Bắt đầu gọi**.

Kết quả quan sát:

- Hai thiết bị hiển thị video của nhau.
- Log signaling thể hiện đầy đủ luồng `offer` -> `answer` -> `candidate`.
- Trạng thái kết nối chuyển sang `connected`.

Xác minh ICE:

- Trong cùng mạng LAN, candidate type thường là `host`.
- Khác mạng nhưng vẫn đi trực tiếp, candidate type thường là `srflx`.

Ảnh chụp màn hình và log minh chứng cho kịch bản này đã được đính kèm trong báo cáo nộp.

### 6.2 Kịch bản 2: Gọi nhóm 3-4 người + kiểm thử Relay mode (coturn Azure VM)

Các bước thực hiện:

1. A tạo phòng `test-2`.
2. B, C, D lần lượt vào cùng phòng.
3. Một người bất kỳ nhấn **Bắt đầu gọi**.

Kết quả quan sát:

- Grid video tự động chia bố cục và hiển thị đầy đủ các luồng remote.
- Một người nhấn **Rời phòng** thì video của người đó biến mất ngay trên các thiết bị còn lại qua bản tin `memberLeft`.
- Các kết nối giữa những thành viên còn lại vẫn duy trì bình thường.

Xác minh TURN/Relay:

- Khi bật **Relay mode**, log UI xuất hiện candidate `type=relay` với IP thuộc coturn trên Azure VM.
- `getStats()` ghi nhận candidate type có `relay`, đáp ứng yêu cầu minh chứng TURN.

Ảnh chụp màn hình và log minh chứng cho kịch bản này đã được đính kèm trong báo cáo nộp.

### 6.3 Tổng hợp

Toàn bộ ảnh chụp và log cho các trường hợp kiểm thử LAN, khác mạng/4G, và gọi nhóm 3-4 người đã được đính kèm trong báo cáo này.

## 7. Cách chạy nhanh

```bash
npm install
node server/server.js
```

Mở:

```text
https://localhost:3000
```

Nếu dùng self-signed certificate, chấp nhận cảnh báo HTTPS trên trình duyệt.
