<script setup>
import { ref, computed, onMounted, useTemplateRef } from 'vue';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
import { createHostPeer } from './webrtc.js';
import { makeKeyInjector } from './keyInjector.js';

const view = ref('picker'); // picker | game
const currentGame = ref(null);

const games = ref([]);
const categories = ref({});
const covers = ref({});
const activeCategory = ref('ACT');
const searchKeyword = ref('');

const roomId = ref('----');
const padLinks = ref([]);
const pads = ref({ 1: 'idle', 2: 'idle' });
const gameFrame = useTemplateRef('gameFrame');
const activeQrPlayer = ref(1);
let menuAssistUntil = 0;

const urlParams = new URLSearchParams(location.search);
const configuredSignalUrl = urlParams.get('signal') || import.meta.env.VITE_SIGNAL_URL || '';
const SIGNAL_URL = configuredSignalUrl || `${location.protocol}//${location.hostname}:3000`;
const PUBLIC_PAD_URL = urlParams.get('pad') || import.meta.env.VITE_PAD_URL || '';
const activeSignalUrl = ref(SIGNAL_URL);
const activePadBase = ref(PUBLIC_PAD_URL);

const CATEGORY_LABELS = {
  ACT: '动作', RPG: '角色扮演', STG: '射击', PUZ: '益智',
  SLG: '策略', SPG: '体育', RAC: '赛车', FTG: '格斗',
  TAB: '棋牌', AVG: '冒险', DMG: '其他', ETC: '杂项'
};
const CATEGORY_ICONS = {
  ACT: '⌁', RPG: '⚔', STG: '◎', PUZ: '✚',
  SLG: '♜', SPG: '♛', RAC: '◌', FTG: '×',
  TAB: '♠', AVG: '⚑', DMG: '●', ETC: '…'
};
const CATEGORY_ACCENTS = {
  ACT: '#ff4f6d', RPG: '#5fe1ff', STG: '#ffd05b', PUZ: '#8fff72',
  SLG: '#ff8b3d', SPG: '#48ffa7', RAC: '#ff5ee1', FTG: '#ff3d3d',
  TAB: '#7db5ff', AVG: '#d7ff5b', DMG: '#b284ff', ETC: '#a7b0c4'
};
const CATEGORY_ORDER = ['ACT', 'AVG', 'STG', 'RPG', 'SPG', 'RAC', 'PUZ', 'FTG', 'DMG', 'ETC', 'SLG', 'TAB'];

const filteredGames = computed(() => {
  let list = games.value;
  if (activeCategory.value) list = list.filter(g => g.category === activeCategory.value);
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim();
    list = list.filter(g => g.name.includes(kw) || g.fullName.includes(kw));
  }
  return list;
});

const categoryItems = computed(() => Object.keys(categories.value).sort((a, b) => {
  const ai = CATEGORY_ORDER.indexOf(a);
  const bi = CATEGORY_ORDER.indexOf(b);
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
}).map((key) => ({
  key,
  label: CATEGORY_LABELS[key] || key,
  count: categories.value[key],
  accent: CATEGORY_ACCENTS[key] || '#7db5ff'
})));

const activeCategoryName = computed(() => CATEGORY_LABELS[activeCategory.value] || activeCategory.value);
const featuredGames = computed(() => filteredGames.value.slice(0, 5));
const activePadLink = computed(() => padLinks.value.find((link) => link.player === activeQrPlayer.value) || padLinks.value[0]);

function formatSize(size) {
  return `${Math.max(1, Math.round(size / 1024))}K`;
}

