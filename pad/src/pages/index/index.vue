<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { io } from 'socket.io-client';
import { createPadPeer } from '../../lib/webrtc.js';
import { vibrate } from '../../lib/haptics.js';

const status = ref('setup'); // setup | scanning | connecting | linked | failed
const roomId = ref('');
const signalHost = ref('');
const requestedPlayer = ref(1);
const assignedPlayer = ref(1);
const errorMsg = ref('');
const isPortrait = ref(false);
const soundOn = ref(false);
const cameraOptIn = ref(true);
const scanMsg = ref('对准电脑大屏右侧的 P1 / P2 二维码');
let socket = null;
let peer = null;
let scannerStream = null;
let scannerTimer = null;
const turboTimers = {};
let orientationHandler = null;

function getRoomFromUrl() {
  // #ifdef H5
  const params = new URLSearchParams(location.search);
  return params.get('room') || '';
  // #endif
  // #ifndef H5
  return '';
  // #endif
}

function getPlayerFromUrl() {
  // #ifdef H5
  const params = new URLSearchParams(location.search);
  const player = Number(params.get('player') || params.get('p'));
  return player === 2 ? 2 : 1;
  // #endif
  // #ifndef H5
  return 1;
  // #endif
}

function getSignalFromUrl() {
  // #ifdef H5
  const params = new URLSearchParams(location.search);
  return params.get('signal') || `${location.hostname}:3000`;
  // #endif
  // #ifndef H5
  return uni.getStorageSync('virtualpad_signal') || '192.168.31.92:3000';
  // #endif
}

function getSignalUrl() {
  const raw = String(signalHost.value || '').trim();
  if (!raw) return '';
  return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `http://${raw}`;
}

function applyPadUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const room = url.searchParams.get('room');
    if (!room) throw new Error('missing_room');
    roomId.value = room;
    requestedPlayer.value = Number(url.searchParams.get('player')) === 2 ? 2 : 1;
    signalHost.value = url.searchParams.get('signal') || `${url.hostname}:3000`;
    connect();
  } catch {
    status.value = 'failed';
    errorMsg.value = '二维码不对，请扫电脑大屏上的手柄二维码';
  }
}

function stopH5Scan() {
  // #ifdef H5
  if (scannerTimer) {
    window.clearInterval(scannerTimer);
    scannerTimer = null;
  }
  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop());
    scannerStream = null;
  }
  const video = document.getElementById('qr-video');
  if (video) video.srcObject = null;
  // #endif
}

async function startH5Scan() {
  if (!cameraOptIn.value) {
    status.value = 'failed';
    errorMsg.value = '请先开启扫码权限，或手动输入房间号连接';
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    status.value = 'failed';
    errorMsg.value = '当前浏览器无法打开摄像头，请手动输入房间号';
    return;
  }
  if (!('BarcodeDetector' in window)) {
    status.value = 'failed';
    errorMsg.value = '当前浏览器不支持网页扫码，请用系统相机扫二维码打开页面';
    return;
  }

  status.value = 'scanning';
  errorMsg.value = '';
  scanMsg.value = '正在开启摄像头...';
  await nextTick();

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    const video = document.getElementById('qr-video');
    video.srcObject = scannerStream;
    await video.play();
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    scanMsg.value = '对准电脑大屏上的二维码，识别后自动进入手柄';
    scannerTimer = window.setInterval(async () => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      const codes = await detector.detect(video);
      const result = codes[0]?.rawValue;
      if (result) {
        stopH5Scan();
        applyPadUrl(result);
      }
    }, 450);
  } catch {
    stopH5Scan();
    status.value = 'failed';
    errorMsg.value = '摄像头权限未开启，请允许扫码或手动输入';
  }
}

function scanQr() {
  // #ifdef H5
  startH5Scan();
  // #endif
  // #ifndef H5
  uni.scanCode({
    onlyFromCamera: true,
    success: (res) => applyPadUrl(res.result),
    fail: () => {
      status.value = 'failed';
      errorMsg.value = '扫码取消或失败';
    }
  });
  // #endif
}

function checkOrientation() {
  // #ifdef H5
  isPortrait.value = window.innerHeight > window.innerWidth;
  // #endif
}

onMounted(() => {
  roomId.value = getRoomFromUrl();
  requestedPlayer.value = getPlayerFromUrl();
  signalHost.value = getSignalFromUrl();
  checkOrientation();
  // #ifdef H5
  orientationHandler = () => checkOrientation();
  window.addEventListener('resize', orientationHandler);
  window.addEventListener('orientationchange', orientationHandler);
  // #endif
  if (roomId.value) connect();
});

