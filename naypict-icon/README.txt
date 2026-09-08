# NayPict - Website Icon & Favicon Pack

Paket ikon lengkap untuk website album NayPict (Tema Gelap / Dark Theme).

## Isi Berkas:
1. `naypict-icon.svg` : Format Vector SVG transparan (Resolusi bebas, sangat ringan < 1 KB, terbaik untuk modern browser).
2. `naypict-icon-dark-bg.svg` : Format Vector SVG dengan latar belakang gelap (#121212).
3. `favicon.ico` : Format standar Windows/Browser lama (berisi multi-resolusi 16x16, 32x32, 48x48).
4. `naypict-icon-512x512.png` : Resolusi tinggi transparan (Apple Touch Icon / PWA splash).
5. `naypict-icon-192x192.png` : Resolusi standar Android / mobile home screen.
6. `naypict-icon-64x64.png` / `32x32.png` / `16x16.png` : PNG favicon transparan.
7. `naypict-avatar-dark-512x512.png` : Versi dengan background hitam (#121212) untuk avatar profil media sosial/YouTube/Instagram.

## Cara Pasang di HTML:
Salin kode berikut ke dalam bagian `<head>` pada file `index.html` website Anda:

```html
<!-- Standar Favicon ICO -->
<link rel="shortcut icon" href="/favicon.ico" type="image/x-icon">

<!-- Modern SVG Favicon -->
<link rel="icon" type="image/svg+xml" href="/naypict-icon.svg">

<!-- Mobile & Apple Touch Icons -->
<link rel="icon" type="image/png" sizes="32x32" href="/naypict-icon-32x32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/naypict-icon-192x192.png">
<link rel="apple-touch-icon" sizes="512x512" href="/naypict-icon-512x512.png">
```

## Logo di Navbar:
```html
<header style="background: #121212; padding: 14px 20px; display: flex; align-items: center; gap: 10px;">
  <img src="/naypict-icon.svg" alt="NayPict Logo" width="28" height="28" />
  <span style="color: #F2EFE9; font-weight: 600; font-size: 18px; letter-spacing: 0.5px;">NayPict</span>
</header>
```
