/* ==========================================================================
   ADMIN PANEL v2 — LIVE CHAT
   --------------------------------------------------------------------------
   Fitur baru:
   - Preview pesan terakhir di sidebar
   - Filter: Semua / Belum dibaca / Hari ini
   - Counter unread di header
   - Date divider di history chat
   - Quick replies (template balasan cepat)
   - Emoji picker
   - Auto-grow textarea
   - Enter untuk kirim, Shift+Enter untuk baris baru
   - Copy pesan dengan hover
   - Toast notification
   - Sound & vibration notif
   - Title tab update dengan jumlah unread
   - Toggle sound on/off
   ========================================================================== */

(function () {
    'use strict';

    // ============================================================
    // 1. CEK KONFIGURASI
    // ============================================================
    if (!window.SUPABASE_CONFIG || !window.supabase) {
        console.error('[Admin] Supabase config tidak ditemukan.');
        document.body.innerHTML = '<div style="padding:40px;font-family:system-ui"><h1>Error</h1><p>Konfigurasi Supabase tidak ditemukan.</p></div>';
        return;
    }

       const { url, anonKey } = window.SUPABASE_CONFIG;

    // ============================================================
    // Admin pakai storageKey terpisah — supaya session admin TIDAK
    // bocor ke chat visitor, dan sebaliknya.
    // ============================================================
    const sb = window.supabase.createClient(url, anonKey, {
        auth: {
            storageKey: 'zadmin-auth',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
        }
    });

    // ============================================================
    // 2. STATE
    // ============================================================
    let currentConv = null;
    let conversations = [];
    let messagesByConv = {}; // { convId: [lastMessage] }
    let allMessagesChannel = null;
    let currentMessagesChannel = null;
    let currentFilter = 'all';
    let soundEnabled = true;
    let baseTitle = document.title;

    // ============================================================
    // 3. DOM REFS
    // ============================================================
    const $ = (id) => document.getElementById(id);

    const loginScreen = $('loginScreen');
    const adminApp = $('adminApp');
    const loginForm = $('loginForm');
    const loginError = $('loginError');
    const loginBtn = $('loginBtn');
    const logoutBtn = $('logoutBtn');
    const soundToggle = $('soundToggle');
    const convList = $('convList');
    const emptyState = $('emptyState');
    const chatView = $('chatView');
    const adminMessages = $('adminMessages');
    const adminForm = $('adminForm');
    const adminInput = $('adminInput');
    const adminSend = $('adminSend');
    const searchConv = $('searchConv');
    const backBtn = $('backBtn');
    const deleteConvBtn = $('deleteConvBtn');
    const onlineStatus = $('onlineStatus');
    const emojiBtn = $('emojiBtn');
    const emojiPicker = $('emojiPicker');
    const toast = $('toast');
    const toastText = $('toastText');

    // ============================================================
    // 4. HELPER
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

    function formatRelative(iso) {
        const diff = Date.now() - new Date(iso).getTime();
        const min = Math.floor(diff / 60000);
        if (min < 1) return 'baru saja';
        if (min < 60) return min + ' mnt';
        const hr = Math.floor(min / 60);
        if (hr < 24) return hr + ' jam';
        const day = Math.floor(hr / 24);
        if (day < 7) return day + ' hr';
        return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
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
            month: 'long',
            year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
    }

    function isToday(iso) {
        const d = new Date(iso);
        const today = new Date();
        return d.getFullYear() === today.getFullYear() &&
               d.getMonth() === today.getMonth() &&
               d.getDate() === today.getDate();
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
    // 5. LOGIN
    // ============================================================
    async function checkSession() {
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            showAdmin();
        } else {
            showLogin();
        }
    }

    function showLogin() {
        loginScreen.style.display = 'flex';
        adminApp.style.display = 'none';
    }

    function showAdmin() {
        loginScreen.style.display = 'none';
        adminApp.style.display = 'grid';
        updateOnlineStatus(true);
        loadConversations();
        subscribeAllMessages();
        updateTitle(0);
    }

    function updateOnlineStatus(online) {
        if (!onlineStatus) return;
        onlineStatus.textContent = online ? '🟢 Online' : '🔴 Offline';
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.classList.remove('is-visible');

        const email = $('loginEmail').value.trim();
        const password = $('loginPassword').value;

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="bx bx-loader-circle bx-spin"></i> Memproses...';

        const { error } = await sb.auth.signInWithPassword({ email, password });

        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="bx bx-log-in"></i> Masuk';

        if (error) {
            loginError.textContent = 'Login gagal: ' + error.message;
            loginError.classList.add('is-visible');
            return;
        }

        showAdmin();
    });

    logoutBtn.addEventListener('click', async () => {
        if (!confirm('Yakin mau logout?')) return;
        await sb.auth.signOut();
        location.reload();
    });

    // ============================================================
    // 6. SOUND TOGGLE
    // ============================================================
    try {
        const saved = localStorage.getItem('zchat_sound');
        if (saved === 'off') {
            soundEnabled = false;
            soundToggle.querySelector('i').className = 'bx bx-volume-mute';
        }
    } catch (e) { /* diabaikan */ }

    soundToggle.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        soundToggle.querySelector('i').className = soundEnabled ? 'bx bx-volume-full' : 'bx bx-volume-mute';
        try {
            localStorage.setItem('zchat_sound', soundEnabled ? 'on' : 'off');
        } catch (e) { /* diabaikan */ }
        showToast(soundEnabled ? 'Suara aktif' : 'Suara dimatikan',
            soundEnabled ? 'bx-volume-full' : 'bx-volume-mute');
    });

    // ============================================================
    // 7. LOAD CONVERSATIONS
    // ============================================================
    async function loadConversations() {
        const { data, error } = await sb
            .from('conversations')
            .select('*')
            .order('last_message_at', { ascending: false });

        if (error) {
            console.error('[Admin] Gagal load percakapan:', error);
            convList.innerHTML = '<div class="conv-empty"><i class="bx bx-error-circle"></i>Gagal memuat percakapan.<br><small>Cek console untuk detail.</small></div>';
            return;
        }

        conversations = data || [];

        // Load last message untuk setiap percakapan (untuk preview)
        await loadLastMessages();

        renderConversations();
        updateCounters();
    }

    async function loadLastMessages() {
        messagesByConv = {};
        if (conversations.length === 0) return;

        // Ambil semua pesan terbaru dengan 1 query
        const convIds = conversations.map(c => c.id);

        const { data, error } = await sb
            .from('messages')
            .select('conversation_id, content, sender, created_at')
            .in('conversation_id', convIds)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Admin] Gagal load last messages:', error);
            return;
        }

        // Simpan pesan pertama (paling baru) untuk setiap conversation
        (data || []).forEach(msg => {
            if (!messagesByConv[msg.conversation_id]) {
                messagesByConv[msg.conversation_id] = msg;
            }
        });
    }

    // ============================================================
    // 8. FILTER & RENDER
    // ============================================================
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('is-active'));
            tab.classList.add('is-active');
            currentFilter = tab.dataset.filter;
            renderConversations();
        });
    });

    function applyFilter(convs) {
        let result = convs;

        if (currentFilter === 'unread') {
            result = result.filter(c => (c.unread_by_admin || 0) > 0);
        } else if (currentFilter === 'today') {
            result = result.filter(c => isToday(c.last_message_at));
        }

        const query = searchConv.value.trim().toLowerCase();
        if (query) {
            result = result.filter(c =>
                (c.visitor_name || '').toLowerCase().includes(query) ||
                (c.visitor_id || '').toLowerCase().includes(query)
            );
        }

        return result;
    }

    function renderConversations() {
        const filtered = applyFilter(conversations);

        convList.innerHTML = '';

        if (filtered.length === 0) {
            const msg = currentFilter === 'unread' ? 'Tidak ada pesan belum dibaca.' :
                        currentFilter === 'today' ? 'Belum ada chat hari ini.' :
                        searchConv.value ? 'Tidak ada hasil.' :
                        'Belum ada percakapan.<br><small>Buka web kamu di tab lain dan kirim pesan untuk test.</small>';
            convList.innerHTML = `<div class="conv-empty"><i class="bx bx-message-square-dots"></i>${msg}</div>`;
            return;
        }

        filtered.forEach(conv => {
            const el = document.createElement('div');
            el.className = 'conv-item';
            el.dataset.id = conv.id;

            const isActive = currentConv && currentConv.id === conv.id;
            const unread = conv.unread_by_admin || 0;

            if (isActive) el.classList.add('is-active');
            if (unread > 0) el.classList.add('is-unread');

            const initial = (conv.visitor_name || '?').charAt(0).toUpperCase();
            const lastMsg = messagesByConv[conv.id];
            let preview = 'Belum ada pesan';
            if (lastMsg) {
                const prefix = lastMsg.sender === 'admin' ? 'Anda: ' : '';
                preview = prefix + lastMsg.content;
            }

            el.innerHTML = `
                <div class="conv-avatar">${escapeHtml(initial)}</div>
                <div class="conv-body">
                    <div class="conv-top">
                        <span class="conv-name">${escapeHtml(conv.visitor_name || 'Anonim')}</span>
                        <span class="conv-time">${formatRelative(conv.last_message_at)}</span>
                    </div>
                    <div class="conv-preview">
                        <span class="conv-preview-text ${unread > 0 ? 'is-unread-text' : ''}">${escapeHtml(preview)}</span>
                        ${unread > 0 ? `<span class="unread-pill">${unread}</span>` : ''}
                    </div>
                </div>
            `;

            el.addEventListener('click', () => openConversation(conv));
            convList.appendChild(el);
        });
    }

    function updateCounters() {
        const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_by_admin || 0), 0);
        const unreadConvCount = conversations.filter(c => (c.unread_by_admin || 0) > 0).length;

        $('countAll').textContent = conversations.length;
        $('countUnread').textContent = unreadConvCount;
        $('countUnread').style.display = unreadConvCount > 0 ? '' : 'none';

        updateTitle(totalUnread);
    }

    function updateTitle(unreadCount) {
        document.title = unreadCount > 0
            ? `(${unreadCount}) ${baseTitle}`
            : baseTitle;
    }

    searchConv.addEventListener('input', renderConversations);

    // ============================================================
    // 9. OPEN CONVERSATION
    // ============================================================
    async function openConversation(conv) {
        currentConv = conv;

        // UI
        emptyState.style.display = 'none';
        chatView.style.display = 'flex';

        if (window.innerWidth <= 900) {
            document.querySelector('.admin-sidebar').classList.remove('is-visible');
            document.querySelector('.admin-main').classList.add('is-visible');
        }

        $('chatName').textContent = conv.visitor_name || 'Anonim';
        $('chatMeta').textContent = `Visitor ID: ${conv.visitor_id.substring(0, 18)}...`;
        $('chatAvatar').textContent = (conv.visitor_name || '?').charAt(0).toUpperCase();

        // Reset unread
        if (conv.unread_by_admin > 0) {
            await sb.from('conversations').update({ unread_by_admin: 0 }).eq('id', conv.id);
            const c = conversations.find(x => x.id === conv.id);
            if (c) c.unread_by_admin = 0;
            renderConversations();
            updateCounters();
        }

        // Highlight sidebar
        document.querySelectorAll('.conv-item').forEach(el => {
            el.classList.toggle('is-active', el.dataset.id === conv.id);
        });

        await loadMessages(conv.id);
        subscribeCurrentMessages(conv.id);

        setTimeout(() => adminInput.focus(), 100);
    }

    // ============================================================
    // 10. LOAD MESSAGES
    // ============================================================
    async function loadMessages(convId) {
        const { data, error } = await sb
            .from('messages')
            .select('*')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[Admin] Gagal load pesan:', error);
            return;
        }

        adminMessages.innerHTML = '';

        let lastDate = null;
        (data || []).forEach(msg => {
            const msgDate = new Date(msg.created_at).toDateString();
            if (msgDate !== lastDate) {
                appendDateDivider(msg.created_at);
                lastDate = msgDate;
            }
            appendMessage(msg, false);
        });

        scrollToBottom();
    }

    function appendDateDivider(iso) {
        const div = document.createElement('div');
        div.className = 'date-divider';
        div.textContent = formatDateDivider(iso);
        adminMessages.appendChild(div);
    }

    function appendMessage(msg, animate = true) {
        if (document.querySelector(`#adminMessages [data-id="${msg.id}"]`)) return;

        const isAdmin = msg.sender === 'admin';
        const row = document.createElement('div');
        row.className = 'msg-row ' + (isAdmin ? 'is-admin' : 'is-visitor');
        row.dataset.id = msg.id;
        if (!animate) row.style.animation = 'none';

        const initial = isAdmin ? 'Z' : (currentConv?.visitor_name || '?').charAt(0).toUpperCase();

        row.innerHTML = `
            <div class="msg-avatar">${escapeHtml(initial)}</div>
            <div class="msg-bubble">
                ${escapeHtml(msg.content)}
                <span class="msg-time">${formatTime(msg.created_at)}</span>
                <button class="msg-copy-btn" type="button" data-copy="${escapeHtml(msg.content)}">
                    <i class='bx bx-copy'></i> Salin
                </button>
            </div>
        `;

        // Copy handler
        row.querySelector('.msg-copy-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const text = e.currentTarget.dataset.copy;
            navigator.clipboard.writeText(text).then(() => {
                showToast('Pesan disalin', 'bx-copy');
            });
        });

        adminMessages.appendChild(row);
    }

    function scrollToBottom() {
        // Hanya scroll kalau user sudah di dekat bawah
        const nearBottom = adminMessages.scrollHeight - adminMessages.scrollTop - adminMessages.clientHeight < 150;
        if (nearBottom || arguments[0] === true) {
            adminMessages.scrollTop = adminMessages.scrollHeight;
        }
    }

    // ============================================================
    // 11. AUTO-GROW TEXTAREA + ENTER TO SEND
    // ============================================================
    function autoGrow() {
        adminInput.style.height = 'auto';
        adminInput.style.height = Math.min(adminInput.scrollHeight, 140) + 'px';
        adminSend.disabled = !adminInput.value.trim();
    }

    adminInput.addEventListener('input', autoGrow);

    adminInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (adminInput.value.trim()) {
                adminForm.dispatchEvent(new Event('submit'));
            }
        }
    });

    // ============================================================
    // 12. QUICK REPLIES
    // ============================================================
    document.querySelectorAll('.quick-reply').forEach(btn => {
        btn.addEventListener('click', () => {
            const text = btn.dataset.text;
            adminInput.value = text;
            autoGrow();
            adminInput.focus();
        });
    });

    // ============================================================
    // 13. EMOJI PICKER
    // ============================================================
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle('is-open');
    });

    document.querySelectorAll('.emoji-option').forEach(btn => {
        btn.addEventListener('click', () => {
            adminInput.value += btn.textContent;
            autoGrow();
            adminInput.focus();
            emojiPicker.classList.remove('is-open');
        });
    });

    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn && !emojiBtn.contains(e.target)) {
            emojiPicker.classList.remove('is-open');
        }
    });

    // ============================================================
    // 14. SEND MESSAGE
    // ============================================================
    adminForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentConv) return;

        const text = adminInput.value.trim();
        if (!text) return;

        adminInput.value = '';
        autoGrow();
        adminSend.disabled = true;

        const { error } = await sb.from('messages').insert({
            conversation_id: currentConv.id,
            sender: 'admin',
            content: text
        });

        if (error) {
            console.error('[Admin] Gagal kirim:', error);
            adminInput.value = text;
            autoGrow();
            showToast('Gagal mengirim pesan', 'bx-error-circle');
        } else {
            await sb.from('conversations').update({
                last_message_at: new Date().toISOString(),
                unread_by_visitor: (currentConv.unread_by_visitor || 0) + 1
            }).eq('id', currentConv.id);
        }

        adminSend.disabled = false;
        adminInput.focus();
    });

    // ============================================================
    // 15. REALTIME: ALL MESSAGES (update sidebar + counters)
    // ============================================================
    function subscribeAllMessages() {
        if (allMessagesChannel) sb.removeChannel(allMessagesChannel);

        allMessagesChannel = sb.channel('admin_all_messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                const msg = payload.new;
                const conv = conversations.find(c => c.id === msg.conversation_id);

                if (conv) {
                    conv.last_message_at = msg.created_at;

                    // Update preview
                    messagesByConv[conv.id] = {
                        conversation_id: msg.conversation_id,
                        content: msg.content,
                        sender: msg.sender,
                        created_at: msg.created_at
                    };

                    if (msg.sender === 'visitor' && (!currentConv || currentConv.id !== conv.id)) {
                        conv.unread_by_admin = (conv.unread_by_admin || 0) + 1;
                    }

                    // Sort ulang
                    conversations.sort((a, b) =>
                        new Date(b.last_message_at) - new Date(a.last_message_at)
                    );

                    renderConversations();
                    updateCounters();
                } else {
                    loadConversations();
                }

                // Notif kalau dari visitor
                if (msg.sender === 'visitor') {
                    playNotif();
                    if (document.hidden) {
                        vibrate();
                    }
                }
            })
            .subscribe();
    }

    // ============================================================
    // 16. REALTIME: CURRENT CONVERSATION
    // ============================================================
    function subscribeCurrentMessages(convId) {
        if (currentMessagesChannel) sb.removeChannel(currentMessagesChannel);

        currentMessagesChannel = sb.channel('admin_conv_' + convId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${convId}`
            }, (payload) => {
                const msg = payload.new;

                // Cek kalau butuh date divider
                const lastDivider = adminMessages.querySelector('.date-divider:last-of-type');
                const msgDateStr = new Date(msg.created_at).toDateString();

                if (!lastDivider || lastDivider.textContent !== formatDateDivider(msg.created_at)) {
                    const lastMsgEl = adminMessages.querySelector('.msg-row:last-of-type');
                    if (lastMsgEl) {
                        const lastMsgDate = new Date(
                            parseInt(lastMsgEl.dataset.id) || Date.now()
                        ).toDateString();
                        // Skip - cukup append divider kalau beda hari
                    }
                }

                appendMessage(msg, true);
                scrollToBottom();
            })
            .subscribe();
    }

    // ============================================================
    // 17. SOUND & VIBRATION
    // ============================================================
    let audioCtx = null;

    function playNotif() {
        if (!soundEnabled) return;
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            const now = audioCtx.currentTime;

            // Dua nada: "ting-ting"
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
        } catch (e) { /* diabaikan */ }
    }

    function vibrate() {
        try {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        } catch (e) { /* diabaikan */ }
    }

    // ============================================================
    // 18. DELETE CONVERSATION
    // ============================================================
    deleteConvBtn.addEventListener('click', async () => {
        if (!currentConv) return;
        if (!confirm(`Hapus percakapan dengan "${currentConv.visitor_name}"? Tidak bisa dibatalkan.`)) return;

        const { error } = await sb.from('conversations').delete().eq('id', currentConv.id);

        if (error) {
            showToast('Gagal menghapus: ' + error.message, 'bx-error-circle');
            return;
        }

        // Hapus dari state
        conversations = conversations.filter(c => c.id !== currentConv.id);
        delete messagesByConv[currentConv.id];

        currentConv = null;
        chatView.style.display = 'none';
        emptyState.style.display = 'flex';
        document.querySelector('.admin-sidebar').classList.add('is-visible');
        document.querySelector('.admin-main').classList.remove('is-visible');

        renderConversations();
        updateCounters();
        showToast('Percakapan dihapus', 'bx-trash');
    });

    // ============================================================
    // 19. MOBILE BACK
    // ============================================================
    backBtn.addEventListener('click', () => {
        chatView.style.display = 'none';
        document.querySelector('.admin-sidebar').classList.add('is-visible');
        document.querySelector('.admin-main').classList.remove('is-visible');
        emptyState.style.display = 'flex';
    });

    // ============================================================
    // 20. RE-CHECK SESSION
    // ============================================================
    sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            location.reload();
        }
    });

    // ============================================================
    // BOOT
    // ============================================================
    checkSession();
    autoGrow();

})();
