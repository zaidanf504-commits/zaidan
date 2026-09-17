/* ==========================================================================
   ZAIDAN — Perilaku dasar situs
   --------------------------------------------------------------------------
   Isi berkas ini: preloader, menu, tema, reveal saat menggulir, tombol salin
   email, dan transisi antar halaman.

   Catatan penting: penentuan tema TIDAK lagi dilakukan di sini. Logikanya
   sudah dipindah ke <script> kecil di dalam <head> setiap halaman, supaya
   tema sudah benar sebelum halaman digambar dan tidak ada kedipan gelap
   bagi pengguna mode terang.

   Semua efek visual 3D ada di js/animations.js.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    /* ======================================================================
       1. PRELOADER
       ====================================================================== */
    const preloader = document.getElementById('preloader');
    let hasVisited = false;

    try {
        hasVisited = sessionStorage.getItem('visited') === 'true';
    } catch (err) {
        hasVisited = true; /* Penyimpanan diblokir: lewati preloader. */
    }

    const loaderCounter = document.getElementById('loader-counter');
    const loaderBar = document.getElementById('loader-bar');
    const loaderText = document.getElementById('loader-text');

    function finishLoad() {
        if (loaderText) loaderText.classList.remove('loader-caret');
        initReveal();
    }

    if (preloader && !hasVisited) {
        try {
            sessionStorage.setItem('visited', 'true');
        } catch (err) { /* diabaikan */ }

        if (loaderText) loaderText.classList.add('loader-caret');

        let progress = 0;

        const loadingInterval = setInterval(() => {
            progress += Math.floor(Math.random() * 4) + 1;
            if (progress >= 100) progress = 100;

            if (loaderCounter) loaderCounter.textContent = progress + '%';
            if (loaderBar) loaderBar.style.width = progress + '%';
            if (loaderText) loaderText.style.width = progress + '%';

            if (progress === 100) {
                clearInterval(loadingInterval);

                setTimeout(() => {
                    preloader.classList.add('preloader-hidden');

                    setTimeout(() => {
                        preloader.style.display = 'none';
                        finishLoad();
                    }, 900);
                }, 450);
            }
        }, 25);

    } else {
        /* Kunjungan ulang dalam sesi yang sama: lewati preloader dan langsung
           mainkan animasi masuk supaya perpindahan halaman tetap terasa. */
        if (preloader) preloader.style.display = 'none';
        initReveal();
        if (window.ZaidanFX) window.ZaidanFX.playEntrance();
    }


    /* ======================================================================
       2. TOMBOL GANTI TEMA
       ----------------------------------------------------------------------
       Kelas "dark" di <html> sudah disiapkan oleh skrip di <head>. Di sini
       kita hanya menangani klik dan menyimpan pilihan pengguna.
       ====================================================================== */
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeToggleMobileBtn = document.getElementById('theme-toggle-mobile');
    const htmlElement = document.documentElement;

    function toggleTheme() {
        htmlElement.classList.toggle('dark');

        const isDark = htmlElement.classList.contains('dark');

        try {
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        } catch (err) { /* diabaikan */ }

        /* Beri tahu pembaca layar apa yang baru saja terjadi */
        [themeToggleBtn, themeToggleMobileBtn].forEach((btn) => {
            if (btn) btn.setAttribute('aria-pressed', String(isDark));
        });
    }

    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    if (themeToggleMobileBtn) themeToggleMobileBtn.addEventListener('click', toggleTheme);


    /* ======================================================================
       3. NAVBAR SAAT DIGULIR
       ====================================================================== */
    const navbar = document.getElementById('navbar');
    let navQueued = false;

    function updateNav() {
        navQueued = false;
        if (!navbar) return;

        if (window.scrollY > 50) {
            navbar.classList.add('py-2', 'shadow-sm');
            navbar.classList.remove('py-4');
        } else {
            navbar.classList.add('py-4');
            navbar.classList.remove('py-2', 'shadow-sm');
        }
    }

    window.addEventListener('scroll', () => {
        if (!navQueued) {
            navQueued = true;
            requestAnimationFrame(updateNav);
        }
    }, { passive: true });

    updateNav();


    /* ======================================================================
       4. MENU MOBILE
       ====================================================================== */
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobile-menu');
    const closeMenu = document.getElementById('close-menu');
    const mobileLinks = document.querySelectorAll('.mobile-link');

    function setMenu(open) {
        if (!mobileMenu) return;

        mobileMenu.classList.toggle('translate-y-full', !open);
        document.body.classList.toggle('overflow-hidden', open);

        if (hamburger) hamburger.setAttribute('aria-expanded', String(open));
        mobileMenu.setAttribute('aria-hidden', String(!open));

        if (open && closeMenu) {
            closeMenu.focus();
        } else if (!open && hamburger) {
            hamburger.focus();
        }
    }

    if (hamburger) hamburger.addEventListener('click', () => setMenu(true));
    if (closeMenu) closeMenu.addEventListener('click', () => setMenu(false));
    mobileLinks.forEach((link) => link.addEventListener('click', () => setMenu(false)));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileMenu && !mobileMenu.classList.contains('translate-y-full')) {
            setMenu(false);
        }
    });


    /* ======================================================================
       5. REVEAL SAAT MENGGULIR
       ----------------------------------------------------------------------
       Menangani dua jenis: .reveal (naik biasa) dan .reveal-3d (masuk sambil
       berputar dari kedalaman).
       ====================================================================== */
    function initReveal() {
        const reveals = document.querySelectorAll('.reveal, .reveal-3d');

        if (!('IntersectionObserver' in window)) {
            reveals.forEach((el) => el.classList.add('active'));
            return;
        }

        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        });

        reveals.forEach((el) => revealObserver.observe(el));
    }


    /* ======================================================================
       6. TOMBOL KEMBALI KE ATAS
       ====================================================================== */
    const backToTopBtn = document.getElementById('backToTop');

    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        let topQueued = false;

        window.addEventListener('scroll', () => {
            if (topQueued) return;
            topQueued = true;

            requestAnimationFrame(() => {
                topQueued = false;

                if (window.scrollY > 500) {
                    backToTopBtn.classList.remove('opacity-0', 'translate-y-10', 'pointer-events-none');
                    backToTopBtn.classList.add('opacity-100', 'translate-y-0');
                } else {
                    backToTopBtn.classList.add('opacity-0', 'translate-y-10', 'pointer-events-none');
                    backToTopBtn.classList.remove('opacity-100', 'translate-y-0');
                }
            });
        }, { passive: true });
    }


    /* ======================================================================
       7. SALIN ALAMAT EMAIL
       ====================================================================== */
    const copyEmailBtn = document.getElementById('copyEmailBtn');

    if (copyEmailBtn) {
        copyEmailBtn.addEventListener('click', async () => {
            const email = 'zaidanf504@gmail.com';
            const originalHTML = copyEmailBtn.innerHTML;

            try {
                await navigator.clipboard.writeText(email);
                copyEmailBtn.innerHTML = '<span class="flex items-center gap-2 text-emerald-500 font-bold"><i class=\'bx bx-check\'></i> Disalin!</span>';

                setTimeout(() => {
                    copyEmailBtn.innerHTML = originalHTML;
                }, 2000);
            } catch (err) {
                /* clipboard API butuh konteks aman (https atau localhost).
                   Saat dibuka lewat file://, jatuh ke cara lama. */
                const temp = document.createElement('textarea');
                temp.value = email;
                temp.setAttribute('readonly', '');
                temp.style.position = 'fixed';
                temp.style.left = '-9999px';
                document.body.appendChild(temp);
                temp.select();

                let ok = false;
                try {
                    ok = document.execCommand('copy');
                } catch (e2) {
                    ok = false;
                }

                temp.remove();

                copyEmailBtn.innerHTML = ok
                    ? '<span class="flex items-center gap-2 text-emerald-500 font-bold"><i class=\'bx bx-check\'></i> Disalin!</span>'
                    : '<span class="flex items-center gap-2 text-red-500 font-bold">Gagal menyalin, salin manual ya</span>';

                setTimeout(() => {
                    copyEmailBtn.innerHTML = originalHTML;
                }, 2400);
            }
        });
    }


    /* ======================================================================
       8. TAHUN DI FOOTER
       ====================================================================== */
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();


    /* ======================================================================
       9. TRANSISI KELUAR HALAMAN
       ----------------------------------------------------------------------
       Lingkaran mengecil di tengah lalu mengembang menutupi layar. Animasi
       masuknya ditangani ZaidanFX.playEntrance() di halaman berikutnya.
       ====================================================================== */
    const links = document.querySelectorAll('a[href]');
    const SKIP = ['_blank', '_external'];

    links.forEach((link) => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            const target = link.getAttribute('target');

            if (!href || SKIP.includes(target) || href.startsWith('http') ||
                href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                return;
            }

            /* Hormati klik dengan tombol pengubah (buka tab baru, unduh, dll) */
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

            if (window.ZaidanFX && window.ZaidanFX.reduceMotion.matches) return;

            const currentPath = window.location.pathname.split('/').pop() || 'index.html';
            const linkPath = href.split('/').pop();

            if (href === currentPath || linkPath === currentPath) return;

            e.preventDefault();

            let label = 'ZAIDAN.';
            if (href.includes('projects')) label = 'PROYEK.';
            if (href.includes('about')) label = 'PROFIL.';
            if (href.includes('ecommerce')) label = 'KASUS.';

            const overlay = document.createElement('div');
            overlay.className = 'fx-transition';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.innerHTML = '<span class="fx-transition__label"></span>';
            overlay.querySelector('.fx-transition__label').textContent = label;

            overlay.style.clipPath = 'circle(0% at 50% 50%)';
            overlay.style.transition = 'clip-path 0.85s cubic-bezier(0.77, 0, 0.175, 1)';

            document.body.appendChild(overlay);

            void overlay.offsetWidth;

            requestAnimationFrame(() => {
                overlay.classList.add('is-in');
                overlay.style.clipPath = 'circle(150% at 50% 50%)';
            });

            setTimeout(() => {
                window.location.href = href;
            }, 880);
        });
    });

    /* Tombol "kembali" browser bisa memulihkan halaman dari cache dalam
       keadaan setengah tertutup. Bersihkan sisa overlay-nya. */
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            document.querySelectorAll('.fx-transition').forEach((el) => el.remove());
            document.body.classList.remove('overflow-hidden');
        }
    });

});
