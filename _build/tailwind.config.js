/** Konfigurasi build Tailwind untuk portofolio Zaidan.
 *
 *  Ini menggantikan <script src="https://cdn.tailwindcss.com"> yang dipakai
 *  sebelumnya. Bedanya:
 *  - CDN meng-compile CSS di browser setiap kali halaman dibuka (lambat,
 *    ada kedipan konten tanpa gaya, dan ukurannya ~400 KB JavaScript).
 *  - File ini menghasilkan satu berkas CSS statis yang sudah jadi.
 *
 *  Cara build ulang setelah menambah class Tailwind baru:
 *      cd _build
 *      C:/Users/zaidan/.workbuddy-ai/binaries/node/workspace/node_modules/.bin/tailwindcss.cmd \
 *          -c tailwind.config.js -i tailwind.input.css -o ../css/tailwind.css --minify
 */

module.exports = {
    darkMode: 'class',
    content: [
        '../*.html',
        '../projects/*.html',
        '../js/*.js'
    ],
    theme: {
        extend: {
            fontFamily: {
                main: ['Inter', 'sans-serif']
            },
            colors: {
                bgdark: '#0e0e0e',
                carddark: '#161616',
                borderdark: '#262626',
                textmuted: '#a3a3a3',
                darkbg: '#0a0a0a',
                darkcard: '#141414'
            },
            animation: {
                marquee: 'marquee 25s linear infinite',
                marquee2: 'marquee2 25s linear infinite',
                'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                float: 'float 4s ease-in-out infinite'
            },
            keyframes: {
                marquee: {
                    '0%': { transform: 'translateX(0%)' },
                    '100%': { transform: 'translateX(-100%)' }
                },
                marquee2: {
                    '0%': { transform: 'translateX(100%)' },
                    '100%': { transform: 'translateX(0%)' }
                },
                /* Keyframe ini sebelumnya dipakai lewat animate-[float_...]
                   di index.html, tapi tidak pernah didefinisikan. Akibatnya
                   lencana "Estetika + Logika" diam saja. */
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-12px)' }
                }
            }
        }
    },
    plugins: []
};
