# WebRTC Group Call (TURN + Room + Group Call)

Hệ thống gọi video nhóm dùng WebRTC, signaling qua `Node.js + HTTPS + WebSocket`, hỗ trợ STUN/TURN với coturn self-host trên Azure VM.

## 1) Yêu cầu môi trường

- Node.js 18+
- npm
- OpenSSL (để tạo cert local)
- Docker + Docker Compose (để chạy coturn)

## 2) Cài đặt

```bash
npm install
```

## 3) Tạo HTTPS certificate (self-signed)

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/C=VN/ST=HCM/L=HCM/O=CSC11003/CN=localhost"
```

Ghi chú:
- Khi chạy local, trình duyệt có thể báo "Not secure" vì self-signed certificate.
- Bạn chỉ cần chọn "Proceed" để test.

## 4) Cấu hình `.env`

Ví dụ:

```env
PORT=3000
SSL_KEY_PATH=./certs/key.pem
SSL_CERT_PATH=./certs/cert.pem

TURN_HOST=your_turn_ip
TURN_USERNAME=your_turn_user
TURN_CREDENTIAL=your_turn_password
```

Trong code hiện tại:
- Server đọc `TURN_HOST`, `TURN_USERNAME`, `TURN_CREDENTIAL` tại `server/server.js`.
- Client fetch ICE config từ endpoint nội bộ `GET /api/ice-servers`.

## 5) Chạy signaling server

```bash
node server/server.js
```

Mở ứng dụng tại:

```text
https://localhost:3000
```

## 6) Chạy TURN server (coturn bằng Docker)

Ví dụ `docker-compose.yml`:

```yaml
services:
  coturn:
    image: coturn/coturn:latest
    container_name: my-coturn
    restart: always
    network_mode: "host"
    command:
      - -n
      - --log-file=stdout
      - --listening-port=3478
      - --min-port=49152
      - --max-port=65535
      - --user=your_turn_user:your_turn_password
      - --realm=20.2.88.224
      - --external-ip=20.2.88.224/10.0.0.4
      - --verbose
```

Chạy:

```bash
docker compose up -d
```

Lưu ý port trên Azure NSG / firewall:
- `3478/tcp`
- `3478/udp`
- `49152-65535/udp` (relay media ports)

## 7) Quy trình sử dụng

1. Nhập nickname
2. Nhập room ID
3. Người đầu tiên bấm **Tạo phòng**
4. Người sau bấm **Vào phòng**
5. Bấm **Bắt đầu gọi** để gọi nhóm
6. Dùng **Dừng** để kết thúc cuộc gọi, **Rời phòng** để thoát phòng

Ràng buộc hiện tại:
- `Vào phòng` sẽ báo lỗi nếu room chưa tồn tại.
- Nickname phải duy nhất trong cùng room.

## 8) Test 2 người

1. Thiết bị A: tạo room `test-1`
2. Thiết bị B: vào room `test-1`
3. Một bên bấm **Bắt đầu gọi**
4. Xác nhận cả hai thấy video của nhau
5. Kiểm tra log trạng thái `connectionState`, `iceConnectionState`
6. Kiểm tra candidate type từ `getStats()` (`host` / `srflx` / `relay`)

## 9) Test nhóm 3–4 người

1. A tạo room `test-2`
2. B, C, D vào cùng room
3. Một người bấm **Bắt đầu gọi**
4. Xác nhận grid hiển thị đủ video remote
5. Thử 1 người **Rời phòng** (người còn lại vẫn gọi bình thường)
6. Thử **Dừng** và gọi lại để xác nhận không lỗi

## 10) Relay mode (phục vụ demo TURN)

UI có toggle **Chế độ ép dùng TURN (Relay)**.

- Bật: `iceTransportPolicy = relay` cho các peer connection mới
- Tắt: `iceTransportPolicy = all` (mặc định WebRTC)

Ghi chú:
- Relay mode là theo client (thiết bị/tab), không phải theo room.
- Nếu đổi toggle khi đang call, nên dừng cuộc gọi rồi gọi lại để policy mới có hiệu lực.

## 11) Tóm tắt kiến trúc

- **Server**: `server/server.js`
  - HTTPS static hosting
  - WebSocket signaling
  - Room state: `Map<roomId, Map<name, WebSocket>>`
  - ICE API: `GET /api/ice-servers`

- **Client**: `public/index.html`
  - `getUserMedia()`
  - mesh topology (`n-1` peer connections)
  - signaling handlers: `offer/answer/candidate`
  - queue ICE candidate đến sớm để tránh drop

- **TURN**: coturn self-host trên Azure VM
