// 手柄按键 → fcgame (JSNES) 键码映射
//
// fcgame js/source/keyboard.js 里硬编码的 keyCode 映射（1P）：
//   W(87)=UP   S(83)=DOWN  A(65)=LEFT  D(68)=RIGHT
//   K(75)=A    J(74)=B     Ctrl(17)=SELECT   Enter(13)=START
//
// JSNES 用 jQuery `$(document).bind('keydown')` 监听，不检查 isTrusted，
// 所以合成 KeyboardEvent dispatch 到 iframe.contentDocument 即可。
const KEY_MAP = {
  1: {
    U:  { code: 'KeyW',        key: 'w',         keyCode: 87 },
    D:  { code: 'KeyS',        key: 's',         keyCode: 83 },
    L:  { code: 'KeyA',        key: 'a',         keyCode: 65 },
    R:  { code: 'KeyD',        key: 'd',         keyCode: 68 },
    A:  { code: 'KeyK',        key: 'k',         keyCode: 75 },
    B:  { code: 'KeyJ',        key: 'j',         keyCode: 74 },
    SE: { code: 'ControlRight', key: 'Control',  keyCode: 17 },
    ST: { code: 'Enter',       key: 'Enter',     keyCode: 13 }
  },
  2: {
    U:  { code: 'Numpad8',     key: '8',         keyCode: 104 },
    D:  { code: 'Numpad2',     key: '2',         keyCode: 98 },
    L:  { code: 'Numpad4',     key: '4',         keyCode: 100 },
    R:  { code: 'Numpad6',     key: '6',         keyCode: 102 },
    A:  { code: 'Numpad7',     key: '7',         keyCode: 103 },
    B:  { code: 'Numpad9',     key: '9',         keyCode: 105 },
    SE: { code: 'Numpad3',     key: '3',         keyCode: 99 },
    ST: { code: 'Numpad1',     key: '1',         keyCode: 97 }
  }
};

const MIN_PRESS_MS = 150;

export function makeKeyInjector(getFrame) {
  const pressedAt = new Map();
  const releaseTimers = new Map();

  function frame() {
    return typeof getFrame === 'function' ? getFrame() : getFrame;
  }

  function target() {
    const f = frame();
    return f?.contentDocument || document;
  }

  function frameWindow() {
    const f = typeof getFrame === 'function' ? getFrame() : getFrame;
    return f?.contentWindow || window;
  }

  function keyboardEvent(type, m) {
    const ev = new KeyboardEvent(type, {
      code: m.code,
      key: m.key,
      bubbles: true,
      cancelable: true
    });
    Object.defineProperties(ev, {
      keyCode: { get: () => m.keyCode },
      which: { get: () => m.keyCode }
    });
    return ev;
  }

  function dispatch(type, m) {
    const doc = target();
    const win = frameWindow();

    // Direct state write is the reliable path for game menus and title screens.
    // Synthetic KeyboardEvent is kept as a fallback for the embedded UI layer.
    const value = type === 'keydown' ? 0x41 : 0x40;
    if (win?.nes?.keyboard?.setKey) {
      win.nes.keyboard.setKey(m.keyCode, value);
    }

    doc.dispatchEvent(keyboardEvent(type, m));
    // 同时 dispatch 到 window 兜底（某些场景下 jQuery 在 window 也有绑）
    if (win) win.dispatchEvent(keyboardEvent(type, m));
  }

  function pressId(player, padKey) {
    return `${player || 1}:${padKey}`;
  }

  function setKey(player, padKey, isDown) {
    const playerNo = Number(player) === 2 ? 2 : 1;
    const m = KEY_MAP[playerNo][padKey];
    if (!m) return;
    const id = pressId(playerNo, padKey);

    if (isDown) {
      const releaseTimer = releaseTimers.get(id);
      if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimers.delete(id);
      }
      pressedAt.set(id, performance.now());
      dispatch('keydown', m);
      return;
    }

    const elapsed = performance.now() - (pressedAt.get(id) || 0);
    const delay = Math.max(0, MIN_PRESS_MS - elapsed);
    const release = () => {
      dispatch('keyup', m);
      pressedAt.delete(id);
      releaseTimers.delete(id);
    };

    if (delay > 0) {
      releaseTimers.set(id, setTimeout(release, delay));
    } else {
      release();
    }
  }

  return {
    key(padKey, action, player = 1) {
      setKey(player, padKey, action === 'D');
    },
    sys(cmd) {
      if (cmd === 'FULL') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
      } else if (cmd === 'SOUND') {
        const win = frameWindow();
        if (win?.nes) {
          win.nes.opts.emulateSound = !win.nes.opts.emulateSound;
          const audio = win.nes.ui?.audio;
          if (win.nes.opts.emulateSound && audio?.resume) audio.resume();
          const soundButton = win.nes.ui?.buttons?.sound;
          soundButton?.attr?.('value', win.nes.opts.emulateSound ? '关闭声音' : '打开声音');
        }
      } else if (cmd === 'ESC') {
        // 模拟 Escape，让游戏弹出菜单 / 暂停
        dispatch('keydown', { code: 'Escape', key: 'Escape', keyCode: 27 });
        dispatch('keyup',   { code: 'Escape', key: 'Escape', keyCode: 27 });
      }
    }
  };
}
