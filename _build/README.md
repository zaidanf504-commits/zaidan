# Cara build ulang CSS

Folder ini **bukan bagian dari situs**. Isinya hanya alat untuk membuat
`../css/tailwind.css`. Boleh dihapus kalau tidak dipakai lagi, tapi kalau
dihapus kamu perlu men-download Tailwind lagi untuk build berikutnya.

## Kenapa ada build?

Sebelumnya semua halaman memuat Tailwind dari CDN:

```html
<script src="https://cdn.tailwindcss.com"></script>
```

Cara itu meng-compile CSS di dalam browser setiap kali halaman dibuka. Akibatnya:
ukurannya besar, ada kedipan konten tanpa gaya saat pertama dibuka, dan tampilan
bisa berbeda tergantung kecepatan koneksi.

Sekarang Tailwind di-compile sekali di sini, hasilnya disimpan sebagai
`css/tailwind.css` (sekitar 31 KB), dan halaman cukup memuat berkas itu.

## Kapan perlu build ulang?

Setiap kali kamu menambah atau mengubah **kelas Tailwind** di file HTML atau JS.
Misalnya menambah `mt-12` yang belum pernah dipakai di halaman mana pun.

Kalau yang kamu ubah hanya teks atau warna di `css/animations.css`, tidak perlu
build ulang.

## Cara build ulang

```bash
cd _build
"C:/Users/zaidan/.workbuddy-ai/binaries/node/workspace/node_modules/.bin/tailwindcss.cmd" \
    -c tailwind.config.js -i tailwind.input.css -o ../css/tailwind.css --minify
```

Prosesnya kurang dari satu detik.

## Isi folder

| Berkas | Fungsi |
|---|---|
| `tailwind.config.js` | Daftar warna, animasi, dan keyframe khusus milik situs ini. Juga menentukan berkas mana saja yang dipindai. |
| `tailwind.input.css` | Titik masuk Tailwind (tiga direktif `@tailwind`). |

## Catatan

`tailwind.config.js` memindai `../*.html`, `../projects/*.html`, dan `../js/*.js`.
Kalau kamu menaruh halaman di folder baru, tambahkan foldernya ke daftar
`content` di berkas itu — kalau tidak, kelas Tailwind di halaman tersebut tidak
akan ikut ter-generate.
