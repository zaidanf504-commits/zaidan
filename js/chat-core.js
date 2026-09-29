/* ==========================================================================
   CHAT CORE — Logika chat yang dipakai bersama
   --------------------------------------------------------------------------
   Versi: 2.1
   Perubahan: 
   - Menunggu Supabase client siap sebelum init (fix race condition)
   - Error handling lebih jelas
   - Support kolom visitor_email opsional (fallback kalau kolom tidak ada)
   ========================================================================== */

(function (global) {
    'use strict';

    // ============================================================
    // TUNGGU SUPABASE CLIENT SIAP
    // ============================================================
    // Kadang CDN Supabase lebih lambat dari script kita. Kalau kita
    // langsung cek `global.supabase`, bisa undefined → ChatCore = null.
    // Solusi: retry sampai 5 detik.

    let sb = null;
    let initAttempts = 0;
    const MAX_ATTEMPTS = 50; // 50 x 100ms = 5 detik

        function waitForSupabase() {
        if (global.SUPABASE_CONFIG && global.supabase) {
            try {
                const { url, anonKey } = global.SUPABASE_CONFIG;

                // ============================================================
                // PENTING: Supabase client khusus untuk chat visitor
                // Pakai storageKey terpisah supaya TIDAK share session
                // dengan admin panel.
                // ============================================================
                sb = global.supabase.createClient(url, anonKey, {
                    auth: {
                        storageKey: 'zchat-visitor-auth',
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false
                    }
                });

                console.log('[ChatCore] ✅ Supabase client siap (isolated storage)');
                boot();
            } catch (err) {
                console.error('[ChatCore] ❌ Gagal buat Supabase client:', err);
                global.ChatCore = null;
            }
            return;
        }

        initAttempts++;
        if (initAttempts >= MAX_ATTEMPTS) {
            console.error('[ChatCore] ❌ Timeout menunggu Supabase client. Cek:');
            console.error('   - Apakah <script src="...@supabase/supabase-js@2"> dimuat?');
            console.error('   - Apakah js/supabase-config.js dimuat?');
            global.ChatCore = null;
            return;
        }

        setTimeout(waitForSupabase, 100);
    }

    // ============================================================
    // EVENT EMITTER
    // ============================================================
    const listeners = {};

    function on(event, handler) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
        return () => off(event, handler);
    }

    function off(event, handler) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(h => h !== handler);
    }

    function emit(event, payload) {
        (listeners[event] || []).forEach(handler => {
            try {
                handler(payload);
            } catch (err) {
                console.error('[ChatCore] Listener error on "' + event + '":', err);
            }
        });
    }

    // ============================================================
    // HELPER
    // ============================================================
    function generateVisitorId() {
        return 'v_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    }

    function loadVisitor() {
        try {
            const raw = localStorage.getItem('zchat_visitor');
            if (raw) return JSON.parse(raw);
        } catch (e) { /* diabaikan */ }
        return null;
    }

    function saveVisitor(data) {
        try {
            localStorage.setItem('zchat_visitor', JSON.stringify(data));
        } catch (e) { /* diabaikan */ }
    }

    function resetVisitor() {
        try {
            localStorage.removeItem('zchat_visitor');
        } catch (e) { /* diabaikan */ }
    }

    // ============================================================
    // STATE
    // ============================================================
    let visitorId = null;
    let visitorName = '';
    let visitorEmail = '';
    let conversationId = null;
    let channel = null;
    let ready = false;
    let hasEmailColumn = true; // Asumsi ada, akan di-set false kalau error

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        const saved = loadVisitor();
        if (saved) {
            visitorId = saved.id;
            visitorName = saved.name || '';
            visitorEmail = saved.email || '';
        }
        if (!visitorId) {
            visitorId = generateVisitorId();
            saveVisitor({ id: visitorId, name: '', email: '' });
        }
        return { visitorId, visitorName, visitorEmail };
    }

    function hasIdentity() {
        return !!visitorName;
    }

    function setIdentity(name, email) {
        visitorName = String(name || '').trim();
        visitorEmail = String(email || '').trim();
        saveVisitor({ id: visitorId, name: visitorName, email: visitorEmail });
    }

    // ============================================================
    // CONVERSATION
    // ============================================================
    async function ensureConversation() {
        if (conversationId) return conversationId;
        if (!visitorName) throw new Error('Belum ada nama visitor');

        // Cek apakah sudah ada
        const { data: existing, error: fetchErr } = await sb
            .from('conversations')
            .select('id')
            .eq('visitor_id', visitorId)
            .maybeSingle();

        if (fetchErr) {
            console.error('[ChatCore] Gagal cek conversation:', fetchErr);
            throw fetchErr;
        }

        if (existing) {
            conversationId = existing.id;
            emit('conversation:ready', { id: conversationId });
            return conversationId;
        }

        // Buat baru — coba dengan visitor_email dulu
        let insertData = {
            visitor_id: visitorId,
            visitor_name: visitorName,
            last_message_at: new Date().toISOString()
        };

        if (hasEmailColumn && visitorEmail) {
            insertData.visitor_email = visitorEmail;
        }

        let { data: created, error: createErr } = await sb
            .from('conversations')
            .insert(insertData)
            .select('id')
            .single();

        // Kalau error karena kolom visitor_email tidak ada, retry tanpa email
        if (createErr && createErr.message && createErr.message.includes('visitor_email')) {
            console.warn('[ChatCore] Kolom visitor_email tidak ada, retry tanpa email...');
            hasEmailColumn = false;
            delete insertData.visitor_email;

            const retry = await sb
                .from('conversations')
                .insert(insertData)
                .select('id')
                .single();

            created = retry.data;
            createErr = retry.error;
        }

        if (createErr) {
            console.error('[ChatCore] Gagal buat conversation:', createErr);
            throw createErr;
        }

        conversationId = created.id;

        // Pesan sambutan
        await sb.from('messages').insert({
            conversation_id: conversationId,
            sender: 'admin',
            content: `Hai ${visitorName}! 👋 Terima kasih sudah mampir. Ada yang bisa saya bantu?`
        });

        emit('conversation:ready', { id: conversationId });
        return conversationId;
    }

    // ============================================================
    // MESSAGES
    // ============================================================
    async function loadMessages() {
        if (!conversationId) return [];

        const { data, error } = await sb
            .from('messages')
            .select('id, sender, content, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[ChatCore] Gagal load pesan:', error);
            throw error;
        }

        return data || [];
    }

    async function sendMessage(content) {
        if (!conversationId) throw new Error('Conversation belum siap');
        const text = String(content || '').trim();
        if (!text) return null;

        const { data, error } = await sb
            .from('messages')
            .insert({
                conversation_id: conversationId,
                sender: 'visitor',
                content: text
            })
            .select()
            .single();

        if (error) {
            console.error('[ChatCore] Gagal kirim pesan:', error);
            throw error;
        }

        // Jangan bergantung sepenuhnya pada Realtime untuk menampilkan pesan
        // pengunjung. Realtime dapat belum diaktifkan pada tabel Supabase atau
        // koneksi websocket dapat terlambat, sementara insert-nya sudah sukses.
        // UI juga melakukan deduplikasi berdasarkan id, jadi event dari
        // Realtime yang datang sesudahnya tidak akan membuat pesan ganda.
        emit('message:new', data);

        // Update metadata conversation (tidak critical, jangan throw kalau gagal)
        try {
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
        } catch (err) {
            console.warn('[ChatCore] Gagal update metadata (non-critical):', err);
        }

        return data;
    }

    async function markAsRead() {
        if (!conversationId) return;
        try {
            await sb.from('conversations')
                .update({ unread_by_visitor: 0 })
                .eq('id', conversationId);
        } catch (err) {
            console.warn('[ChatCore] Gagal mark as read:', err);
        }
    }

    // ============================================================
    // REALTIME
    // ============================================================
    function subscribeRealtime() {
        if (!conversationId) return;
        if (channel) {
            sb.removeChannel(channel);
            channel = null;
        }

        channel = sb.channel('visitor_' + conversationId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversationId}`
            }, (payload) => {
                emit('message:new', payload.new);
            })
            .subscribe((status) => {
                console.log('[ChatCore] Realtime status:', status);
                emit('realtime:status', status);
            });
    }

    function unsubscribeRealtime() {
        if (channel) {
            sb.removeChannel(channel);
            channel = null;
        }
    }

    // ============================================================
    // READY STATE
    // ============================================================
    function isReady() {
        return ready && !!conversationId;
    }

    async function setup() {
        if (!visitorName) return false;
        await ensureConversation();
        ready = true;
        emit('ready', { conversationId, visitorName });
        return true;
    }

    // ============================================================
    // BOOT — dipanggil setelah Supabase client siap
    // ============================================================
    function boot() {
        init();

        global.ChatCore = {
            // State
            getVisitorId: () => visitorId,
            getVisitorName: () => visitorName,
            getVisitorEmail: () => visitorEmail,
            getConversationId: () => conversationId,
            hasIdentity,
            isReady,

            // Actions
            init,
            setIdentity,
            resetVisitor,
            setup,
            ensureConversation,
            loadMessages,
            sendMessage,
            markAsRead,
            subscribeRealtime,
            unsubscribeRealtime,

            // Events
            on,
            off
        };

        // Beri tahu script lain kalau ChatCore siap
        emit('core:ready');
        console.log('[ChatCore] ✅ ChatCore siap dipakai');
    }

    // Mulai tunggu Supabase
    waitForSupabase();

})(window);
