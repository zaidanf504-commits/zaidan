/* ==========================================================================
   WIDGET LIVE CHAT — ZAIDAN (v2.2)
   --------------------------------------------------------------------------
   Level 1 UX Upgrade:
   - Auto-scroll pintar (tidak paksa scroll saat user baca history)
   - Prevent double-send (disable button saat loading)
   - Escape key untuk tutup panel
   - Placeholder dinamis + Enter to send
   ========================================================================== */

(function () {
    'use strict';

    // ============================================================
    // TUNGGU CHATCORE SIAP
    // ============================================================
    let Core = null;
    let initAttempts = 0;
    const MAX_ATTEMPTS = 50; // 5 detik

    function waitForCore() {
        if (window.ChatCore) {
            Core = window.ChatCore;
            console.log('[ChatWidget] ✅ ChatCore siap, mulai widget');
            boot();
            return;
        }

        if (window.ChatCore === null) {
            console.warn('[ChatWidget] ⚠️ ChatCore gagal di-init. Widget tidak aktif.');
            return;
        }

        initAttempts++;
        if (initAttempts >= MAX_ATTEMPTS) {
            console.warn('[ChatWidget] ⚠️ Timeout menunggu ChatCore. Widget tidak aktif.');
            return;
        }

        setTimeout(waitForCore, 100);
    }

    // ============================================================
    // STATE
    // ============================================================
    let isOpen = false;
    let isReady = false;
    let isSending = false; // ← untuk prevent double-send
    let ui = null;

    // ============================================================
    // BUILD UI
    // ============================================================
    function buildUI() {
        if (document.querySelector('.zchat-bubble')) {
            return {
                bubble: document.querySelector('.zchat-bubble'),
                panel: document.querySelector('.zchat-panel')
            };
        }

        const bubble = document.createElement('button');
        bubble.className = 'zchat-bubble';
        bubble.setAttribute('aria-label', 'Buka live chat');
        bubble.type = 'button';
        bubble.innerHTML = '<i class="bx bx-message-rounded-dots"></i>';
        document.body.appendChild(bubble);

        const panel = document.createElement('div');
        panel.className = 'zchat-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Live chat dengan Zaidan');
        panel.innerHTML = `
            <div class="zchat-header">
                <div class="zchat-avatar">Z</div>
                <div class="zchat-header-info">
                    <h3>Zaidan Faiz</h3>
                    <div class="zchat-status">
                        <span class="zchat-status-dot"></span>
                        <span>Biasanya balas dalam 1-2 jam</span>
                    </div>
                </div>
                <a href="chat.html" class="zchat-expand" title="Buka di halaman penuh" aria-label="Buka di halaman penuh">
                    <i class='bx bx-expand-alt'></i>
                </a>
                <button class="zchat-close" id="zchat-close" aria-label="Tutup chat" type="button">
                    <i class="bx bx-x"></i>
                </button>
            </div>

            <div class="zchat-intro" id="zchat-intro">
                <p><strong>Halo! 👋</strong>Sebelum mulai, boleh tahu nama kamu?</p>
                <input type="text" class="zchat-input" id="zchat-name-input" placeholder="Nama kamu" maxlength="50" autocomplete="name">
                <button class="zchat-btn" id="zchat-start-btn" disabled type="button">Mulai Chat</button>
            </div>

            <div class="zchat-messages" id="zchat-messages"></div>

            <div class="zchat-typing" id="zchat-typing"></div>

            <form class="zchat-form" id="zchat-form">
                <input type="text" id="zchat-input" placeholder="Tulis pesan... (Enter untuk kirim)" maxlength="2000" autocomplete="off">
                <button type="submit" class="zchat-send" id="zchat-send" aria-label="Kirim pesan">
                    <i class="bx bx-send"></i>
                </button>
            </form>

            <div class="zchat-toast" id="zchat-toast"></div>
        `;
        document.body.appendChild(panel);

        return { bubble, panel };
    }

    // ============================================================
    // TOAST
    // ============================================================
    function showToast(message) {
        const toast = document.getElementById('zchat-toast');
        if (!toast) return;

        toast.textContent = message;
        toast.classList.add('is-visible');

        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(() => {
            toast.classList.remove('is-visible');
        }, 3000);
    }

    // ============================================================
    // OPEN / CLOSE
    // ============================================================
    function openChat() {
        isOpen = true;
        ui.panel.classList.add('is-open');
        ui.bubble.classList.add('is-open');
        ui.bubble.innerHTML = '<i class="bx bx-x"></i>';
        ui.bubble.setAttribute('aria-label', 'Tutup live chat');

        clearUnreadBadge();
        if (isReady) Core.markAsRead();

        setTimeout(() => {
            if (Core.hasIdentity()) {
                const input = document.getElementById('zchat-input');
                if (input) input.focus();
            } else {
                const nameInput = document.getElementById('zchat-name-input');
                if (nameInput) nameInput.focus();
            }
        }, 320);
    }

    function closeChat() {
        isOpen = false;
        ui.panel.classList.remove('is-open');
        ui.bubble.classList.remove('is-open');
        ui.bubble.innerHTML = '<i class="bx bx-message-rounded-dots"></i>';
        ui.bubble.setAttribute('aria-label', 'Buka live chat');
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================
    async function initWidget() {
        if (!Core.hasIdentity()) {
            document.getElementById('zchat-intro').classList.add('is-visible');
            return;
        }

        document.getElementById('zchat-intro').classList.remove('is-visible');
        document.getElementById('zchat-messages').classList.add('is-visible');
        document.getElementById('zchat-form').classList.add('is-visible');

        try {
            await Core.setup();
            isReady = true;
            await loadMessages();
            Core.subscribeRealtime();
        } catch (err) {
            console.error('[ChatWidget] ❌ Init error:', err);
            showToast('Gagal memuat chat. Coba refresh halaman.');
        }
    }

    // ============================================================
    // NAME FORM
    // ============================================================
    function setupNameForm() {
        const nameInput = document.getElementById('zchat-name-input');
        const startBtn = document.getElementById('zchat-start-btn');

        nameInput.addEventListener('input', () => {
            startBtn.disabled = nameInput.value.trim().length < 2;
        });

        startBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (name.length < 2) return;

            Core.setIdentity(name, '');
            startBtn.textContent = 'Memuat...';
            startBtn.disabled = true;

            try {
                await initWidget();
            } catch (err) {
                console.error('[ChatWidget] Setup error:', err);
                startBtn.textContent = 'Mulai Chat';
                startBtn.disabled = false;
                showToast('Gagal memulai chat. Coba lagi.');
            }
        });

        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !startBtn.disabled) {
                e.preventDefault();
                startBtn.click();
            }
        });
    }

    // ============================================================
    // LOAD MESSAGES
    // ============================================================
    async function loadMessages() {
        try {
            const messages = await Core.loadMessages();
            const container = document.getElementById('zchat-messages');
            container.innerHTML = '';
            messages.forEach(msg => appendMessage(msg, false));
            scrollToBottom(true); // Paksa scroll saat load awal
        } catch (err) {
            console.error('[ChatWidget] Load error:', err);
            showToast('Gagal memuat pesan');
        }
    }

    function appendMessage(msg, animate = true) {
        if (document.querySelector(`#zchat-messages [data-id="${msg.id}"]`)) return;

        const container = document.getElementById('zchat-messages');
        const div = document.createElement('div');
        div.className = 'zchat-msg zchat-msg--' + msg.sender;
        div.dataset.id = msg.id;
        if (!animate) div.style.animation = 'none';
        div.innerHTML = `
            ${escapeHtml(msg.content)}
            <span class="zchat-msg-time">${formatTime(msg.created_at)}</span>
        `;
        container.appendChild(div);
    }

    // ============================================================
    // SCROLL PINTAR
    // ============================================================
    function scrollToBottom(force = false) {
        const container = document.getElementById('zchat-messages');
        if (!container) return;

        // Kalau user sedang scroll ke atas (baca history), jangan paksa
        // scroll ke bawah. Kecuali `force = true`.
        const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;

        if (force || nearBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // ============================================================
    // SEND MESSAGE
    // ============================================================
    function setupSendForm() {
        const form = document.getElementById('zchat-form');
        const input = document.getElementById('zchat-input');
        const sendBtn = document.getElementById('zchat-send');

        // Enter to send (Shift+Enter = baris baru, tapi widget pakai <input>
        // jadi baris baru tidak berlaku — cukup Enter untuk kirim)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.value.trim() && !isSending) {
                    form.dispatchEvent(new Event('submit'));
                }
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Prevent double-send
            if (isSending) return;

            const text = input.value.trim();
            if (!text) return;

            if (!isReady) {
                showToast('Chat belum siap. Tunggu sebentar...');
                return;
            }

            isSending = true;
            input.value = '';
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="bx bx-loader-circle bx-spin"></i>';

            try {
                await Core.sendMessage(text);
                scrollToBottom(true); // Paksa scroll setelah kirim
            } catch (err) {
                console.error('[ChatWidget] ❌ Send error:', err);
                input.value = text;

                let errMsg = 'Gagal mengirim. Coba lagi.';
                if (err.message) {
                    if (err.message.includes('row-level security')) {
                        errMsg = 'Error: Izin database. Hubungi admin.';
                    } else if (err.message.includes('Failed to fetch')) {
                        errMsg = 'Error: Koneksi internet bermasalah.';
                    }
                }
                showToast(errMsg);
            }

            isSending = false;
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="bx bx-send"></i>';
            input.focus();
        });
    }

    // ============================================================
    // REALTIME
    // ============================================================
    function setupRealtime() {
        Core.on('message:new', (msg) => {
            appendMessage(msg, true);

            // Kalau pesan dari user sendiri → paksa scroll.
            // Kalau dari admin → scroll hanya kalau user sudah di bawah.
            scrollToBottom(msg.sender === 'visitor');

            if (!isOpen && msg.sender === 'admin') {
                showUnreadBadge();
            }
        });
    }

    // ============================================================
    // BADGE
    // ============================================================
    function showUnreadBadge() {
        let badge = ui.bubble.querySelector('.zchat-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'zchat-badge';
            badge.textContent = '1';
            ui.bubble.appendChild(badge);
        } else {
            badge.textContent = String(parseInt(badge.textContent || '0') + 1);
        }
    }

    function clearUnreadBadge() {
        const badge = ui.bubble.querySelector('.zchat-badge');
        if (badge) badge.remove();
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : text;
        return div.innerHTML;
    }

    function formatTime(iso) {
        return new Date(iso).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // ============================================================
    // BOOT
    // ============================================================
    function boot() {
        ui = buildUI();

        ui.bubble.addEventListener('click', () => {
            isOpen ? closeChat() : openChat();
        });

        document.getElementById('zchat-close').addEventListener('click', closeChat);

        // Escape untuk tutup panel
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) {
                closeChat();
            }
        });

        setupNameForm();
        setupSendForm();
        setupRealtime();

        initWidget();

        window.ZChat = {
            open: openChat,
            close: closeChat,
            reset: () => {
                Core.resetVisitor();
                location.reload();
            }
        };

        console.log('[ChatWidget] ✅ Widget siap');
    }

    waitForCore();

})();
