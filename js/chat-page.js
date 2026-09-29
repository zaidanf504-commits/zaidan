/* ==========================================================================
   CHAT PAGE — Logic untuk halaman chat.html
   --------------------------------------------------------------------------
   Level 1 UX Upgrade:
   - Auto-scroll pintar (tidak paksa scroll saat user baca history)
   - Force scroll saat kirim pesan atau load awal
   ========================================================================== */

(function () {
    'use strict';

    let initAttempts = 0;
    const MAX_INIT_ATTEMPTS = 50;

    function waitForCore() {
        if (window.ChatCore) {
            bootPage(window.ChatCore);
            return;
        }

        if (window.ChatCore === null || initAttempts >= MAX_INIT_ATTEMPTS) {
            console.error('[ChatPage] ChatCore tidak tersedia.');
            const loading = document.getElementById('introScreen');
            if (loading) loading.innerHTML = '<div class="cp-loading"><i class="bx bx-error-circle"></i>Chat tidak dapat dimuat. Silakan refresh halaman.</div>';
            return;
        }

        initAttempts++;
        setTimeout(waitForCore, 100);
    }

    function bootPage(Core) {

        // ============================================================
        // DOM REFS
        // ============================================================
        const $ = (id) => document.getElementById(id);

        const introScreen = $('introScreen');
        const chatScreen = $('chatScreen');
        const introForm = $('introForm');
        const introName = $('introName');
        const introEmail = $('introEmail');
        const introSubmit = $('introSubmit');
        const messagesArea = $('messagesArea');
        const typingIndicator = $('typingIndicator');
        const quickReplies = $('quickReplies');
        const chatForm = $('chatForm');
        const chatInput = $('chatInput');
        const chatSend = $('chatSend');
        const emojiBtn = $('emojiBtn');
        const emojiPicker = $('emojiPicker');
        const headerStatus = $('headerStatus');
        const themeToggle = $('themeToggle');
        const soundToggle = $('soundToggle');
        const toast = $('chatToast');
        const toastText = $('chatToastText');

        let soundEnabled = true;
        let hasSentFirstMessage = false;

        // ============================================================
        // HELPER
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

        function formatDateDivider(iso) {
            const d = new Date(iso);
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const sameDay = (a, b) =>
                a.getFullYear() === b.getFullYear() &&
                a.getMonth() === b.getMonth() &&
                a.getDate() === b.getDate();

            if (sameDay(d, today)) return 'Hari ini';
            if (sameDay(d, yesterday)) return 'Kemarin';
            return d.toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
            });
        }

        function showToast(message, icon = 'bx-check-circle') {
            toastText.textContent = message;
            toast.querySelector('i').className = 'bx ' + icon;
            toast.classList.add('is-visible');
            clearTimeout(showToast._timer);
            showToast._timer = setTimeout(() => {
                toast.classList.remove('is-visible');
            }, 2500);
        }

        // ============================================================
        // THEME TOGGLE
        // ============================================================
        themeToggle.addEventListener('click', () => {
            const html = document.documentElement;
            html.classList.toggle('dark');
            const isDark = html.classList.contains('dark');
            try {
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            } catch (e) {}
        });

        // ============================================================
        // SOUND TOGGLE
        // ============================================================
        try {
            const saved = localStorage.getItem('zchat_sound');
            if (saved === 'off') {
                soundEnabled = false;
                soundToggle.querySelector('i').className = 'bx bx-volume-mute';
            }
        } catch (e) {}

        soundToggle.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            soundToggle.querySelector('i').className = soundEnabled ? 'bx bx-volume-full' : 'bx bx-volume-mute';
            try {
                localStorage.setItem('zchat_sound', soundEnabled ? 'on' : 'off');
            } catch (e) {}
            showToast(soundEnabled ? 'Suara aktif' : 'Suara dimatikan',
                soundEnabled ? 'bx-volume-full' : 'bx-volume-mute');
        });

        // ============================================================
        // INTRO FORM
        // ============================================================
        function validateIntro() {
            const name = introName.value.trim();
            introSubmit.disabled = name.length < 2;
        }

        introName.addEventListener('input', validateIntro);
        introEmail.addEventListener('input', validateIntro);

        introForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = introName.value.trim();
            const email = introEmail.value.trim();

            if (name.length < 2) return;

            introSubmit.disabled = true;
            introSubmit.innerHTML = '<i class="bx bx-loader-circle bx-spin"></i> Memuat...';

            Core.setIdentity(name, email);

            try {
                await Core.setup();
                showChatScreen();
            } catch (err) {
                console.error('[ChatPage] Setup error:', err);
                showToast('Gagal memulai chat. Coba lagi.', 'bx-error-circle');
                introSubmit.disabled = false;
                introSubmit.innerHTML = 'Mulai Chat <i class="bx bx-right-arrow-alt"></i>';
            }
        });

        // ============================================================
        // SCREEN SWITCHING
        // ============================================================
        function showIntroScreen() {
            introScreen.classList.remove('is-hidden');
            chatScreen.classList.remove('is-visible');
        }

        async function showChatScreen() {
            introScreen.classList.add('is-hidden');
            chatScreen.classList.add('is-visible');

            headerStatus.textContent = 'Online — biasanya balas dalam 1-2 jam';

            await loadAndRenderMessages();
            Core.subscribeRealtime();
            Core.markAsRead();

            setTimeout(() => chatInput.focus(), 200);
        }

        // ============================================================
        // MESSAGES RENDERING
        // ============================================================
        async function loadAndRenderMessages() {
            messagesArea.innerHTML = '<div class="cp-loading"><i class="bx bx-loader-circle bx-spin"></i>Memuat pesan...</div>';

            try {
                const messages = await Core.loadMessages();
                messagesArea.innerHTML = '';

                if (messages.length === 0) {
                    renderEmptyHint();
                    return;
                }

                let lastDate = null;
                messages.forEach(msg => {
                    const dateKey = new Date(msg.created_at).toDateString();
                    if (dateKey !== lastDate) {
                        appendDateDivider(msg.created_at);
                        lastDate = dateKey;
                    }
                    appendMessage(msg, false);
                });

                scrollToBottom(true); // Paksa scroll saat load awal
            } catch (err) {
                messagesArea.innerHTML = '<div class="cp-loading"><i class="bx bx-error-circle"></i>Gagal memuat pesan</div>';
            }
        }

        function renderEmptyHint() {
            messagesArea.innerHTML = `
                <div class="cp-loading">
                    <i class='bx bx-message-rounded-dots'></i>
                    <span>Belum ada pesan. Mulai dengan sapaan!</span>
                </div>
            `;
        }

        function appendDateDivider(iso) {
            const div = document.createElement('div');
            div.className = 'cp-date-divider';
            div.textContent = formatDateDivider(iso);
            messagesArea.appendChild(div);
        }

        function appendMessage(msg, animate = true) {
            if (document.querySelector(`#messagesArea [data-id="${msg.id}"]`)) return;

            const isAdmin = msg.sender === 'admin';
            const visitorName = Core.getVisitorName() || 'Kamu';
            const initial = isAdmin ? 'Z' : visitorName.charAt(0).toUpperCase();

            const row = document.createElement('div');
            row.className = 'cp-msg ' + (isAdmin ? 'is-admin' : 'is-visitor');
            row.dataset.id = msg.id;
            if (!animate) row.style.animation = 'none';

            row.innerHTML = `
                <div class="cp-msg__avatar">${escapeHtml(initial)}</div>
                <div class="cp-msg__bubble">
                    ${escapeHtml(msg.content)}
                    <span class="cp-msg__time">${formatTime(msg.created_at)}</span>
                </div>
            `;

            messagesArea.appendChild(row);
        }

        // ============================================================
        // SCROLL PINTAR
        // ============================================================
        function scrollToBottom(force = false) {
            const nearBottom = messagesArea.scrollHeight - messagesArea.scrollTop - messagesArea.clientHeight < 150;
            if (force || nearBottom) {
                messagesArea.scrollTop = messagesArea.scrollHeight;
            }
        }

        // ============================================================
        // REALTIME LISTENER
        // ============================================================
        Core.on('message:new', (msg) => {
            const lastDivider = messagesArea.querySelector('.cp-date-divider:last-of-type');
            const needsDivider = !lastDivider ||
                lastDivider.textContent !== formatDateDivider(msg.created_at);

            if (needsDivider) {
                appendDateDivider(msg.created_at);
            }

            appendMessage(msg, true);

            // Kalau pesan dari user sendiri → paksa scroll.
            // Kalau dari admin → scroll hanya kalau user sudah di bawah.
            scrollToBottom(msg.sender === 'visitor');

            if (msg.sender === 'admin') {
                playNotif();
                if (document.hidden) {
                    vibrate();
                }
            }
        });

        // ============================================================
        // SOUND & VIBRATION
        // ============================================================
        let audioCtx = null;

        function playNotif() {
            if (!soundEnabled) return;
            try {
                if (!audioCtx) {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                const now = audioCtx.currentTime;
                [880, 1174].forEach((freq, i) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.frequency.value = freq;
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.08, now + i * 0.12);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.25);
                    osc.start(now + i * 0.12);
                    osc.stop(now + i * 0.12 + 0.25);
                });
            } catch (e) {}
        }

        function vibrate() {
            try {
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            } catch (e) {}
        }

        // ============================================================
        // AUTO-GROW TEXTAREA
        // ============================================================
        function autoGrow() {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
            chatSend.disabled = !chatInput.value.trim();
        }

        chatInput.addEventListener('input', autoGrow);

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (chatInput.value.trim()) {
                    chatForm.dispatchEvent(new Event('submit'));
                }
            }
        });

        // ============================================================
        // QUICK REPLIES
        // ============================================================
        document.querySelectorAll('.chat-quick-reply').forEach(btn => {
            btn.addEventListener('click', () => {
                chatInput.value = btn.dataset.text;
                autoGrow();
                chatInput.focus();
            });
        });

        // ============================================================
        // EMOJI PICKER
        // ============================================================
        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            emojiPicker.classList.toggle('is-open');
        });

        document.querySelectorAll('.chat-emoji-option').forEach(btn => {
            btn.addEventListener('click', () => {
                chatInput.value += btn.textContent;
                autoGrow();
                chatInput.focus();
                emojiPicker.classList.remove('is-open');
            });
        });

        document.addEventListener('click', (e) => {
            if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
                emojiPicker.classList.remove('is-open');
            }
        });

        // ============================================================
        // SEND MESSAGE
        // ============================================================
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text) return;

            chatInput.value = '';
            autoGrow();
            chatSend.disabled = true;

            try {
                await Core.sendMessage(text);
                scrollToBottom(true); // Paksa scroll setelah kirim

                if (!hasSentFirstMessage) {
                    hasSentFirstMessage = true;
                    quickReplies.classList.add('is-hidden');
                }
            } catch (err) {
                console.error('[ChatPage] Kirim gagal:', err);
                chatInput.value = text;
                autoGrow();
                showToast('Gagal mengirim pesan', 'bx-error-circle');
            }

            chatSend.disabled = false;
            chatInput.focus();
        });

        // ============================================================
        // BOOT
        // ============================================================
        function boot() {
            const name = Core.getVisitorName();

            if (name) {
                introName.value = name;
                introEmail.value = Core.getVisitorEmail() || '';
                Core.setup().then(() => {
                    showChatScreen();
                }).catch(err => {
                    console.error('[ChatPage] Setup error:', err);
                    showIntroScreen();
                });
            } else {
                showIntroScreen();
            }

            autoGrow();
            validateIntro();
        }

        boot();
    }

    waitForCore();

})();
