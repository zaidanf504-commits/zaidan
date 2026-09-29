/* ==========================================================================
   WIDGET LIVE CHAT — ZAIDAN
   --------------------------------------------------------------------------
   Chat 2 arah antara visitor (user web) dan admin (kamu).
   Pesan disimpan di Supabase dan dikirim real-time via Realtime channel.

   Tidak ada bot. Semua balasan datang dari kamu (admin).
   ========================================================================== */

(function () {
    'use strict';

    // ============================================================
    // 1. CEK KONFIGURASI
    // ============================================================
    if (!window.SUPABASE_CONFIG || !window.supabase) {
        console.warn('[Chat] Supabase config tidak ditemukan. Widget chat tidak aktif.');
        return;
    }

    const { url, anonKey } = window.SUPABASE_CONFIG;
    const sb = window.supabase.createClient(url, anonKey);

    // ============================================================
    // 2. STATE
    // ============================================================
    const STORAGE_KEY = 'zchat_visitor';
    let visitorId = null;
    let visitorName = '';
    let conversationId = null;
    let channel = null;
    let isOpen = false;
    let isReady = false;

    // ============================================================
    // 3. HELPER
    // ============================================================
    function generateVisitorId() {
        return 'v_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    }

    function loadVisitor() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                visitorId = data.id;
                visitorName = data.name || '';
            }
        } catch (e) { /* diabaikan */ }

        if (!visitorId) {
            visitorId = generateVisitorId();
            saveVisitor();
        }
    }

    function saveVisitor() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                id: visitorId,
                name: visitorName
            }));
        } catch (e) { /* diabaikan */ }
    }

    function formatTime(iso) {
        const d = new Date(iso);
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================================
    // 4. BANGUN UI
    // ============================================================
    function buildUI() {
        // Bubble button
        const bubble = document.createElement('button');
        bubble.className = 'zchat-bubble';
        bubble.setAttribute('aria-label', 'Buka live chat');
        bubble.type = 'button';
        bubble.innerHTML = '<i class="bx bx-message-rounded-dots"></i>';
        document.body.appendChild(bubble);

        // Panel
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
                <button class="zchat-close" id="zchat-close" aria-label="Tutup chat" type="button">
                    <i class="bx bx-x"></i>
                </button>
            </div>

            <!-- Form perkenalan -->
            <div class="zchat-intro" id="zchat-intro">
                <p><strong>Halo! 👋</strong>Sebelum mulai, boleh tahu nama kamu?</p>
                <input type="text" class="zchat-input" id="zchat-name-input" placeholder="Nama kamu" maxlength="50" autocomplete="name">
                <button class="zchat-btn" id="zchat-start-btn" disabled type="button">Mulai Chat</button>
            </div>

            <!-- Area pesan -->
            <div class="zchat-messages" id="zchat-messages"></div>

            <!-- Typing indicator -->
            <div class="zchat-typing" id="zchat-typing"></div>

            <!-- Form kirim -->
            <form class="zchat-form" id="zchat-form">
                <input type="text" id="zchat-input" placeholder="Ketik pesan..." maxlength="2000" autocomplete="off">
                <button type="submit" class="zchat-send" id="zchat-send" aria-label="Kirim pesan">
                    <i class="bx bx-send"></i>
                </button>
            </form>
        `;
        document.body.appendChild(panel);

        return { bubble, panel };
    }

    const ui = buildUI();

    // ============================================================
    // 5. BUKA / TUTUP
    // ============================================================
    function openChat() {
        isOpen = true;
        ui.panel.classList.add('is-open');
        ui.bubble.classList.add('is-open');
        ui.bubble.innerHTML = '<i class="bx bx-x"></i>';
        ui.bubble.setAttribute('aria-label', 'Tutup live chat');

        clearUnreadBadge();

        // Reset unread_by_visitor
        if (conversationId) {
            sb.from('conversations')
                .update({ unread_by_visitor: 0 })
                .eq('id', conversationId)
                .then(() => {});
        }

        // Fokus ke input yang sesuai
        setTimeout(() => {
            if (visitorName) {
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

    ui.bubble.addEventListener('click', () => {
        if (isOpen) closeChat();
        else openChat();
    });

    document.getElementById('zchat-close').addEventListener('click', closeChat);

    // ============================================================
    // 6. INISIALISASI PERCAKAPAN
    // ============================================================
    async function initConversation() {
        if (!visitorName) {
            // Belum ada nama → tampilkan form perkenalan
            document.getElementById('zchat-intro').classList.add('is-visible');
            document.getElementById('zchat-messages').classList.remove('is-visible');
            document.getElementById('zchat-form').classList.remove('is-visible');
            return;
        }

        // Sudah ada nama → tampilkan chat
        document.getElementById('zchat-intro').classList.remove('is-visible');
        document.getElementById('zchat-messages').classList.add('is-visible');
        document.getElementById('zchat-form').classList.add('is-visible');

        // Cek percakapan yang sudah ada
        const { data: existing, error: fetchErr } = await sb
            .from('conversations')
            .select('id')
            .eq('visitor_id', visitorId)
            .maybeSingle();

        if (fetchErr) {
            console.error('[Chat] Gagal cek percakapan:', fetchErr);
            return;
        }

        if (existing) {
            conversationId = existing.id;
        } else {
            // Buat percakapan baru
            const { data: created, error: createErr } = await sb
                .from('conversations')
                .insert({
                    visitor_id: visitorId,
                    visitor_name: visitorName,
                    last_message_at: new Date().toISOString()
                })
                .select('id')
                .single();

            if (createErr) {
                console.error('[Chat] Gagal buat percakapan:', createErr);
                return;
            }
            conversationId = created.id;

            // Pesan sambutan otomatis (template, bukan bot)
            await sb.from('messages').insert({
                conversation_id: conversationId,
                sender: 'admin',
                content: `Hai ${visitorName}! 👋 Terima kasih sudah mampir. Ada yang bisa saya bantu?`
            });
        }

        isReady = true;
        await loadMessages();
        subscribeRealtime();
    }

    // ============================================================
    // 7. HANDLE FORM NAMA
    // ============================================================
    const nameInput = document.getElementById('zchat-name-input');
    const startBtn = document.getElementById('zchat-start-btn');

    nameInput.addEventListener('input', () => {
        startBtn.disabled = nameInput.value.trim().length < 2;
    });

    startBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (name.length < 2) return;

        visitorName = name;
        saveVisitor();
        startBtn.textContent = 'Memuat...';
        startBtn.disabled = true;

        await initConversation();
    });

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !startBtn.disabled) {
            e.preventDefault();
            startBtn.click();
        }
    });

    // ============================================================
    // 8. LOAD PESAN
    // ============================================================
    async function loadMessages() {
        if (!conversationId) return;

        const { data, error } = await sb
            .from('messages')
            .select('id, sender, content, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[Chat] Gagal load pesan:', error);
            return;
        }

        const container = document.getElementById('zchat-messages');
        container.innerHTML = '';
        (data || []).forEach(msg => appendMessage(msg, false));
        scrollToBottom();
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

    function scrollToBottom() {
        const container = document.getElementById('zchat-messages');
        container.scrollTop = container.scrollHeight;
    }

    // ============================================================
    // 9. KIRIM PESAN
    // ============================================================
    const form = document.getElementById('zchat-form');
    const input = document.getElementById('zchat-input');
    const sendBtn = document.getElementById('zchat-send');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const text = input.value.trim();
        if (!text || !conversationId) return;

        input.value = '';
        sendBtn.disabled = true;

        const { error } = await sb.from('messages').insert({
            conversation_id: conversationId,
            sender: 'visitor',
            content: text
        });

        if (error) {
            console.error('[Chat] Gagal kirim pesan:', error);
            input.value = text;
        } else {
            // Update last_message_at + increment unread_by_admin
            const { data: conv } = await sb
                .from('conversations')
                .select('unread_by_admin')
                .eq('id', conversationId)
                .single();

            await sb.from('conversations')
                .update({
                    last_message_at: new Date().toISOString(),
                    unread_by_admin: (conv?.unread_by_admin || 0) + 1
                })
                .eq('id', conversationId);
        }

        sendBtn.disabled = false;
        input.focus();
    });

    // ============================================================
    // 10. REALTIME
    // ============================================================
    function subscribeRealtime() {
        if (channel) sb.removeChannel(channel);

        channel = sb.channel('chat_' + conversationId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversationId}`
            }, (payload) => {
                const msg = payload.new;
                appendMessage(msg);
                scrollToBottom();

                // Kalau chat tertutup dan pesan dari admin, tampilkan badge unread
                if (!isOpen && msg.sender === 'admin') {
                    showUnreadBadge();
                }
            })
            .subscribe();
    }

    // ============================================================
    // 11. BADGE UNREAD
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
    // 12. BOOT
    // ============================================================
    loadVisitor();

    if (visitorName) {
        // Sudah pernah chat → siapkan percakapan
        initConversation();
    } else {
        // Pertama kali → tampilkan form perkenalan saat bubble dibuka
        document.getElementById('zchat-intro').classList.add('is-visible');
    }

    // Expose untuk debugging
    window.ZChat = {
        open: openChat,
        close: closeChat,
        reset: () => {
            try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
            location.reload();
        }
    };

})();