<script>
  import { uiState } from '../state/ui.svelte.js';
  import {
    deriveKey, encrypt, decrypt,
    makeReadySignal, verifyReadySignal,
    serializeClip, chunkBuffer, deserializeMeta,
    createSenderPeer, createReceiverPeer, connectToPeer,
  } from '../lib/p2p.js';

  let { onReceiveClip } = $props();

  // ── Local state ───────────────────────────────────────────────────────────────
  let senderStatus   = $state('idle');  // idle | waiting-peer | verifying | sending | done | error
  let receiverStatus = $state('idle');  // idle | connecting | ready | receiving | done | error
  let errorMsg       = $state('');
  let secondsLeft    = $state(60);
  let codeInput      = $state('');

  const displayCode = $derived(
    uiState.p2pShare.code
      ? uiState.p2pShare.code.slice(0, 4) + ' · ' + uiState.p2pShare.code.slice(4)
      : ''
  );

  function close() {
    uiState.p2pShare.peer?.destroy();
    uiState.p2pShare = { open: false, mode: null, clip: null, code: null, peer: null };
    senderStatus   = 'idle';
    receiverStatus = 'idle';
    errorMsg       = '';
    secondsLeft    = 60;
    codeInput      = '';
  }

  // ── Sender $effect ────────────────────────────────────────────────────────────
  $effect(() => {
    if (!uiState.p2pShare.open || uiState.p2pShare.mode !== 'sender') return;

    const code = uiState.p2pShare.code;
    const clip = uiState.p2pShare.clip;

    senderStatus = 'idle';
    errorMsg     = '';
    secondsLeft  = 60;

    const peer = createSenderPeer(code);
    uiState.p2pShare.peer = peer;

    let countdownInterval = null;
    let handled = false;

    peer.on('open', () => {
      senderStatus = 'waiting-peer';
      secondsLeft  = 60;
      countdownInterval = setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft <= 0) {
          clearInterval(countdownInterval);
          countdownInterval = null;
          senderStatus = 'error';
          errorMsg     = 'Timed out — generate a new code';
          peer.destroy();
        }
      }, 1000);
    });

    peer.on('connection', conn => {
      if (handled) { conn.close(); return; }

      conn.on('open', () => {
        senderStatus = 'verifying';
      });

      conn.on('data', async data => {
        if (handled) return;
        const key = await deriveKey(code);
        const ok  = await verifyReadySignal(key, data);
        if (!ok) {
          conn.close();
          senderStatus = 'error';
          errorMsg     = 'Code mismatch — wrong pairing code?';
          return;
        }
        handled = true;
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        senderStatus = 'sending';
        try {
          await doSend(conn, key, clip);
          conn.close();
          peer.destroy();
          senderStatus = 'done';
          setTimeout(() => close(), 2000);
        } catch {
          senderStatus = 'error';
          errorMsg     = 'Transfer failed — try again';
        }
      });

      conn.on('close', () => {
        if (!handled && senderStatus !== 'done' && senderStatus !== 'error') {
          senderStatus = 'error';
          errorMsg     = 'Connection dropped — try again';
        }
      });
    });

    peer.on('error', err => {
      senderStatus = 'error';
      if (err.type === 'server-error')    errorMsg = 'Signaling server unreachable';
      else if (err.type === 'unavailable-id') errorMsg = 'Code already in use — try again';
      else errorMsg = `Connection error (${err.type})`;
    });

    return () => {
      if (countdownInterval) clearInterval(countdownInterval);
    };
  });

  async function doSend(conn, key, clip) {
    const { metaBuf, bodyBuf } = await serializeClip(clip, null);
    conn.send(await encrypt(key, metaBuf));
    for (const chunk of chunkBuffer(bodyBuf)) {
      conn.send(await encrypt(key, chunk));
    }
  }

  // ── Receiver logic ────────────────────────────────────────────────────────────
  // Reset receiver state when the modal opens in receiver mode
  $effect(() => {
    if (!uiState.p2pShare.open || uiState.p2pShare.mode !== 'receiver') return;
    receiverStatus = 'idle';
    errorMsg       = '';
    codeInput      = '';
  });

  async function handleConnect() {
    const rawCode = codeInput.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (rawCode.length !== 8) return;

    // Destroy any previous attempt
    uiState.p2pShare.peer?.destroy();

    receiverStatus = 'connecting';
    errorMsg       = '';

    const key  = await deriveKey(rawCode);
    const peer = createReceiverPeer();
    uiState.p2pShare.peer = peer;

    peer.on('open', () => {
      const conn = connectToPeer(peer, rawCode);

      conn.on('open', async () => {
        conn.send(await makeReadySignal(key));
        receiverStatus = 'ready';
      });

      let msgIndex    = 0;
      let receivedMeta = null;
      const chunks    = [];

      conn.on('data', async data => {
        try {
          const decrypted = await decrypt(key, data);
          if (msgIndex === 0) {
            receivedMeta   = deserializeMeta(decrypted);
            receiverStatus = 'receiving';
          } else {
            chunks.push(decrypted);
            if (chunks.length === receivedMeta.totalChunks) {
              const bodyBuf = reassemble(chunks);
              await onReceiveClip(receivedMeta, bodyBuf);
              receiverStatus = 'done';
              setTimeout(() => close(), 2000);
            }
          }
          msgIndex++;
        } catch (err) {
          receiverStatus = 'error';
          errorMsg = err instanceof DOMException
            ? 'Decryption failed — data may be corrupted'
            : 'Transfer failed — try again';
        }
      });

      conn.on('close', () => {
        if (!['done', 'error'].includes(receiverStatus)) {
          receiverStatus = 'error';
          errorMsg       = 'Connection dropped — try again';
        }
      });

      conn.on('error', () => {
        receiverStatus = 'error';
        errorMsg       = 'Connection error — try again';
      });
    });

    peer.on('error', err => {
      receiverStatus = 'error';
      if (err.type === 'peer-unavailable') errorMsg = 'No sender found — check the code';
      else if (err.type === 'server-error') errorMsg = 'Signaling server unreachable';
      else errorMsg = `Error: ${err.type}`;
    });
  }

  function reassemble(chunks) {
    const totalLen = chunks.reduce((s, c) => s + c.byteLength, 0);
    const out      = new Uint8Array(totalLen);
    let offset     = 0;
    for (const chunk of chunks) {
      out.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    return out.buffer;
  }

  function onCodeInput(e) {
    const raw       = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
    const formatted = raw.length > 4 ? raw.slice(0, 4) + '-' + raw.slice(4) : raw;
    codeInput       = formatted;
    e.target.value  = formatted;
  }

  function onCodeKeyDown(e) {
    if (e.key === 'Enter') handleConnect();
  }

  const senderMsg = $derived({
    idle:           '',
    'waiting-peer': 'Waiting for receiver…',
    verifying:      'Verifying connection…',
    sending:        'Sending clip…',
    done:           'Sent!',
    error:          errorMsg,
  }[senderStatus] ?? '');

  const receiverMsg = $derived({
    idle:       '',
    connecting: 'Connecting…',
    ready:      'Connected — awaiting clip…',
    receiving:  'Receiving clip…',
    done:       'Clip received!',
    error:      errorMsg,
  }[receiverStatus] ?? '');
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
<div
  class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 transition-opacity duration-150"
  class:opacity-0={!uiState.p2pShare.open}
  class:pointer-events-none={!uiState.p2pShare.open}
  onclick={(e) => { if (e.target === e.currentTarget) close(); }}
  role="dialog"
  aria-modal="true"
  aria-label="P2P clip sharing"
>
  <div class="bg-nb-card border border-white/10 rounded-xl shadow-2xl w-full max-w-sm p-6">

    <!-- Header -->
    <div class="flex items-center justify-between mb-5">
      <h3 class="text-sm font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-nb-accent" style="font-size:16px">
          {uiState.p2pShare.mode === 'sender' ? 'send' : 'download_for_offline'}
        </span>
        {uiState.p2pShare.mode === 'sender' ? 'Send clip via P2P' : 'Receive clip via P2P'}
      </h3>
      <button class="text-nb-muted hover:text-nb-text transition-colors" onclick={close}>
        <span class="material-symbols-outlined" style="font-size:18px">close</span>
      </button>
    </div>

    <!-- ── SENDER ─────────────────────────────────────────────────────────────── -->
    {#if uiState.p2pShare.mode === 'sender'}

      {#if senderStatus === 'done'}
        <div class="text-center py-6">
          <span class="material-symbols-outlined text-nb-accent block mb-2" style="font-size:40px">check_circle</span>
          <div class="text-sm text-nb-text font-medium">Sent!</div>
          <div class="text-xs text-nb-muted mt-1">Clip delivered securely</div>
        </div>

      {:else if senderStatus === 'error'}
        <div class="text-center py-6">
          <span class="material-symbols-outlined text-red-400 block mb-2" style="font-size:40px">error</span>
          <div class="text-sm text-red-400">{errorMsg}</div>
        </div>

      {:else}
        <!-- Code display -->
        <div class="mb-5">
          <div class="text-[10px] uppercase tracking-widest text-nb-muted mb-2">Pairing code</div>
          <div class="bg-nb-bg border border-white/10 rounded-lg py-5 text-center font-mono text-2xl tracking-[0.25em] text-nb-text select-all cursor-text">
            {displayCode}
          </div>
          <div class="text-[11px] text-nb-muted text-center mt-2 leading-relaxed">
            Receiver opens app → Receive → enters code above
          </div>
        </div>

        <!-- Status + countdown -->
        <div class="mb-5">
          <div class="flex items-center justify-between text-xs mb-2">
            <span class="text-nb-muted flex items-center gap-1.5">
              {#if senderStatus === 'waiting-peer'}
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-nb-accent animate-pulse"></span>
              {/if}
              {senderMsg}
            </span>
            {#if senderStatus === 'waiting-peer'}
              <span class="text-nb-muted tabular-nums">{secondsLeft}s</span>
            {/if}
          </div>
          {#if senderStatus === 'waiting-peer'}
            <div class="h-0.5 bg-nb-bg rounded-full overflow-hidden">
              <div
                class="h-full bg-nb-accent/50 rounded-full transition-all duration-1000"
                style="width: {(secondsLeft / 60) * 100}%"
              ></div>
            </div>
          {:else if senderStatus === 'verifying' || senderStatus === 'sending'}
            <div class="h-0.5 bg-nb-accent/50 rounded-full animate-pulse"></div>
          {/if}
        </div>
      {/if}

      <button
        class="w-full px-4 py-2 bg-nb-bg border border-white/10 rounded text-xs text-nb-muted hover:text-nb-text hover:border-white/20 transition-colors"
        onclick={close}
      >
        {senderStatus === 'done' ? 'Close' : 'Cancel'}
      </button>

    <!-- ── RECEIVER ───────────────────────────────────────────────────────────── -->
    {:else if uiState.p2pShare.mode === 'receiver'}

      {#if receiverStatus === 'done'}
        <div class="text-center py-6">
          <span class="material-symbols-outlined text-nb-accent block mb-2" style="font-size:40px">check_circle</span>
          <div class="text-sm text-nb-text font-medium">Clip received!</div>
          <div class="text-xs text-nb-muted mt-1">Added to your feed</div>
        </div>

      {:else if receiverStatus === 'error'}
        <div class="mb-4 text-center py-4">
          <span class="material-symbols-outlined text-red-400 block mb-2" style="font-size:36px">error</span>
          <div class="text-sm text-red-400 mb-3">{errorMsg}</div>
          <!-- Allow retry -->
          <div class="flex gap-2">
            <input
              class="flex-1 bg-nb-bg border border-white/10 rounded px-3 py-2 text-sm font-mono tracking-widest uppercase text-nb-text outline-none focus:border-nb-accent/40 placeholder:text-white/20"
              placeholder="XXXX-XXXX"
              maxlength="9"
              value={codeInput}
              oninput={onCodeInput}
              onkeydown={onCodeKeyDown}
            />
            <button
              class="px-4 py-2 bg-nb-accent/10 border border-nb-accent/20 rounded text-xs text-nb-accent hover:bg-nb-accent/20 transition-colors disabled:opacity-40"
              onclick={handleConnect}
              disabled={codeInput.replace(/[^A-Za-z0-9]/g, '').length < 8}
            >Retry</button>
          </div>
        </div>

      {:else if receiverStatus === 'idle'}
        <div class="mb-5">
          <div class="text-[10px] uppercase tracking-widest text-nb-muted mb-2">Enter pairing code</div>
          <div class="flex gap-2">
            <input
              class="flex-1 bg-nb-bg border border-white/10 rounded px-3 py-2 text-sm font-mono tracking-widest uppercase text-nb-text outline-none focus:border-nb-accent/40 placeholder:text-white/20"
              placeholder="XXXX-XXXX"
              maxlength="9"
              value={codeInput}
              oninput={onCodeInput}
              onkeydown={onCodeKeyDown}
            />
            <button
              class="px-4 py-2 bg-nb-accent/10 border border-nb-accent/20 rounded text-xs text-nb-accent hover:bg-nb-accent/20 transition-colors disabled:opacity-40"
              onclick={handleConnect}
              disabled={codeInput.replace(/[^A-Za-z0-9]/g, '').length < 8}
            >Connect</button>
          </div>
          <div class="text-[11px] text-nb-muted mt-2">
            Enter the 8-character code shown on the sender's screen
          </div>
        </div>

      {:else}
        <!-- connecting | ready | receiving -->
        <div class="mb-5 py-4">
          <div class="h-0.5 bg-nb-accent/50 rounded-full animate-pulse mb-4"></div>
          <div class="text-xs text-nb-muted text-center flex items-center justify-center gap-2">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-nb-accent animate-pulse"></span>
            {receiverMsg}
          </div>
        </div>
      {/if}

      {#if receiverStatus !== 'done'}
        <button
          class="w-full px-4 py-2 bg-nb-bg border border-white/10 rounded text-xs text-nb-muted hover:text-nb-text hover:border-white/20 transition-colors"
          onclick={close}
        >Cancel</button>
      {:else}
        <button
          class="w-full px-4 py-2 bg-nb-bg border border-white/10 rounded text-xs text-nb-muted hover:text-nb-text hover:border-white/20 transition-colors"
          onclick={close}
        >Close</button>
      {/if}

    {/if}
  </div>
</div>
