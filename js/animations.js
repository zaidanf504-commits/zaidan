/* ==========================================================================
   ZAIDAN — Mesin Animasi 3D & Interaksi Mikro (Versi Terpadu)
   --------------------------------------------------------------------------
   Ditulis murni dengan Vanilla JavaScript tanpa dependensi eksternal.
   Dilengkapi:
   - Bola Fibonacci 3D dengan efek napas (breathing) & riak klik (pulse)
   - Kursor magnetik dengan dukungan label kontekstual (data-fx-cursor-label)
   - Ambient spotlight yang mengikuti pointer
   - Kubus 3D dengan inersia geser & rotasi klik otomatis
   - Smart Session Preloader agar navigasi balik tidak mengulang loading
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
       1. KANVAS 3D CYBERNETIC POLYHEDRON & ORBITAL CONSTELLATION
       ----------------------------------------------------------------------
       Engine 3D Vanilla WebGL/Canvas tanpa dependensi eksternal.
       - Core Polyhedron Geodesik 3D dengan depth sorting & glowing nodes
       - Cincin orbit ganda (dual orbital rings) berputar 3D di bidang miring
       - Inersia kursor (mouse torque + lerp damping) & gaya magnetik
       - Riak kejut 3D elastis saat klik (shockwave impulse)
       - Kamera 3D yang bertransformasi dinamis saat halaman digulir
       ====================================================================== */
    function initHeroCanvas() {
        const canvas = document.getElementById('fx-hero-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const PERSPECTIVE = 3.2;

        /* Geometri Inti: Geodesic Polyhedron Lattice */
        const corePts = [];
        const CORE_COUNT = 52;
        const PHI = (1 + Math.sqrt(5)) / 2;

        for (let i = 0; i < CORE_COUNT; i++) {
            const y = 1 - (i / (CORE_COUNT - 1)) * 2;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = i * PHI * Math.PI * 2;
            corePts.push({
                x: Math.cos(theta) * r,
                y: y,
                z: Math.sin(theta) * r,
                type: 'core'
            });
        }

        /* Tepi koneksi core (lattice chords) */
        const coreEdges = [];
        const CORE_EDGE_DIST = 0.58;
        for (let i = 0; i < CORE_COUNT; i++) {
            for (let j = i + 1; j < CORE_COUNT; j++) {
                const a = corePts[i];
                const b = corePts[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dz = a.z - b.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < CORE_EDGE_DIST) {
                    coreEdges.push([i, j, dist]);
                }
            }
        }

        /* Cincin Orbital 1: Bidang khatulistiwa miring (Equatorial Inclined Ring) */
        const RING1_COUNT = 24;
        const ring1Pts = [];
        const RING1_RADIUS = 1.38;
        for (let i = 0; i < RING1_COUNT; i++) {
            const th = (i / RING1_COUNT) * Math.PI * 2;
            const rx = Math.cos(th) * RING1_RADIUS;
            const rz = Math.sin(th) * RING1_RADIUS;
            /* Miringkan 28 derajat */
            const tilt = 0.48;
            ring1Pts.push({
                x: rx,
                y: rz * Math.sin(tilt),
                z: rz * Math.cos(tilt),
                baseAngle: th,
                type: 'ring1'
            });
        }

        /* Cincin Orbital 2: Bidang kutub miring berlawanan (Polar Cross Ring) */
        const RING2_COUNT = 20;
        const ring2Pts = [];
        const RING2_RADIUS = 1.62;
        for (let i = 0; i < RING2_COUNT; i++) {
            const th = (i / RING2_COUNT) * Math.PI * 2;
            const ry = Math.cos(th) * RING2_RADIUS;
            const rz = Math.sin(th) * RING2_RADIUS;
            const tilt = -0.55;
            ring2Pts.push({
                x: rz * Math.sin(tilt),
                y: ry,
                z: rz * Math.cos(tilt),
                baseAngle: th,
                type: 'ring2'
            });
        }

        /* Partikel Mengambang di Ruang 3D (Ambient Starfield) */
        const STAR_COUNT = 36;
        const stars = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            const radius = 1.2 + Math.random() * 0.9;
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI;
            stars.push({
                x: Math.cos(theta) * Math.cos(phi) * radius,
                y: Math.sin(phi) * radius,
                z: Math.sin(theta) * Math.cos(phi) * radius,
                speed: 0.003 + Math.random() * 0.004,
                phase: Math.random() * Math.PI * 2,
                size: 0.6 + Math.random() * 1.2,
                type: 'star'
            });
        }

        let W = 0;
        let H = 0;
        let rotY = 0;
        let rotX = -0.2;
        let ring1Spin = 0;
        let ring2Spin = 0;
        let breathPhase = 0;
        let clickShock = 0;
        let shockVel = 0;

        let mouseX = 0;
        let mouseY = 0;
        let targetRotX = -0.15;
        let targetRotY = 0;
        let curRotX = -0.15;
        let curRotY = 0;

        let screenPointerX = -9999;
        let screenPointerY = -9999;

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

        function project3D(x, y, z, cx, cy, radius, cosY, sinY, cosX, sinX) {
            /* Rotasi Y */
            const x1 = x * cosY - z * sinY;
            const z1 = x * sinY + z * cosY;
            /* Rotasi X */
            const y2 = y * cosX - z1 * sinX;
            const z2 = y * sinX + z1 * cosX;

            const scale = PERSPECTIVE / (PERSPECTIVE + z2);
            return {
                px: cx + x1 * scale * radius,
                py: cy + y2 * scale * radius,
                depth: clamp((scale - 0.65) / 0.85, 0, 1),
                rawZ: z2,
                scale: scale
            };
        }

        function draw() {
            const scrollRatio = clamp(window.scrollY / Math.max(1, window.innerHeight), 0, 1.4);

            /* Fisika Shockwave Elastis */
            if (clickShock > 0.001 || Math.abs(shockVel) > 0.001) {
                const spring = (0 - clickShock) * 0.14;
                shockVel = (shockVel + spring) * 0.82;
                clickShock += shockVel;
            } else {
                clickShock = 0;
                shockVel = 0;
            }

            breathPhase += 0.016;
            ring1Spin += 0.0045;
            ring2Spin -= 0.0035;
            rotY += 0.0028;

            /* Lerp rotasi kursor yang halus dengan inersia */
            curRotX = lerp(curRotX, targetRotX + scrollRatio * 0.85, 0.05);
            curRotY = lerp(curRotY, targetRotY, 0.05);

            const totalRotY = rotY + curRotY;
            const totalRotX = curRotX;

            const cosY = Math.cos(totalRotY);
            const sinY = Math.sin(totalRotY);
            const cosX = Math.cos(totalRotX);
            const sinX = Math.sin(totalRotX);

            /* Efek nafas berdenyut + gelombang sentak klik */
            const breath = 1 + Math.sin(breathPhase) * 0.035 + clickShock * 0.28;
            /* Skala mengecil anggun saat scroll menjauh dari hero */
            const scrollScale = 1 - scrollRatio * 0.22;
            const baseRadius = Math.min(W, H) * 0.38 * breath * scrollScale;

            /* Pusatkan 3D canvas di area seimbang */
            const cx = W > 1024 ? W * 0.54 : W * 0.5;
            const cy = H * 0.48;

            ctx.clearRect(0, 0, W, H);

            const isDark = document.documentElement.classList.contains('dark');
            const ink = inkCache;

            /* 1. Gambar Inti Polyhedron (Geodesic Wireframe) */
            const projCore = new Array(CORE_COUNT);
            for (let i = 0; i < CORE_COUNT; i++) {
                const p = corePts[i];
                projCore[i] = project3D(p.x, p.y, p.z, cx, cy, baseRadius, cosY, sinY, cosX, sinX);
            }

            /* Garis-garis penghubung core */
            for (let e = 0; e < coreEdges.length; e++) {
                const edge = coreEdges[e];
                const p1 = projCore[edge[0]];
                const p2 = projCore[edge[1]];

                const avgDepth = (p1.depth + p2.depth) * 0.5;
                if (avgDepth < 0.05) continue;

                const alpha = (1 - edge[2] / CORE_EDGE_DIST) * avgDepth * (isDark ? 0.38 : 0.26);
                if (alpha < 0.015) continue;

                ctx.beginPath();
                ctx.moveTo(p1.px, p1.py);
                ctx.lineTo(p2.px, p2.py);
                ctx.strokeStyle = 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + alpha.toFixed(3) + ')';
                ctx.lineWidth = avgDepth > 0.6 ? 1.2 : 0.75;
                ctx.stroke();
            }

            /* 2. Gambar Cincin Orbital 1 (Equatorial Inclined Orbit) */
            const projRing1 = new Array(RING1_COUNT);
            ctx.beginPath();
            for (let i = 0; i < RING1_COUNT; i++) {
                const p = ring1Pts[i];
                const dynamicAngle = p.baseAngle + ring1Spin;
                const rx = Math.cos(dynamicAngle) * RING1_RADIUS;
                const rz = Math.sin(dynamicAngle) * RING1_RADIUS;
                const tilt = 0.48;
                const curY = rz * Math.sin(tilt);
                const curZ = rz * Math.cos(tilt);

                projRing1[i] = project3D(rx, curY, curZ, cx, cy, baseRadius, cosY, sinY, cosX, sinX);
            }

            for (let i = 0; i < RING1_COUNT; i++) {
                const next = (i + 1) % RING1_COUNT;
                const p1 = projRing1[i];
                const p2 = projRing1[next];
                const avgDepth = (p1.depth + p2.depth) * 0.5;

                ctx.beginPath();
                ctx.moveTo(p1.px, p1.py);
                ctx.lineTo(p2.px, p2.py);
                const ringAlpha = (0.12 + avgDepth * 0.28) * (isDark ? 0.65 : 0.45);
                ctx.strokeStyle = 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + ringAlpha.toFixed(3) + ')';
                ctx.lineWidth = avgDepth > 0.5 ? 1 : 0.6;
                ctx.stroke();
            }

            /* 3. Gambar Cincin Orbital 2 (Polar Inclined Orbit) */
            const projRing2 = new Array(RING2_COUNT);
            for (let i = 0; i < RING2_COUNT; i++) {
                const p = ring2Pts[i];
                const dynamicAngle = p.baseAngle + ring2Spin;
                const ry = Math.cos(dynamicAngle) * RING2_RADIUS;
                const rz = Math.sin(dynamicAngle) * RING2_RADIUS;
                const tilt = -0.55;
                const curX = rz * Math.sin(tilt);
                const curZ = rz * Math.cos(tilt);

                projRing2[i] = project3D(curX, ry, curZ, cx, cy, baseRadius, cosY, sinY, cosX, sinX);
            }

            for (let i = 0; i < RING2_COUNT; i++) {
                const next = (i + 1) % RING2_COUNT;
                const p1 = projRing2[i];
                const p2 = projRing2[next];
                const avgDepth = (p1.depth + p2.depth) * 0.5;

                ctx.beginPath();
                ctx.moveTo(p1.px, p1.py);
                ctx.lineTo(p2.px, p2.py);
                const ringAlpha = (0.08 + avgDepth * 0.22) * (isDark ? 0.55 : 0.38);
                ctx.strokeStyle = 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + ringAlpha.toFixed(3) + ')';
                ctx.lineWidth = 0.7;
                ctx.stroke();
            }

            /* 4. Titik Node Core Polyhedron dengan Halo & Efek Magnetik */
            for (let i = 0; i < CORE_COUNT; i++) {
                const p = projCore[i];
                const depth = p.depth;

                /* Deteksi kedekatan kursor (magnetik halus) */
                const distToMouse = Math.hypot(p.px - screenPointerX, p.py - screenPointerY);
                const isNear = distToMouse < 110;
                const nodeSize = (0.8 + depth * 2.2) * (isNear ? 1.6 : 1);
                const nodeAlpha = clamp(0.2 + depth * 0.75 + (isNear ? 0.25 : 0), 0, 1);

                /* Soft ambient glow halo untuk foreground nodes */
                if (depth > 0.65) {
                    const glowRadius = nodeSize * 3.5;
                    const glow = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, glowRadius);
                    glow.addColorStop(0, 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + (nodeAlpha * 0.28).toFixed(3) + ')');
                    glow.addColorStop(1, 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ', 0)');
                    ctx.beginPath();
                    ctx.arc(p.px, p.py, glowRadius, 0, Math.PI * 2);
                    ctx.fillStyle = glow;
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(p.px, p.py, nodeSize, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + nodeAlpha.toFixed(3) + ')';
                ctx.fill();
            }

            /* 5. Partikel Bintang Mengambang (Floating Cosmic Stars) */
            for (let i = 0; i < STAR_COUNT; i++) {
                const s = stars[i];
                s.phase += s.speed;
                const oscX = s.x + Math.sin(s.phase) * 0.12;
                const oscY = s.y + Math.cos(s.phase * 0.8) * 0.12;
                const proj = project3D(oscX, oscY, s.z, cx, cy, baseRadius, cosY, sinY, cosX, sinX);

                if (proj.depth < 0.1) continue;
                const starAlpha = (0.15 + proj.depth * 0.55) * (isDark ? 0.85 : 0.55);

                ctx.beginPath();
                ctx.arc(proj.px, proj.py, s.size * proj.depth, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + starAlpha.toFixed(3) + ')';
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
            }, 120);
        });

        if (finePointer.matches) {
            window.addEventListener('pointermove', function (e) {
                screenPointerX = e.clientX;
                screenPointerY = e.clientY;
                mouseX = (e.clientX / window.innerWidth) * 2 - 1;
                mouseY = (e.clientY / window.innerHeight) * 2 - 1;

                targetRotY = mouseX * 0.95;
                targetRotX = -0.18 + mouseY * 0.45;
            }, { passive: true });

            window.addEventListener('pointerleave', function () {
                screenPointerX = -9999;
                screenPointerY = -9999;
                targetRotY = 0;
                targetRotX = -0.18;
            });

            window.addEventListener('pointerdown', function () {
                if (visible && !reduceMotion.matches) {
                    shockVel = 0.55;
                }
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
       3. KUBUS KEAHLIAN 3D — kontrol putar interaktif, drag & telemetri
       ====================================================================== */
    function initCube() {
        const scene = document.querySelector('[data-fx-cube]');
        if (!scene) return;

        const cube = scene.querySelector('.fx-cube');
        if (!cube) return;

        const coordsEl = document.getElementById('fx-cube-coords');
        const faceButtons = document.querySelectorAll('[data-fx-face]');

        let ry = -32;
        let rx = -16;
        let targetRx = null;
        let targetRy = null;
        let velocity = 0;
        let dragging = false;
        let hovering = false;
        let lastX = 0;
        let lastY = 0;
        let downX = 0;
        let downY = 0;
        let visible = true;
        let raf = null;

        const BASE_TILT = -16;
        const AUTO_SPEED = 0.22;

        /* Target rotasi tiap sisi */
        const FACE_TARGETS = {
            front: { rx: -10, ry: 0 },
            right: { rx: -10, ry: -90 },
            back:  { rx: -10, ry: -180 },
            left:  { rx: -10, ry: 90 },
            top:   { rx: -85, ry: 0 }
        };

        function apply() {
            cube.style.setProperty('--fx-cube-ry', ry.toFixed(2) + 'deg');
            cube.style.setProperty('--fx-cube-rx', rx.toFixed(2) + 'deg');

            if (coordsEl) {
                let normRy = Math.round(ry % 360);
                if (normRy > 180) normRy -= 360;
                else if (normRy < -180) normRy += 360;
                coordsEl.textContent = 'ROTASI 3D: ' + Math.round(rx) + '° X / ' + normRy + '° Y';
            }
        }

        function tick() {
            raf = requestAnimationFrame(tick);
            if (!visible || document.hidden) return;

            if (targetRx !== null && targetRy !== null && !dragging) {
                /* Snapping ke target sisi dengan lerp lembut */
                rx = lerp(rx, targetRx, 0.08);
                ry = lerp(ry, targetRy, 0.08);

                if (Math.abs(rx - targetRx) < 0.2 && Math.abs(ry - targetRy) < 0.2) {
                    rx = targetRx;
                    ry = targetRy;
                    targetRx = null;
                    targetRy = null;
                }
            } else if (!dragging) {
                velocity *= 0.93;
                if (Math.abs(velocity) < 0.001) velocity = 0;
                ry += velocity;

                if (!hovering && !reduceMotion.matches) ry += AUTO_SPEED;
                rx = lerp(rx, BASE_TILT, 0.035);
            }

            apply();
        }

        /* Tangani tombol pemilih sisi kubus */
        faceButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const face = btn.getAttribute('data-fx-face');
                if (FACE_TARGETS[face]) {
                    /* Hitung putaran terdekat untuk ry */
                    const target = FACE_TARGETS[face];
                    targetRx = target.rx;

                    const curRot = ry % 360;
                    let diff = target.ry - curRot;
                    while (diff < -180) diff += 360;
                    while (diff > 180) diff -= 360;
                    targetRy = ry + diff;

                    velocity = 0;

                    faceButtons.forEach(b => {
                        b.classList.remove('active', 'bg-black', 'text-white', 'dark:bg-white', 'dark:text-black');
                        b.classList.add('bg-transparent', 'text-gray-600', 'dark:text-textmuted');
                    });
                    btn.classList.add('active', 'bg-black', 'text-white', 'dark:bg-white', 'dark:text-black');
                    btn.classList.remove('bg-transparent', 'text-gray-600', 'dark:text-textmuted');
                }
            });
        });

        scene.addEventListener('pointerdown', function (e) {
            if (reduceMotion.matches) return;
            dragging = true;
            targetRx = null;
            targetRy = null;
            lastX = downX = e.clientX;
            lastY = downY = e.clientY;
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

        function endDrag(e) {
            if (!dragging) return;
            dragging = false;
            scene.classList.remove('is-dragging');

            /* Jika pengguna hanya mengklik (bukan menggeser), beri dorongan putaran */
            if (e && Math.hypot(e.clientX - downX, e.clientY - downY) < 6) {
                velocity = 6.5;
            }
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
       4. KARTU PROYEK 3D — untuk halaman arsip proyek ([data-fx-card])
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
       5. KURSOR MAGNETIK, LABEL KONTEKSTUAL & AMBIENT SPOTLIGHT
       ====================================================================== */
    function initCursor() {
        if (!finePointer.matches || reduceMotion.matches) return;

        const spotlight = document.createElement('div');
        spotlight.className = 'fx-spotlight';
        spotlight.setAttribute('aria-hidden', 'true');

        const ring = document.createElement('div');
        ring.className = 'fx-cursor';
        ring.setAttribute('aria-hidden', 'true');

        const labelSpan = document.createElement('span');
        labelSpan.className = 'fx-cursor__label';
        ring.appendChild(labelSpan);

        const dot = document.createElement('div');
        dot.className = 'fx-cursor-dot';
        dot.setAttribute('aria-hidden', 'true');

        document.body.appendChild(spotlight);
        document.body.appendChild(ring);
        document.body.appendChild(dot);

        const SELECTOR = 'a, button, [data-fx-cursor], [data-fx-cursor-label]';
        let mx = -200;
        let my = -200;
        let rx = -200;
        let ry = -200;
        let sx = window.innerWidth / 2;
        let sy = window.innerHeight / 2;

        window.addEventListener('pointermove', function (e) {
            mx = e.clientX;
            my = e.clientY;
            ring.classList.add('is-visible');
            dot.classList.add('is-visible');
            spotlight.classList.add('is-visible');
        }, { passive: true });

        document.addEventListener('pointerleave', function () {
            ring.classList.remove('is-visible');
            dot.classList.remove('is-visible');
            spotlight.classList.remove('is-visible');
        });

        document.addEventListener('pointerover', function (e) {
            if (!(e.target instanceof Element)) return;
            const labeled = e.target.closest('[data-fx-cursor-label]');
            if (labeled) {
                labelSpan.textContent = labeled.getAttribute('data-fx-cursor-label') || '';
                ring.classList.add('has-label');
                ring.classList.remove('is-hover');
                return;
            }
            if (e.target.closest(SELECTOR)) {
                ring.classList.add('is-hover');
            }
        });

        document.addEventListener('pointerout', function (e) {
            if (!(e.target instanceof Element)) return;
            const labeled = e.target.closest('[data-fx-cursor-label]');
            if (labeled) {
                ring.classList.remove('has-label');
                labelSpan.textContent = '';
            }
            if (e.target.closest(SELECTOR)) {
                ring.classList.remove('is-hover');
            }
        });

        (function loop() {
            rx = lerp(rx, mx, 0.18);
            ry = lerp(ry, my, 0.18);
            sx = lerp(sx, mx, 0.09);
            sy = lerp(sy, my, 0.09);

            ring.style.transform = 'translate3d(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px,0)';
            dot.style.transform = 'translate3d(' + mx.toFixed(2) + 'px,' + my.toFixed(2) + 'px,0)';
            spotlight.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0)';
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
                el.style.transform = 'translate3d(' + (dx * 0.2).toFixed(2) + 'px,' + (dy * 0.26).toFixed(2) + 'px,0)';
            });

            el.addEventListener('pointerleave', function () {
                el.classList.remove('is-live');
                el.style.transform = '';
            });
        });
    }

    /* ======================================================================
       7. TEKS PECAH HURUF — masuk berputar 3D
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
        const nodesX = document.querySelectorAll('[data-fx-parallax-x]');
        if ((!nodes.length && !nodesX.length) || reduceMotion.matches) return;

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

            nodesX.forEach(function (el) {
                const rect = el.getBoundingClientRect();
                if (rect.bottom < -100 || rect.top > vh + 100) return;
                const speed = parseFloat(el.getAttribute('data-fx-parallax-x')) || 0.15;
                const progress = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
                const offset = (progress - 0.5) * 40 * speed;
                el.style.transform = 'translate3d(' + offset.toFixed(1) + 'px,0,0)';
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
       10. TRANSISI MASUK HALAMAN & SMART SESSION PRELOADER
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

        /* Tandai bahwa preloader sudah pernah tampil di sesi ini */
        window.addEventListener('load', function () {
            try {
                sessionStorage.setItem('zaidan_preloader_shown', '1');
            } catch (e) { /* diabaikan */ }
        });

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
