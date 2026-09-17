/* ==========================================================================
   ZAIDAN — Mesin Animasi 3D
   --------------------------------------------------------------------------
   Semua efek di bawah ini ditulis dari nol: tidak ada Three.js, tidak ada
   GSAP, tidak ada dependensi apa pun. Matematika 3D-nya dihitung manual
   (rotasi matriks + proyeksi perspektif), jadi situsnya tetap ringan dan
   bisa jalan lewat file:// tanpa internet.

   Prinsip yang dipegang:
   - Tidak ada satu pun efek yang diperlukan untuk membaca isi halaman.
   - Semua dimatikan otomatis kalau pengguna pakai "reduce motion".
   - Semua animasi berhenti saat tab tidak aktif atau elemen di luar layar.
   ========================================================================== */

(function () {
    'use strict';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    /* ----------------------------------------------------------------------
       Membaca warna tinta dari CSS supaya animasi ikut tema terang/gelap
       ---------------------------------------------------------------------- */
    let inkCache = [14, 14, 14];

    function readInk() {
        const raw = getComputedStyle(document.documentElement)
            .getPropertyValue('--fx-ink')
            .trim();
        const parts = raw.split(',').map((n) => parseFloat(n));
        if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
            inkCache = parts;
        }
    }

    /* ======================================================================
       1. KANVAS PARTIKEL 3D DI HERO
       ----------------------------------------------------------------------
       Titik-titik disebar di permukaan bola memakai sebaran Fibonacci
       (supaya jaraknya rata, tidak menumpuk di kutub). Tiap titik dirotasi
       dengan matriks Y lalu X, kemudian diproyeksikan ke layar 2D memakai
       rumus perspektif sederhana: skala = d / (d + z).
       ====================================================================== */
    function initHeroCanvas() {
        const canvas = document.getElementById('fx-hero-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const COUNT = 118;
        const EDGE_LIMIT = 0.46;
        const PERSPECTIVE = 2.7;
        const BUCKETS = 8;

        /* --- Sebaran Fibonacci di permukaan bola --- */
        const pts = [];
        const GOLDEN = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < COUNT; i++) {
            const y = 1 - (i / (COUNT - 1)) * 2;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            const th = GOLDEN * i;
            pts.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r });
        }

        /* --- Daftar garis penghubung ---
           Dihitung SEKALI saja di awal. Jarak antar titik tidak pernah
           berubah saat bola berputar, jadi tidak perlu dihitung ulang tiap
           frame. Ini yang membuat animasinya tetap ringan. */
        const edges = [];
        for (let i = 0; i < COUNT; i++) {
            for (let j = i + 1; j < COUNT; j++) {
                const a = pts[i];
                const b = pts[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dz = a.z - b.z;
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d < EDGE_LIMIT) edges.push([i, j, d]);
            }
        }

        const px = new Float32Array(COUNT);
        const py = new Float32Array(COUNT);
        const pd = new Float32Array(COUNT);

        let W = 0;
        let H = 0;
        let spinY = 0;
        let pointerX = 0;
        let pointerY = 0;
        let smoothX = 0;
        let smoothY = 0;
        let visible = true;
        let raf = null;

        function resize() {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = Math.max(1, Math.round(rect.width));
            H = Math.max(1, Math.round(rect.height));
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function draw() {
            const scrollRatio = clamp(window.scrollY / Math.max(1, window.innerHeight), 0, 1.5);
            spinY += 0.0021;
            smoothX = lerp(smoothX, pointerX, 0.045);
            smoothY = lerp(smoothY, pointerY, 0.045);

            const ry = spinY + smoothX * 1.0;
            const rx = -0.22 + smoothY * 0.55 + scrollRatio * 0.5;

            const cosY = Math.cos(ry);
            const sinY = Math.sin(ry);
            const cosX = Math.cos(rx);
            const sinX = Math.sin(rx);

            const radius = Math.min(W, H) * 0.40;
            const cx = W * 0.5;
            const cy = H * 0.5;

            for (let i = 0; i < COUNT; i++) {
                const p = pts[i];
                const x1 = p.x * cosY - p.z * sinY;
                const z1 = p.x * sinY + p.z * cosY;
                const y2 = p.y * cosX - z1 * sinX;
                const z2 = p.y * sinX + z1 * cosX;

                const s = PERSPECTIVE / (PERSPECTIVE + z2);
                px[i] = cx + x1 * s * radius;
                py[i] = cy + y2 * s * radius;
                pd[i] = clamp((s - 0.72) / 0.86, 0, 1);
            }

            ctx.clearRect(0, 0, W, H);

            /* --- Garis: dikelompokkan jadi 8 tingkat transparansi supaya
                   kita hanya mengganti strokeStyle 8 kali, bukan ~600 kali --- */
            const paths = [];
            for (let b = 0; b < BUCKETS; b++) paths.push(new Path2D());

            for (let e = 0; e < edges.length; e++) {
                const edge = edges[e];
                const i = edge[0];
                const j = edge[1];
                const depth = Math.min(pd[i], pd[j]);
                const alpha = (1 - edge[2] / EDGE_LIMIT) * depth * 0.45;
                if (alpha < 0.015) continue;
                const bucket = Math.min(BUCKETS - 1, Math.floor(alpha * BUCKETS));
                const path = paths[bucket];
                path.moveTo(px[i], py[i]);
                path.lineTo(px[j], py[j]);
            }

            ctx.lineWidth = 1;
            for (let b = 0; b < BUCKETS; b++) {
                const alpha = ((b + 0.5) / BUCKETS) * 0.9;
                ctx.strokeStyle = 'rgba(' + inkCache[0] + ',' + inkCache[1] + ',' + inkCache[2] + ',' + alpha.toFixed(3) + ')';
                ctx.stroke(paths[b]);
            }

            /* --- Titik --- */
            for (let i = 0; i < COUNT; i++) {
                const depth = pd[i];
                ctx.beginPath();
                ctx.arc(px[i], py[i], 0.7 + depth * 1.9, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(' + inkCache[0] + ',' + inkCache[1] + ',' + inkCache[2] + ',' + (0.18 + depth * 0.6).toFixed(3) + ')';
                ctx.fill();
            }
        }

        function frame() {
            raf = requestAnimationFrame(frame);
            if (!visible || document.hidden) return;
            draw();
        }

        function start() {
            if (raf !== null) return;
            if (reduceMotion.matches) {
                resize();
                draw();
                canvas.classList.add('is-ready');
                return;
            }
            raf = requestAnimationFrame(frame);
        }

        function stop() {
            if (raf !== null) {
                cancelAnimationFrame(raf);
                raf = null;
            }
        }

        readInk();
        resize();
        canvas.classList.add('is-ready');

        if (reduceMotion.matches) {
            draw();
        } else {
            start();
        }

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                visible = entries[0].isIntersecting;
            }, { threshold: 0 }).observe(canvas);
        }

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) stop();
            else start();
        });

        let resizeTimer = null;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                resize();
                if (reduceMotion.matches) draw();
            }, 150);
        });

        if (finePointer.matches) {
            window.addEventListener('pointermove', function (e) {
                pointerX = (e.clientX / window.innerWidth) * 2 - 1;
                pointerY = (e.clientY / window.innerHeight) * 2 - 1;
            }, { passive: true });
        }

        window.addEventListener('scroll', function () {
            if (reduceMotion.matches) draw();
        }, { passive: true });
    }

    /* ======================================================================
       2. TILT 3D — mengikuti kursor dengan beberapa lapisan kedalaman
       ====================================================================== */
    function setupTilt(root) {
        const inner = root.querySelector('.fx-tilt__inner');
        if (!inner) return;

        const maxAngle = parseFloat(root.getAttribute('data-fx-tilt')) || 11;
        const shadow = root.querySelector('.fx-tilt__shadow');

        /* Lapisan diberi kedalaman sekali saja di awal */
        root.querySelectorAll('[data-fx-depth]').forEach(function (layer) {
            const depth = parseFloat(layer.getAttribute('data-fx-depth')) || 0;
            layer.style.transform = 'translateZ(' + depth + 'px)';
        });

        let targetRX = 0;
        let targetRY = 0;
        let curRX = 0;
        let curRY = 0;
        let raf = null;

        function settle() {
            curRX = lerp(curRX, targetRX, 0.12);
            curRY = lerp(curRY, targetRY, 0.12);

            inner.style.transform = 'rotateX(' + curRX.toFixed(3) + 'deg) rotateY(' + curRY.toFixed(3) + 'deg)';

            if (shadow) {
                shadow.style.transform = 'translate(' + (-curRY * 0.9).toFixed(2) + 'px, ' + (curRX * 0.5).toFixed(2) + 'px)';
            }

            if (Math.abs(curRX - targetRX) > 0.02 || Math.abs(curRY - targetRY) > 0.02) {
                raf = requestAnimationFrame(settle);
            } else {
                raf = null;
            }
        }

        function kick() {
            if (raf === null) raf = requestAnimationFrame(settle);
        }

        root.addEventListener('pointermove', function (e) {
            const rect = root.getBoundingClientRect();
            const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
            const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);

            targetRY = (nx - 0.5) * 2 * maxAngle;
            targetRX = -(ny - 0.5) * 2 * maxAngle;

            root.style.setProperty('--fx-gx', (nx * 100).toFixed(1) + '%');
            root.style.setProperty('--fx-gy', (ny * 100).toFixed(1) + '%');
            kick();
        });

        root.addEventListener('pointerenter', function () {
            root.classList.add('is-live');
        });

        root.addEventListener('pointerleave', function () {
            root.classList.remove('is-live');
            targetRX = 0;
            targetRY = 0;
            kick();
        });
    }

    function initTilt() {
        const nodes = document.querySelectorAll('[data-fx-tilt]');
        if (!nodes.length) return;

        if (!finePointer.matches || reduceMotion.matches) {
            /* Tanpa kursor presisi, lapisan tetap diberi kedalaman statis
               supaya tampilannya masih terasa bertingkat. */
            nodes.forEach(function (root) {
                root.querySelectorAll('[data-fx-depth]').forEach(function (layer) {
                    const depth = parseFloat(layer.getAttribute('data-fx-depth')) || 0;
                    layer.style.transform = 'translateZ(' + depth + 'px)';
                });
            });
            return;
        }

        nodes.forEach(setupTilt);
    }

    /* ======================================================================
       3. KUBUS KEAHLIAN 3D — berputar sendiri, bisa diputar dengan kursor
       ====================================================================== */
    function initCube() {
        const scene = document.querySelector('[data-fx-cube]');
        if (!scene) return;

        const cube = scene.querySelector('.fx-cube');
        if (!cube) return;

        let ry = -32;
        let rx = -16;
        let velocity = 0;
        let dragging = false;
        let hovering = false;
        let lastX = 0;
        let lastY = 0;
        let visible = true;
        let raf = null;

        const BASE_TILT = -16;
        const AUTO_SPEED = 0.24;

        function apply() {
            cube.style.setProperty('--fx-cube-ry', ry.toFixed(2) + 'deg');
            cube.style.setProperty('--fx-cube-rx', rx.toFixed(2) + 'deg');
        }

        function tick() {
            raf = requestAnimationFrame(tick);
            if (!visible || document.hidden) return;

            if (!dragging) {
                velocity *= 0.93;
                if (Math.abs(velocity) < 0.001) velocity = 0;
                ry += velocity;

                if (!hovering && !reduceMotion.matches) ry += AUTO_SPEED;

                /* Kemiringan kembali ke posisi semula dengan lembut */
                rx = lerp(rx, BASE_TILT, 0.03);
            }

            apply();
        }

        scene.addEventListener('pointerdown', function (e) {
            if (reduceMotion.matches) return;
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            velocity = 0;
            scene.classList.add('is-dragging');
            if (scene.setPointerCapture) {
                try { scene.setPointerCapture(e.pointerId); } catch (err) { /* diabaikan */ }
            }
        });

        scene.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;

            ry += dx * 0.55;
            rx = clamp(rx - dy * 0.42, -75, 75);
            velocity = dx * 0.55;
            apply();
        });

        function endDrag() {
            if (!dragging) return;
            dragging = false;
            scene.classList.remove('is-dragging');
        }

        scene.addEventListener('pointerup', endDrag);
        scene.addEventListener('pointercancel', endDrag);

        scene.addEventListener('pointerenter', function () { hovering = true; });
        scene.addEventListener('pointerleave', function () {
            hovering = false;
            endDrag();
        });

        apply();
        raf = requestAnimationFrame(tick);

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                visible = entries[0].isIntersecting;
            }, { threshold: 0 }).observe(scene);
        }

        document.addEventListener('visibilitychange', function () {
            if (document.hidden && raf !== null) {
                cancelAnimationFrame(raf);
                raf = null;
            } else if (raf === null) {
                raf = requestAnimationFrame(tick);
            }
        });
    }

    /* ======================================================================
       4. KARTU PROYEK 3D — tilt + chip yang naik ke depan
       ====================================================================== */
    function initCardTilt() {
        if (!finePointer.matches || reduceMotion.matches) return;

        document.querySelectorAll('[data-fx-card]').forEach(function (card) {
            const maxAngle = parseFloat(card.getAttribute('data-fx-card')) || 7;
            const image = card.querySelector('.fx-card-img');
            const chips = card.querySelectorAll('.fx-chip');
            let raf = null;
            let targetRX = 0;
            let targetRY = 0;
            let curRX = 0;
            let curRY = 0;

            function settle() {
                curRX = lerp(curRX, targetRX, 0.13);
                curRY = lerp(curRY, targetRY, 0.13);

                card.style.transform = 'perspective(1100px) rotateX(' + curRX.toFixed(3) + 'deg) rotateY(' + curRY.toFixed(3) + 'deg) translateY(-8px)';

                if (image) {
                    image.style.transform = 'scale(1.08) translateZ(30px)';
                    image.style.filter = 'grayscale(0)';
                }

                chips.forEach(function (chip, i) {
                    chip.style.transform = 'translateZ(' + (18 + i * 8) + 'px)';
                });

                if (Math.abs(curRX - targetRX) > 0.02 || Math.abs(curRY - targetRY) > 0.02) {
                    raf = requestAnimationFrame(settle);
                } else {
                    raf = null;
                }
            }

            card.addEventListener('pointermove', function (e) {
                const rect = card.getBoundingClientRect();
                const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
                targetRY = (nx - 0.5) * 2 * maxAngle;
                targetRX = -(ny - 0.5) * 2 * maxAngle;
                if (raf === null) raf = requestAnimationFrame(settle);
            });

            card.addEventListener('pointerleave', function () {
                targetRX = 0;
                targetRY = 0;
                if (image) {
                    image.style.transform = '';
                    image.style.filter = '';
                }
                chips.forEach(function (chip) { chip.style.transform = ''; });
                if (raf === null) raf = requestAnimationFrame(settle);
            });
        });
    }

    /* ======================================================================
       5. KURSOR MAGNETIK
       ====================================================================== */
    function initCursor() {
        if (!finePointer.matches || reduceMotion.matches) return;

        const ring = document.createElement('div');
        ring.className = 'fx-cursor';
        const dot = document.createElement('div');
        dot.className = 'fx-cursor-dot';
        document.body.appendChild(ring);
        document.body.appendChild(dot);

        const SELECTOR = 'a, button, [data-fx-cursor]';
        let mx = -200;
        let my = -200;
        let rx = -200;
        let ry = -200;

        window.addEventListener('pointermove', function (e) {
            mx = e.clientX;
            my = e.clientY;
            ring.classList.add('is-visible');
            dot.classList.add('is-visible');
        }, { passive: true });

        document.addEventListener('pointerleave', function () {
            ring.classList.remove('is-visible');
            dot.classList.remove('is-visible');
        });

        document.addEventListener('pointerover', function (e) {
            if (e.target instanceof Element && e.target.closest(SELECTOR)) {
                ring.classList.add('is-hover');
            }
        });

        document.addEventListener('pointerout', function (e) {
            if (e.target instanceof Element && e.target.closest(SELECTOR)) {
                ring.classList.remove('is-hover');
            }
        });

        (function loop() {
            rx = lerp(rx, mx, 0.17);
            ry = lerp(ry, my, 0.17);
            ring.style.transform = 'translate(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px)';
            dot.style.transform = 'translate(' + mx.toFixed(2) + 'px,' + my.toFixed(2) + 'px)';
            requestAnimationFrame(loop);
        })();
    }

    /* ======================================================================
       6. TOMBOL MAGNETIK
       ====================================================================== */
    function initMagnetic() {
        if (!finePointer.matches || reduceMotion.matches) return;

        document.querySelectorAll('.fx-magnetic').forEach(function (el) {
            el.addEventListener('pointermove', function (e) {
                const rect = el.getBoundingClientRect();
                const dx = e.clientX - (rect.left + rect.width / 2);
                const dy = e.clientY - (rect.top + rect.height / 2);
                el.classList.add('is-live');
                el.style.transform = 'translate(' + (dx * 0.2).toFixed(2) + 'px,' + (dy * 0.26).toFixed(2) + 'px)';
            });

            el.addEventListener('pointerleave', function () {
                el.classList.remove('is-live');
                el.style.transform = '';
            });
        });
    }

    /* ======================================================================
       7. TEKS PECAH HURUF — masuk berputar 3D
       ----------------------------------------------------------------------
       Hanya memecah simpul teks. Elemen anak (misalnya <span> ber-outline)
       tetap utuh, dan spasi dibiarkan sebagai teks biasa supaya baris masih
       bisa turun dengan normal.
       ====================================================================== */
    function initSplit() {
        const targets = document.querySelectorAll('[data-fx-split]');
        if (!targets.length) return;

        targets.forEach(function (el) {
            if (reduceMotion.matches) {
                el.classList.add('is-in');
                return;
            }

            let index = 0;

            function walk(node) {
                Array.prototype.slice.call(node.childNodes).forEach(function (child) {
                    if (child.nodeType === 3) {
                        const text = child.textContent;
                        if (!text.trim()) return;

                        const frag = document.createDocumentFragment();
                        for (let i = 0; i < text.length; i++) {
                            const ch = text.charAt(i);
                            if (ch === ' ') {
                                frag.appendChild(document.createTextNode(' '));
                                continue;
                            }
                            const span = document.createElement('span');
                            span.className = 'fx-char';
                            span.style.setProperty('--fx-i', index++);
                            span.textContent = ch;
                            frag.appendChild(span);
                        }
                        node.replaceChild(frag, child);
                    } else if (child.nodeType === 1) {
                        walk(child);
                    }
                });
            }

            walk(el);
            el.classList.add('fx-split');
        });

        if (!('IntersectionObserver' in window)) {
            targets.forEach(function (el) { el.classList.add('is-in'); });
            return;
        }

        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-in');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.2 });

        targets.forEach(function (el) { observer.observe(el); });
    }

    /* ======================================================================
       8. BAR PROGRES GULIR
       ====================================================================== */
    function initProgress() {
        const bar = document.querySelector('.fx-progress__bar');
        if (!bar) return;

        let queued = false;

        function update() {
            queued = false;
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const ratio = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
            bar.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
        }

        window.addEventListener('scroll', function () {
            if (!queued) {
                queued = true;
                requestAnimationFrame(update);
            }
        }, { passive: true });

        window.addEventListener('resize', update);
        update();
    }

    /* ======================================================================
       9. PARALLAX — hiasan latar bergerak lebih lambat dari halaman
       ====================================================================== */
    function initParallax() {
        const nodes = document.querySelectorAll('[data-fx-parallax]');
        if (!nodes.length || reduceMotion.matches) return;

        let queued = false;

        function update() {
            queued = false;
            const vh = window.innerHeight;

            nodes.forEach(function (el) {
                const rect = el.getBoundingClientRect();
                if (rect.bottom < -200 || rect.top > vh + 200) return;
                const speed = parseFloat(el.getAttribute('data-fx-parallax')) || 0.12;
                const center = rect.top + rect.height / 2;
                const offset = (center - vh / 2) * speed;
                el.style.transform = 'translate3d(0,' + offset.toFixed(1) + 'px,0)';
            });
        }

        window.addEventListener('scroll', function () {
            if (!queued) {
                queued = true;
                requestAnimationFrame(update);
            }
        }, { passive: true });

        window.addEventListener('resize', update);
        update();
    }

    /* ======================================================================
       10. TRANSISI MASUK HALAMAN
       ----------------------------------------------------------------------
       Dijalankan setelah preloader selesai. Melengkapi animasi keluar yang
       sudah ada, supaya perpindahan halaman terasa simetris.
       ====================================================================== */
    function playEntrance() {
        if (reduceMotion.matches) return;

        const overlay = document.createElement('div');
        overlay.className = 'fx-transition';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = '<span class="fx-transition__label"></span>';

        const label = overlay.querySelector('.fx-transition__label');
        const text = document.body.getAttribute('data-page-label') || 'ZAIDAN.';
        label.textContent = text;

        overlay.style.clipPath = 'circle(150% at 50% 50%)';
        overlay.style.transition = 'clip-path 0.9s cubic-bezier(0.77, 0, 0.175, 1)';
        document.body.appendChild(overlay);

        requestAnimationFrame(function () {
            overlay.classList.add('is-in');
            requestAnimationFrame(function () {
                overlay.style.clipPath = 'circle(0% at 50% 50%)';
            });
        });

        setTimeout(function () {
            overlay.remove();
        }, 1500);
    }

    /* ======================================================================
       BOOT
       ====================================================================== */
    function boot() {
        readInk();
        initHeroCanvas();
        initTilt();
        initCube();
        initCardTilt();
        initCursor();
        initMagnetic();
        initSplit();
        initProgress();
        initParallax();

        /* Warna kanvas ikut berubah saat tema diganti */
        if ('MutationObserver' in window) {
            new MutationObserver(function () {
                readInk();
            }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        }
    }

    window.ZaidanFX = { playEntrance: playEntrance, readInk: readInk, reduceMotion: reduceMotion };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