function hashText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function gamePoster(game) {
  const seed = hashText(`${game.name}-${game.path}`);
  const hue = seed % 360;
  const hue2 = (hue + 38 + (seed % 80)) % 360;
  const accent = CATEGORY_ACCENTS[game.category] || '#ff4f6d';
  const icon = CATEGORY_ICONS[game.category] || '游';
  const title = game.name.replace(/[<>&"]/g, '').slice(0, 10);
  const subtitle = CATEGORY_LABELS[game.category] || game.category;
  const shape = seed % 4;
  const pattern = [
    `<circle cx="224" cy="88" r="76" fill="hsla(${hue2},82%,58%,0.42)"/>`,
    `<path d="M0 186 C74 126 132 232 236 142 C286 96 334 102 376 128 L376 520 L0 520 Z" fill="hsla(${hue2},80%,45%,0.36)"/>`,
    `<polygon points="188,38 340,178 260,360 84,322 38,130" fill="hsla(${hue2},82%,55%,0.32)"/>`,
    `<path d="M66 86 L308 48 L338 282 L92 336 Z" fill="hsla(${hue2},84%,54%,0.30)"/>`
  ][shape];
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 520">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},78%,18%)"/>
      <stop offset="0.55" stop-color="#111827"/>
      <stop offset="1" stop-color="hsl(${hue2},82%,16%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="32%" cy="18%" r="70%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.72"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="376" height="520" rx="22" fill="url(#bg)"/>
  <rect width="376" height="520" rx="22" fill="url(#glow)"/>
  ${pattern}
  <g opacity="0.18">
    <path d="M24 54 H352 M24 108 H352 M24 162 H352 M24 216 H352 M24 270 H352 M24 324 H352" stroke="#fff" stroke-width="1"/>
    <path d="M54 24 V382 M108 24 V382 M162 24 V382 M216 24 V382 M270 24 V382 M324 24 V382" stroke="#fff" stroke-width="1"/>
  </g>
  <g filter="url(#shadow)">
    <circle cx="188" cy="204" r="92" fill="rgba(0,0,0,0.28)"/>
    <text x="188" y="232" text-anchor="middle" font-family="Arial, sans-serif" font-size="92" font-weight="900" fill="#fff">${icon}</text>
  </g>
  <rect x="0" y="376" width="376" height="144" fill="rgba(5,8,14,0.78)"/>
  <text x="28" y="424" font-family="Arial, PingFang SC, sans-serif" font-size="32" font-weight="900" fill="#fff">${title}</text>
  <text x="28" y="462" font-family="Arial, PingFang SC, sans-serif" font-size="20" font-weight="800" fill="${accent}">${subtitle}</text>
  <text x="298" y="462" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="#aeb8c8">FC</text>
</svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function coverForGame(game) {
  return covers.value[game.path] || '/covers/missing-cover.svg';
}

function launchGame(game) {
  currentGame.value = game;
  view.value = 'game';
  menuAssistUntil = performance.now() + 45000;
  document.documentElement.requestFullscreen?.().catch(() => {});
}

function backToPicker() {
  view.value = 'picker';
  currentGame.value = null;
}

function signalParam() {
  return encodeURIComponent(activeSignalUrl.value);
}

async function buildPadLinks(id, lanIP) {
  const padBase = activePadBase.value || `http://${lanIP}:5174/`;
  padLinks.value = await Promise.all([1, 2].map(async (player) => {
    const url = `${padBase}?room=${id}&player=${player}&signal=${signalParam()}`;
    return {
      player,
      label: player === 1 ? 'P1 主手柄' : 'P2 加入游戏',
      hint: player === 1 ? '自己扫这个' : '朋友扫这个',
      url,
      qr: await QRCode.toDataURL(url, { width: 220, margin: 1 })
    };
  }));
}

onMounted(async () => {
  // 拉 games.json
  try {
    const res = await fetch('/games.json');
    const data = await res.json();
    games.value = data.games;
    categories.value = data.meta.categories;
    const coverRes = await fetch('/covers/manifest.json');
    if (coverRes.ok) covers.value = await coverRes.json();
  } catch (e) {
    console.error(`load games.json failed: ${e.message}`);
  }

  // KeyInjector 始终指向当前 iframe（在 game 视图下才有效）
  const inject = makeKeyInjector(() => gameFrame.value);

  const peers = new Map();
  let socket = null;
  let didFallback = false;

  function attachSocket(signalUrl, { useLocalPad = false } = {}) {
    activeSignalUrl.value = signalUrl;
    if (useLocalPad) activePadBase.value = '';
    socket?.disconnect();
    socket = io(signalUrl);
    const fallbackTimer = configuredSignalUrl && !didFallback
      ? window.setTimeout(() => {
          if (roomId.value !== '----') return;
          didFallback = true;
          attachSocket(`${location.protocol}//${location.hostname}:3000`, { useLocalPad: true });
        }, 2200)
      : null;

    socket.on('connect', () => {
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      socket.emit('host:create', null, async ({ ok, roomId: id, lanIP }) => {
        if (!ok) return console.error('create room failed');
        roomId.value = id;
        await buildPadLinks(id, lanIP);
      });
    });

    socket.on('connect_error', () => {
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      if (didFallback || !configuredSignalUrl) return;
      didFallback = true;
      attachSocket(`${location.protocol}//${location.hostname}:3000`, { useLocalPad: true });
    });

    socket.on('pad:joined', async ({ padId, player }) => {
      const playerNo = Number(player) === 2 ? 2 : 1;
      pads.value = { ...pads.value, [playerNo]: 'connected' };
      const peer = createHostPeer({
        onSignal: (data) => socket.emit('signal', { to: padId, data }),
        onMessage: (raw) => {
          try {
            const data = JSON.parse(raw);
            const inputPlayer = Number(data.p) === 2 ? 2 : playerNo;
            if (data.t === 'K') {
              inject.key(data.k, data.a, inputPlayer);
              if (
                inputPlayer === 2 &&
                performance.now() < menuAssistUntil &&
                ['U', 'D', 'L', 'R', 'SE', 'ST'].includes(data.k)
              ) {
                inject.key(data.k, data.a, 1);
              }
            } else if (data.t === 'S') {
              if (data.k === 'MENU') backToPicker();
              else inject.sys(data.k);
            }
          } catch (e) {
            console.error(`parse err: ${e.message}`);
          }
        },
        onOpen: () => {},
        onClose: () => {}
      });
      peers.set(padId, peer);
      await peer.start();
    });

    socket.on('signal', async ({ from, data }) => {
      const peer = peers.get(from);
      if (peer) await peer.handleSignal(data);
    });

    socket.on('pad:left', ({ padId, player }) => {
      peers.get(padId)?.close();
      peers.delete(padId);
      if (player) pads.value = { ...pads.value, [player]: 'idle' };
    });
  }

  attachSocket(SIGNAL_URL);
});
</script>

<template>
  <div class="root">
    <div v-if="view === 'picker'" class="picker">
      <aside class="rail">
        <div class="mark">
          <span class="mark-icon">VP</span>
          <div>
            <div class="mark-title">VirtualPad</div>
            <div class="mark-sub">经典游戏 · 手机当手柄</div>
          </div>
        </div>
        <nav class="category-rail">
          <button
            v-for="cat in categoryItems"
            :key="cat.key"
            :class="['rail-tab', { active: activeCategory === cat.key }]"
            :style="{ '--accent': cat.accent }"
            @click="activeCategory = cat.key"
          >
            <span :class="['rail-icon', `icon-${cat.key.toLowerCase()}`]" aria-hidden="true"></span>
            <span class="rail-name">{{ cat.label }}</span>
            <span class="rail-count">{{ cat.count }}</span>
          </button>
        </nav>
        <div class="room-card">
          <span>房间号</span>
          <strong>{{ roomId }}</strong>
        </div>
      </aside>

      <main class="library">
        <section class="hero">
          <div class="hero-copy">
            <h1 class="sr-only">重温经典 热血再燃</h1>
            <p class="sr-only">{{ games.length }} 款 FC 游戏 · 当前分类 {{ activeCategoryName }} · 手机就是手柄</p>
            <div class="search-wrap">
              <span>⌕</span>
              <input v-model="searchKeyword" class="search" placeholder="搜游戏名，比如 冒险岛、魂斗罗、马里奥" />
            </div>
          </div>
          <aside class="join-panel">
            <div class="join-head">
              <p>PAIRING</p>
              <h2>扫码加入</h2>
            </div>
            <div class="qr-switch" v-if="padLinks.length">
              <button :class="{ active: activeQrPlayer === 1 }" @click="activeQrPlayer = 1">扫 P1</button>
              <button :class="{ active: activeQrPlayer === 2 }" @click="activeQrPlayer = 2">扫 P2</button>
            </div>
            <div class="qr-focus" v-if="activePadLink">
              <div :class="['qr-block', `focus-p${activePadLink.player}`]">
                <img :src="activePadLink.qr" :alt="`${activePadLink.label} QR`" />
                <div class="room-meta">
                  <div :class="['player-code', `p${activePadLink.player}`]">P{{ activePadLink.player }}</div>
                  <div class="player-label">{{ activePadLink.player === 1 ? '主手柄' : '加入游戏' }}</div>
                  <div class="room-status">
                    <span :class="['dot', pads[activePadLink.player]]"></span>
                    {{ pads[activePadLink.player] === 'connected' ? '已连接' : activePadLink.hint }}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section class="content-row">
          <div class="games-panel">
            <div class="section-head">
              <div>
                <p class="section-kicker">{{ activeCategoryName }}</p>
                <h2>游戏库</h2>
              </div>
              <div class="library-actions">
                <div class="result-count">共 <strong>{{ filteredGames.length }}</strong> 款游戏</div>
                <div class="view-toggle" aria-label="视图切换">
                  <button class="active" title="网格视图">▦</button>
                  <button title="列表视图">☰</button>
                </div>
              </div>
            </div>
            <div class="game-grid">
              <button
                v-for="g in filteredGames"
                :key="g.path"
                class="game-card"
                :style="{ '--accent': CATEGORY_ACCENTS[g.category] || '#7db5ff' }"
                @click="launchGame(g)"
              >
                <img class="poster-art" :src="coverForGame(g)" :alt="`${g.name} 海报`" loading="lazy" />
                <span class="card-name">{{ g.name }}</span>
                <span class="card-meta">
                  <span>{{ CATEGORY_LABELS[g.category] || g.category }}</span>
                  <span>{{ formatSize(g.size) }}</span>
                </span>
              </button>
              <div v-if="filteredGames.length === 0" class="empty">没找到匹配的游戏</div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <div v-else class="game">
      <iframe
        ref="gameFrame"
        :src="`/fcgame/index.html?tv=1&rom=${currentGame.path}`"
        class="game-frame"
        frameborder="0"
        allow="autoplay"
      ></iframe>

      <button class="back-btn" @click="backToPicker">← 选游戏</button>

      <div class="game-title">{{ currentGame.name }}</div>

      <div class="player-badges">
        <div v-for="player in [1, 2]" :key="player" :class="['badge', pads[player]]">
          P{{ player }} {{ pads[player] === 'connected' ? '已连' : '等待' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style>
html, body, #app {
  height: 100%;
  margin: 0;
  background: #07090d;
  color: #f6f7fb;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

button, input {
  font: inherit;
}

.root {
  width: 100vw;
  min-height: 100vh;
  background:
    radial-gradient(circle at 10% 0%, rgba(255, 52, 52, 0.22), transparent 25%),
    radial-gradient(circle at 88% 12%, rgba(20, 218, 255, 0.15), transparent 28%),
    linear-gradient(135deg, #020508 0%, #081019 46%, #03070b 100%);
  overflow-x: hidden;
}
.root::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 40px 40px;
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.8), transparent 72%);
  pointer-events: none;
}

.picker {
  position: relative;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 14px;
  min-height: 100vh;
  padding: 12px;
  box-sizing: border-box;
}

.rail {
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 12px;
  height: calc(100vh - 24px);
  padding: 16px;
  border: 1px solid rgba(255,255,255,0.09);
  border-left: 3px solid #ff3333;
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(8, 13, 18, 0.94), rgba(5, 8, 12, 0.92));
  backdrop-filter: blur(18px);
  box-shadow: 0 0 0 1px rgba(255, 42, 42, 0.08), 0 24px 70px rgba(0,0,0,0.46);
  box-sizing: border-box;
}
.rail::before,
.rail::after {
  content: '';
  position: absolute;
  left: -3px;
  width: 18px;
  height: 18px;
  border-left: 2px solid #ff3333;
  pointer-events: none;
}
.rail::before {
  top: 0;
  border-top: 2px solid #ff3333;
  border-top-left-radius: 8px;
}
.rail::after {
  bottom: 0;
  border-bottom: 2px solid #ff3333;
  border-bottom-left-radius: 8px;
}
.mark {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 4px 0 18px;
  border-bottom: 1px solid rgba(255, 51, 51, 0.28);
  margin-bottom: 14px;
}
.mark-icon {
  display: none;
}
.mark-title {
  position: relative;
  font-size: 29px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0;
  line-height: 1;
  text-shadow: 4px 4px 0 rgba(255, 51, 51, 0.62);
}
.mark-title::after {
  content: '*';
  position: relative;
  top: -8px;
  margin-left: 3px;
  color: #ff3333;
  font-size: 23px;
  text-shadow: none;
}
.mark-sub {
  margin-top: 8px;
  color: #c2c8d4;
  font-size: 14px;
  font-weight: 700;
  text-align: center;
}

.category-rail {
  display: grid;
  gap: 6px;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
}
.category-rail::-webkit-scrollbar {
  display: none;
}
.rail-tab {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 41px;
  padding: 6px 10px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  background: linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
  color: #d8dee7;
  cursor: pointer;
  text-align: left;
}
.rail-tab:hover,
.rail-tab.active {
  border-color: #ff3333;
  background: linear-gradient(90deg, rgba(255, 51, 51, 0.44), rgba(255, 51, 51, 0.14));
  box-shadow: inset 0 0 0 1px rgba(255, 82, 82, 0.25), 0 0 22px rgba(255, 35, 35, 0.22);
  color: #fff;
}
.rail-icon {
  position: relative;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  border: 1px solid rgba(255,255,255,0.16);
  background:
    radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 58%),
    #0c141f;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05), 0 0 14px color-mix(in srgb, var(--accent) 20%, transparent);
}
.rail-icon::before,
.rail-icon::after {
  content: '';
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
}
.rail-icon::before {
  width: 17px;
  height: 17px;
  border: 2px solid #f5f8ff;
  border-radius: 5px;
}
.rail-icon::after {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ff3333;
  box-shadow: 8px 0 #5fe1ff;
}
.icon-act::before {
  width: 20px;
  height: 12px;
  border-radius: 10px;
}
.icon-act::after {
  left: 10px;
  top: 13px;
}
.icon-rpg::before {
  width: 4px;
  height: 22px;
  border: 0;
  border-radius: 2px;
  background: #f5f8ff;
  transform: rotate(42deg);
}
.icon-rpg::after {
  width: 18px;
  height: 2px;
  border-radius: 0;
  background: #ff3333;
  box-shadow: none;
  transform: rotate(42deg) translateY(6px);
}
.icon-stg::before {
  border-radius: 50%;
}
.icon-stg::after {
  width: 7px;
  height: 7px;
  background: #ff3333;
  box-shadow: none;
}
.icon-puz::before {
  border-radius: 3px;
  clip-path: polygon(0 0, 58% 0, 58% 32%, 100% 32%, 100% 100%, 0 100%);
}
.icon-puz::after {
  width: 6px;
  height: 6px;
  right: 8px;
  top: 8px;
  background: #5fe1ff;
  box-shadow: none;
}
.icon-slg::before {
  width: 18px;
  height: 18px;
  border-radius: 2px;
  transform: rotate(45deg);
}
.icon-slg::after {
  width: 16px;
  height: 2px;
  background: #ff3333;
  border-radius: 0;
  box-shadow: 0 7px #5fe1ff;
}
.icon-spg::before {
  border-radius: 50%;
}
.icon-spg::after {
  width: 19px;
  height: 2px;
  background: #f5f8ff;
  border-radius: 0;
  box-shadow: 0 -6px #ff3333, 0 6px #5fe1ff;
}
.icon-rac::before {
  width: 20px;
  height: 12px;
  border-radius: 12px 12px 5px 5px;
}
.icon-rac::after {
  bottom: 8px;
  width: 5px;
  height: 5px;
  background: #ff3333;
  box-shadow: 12px 0 #5fe1ff;
}
.icon-ftg::before {
  width: 18px;
  height: 2px;
  border: 0;
  border-radius: 0;
  background: #f5f8ff;
  transform: rotate(45deg);
}
.icon-ftg::after {
  width: 18px;
  height: 2px;
  border-radius: 0;
  background: #ff3333;
  box-shadow: none;
  transform: rotate(-45deg);
}
.icon-tab::before {
  width: 15px;
  height: 20px;
  border-radius: 3px;
  transform: rotate(-8deg);
}
.icon-tab::after {
  width: 5px;
  height: 5px;
  background: #ff3333;
  box-shadow: 0 8px #5fe1ff;
}
.icon-avg::before {
  width: 17px;
  height: 17px;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
}
.icon-avg::after {
  width: 6px;
  height: 6px;
  background: #ff3333;
  box-shadow: none;
}
.icon-dmg::before {
  width: 18px;
  height: 18px;
  border-radius: 50%;
}
.icon-dmg::after {
  width: 3px;
  height: 20px;
  border-radius: 0;
  background: #ff3333;
  box-shadow: 7px 0 #5fe1ff, -7px 0 rgba(245,248,255,0.75);
}
.icon-etc::before {
  width: 4px;
  height: 4px;
  border: 0;
  border-radius: 50%;
  background: #f5f8ff;
  box-shadow: 7px 0 #ff3333, -7px 0 #5fe1ff;
}
.icon-etc::after {
  display: none;
}
.rail-name {
  font-weight: 750;
  font-size: 15px;
}
.rail-count {
  color: #ff4b4b;
  font-size: 13px;
  font-weight: 800;
}

.library {
  min-width: 0;
  display: grid;
  gap: 14px;
}
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(390px, 446px);
  gap: 14px;
  min-height: 327px;
}
.hero-copy,
.games-panel,
.join-panel {
  border: 1px solid rgba(76, 103, 132, 0.5);
  border-radius: 8px;
  background: rgba(8, 12, 18, 0.84);
  box-shadow: 0 22px 70px rgba(0,0,0,0.38), inset 0 0 0 1px rgba(255,255,255,0.035);
  backdrop-filter: blur(18px);
}
.hero-copy {
  position: relative;
  overflow: hidden;
  min-height: 327px;
  padding: 0;
  background:
    linear-gradient(90deg, rgba(2,5,8,0.08), rgba(2,5,8,0.1)),
    url('/ui/hero-scene.png') center / 100% 100% no-repeat;
}
.hero-copy::after {
  content: none;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.eyebrow,
.section-kicker,
.join-head p {
  margin: 0 0 8px;
  color: #5fe1ff;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}
.hero h1 {
  position: relative;
  margin: 0;
  max-width: 780px;
  font-size: clamp(42px, 5.2vw, 86px);
  line-height: 0.96;
  font-weight: 950;
}
.hero-sub {
  position: relative;
  max-width: 620px;
  margin: 18px 0 0;
  color: #b3bdcf;
  font-size: 16px;
}
.search-wrap {
  position: absolute;
  left: 5%;
  bottom: 8%;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: center;
  width: 55%;
  margin-top: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  box-shadow: none;
  z-index: 2;
}
.search-wrap span {
  padding-left: 20px;
  color: transparent;
  font-size: 34px;
  font-weight: 900;
}
.search {
  width: 100%;
  padding: 17px 16px;
  border: 0;
  background: transparent;
  color: #fff;
  box-sizing: border-box;
  caret-color: #ff3333;
}
.search::placeholder { color: transparent; }
.search:focus {
  outline: none;
}
.game-card:hover {
  border-color: rgba(255, 51, 51, 0.88);
  transform: translateY(-2px);
}

.content-row {
  display: block;
}
.games-panel {
  min-width: 0;
  padding: 10px;
  border-color: rgba(255, 51, 51, 0.4);
}
.section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
  padding: 0 2px;
}
.section-head h2,
.join-head h2 {
  margin: 0;
  font-size: 30px;
  text-shadow: 3px 3px 0 rgba(255, 51, 51, 0.45);
}
.section-head h2 {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 42px;
}
.section-head h2::before {
  content: '//';
  position: absolute;
  left: 0;
  top: -1px;
  color: #ff3333;
  font-size: 32px;
  font-weight: 950;
  font-style: italic;
  letter-spacing: -3px;
  text-shadow: 0 0 14px rgba(255, 51, 51, 0.45);
}
.section-head h2::after {
  content: '';
  width: 86px;
  height: 8px;
  margin-left: 2px;
  background: repeating-linear-gradient(110deg, #ff3333 0 8px, transparent 8px 15px);
  opacity: 0.82;
}
.library-actions {
  display: flex;
  align-items: center;
  gap: 18px;
}
.result-count {
  color: #d6dbe4;
  font-weight: 800;
}
.result-count strong {
  color: #ff3333;
  font-size: 18px;
}
.view-toggle {
  display: flex;
  gap: 6px;
  padding: 5px;
  border: 1px solid rgba(255, 51, 51, 0.45);
  border-radius: 8px;
  background: rgba(5, 8, 12, 0.72);
}
.view-toggle button {
  width: 34px;
  height: 30px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #8b94a3;
  cursor: default;
  font-size: 17px;
  font-weight: 900;
}
.view-toggle button.active {
  background: #ff3333;
  color: #fff;
  box-shadow: 0 0 16px rgba(255, 51, 51, 0.32);
}
.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
  gap: 10px;
}
.game-card {
  position: relative;
  display: grid;
  grid-template-rows: auto auto auto;
  gap: 7px;
  padding: 7px;
  overflow: hidden;
  border: 1px solid rgba(92, 117, 148, 0.72);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(18, 25, 34, 0.98), rgba(8, 12, 18, 0.98));
  color: #fff;
  cursor: pointer;
  text-align: left;
  transition: transform 150ms, border-color 150ms, background 150ms;
}
.card-name,
.card-meta {
  position: relative;
}
.poster-art {
  width: 100%;
  aspect-ratio: 4 / 3;
  display: block;
  object-fit: cover;
  border-radius: 7px;
  background: #121827;
  box-shadow: 0 12px 22px rgba(0,0,0,0.34);
}
.card-name {
  min-height: 22px;
  font-size: 14px;
  font-weight: 850;
  line-height: 1.32;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #b9c0cb;
  font-size: 11px;
}
.card-meta span:first-child {
  padding: 2px 7px;
  border-radius: 4px;
  background: #e33737;
  color: #fff;
  font-weight: 800;
}
.empty {
  grid-column: 1 / -1;
  padding: 70px 20px;
  color: #8c95a8;
  text-align: center;
}

.join-panel {
  padding: 18px 14px;
  border-color: rgba(255, 51, 51, 0.48);
  background:
    linear-gradient(135deg, rgba(255, 51, 51, 0.08), transparent 34%),
    rgba(6, 10, 16, 0.92);
  position: relative;
  overflow: hidden;
}
.join-panel::before,
.join-panel::after {
  content: '';
  position: absolute;
  top: 28px;
  right: 20px;
  height: 6px;
  width: 62px;
  background: repeating-linear-gradient(110deg, #ff3333 0 9px, transparent 9px 17px);
  pointer-events: none;
}
.join-panel::after {
  top: 58px;
  width: 74px;
  opacity: 0.65;
  transform: skewX(24deg);
}
.join-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.qr-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 12px 0;
}
.qr-switch button {
  height: 42px;
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 8px;
  background: rgba(255,255,255,0.06);
  color: #aeb8c8;
  font-size: 15px;
  font-weight: 900;
  cursor: pointer;
}
.qr-switch button.active:first-child {
  border-color: #ff3333;
  background: linear-gradient(180deg, rgba(255,51,51,0.46), rgba(255,51,51,0.18));
  color: #fff;
  box-shadow: 0 0 22px rgba(255,51,51,0.22);
}
.qr-switch button.active:nth-child(2) {
  border-color: #28dfff;
  background: linear-gradient(180deg, rgba(40,223,255,0.42), rgba(40,223,255,0.16));
  color: #fff;
  box-shadow: 0 0 22px rgba(40,223,255,0.2);
}
.qr-focus {
  display: grid;
  gap: 10px;
}
.qr-block {
  position: relative;
  display: grid;
  grid-template-columns: 190px minmax(150px, 1fr);
  gap: 18px;
  align-items: center;
  min-height: 230px;
  padding: 18px;
  border: 1px solid #ff3333;
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(255, 51, 51, 0.12), rgba(255,255,255,0.03)),
    rgba(4, 7, 12, 0.76);
}
.qr-block::before,
.qr-block::after {
  content: '';
  position: absolute;
  width: 42px;
  height: 28px;
  pointer-events: none;
}
.qr-block::before {
  left: 10px;
  top: 10px;
  border-top: 4px solid #ff3333;
  border-left: 4px solid #ff3333;
}
.qr-block::after {
  right: 10px;
  bottom: 10px;
  border-right: 2px solid #ff3333;
  border-bottom: 2px solid #ff3333;
}
.qr-block.focus-p2 {
  border-color: #28dfff;
  background:
    linear-gradient(90deg, rgba(40, 223, 255, 0.12), rgba(255,255,255,0.03)),
    rgba(4, 7, 12, 0.76);
}
.qr-block.focus-p2::before {
  border-color: #28dfff;
}
.qr-block.focus-p2::after {
  border-color: #28dfff;
}
.qr-block img {
  width: 180px;
  height: 180px;
  display: block;
  padding: 10px;
  border-radius: 8px;
  background: #fff;
  box-sizing: border-box;
  box-shadow: 0 0 0 3px rgba(255, 51, 51, 0.5);
}
.qr-block.focus-p2 img {
  box-shadow: 0 0 0 3px rgba(40, 223, 255, 0.5);
}
.player-code {
  color: #ff3333;
  font-size: 62px;
  font-weight: 950;
  font-style: italic;
  line-height: 1;
  text-shadow: 0 0 16px rgba(255, 51, 51, 0.35);
}
.player-code.p2 {
  color: #28dfff;
  text-shadow: 0 0 16px rgba(40, 223, 255, 0.35);
}
.player-label {
  color: #fff;
  font-size: 22px;
  font-weight: 900;
  margin-bottom: 8px;
  white-space: nowrap;
}
.room-meta {
  min-width: 0;
  position: relative;
  z-index: 1;
}
.room-meta::after {
  content: '';
  position: absolute;
  right: 8px;
  top: -16px;
  z-index: -1;
  width: 116px;
  height: 58px;
  border: 2px solid rgba(255,255,255,0.08);
  border-radius: 38px 38px 26px 26px;
  transform: rotate(-12deg);
  opacity: 0.85;
}
.room-meta::before {
  content: '';
  position: absolute;
  right: 46px;
  top: 4px;
  z-index: -1;
  width: 9px;
  height: 9px;
  border: 2px solid rgba(255,255,255,0.08);
  border-radius: 50%;
  box-shadow:
    20px 0 0 -2px rgba(255,255,255,0.08),
    44px 5px 0 -1px rgba(255,255,255,0.08),
    56px -4px 0 -1px rgba(255,255,255,0.08);
}
.room-status {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #aeb8c8;
  font-size: 13px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #626b78;
}
.dot.connected {
  background: #62ff93;
  box-shadow: 0 0 12px rgba(98,255,147,0.88);
}
.room-card {
  position: relative;
  z-index: 2;
  margin-top: auto;
  padding: 14px 18px;
  border-radius: 0;
  border: 1px solid rgba(255, 213, 76, 0.34);
  background: linear-gradient(135deg, rgba(255, 213, 76, 0.16), rgba(255,255,255,0.03));
  box-shadow: inset 0 0 0 1px rgba(255, 213, 76, 0.08);
  clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px);
}
.room-card::before {
  content: '◉';
  float: left;
  margin-right: 10px;
  color: #47e986;
  text-shadow: 0 0 10px rgba(71, 233, 134, 0.8);
}
.room-card::after {
  content: '▂▃▅▇';
  position: absolute;
  right: 16px;
  bottom: 18px;
  color: #55ef7c;
  font-size: 20px;
}
.room-card span {
  display: block;
  color: #ffd05b;
  font-size: 12px;
  font-weight: 900;
}
.room-card strong {
  display: block;
  margin-top: 4px;
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 40px;
  font-weight: 250;
}

.game {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #000;
}
.game-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.back-btn,
.game-title,
.badge {
  background: rgba(8, 11, 17, 0.78);
  border: 1px solid rgba(255,255,255,0.13);
  color: #fff;
  backdrop-filter: blur(8px);
}
.back-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  padding: 8px 16px;
  border-radius: 999px;
  cursor: pointer;
  z-index: 20;
}
.game-title {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 20px;
  border-radius: 999px;
  font-size: 14px;
  z-index: 20;
}
.player-badges {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 20;
}
.badge {
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
}
.badge.idle {
  color: #aeb8c8;
}
.badge.connected {
  background: rgba(18, 84, 50, 0.86);
  color: #83ffad;
}

@media (max-width: 1100px) {
  .picker {
    grid-template-columns: 1fr;
  }
  .rail,
  .join-panel {
    position: relative;
    top: auto;
    height: auto;
  }
  .category-rail {
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  }
  .hero {
    grid-template-columns: 1fr;
  }
}
</style>