onBeforeUnmount(() => {
  stopH5Scan();
  Object.values(turboTimers).forEach(clearInterval);
  peer?.close();
  socket?.disconnect();
  // #ifdef H5
  if (orientationHandler) {
    window.removeEventListener('resize', orientationHandler);
    window.removeEventListener('orientationchange', orientationHandler);
  }
  // #endif
});

function connect() {
  const room = String(roomId.value || '').trim();
  const signalUrl = getSignalUrl();
  if (!room || !signalUrl) {
    status.value = 'failed';
    errorMsg.value = '请输入 PC 地址和房间号';
    return;
  }
  roomId.value = room;
  stopH5Scan();
  status.value = 'connecting';
  errorMsg.value = '';
  socket?.disconnect();
  peer?.close();
  // #ifndef H5
  uni.setStorageSync('virtualpad_signal', signalHost.value);
  // #endif

  socket = io(signalUrl);

  socket.on('connect', () => {
    socket.emit('pad:join', { roomId: roomId.value, player: requestedPlayer.value }, async ({ ok, hostId, player, error }) => {
      if (!ok) {
        status.value = 'failed';
        if (error === 'room_not_found') errorMsg.value = '房间不存在或已关闭';
        else if (error === 'seat_taken') errorMsg.value = `P${requestedPlayer.value} 已经有人了，请换另一个二维码`;
        else if (error === 'room_full') errorMsg.value = '房间已满';
        else errorMsg.value = '加入失败';
        return;
      }
      assignedPlayer.value = Number(player) === 2 ? 2 : 1;
      peer = createPadPeer({
        onSignal: (data) => socket.emit('signal', { to: hostId, data }),
        onOpen: () => { status.value = 'linked'; vibrate('M'); },
        onClose: () => { status.value = 'failed'; errorMsg.value = '连接已断开'; }
      });
      await peer.start();
    });
  });

  socket.on('connect_error', () => {
    status.value = 'failed';
    errorMsg.value = '连不上 PC，请确认同一 Wi-Fi 和地址端口';
  });

  socket.on('signal', async ({ data }) => {
    await peer?.handleSignal(data);
  });

  socket.on('host:closed', () => {
    status.value = 'failed';
    errorMsg.value = '主机已关闭';
  });
}

function sendKey(key, action) {
  if (action === 'D') vibrate('L');
  peer?.send({ p: assignedPlayer.value, t: 'K', k: key, a: action });
}

function sendSys(cmd) {
  vibrate('M');
  peer?.send({ p: assignedPlayer.value, t: 'S', k: cmd });
}

function toggleSound() {
  soundOn.value = !soundOn.value;
  sendSys('SOUND');
}

function startTurbo(key) {
  if (turboTimers[key]) return;
  vibrate('L');
  let down = false;
  turboTimers[key] = setInterval(() => {
    down = !down;
    sendKey(key, down ? 'D' : 'U');
  }, 50);
}

function stopTurbo(key) {
  clearInterval(turboTimers[key]);
  delete turboTimers[key];
  sendKey(key, 'U');
}
</script>

