const ICE_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Pad 端：主动 createOffer
export function createPadPeer({ onSignal, onOpen, onClose }) {
  const pc = new RTCPeerConnection(ICE_CONFIG);
  // ordered=false + maxRetransmits=0 → UDP-like，最低延迟
  const channel = pc.createDataChannel('gamepad', { ordered: false, maxRetransmits: 0 });

  channel.onopen = () => onOpen?.();
  channel.onclose = () => onClose?.();

  pc.onicecandidate = (e) => {
    if (e.candidate) onSignal({ type: 'ice', candidate: e.candidate });
  };

  return {
    async start() {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      onSignal({ type: 'offer', sdp: pc.localDescription });
    },
    async handleSignal(data) {
      if (data.type === 'answer') {
        await pc.setRemoteDescription(data.sdp);
      } else if (data.type === 'ice') {
        try { await pc.addIceCandidate(data.candidate); } catch (e) { console.warn(e); }
      }
    },
    send(payload) {
      if (channel.readyState === 'open') {
        channel.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
        return true;
      }
      return false;
    },
    close() {
      try { channel.close(); } catch {}
      try { pc.close(); } catch {}
    }
  };
}
