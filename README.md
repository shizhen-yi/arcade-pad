# 无界手柄 VirtualPad

手机变手柄、电脑变大屏的复古游戏跨端控制系统。

## 架构

- `server/` — Node.js + socket.io 信令服务器（房间撮合 + WebRTC SDP/ICE 转发）
- `host/` — PC 大屏端（Vue3+Vite，嵌 fcgame + WebRTC 接收 + 键盘事件注入）
- `pad/` — Uni-app 手柄端（H5+App 双轨，WebRTC 发送 + 触觉反馈）
- `vendor/fcgame/` — FC 模拟器内核（200+ ROM，roms/ 不入 git）

## Phase 1 验收

手机扫码 → 按方向键 → PC 浏览器 console 打印 `{k:"U", a:"D"}`。