<template>
  <view class="pad">
    <!-- 手机端连接页：先进网页，再决定扫码或手动输入 -->
    <view v-if="status === 'setup' || status === 'failed'" class="overlay setup-overlay">
      <view class="overlay-card setup-card">
        <view class="brand">VIRTUALPAD</view>
        <view class="setup-title">手机连接游戏大屏</view>
        <view class="setup-subtitle">扫描电脑右侧二维码，连接成功后自动变成手柄。</view>
        <view class="setup-actions">
          <button class="scan-btn" @click="scanQr">扫码连接</button>
          <button class="manual-btn" @click="roomId = roomId || ''">手动输入</button>
        </view>
        <label class="camera-switch">
          <checkbox :checked="cameraOptIn" @click="cameraOptIn = !cameraOptIn" color="#ff4f4f" />
          <text>扫码时开启摄像头</text>
        </label>
        <view class="manual-panel">
          <input class="setup-input" v-model="signalHost" placeholder="PC 地址，例如 192.168.31.92:3000" />
          <input class="setup-input room-input" v-model="roomId" maxlength="4" type="number" placeholder="4 位房间号" />
          <view class="player-select">
            <button :class="['player-select-btn', { active: requestedPlayer === 1 }]" @click="requestedPlayer = 1">P1</button>
            <button :class="['player-select-btn', { active: requestedPlayer === 2 }]" @click="requestedPlayer = 2">P2</button>
          </view>
          <button class="connect-btn" @click="connect">连接手柄</button>
        </view>
        <view v-if="status === 'failed'" class="msg err">{{ errorMsg }}</view>
      </view>
    </view>

    <!-- H5 摄像头扫码页 -->
    <view v-else-if="status === 'scanning'" class="overlay scan-overlay">
      <view class="scan-card">
        <view class="scan-top">
          <view>
            <view class="brand">SCAN</view>
            <view class="setup-title">扫描电脑二维码</view>
          </view>
          <button class="close-scan" @click="stopH5Scan(); status = 'setup'">关闭</button>
        </view>
        <view class="camera-frame">
          <video id="qr-video" class="qr-video" autoplay muted playsinline></video>
          <view class="scan-corners"></view>
          <view class="scan-line"></view>
        </view>
        <view class="scan-msg">{{ scanMsg }}</view>
      </view>
    </view>

    <!-- 已连接后才要求横屏握持 -->
    <view v-else-if="status === 'linked' && isPortrait" class="overlay portrait-hint">
      <view class="rotate-icon">📱</view>
      <view class="msg-big">请横屏拿手机</view>
      <view class="msg-small">这是个游戏手柄，竖着用不了</view>
    </view>

    <!-- 连接状态遮罩 -->
    <view v-else-if="status !== 'linked'" class="overlay">
      <view class="overlay-card">
        <view class="brand">VIRTUALPAD</view>
        <view v-if="status === 'connecting'" class="msg">连接中… 房间 {{ roomId }} / P{{ requestedPlayer }}</view>
      </view>
    </view>

    <!-- 手柄主体 -->
    <view v-if="status === 'linked' && !isPortrait" class="layout">
      <view class="pad-shell"></view>
      <view class="player-chip">P{{ assignedPlayer }}</view>
      <!-- 左侧方向键 -->
      <view class="dpad">
        <view class="dpad-btn up"
              @touchstart.prevent="sendKey('U','D')" @touchend.prevent="sendKey('U','U')"
              @touchcancel.prevent="sendKey('U','U')">▲</view>
        <view class="dpad-row">
          <view class="dpad-btn left"
                @touchstart.prevent="sendKey('L','D')" @touchend.prevent="sendKey('L','U')"
                @touchcancel.prevent="sendKey('L','U')">◀</view>
          <view class="dpad-center"></view>
          <view class="dpad-btn right"
                @touchstart.prevent="sendKey('R','D')" @touchend.prevent="sendKey('R','U')"
                @touchcancel.prevent="sendKey('R','U')">▶</view>
        </view>
        <view class="dpad-btn down"
              @touchstart.prevent="sendKey('D','D')" @touchend.prevent="sendKey('D','U')"
              @touchcancel.prevent="sendKey('D','U')">▼</view>
      </view>

      <!-- 中间游戏键（SELECT/START 是 FC 标准按键，要按 keydown/keyup） -->
      <view class="sys">
        <view class="pad-brand">VIRTUALPAD</view>
        <view :class="['sound-btn', { on: soundOn }]"
              @touchstart.prevent="toggleSound">
          {{ soundOn ? '声音 ON' : '声音 OFF' }}
        </view>
        <view class="sys-btn"
              @touchstart.prevent="sendKey('SE','D')" @touchend.prevent="sendKey('SE','U')"
              @touchcancel.prevent="sendKey('SE','U')">SELECT</view>
        <view class="sys-btn"
              @touchstart.prevent="sendKey('ST','D')" @touchend.prevent="sendKey('ST','U')"
              @touchcancel.prevent="sendKey('ST','U')">START</view>
        <view class="sys-btn small"
              @touchstart.prevent="sendSys('MENU')">⌂ 选游戏</view>
      </view>

      <!-- 右侧动作键 -->
      <view class="action">
        <view class="turbo-row">
          <view class="turbo-btn"
                @touchstart.prevent="startTurbo('A')" @touchend.prevent="stopTurbo('A')"
                @touchcancel.prevent="stopTurbo('A')">TA</view>
          <view class="turbo-btn"
                @touchstart.prevent="startTurbo('B')" @touchend.prevent="stopTurbo('B')"
                @touchcancel.prevent="stopTurbo('B')">TB</view>
        </view>
        <view class="action-row">
          <view class="action-btn b"
                @touchstart.prevent="sendKey('B','D')" @touchend.prevent="sendKey('B','U')"
                @touchcancel.prevent="sendKey('B','U')">B</view>
          <view class="action-btn a"
                @touchstart.prevent="sendKey('A','D')" @touchend.prevent="sendKey('A','U')"
                @touchcancel.prevent="sendKey('A','U')">A</view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss">
