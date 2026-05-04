# WebRTC Group Call with STUN/TURN

Hệ thống gọi video nhóm sử dụng WebRTC, hỗ trợ kết nối qua Internet bằng STUN/TURN.

## Yêu cầu

- Node.js v18+
- npm

## Cài đặt

```bash
npm install
```

## Tạo SSL Certificate (cho local HTTPS)

```bash
# Tạo thư mục certs
mkdir -p certs

# Tạo self-signed certificate
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/C=VN/ST=HCM/L=HCM/O=CSC11003/CN=localhost"
```

## Chạy Server

### Cách 1: Local HTTPS (khuyến nghị cho test)

```bash
node server/server.js
# Truy cập: https://localhost:3000
```

Chấp nhận cảnh báo "Not secure" trên trình duyệt.

### Cách 2: Deploy lên Cloud

#### Heroku

```bash
heroku create
git push heroku master
# URL: https://[app-name].herokuapp.com
```

#### Render

1. Tạo repo trên GitHub
2. Connect Render với repo
3. Deploy tự động

## Cách sử dụng

### 1. Tạo hoặc vào phòng

1. Mở ứng dụng trên trình duyệt (PC hoặc điện thoại)
2. Nhập **Tên** (nickname)
3. Nhập **Room ID** (ví dụ: `phong-1`)
4. Nếu phòng chưa có, bấm **Tạo phòng**
5. Nếu phòng đã có, bấm **Vào phòng**

Lưu ý:
- Nút **Vào phòng** sẽ báo lỗi nếu phòng chưa được tạo trước
- Nickname phải là duy nhất trong từng phòng

### 2. Gọi video nhóm

1. Tất cả thành viên vào cùng phòng
2. Một người bấm **Bắt đầu gọi**
3. Tất cả thấy video của nhau

### 3. Kết thúc cuộc gọi

Bấm **Dừng** để kết thúc (có cảnh báo nếu >1 người)

### 4. Rời phòng

Bấm **Rời phòng** để thoát

## Cấu hình TURN

### STUN Server

- `stun:stun.l.google.com:19302` (mặc định)

### TURN Server

Sử dụng **Metered.ca** (đã cấu hình sẵn trong code):

- Tự động fetch credentials từ API
- Hỗ trợ: UDP, TCP, TLS

**Tự đổi TURN server:**
Chỉnh URL trong `public/index.html`, hàm `loadIceServers()`:

```javascript
const res = await fetch('https://[your-app].metered.live/api/v1/turn/credentials?apiKey=YOUR_API_KEY');
```

## Tính năng

- ✓ Tạo/Join phòng
- ✓ Gọi video nhóm (mesh)
- ✓ STUN/TURN tự động
- ✓ Thông báo `P2P failed, trying TURN...` sau 12 giây nếu chưa connected
- ✓ Hiển thị trạng thái kết nối
- ✓ Log ICE candidate (host/srflx/relay)
- ✓ Cảnh báo trước khi dừng (nếu >1 người)

## Test

### Test 2 người

1. A tạo phòng `test-1`
2. B vào phòng `test-1`
3. A bấm "Bắt đầu gọi"
4. Cả hai thấy video nhau

### Test nhóm (3-4 người)

1. A tạo phòng `test-2`
2. B, C, D vào cùng phòng
3. Một người bấm "Bắt đầu gọi"
4. Tất cả thấy video của nhau

## Kiến trúc

- **Server**: Node.js + HTTPS + WebSocket (signaling)
- **Client**: WebRTC (getUserMedia + RTCPeerConnection)
- **ICE**: STUN + TURN (Metered)
- **Topology**: Mesh (mỗi người n-1 connections)

## Troubleshooting

### Không vào được phòng

- Kiểm tra server đang chạy
- Kiểm tra WebSocket URL đúng

### Video không hiện

- Cho phép camera/microphone
- Kiểm tra log (F12 → Console)

### ICE failed

- Thử đổi mạng (WiFi thay 4G)
- Kiểm tra TURN server hoạt động

## License

MIT