page, html, body {
  margin: 0;
  padding: 0;
  background: #0a0a14;
  overflow: hidden;
  height: 100%;
}

.pad {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(circle at 15% 22%, rgba(95, 225, 255, 0.16), transparent 28%),
    radial-gradient(circle at 84% 20%, rgba(255, 51, 51, 0.18), transparent 28%),
    radial-gradient(circle at 50% 92%, rgba(255, 208, 91, 0.1), transparent 34%),
    linear-gradient(135deg, #05070b 0%, #111824 52%, #06070c 100%);
  overflow: hidden;
  touch-action: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
/* 所有可按按钮都关闭 iOS 默认手势：双击不放大、长按不弹菜单 */
.dpad-btn, .sys-btn, .sound-btn, .action-btn, .turbo-btn {
  touch-action: manipulation;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}

/* ========= 遮罩层 ========= */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 20, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  flex-direction: column;
}
.overlay-card { text-align: center; color: #fff; }
.brand { font-size: 22rpx; letter-spacing: 8rpx; color: #8ee9ff; margin-bottom: 20rpx; font-weight: 900; }
.msg { font-size: 30rpx; color: #9aff9a; }
.msg.err { color: #ff6b6b; }
.setup-overlay {
  align-items: stretch;
  justify-content: center;
  padding: max(42rpx, env(safe-area-inset-top)) 34rpx max(34rpx, env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.setup-card {
  width: min(720rpx, calc(100vw - 68rpx));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  align-items: stretch;
  margin: 0 auto;
  padding: 34rpx;
  border: 1px solid rgba(255, 79, 79, 0.5);
  border-radius: 34rpx;
  background:
    radial-gradient(circle at 18% 0%, rgba(95, 225, 255, 0.18), transparent 36%),
    linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)),
    #111722;
  box-shadow: 0 28rpx 80rpx rgba(0,0,0,0.45), 0 0 0 1px rgba(95,225,255,0.12);
}
.setup-title {
  font-size: 54rpx;
  line-height: 1.08;
  color: #fff;
  font-weight: 950;
  text-align: left;
  text-shadow: 4rpx 4rpx 0 rgba(255, 51, 51, 0.48);
}
.setup-subtitle {
  color: #aeb7c8;
  font-size: 27rpx;
  line-height: 1.65;
  text-align: left;
}
.setup-actions {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 16rpx;
}
.setup-input {
  height: 78rpx;
  padding: 0 26rpx;
  border-radius: 18rpx;
  border: 1px solid #3a4060;
  background: #15192e;
  color: #fff;
  font-size: 28rpx;
  text-align: left;
}
.room-input {
  text-align: center;
  font-size: 36rpx;
  letter-spacing: 10rpx;
}
.manual-panel {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 18rpx;
  border-radius: 26rpx;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(5, 8, 12, 0.38);
}
.player-select {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14rpx;
}
.player-select-btn {
  height: 68rpx;
  border-radius: 18rpx;
  border: 1px solid #3a4060;
  background: #15192e;
  color: #9aa6cc;
  font-size: 28rpx;
  font-weight: 800;
}
.player-select-btn.active {
  border-color: #7f8cff;
  background: linear-gradient(180deg, #6675ff, #3a48c8);
  color: #fff;
}
.scan-btn,
.manual-btn,
.connect-btn {
  height: 82rpx;
  border: 0;
  border-radius: 22rpx;
  font-size: 30rpx;
  font-weight: 800;
}
.scan-btn {
  background: linear-gradient(180deg, #ff6969, #bd1b24);
  color: #fff;
  box-shadow: 0 12rpx 28rpx rgba(255, 51, 51, 0.28);
}
.manual-btn {
  border: 1px solid rgba(255,255,255,0.14);
  background: #1a2030;
  color: #d7deee;
}
.connect-btn {
  background: linear-gradient(180deg, #9aff9a, #39c46a);
  color: #07120a;
}
.camera-switch {
  display: flex;
  align-items: center;
  gap: 12rpx;
  color: #c8d1e0;
  font-size: 25rpx;
  text-align: left;
}
.scan-card {
  width: min(720rpx, 90vw);
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.scan-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18rpx;
}
.close-scan {
  min-width: 116rpx;
  height: 64rpx;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 999px;
  background: #1a2030;
  color: #d7deee;
  font-size: 26rpx;
  font-weight: 800;
}
.camera-frame {
  position: relative;
  overflow: hidden;
  aspect-ratio: 1;
  border-radius: 34rpx;
  border: 1px solid rgba(95, 225, 255, 0.45);
  background: #080d15;
  box-shadow: 0 28rpx 80rpx rgba(0,0,0,0.45);
}
.qr-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.scan-corners {
  position: absolute;
  inset: 52rpx;
  border: 4rpx solid rgba(95, 225, 255, 0.88);
  border-radius: 28rpx;
  box-shadow: 0 0 36rpx rgba(95,225,255,0.32);
}
.scan-line {
  position: absolute;
  left: 58rpx;
  right: 58rpx;
  top: 28%;
  height: 4rpx;
  background: #9aff9a;
  box-shadow: 0 0 24rpx rgba(154, 255, 154, 0.72);
  animation: scan-y 1.8s ease-in-out infinite alternate;
}
.scan-msg {
  color: #aeb7c8;
  font-size: 27rpx;
  line-height: 1.6;
}
@keyframes scan-y {
  from { transform: translateY(-60rpx); }
  to { transform: translateY(260rpx); }
}

.portrait-hint .rotate-icon {
  font-size: 120rpx;
  margin-bottom: 30rpx;
  animation: rotate 2s ease-in-out infinite;
}
.portrait-hint .msg-big {
  font-size: 44rpx;
  color: #fff;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.portrait-hint .msg-small {
  font-size: 26rpx;
  color: #6b7280;
}
@keyframes rotate {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-90deg); }
}

/* ========= 手柄主体（横屏布局） ========= */
.layout {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  justify-items: stretch;
  gap: 0;
  padding: max(14px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  box-sizing: border-box;
}
.pad-shell {
  position: absolute;
  left: max(14px, env(safe-area-inset-left));
  right: max(14px, env(safe-area-inset-right));
  top: max(12px, env(safe-area-inset-top));
  bottom: max(12px, env(safe-area-inset-bottom));
  border-radius: 34px 34px 58px 58px;
  background:
    radial-gradient(circle at 18% 50%, rgba(95, 225, 255, 0.12), transparent 28%),
    radial-gradient(circle at 82% 50%, rgba(255, 51, 51, 0.16), transparent 28%),
    linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.025)),
    #111827;
  border: 2px solid rgba(255, 51, 51, 0.45);
  box-shadow:
    0 0 0 1px rgba(95, 225, 255, 0.18),
    0 0 42px rgba(255, 51, 51, 0.18),
    inset 0 1px 0 rgba(255,255,255,0.18),
    inset 0 -20px 45px rgba(0,0,0,0.28),
    0 24px 60px rgba(0,0,0,0.42);
  pointer-events: none;
}
.pad-shell::before,
.pad-shell::after {
  content: '';
  position: absolute;
  top: 11%;
  width: 24%;
  bottom: 11%;
  border-radius: 36px;
  background: radial-gradient(circle at 50% 35%, rgba(255,255,255,0.08), rgba(0,0,0,0.16));
  filter: blur(0.2px);
}
.pad-shell::before { left: 2%; }
.pad-shell::after { right: 2%; }
.player-chip {
  position: absolute;
  left: 50%;
  top: max(22px, env(safe-area-inset-top));
  transform: translateX(-50%);
  z-index: 3;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.14);
  color: #dfe5ff;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.12em;
}

/* === 左侧方向键 === */
.dpad {
  width: min(34vw, 74vh);
  height: min(34vw, 74vh);
  justify-self: start;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: min(1.6vh, 10px);
  align-items: center;
  justify-items: center;
  z-index: 2;
  margin-left: 4vw;
}
.dpad-row { display: contents; }
.dpad-center {
  grid-column: 2;
  grid-row: 2;
  width: 100%;
  height: 100%;
  border-radius: 15px;
  background:
    radial-gradient(circle, rgba(95,225,255,0.2), transparent 58%),
    linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.24)),
    #080c13;
  box-shadow: inset 0 2px 10px rgba(0,0,0,0.45);
}
.dpad-btn {
  width: 100%;
  height: 100%;
  min-width: 76rpx;
  min-height: 76rpx;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04)),
    #171d29;
  border: 1px solid rgba(95,225,255,0.28);
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  color: #e9eefc;
  font-size: min(7vh, 38px);
  font-weight: 600;
  box-shadow: 0 12px 22px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.18), 0 0 16px rgba(95,225,255,0.1);
  position: relative;
  transition: transform 80ms;
}
.dpad-btn.up { grid-column: 2; grid-row: 1; }
.dpad-btn.left { grid-column: 1; grid-row: 2; }
.dpad-btn.right { grid-column: 3; grid-row: 2; }
.dpad-btn.down { grid-column: 2; grid-row: 3; }
.dpad-btn::after {
  content: ''; position: absolute; inset: -12px; /* 热区放大 */
}
.dpad-btn:active {
  background: linear-gradient(180deg, #5866ff, #3441c8);
  color: #fff;
  transform: scale(0.94);
}

/* === 中间系统键 === */
.sys {
  display: flex;
  flex-direction: column;
  gap: min(2vh, 12px);
  align-items: stretch;
  justify-self: center;
  margin: 0 10px;
  z-index: 2;
}
.pad-brand {
  color: #fff;
  font-size: min(2.8vh, 17px);
  font-weight: 950;
  letter-spacing: 0.18em;
  text-align: center;
  margin-bottom: min(1vh, 8px);
  text-shadow: 3px 3px 0 rgba(255, 51, 51, 0.62);
}
.sound-btn {
  padding: min(1.6vh, 10px) 18px;
  border: 1px solid rgba(255, 208, 91, 0.36);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 208, 91, 0.18), rgba(255,255,255,0.04));
  color: #ffd05b;
  font-size: min(2.4vh, 14px);
  font-weight: 900;
  text-align: center;
  min-width: 128px;
  box-shadow: 0 8px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12);
}
.sound-btn.on {
  border-color: rgba(98,255,147,0.64);
  background: linear-gradient(180deg, rgba(98,255,147,0.34), rgba(24,120,62,0.42));
  color: #d8ffe6;
  box-shadow: 0 0 22px rgba(98,255,147,0.18), inset 0 1px 0 rgba(255,255,255,0.16);
}
.sys-btn {
  padding: min(1.8vh, 10px) 18px;
  background: rgba(5, 8, 12, 0.74);
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 999px;
  color: #dfe5ff;
  font-size: min(2.8vh, 16px);
  letter-spacing: 4px;
  text-align: center;
  min-width: 118px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 18px rgba(0,0,0,0.18);
}
.sys-btn:active { background: #5362ff; color: #fff; transform: scale(0.97); }
.sys-btn.small {
  font-size: 1.8vh;
  letter-spacing: 1px;
  padding: 1vh 2vw;
  min-width: 0;
  opacity: 0.7;
}

/* === 右侧动作键 === */
.action {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: min(2.5vh, 14px);
  justify-self: end;
  z-index: 2;
  margin-right: 4vw;
}
.turbo-row, .action-row { display: flex; gap: min(2.2vh, 14px); align-items: center; }
.turbo-btn {
  width: min(12vh, 56px);
  height: min(12vh, 56px);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.02)),
    #1b2230;
  border: 1px solid rgba(95,225,255,0.26);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #9fb0ff;
  font-size: min(3.4vh, 16px);
  font-weight: 700;
  position: relative;
}
.turbo-btn::after { content: ''; position: absolute; inset: -10px; }
.turbo-btn:active { background: linear-gradient(180deg, #5362ff, #2e39b8); color: #fff; }
.action-btn {
  width: min(24vh, 92px);
  height: min(24vh, 92px);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: min(9vh, 48px);
  font-weight: 700;
  box-shadow: 0 14px 26px rgba(0,0,0,0.34), inset 0 2px 0 rgba(255,255,255,0.2);
  position: relative;
  transition: transform 80ms;
}
.action-btn::after { content: ''; position: absolute; inset: -12px; }
.action-btn.a {
  background: linear-gradient(180deg, #ff5f77, #d31731);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.18);
}
.action-btn.b {
  background: linear-gradient(180deg, #5fe1ff, #1b83d6);
  color: #031018;
  border: 1px solid rgba(255,255,255,0.18);
}
.action-btn:active { transform: scale(0.92); }
</style>
