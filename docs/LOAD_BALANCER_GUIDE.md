# Panduan Implementasi Load Balancer Pixtale

Dokumen ini menjelaskan strategi penerapan **Load Balancer** untuk mencegah *server overload*, mendistribusikan beban lalu lintas secara merata, serta menjamin *High Availability (HA)* pada Pixtale.

---

## 1. Arsitektur Load Balancer Pixtale

Pixtale mendukung 2 model arsitektur Load Balancer utama:

```
[MODEL A: Edge CDN Anycast Load Balancing (Serverless / Cloud)]
Pengunjung Global ──→ Cloudflare Anycast Edge (300+ Kota)
                         ├─ Static Cache & Media (90% traffic diserap)
                         └─ Origin Shield ──→ Vercel Serverless Pool

[MODEL B: Dedicated Cluster Nginx Load Balancer (Docker / VPS)]
Pengunjung ──→ Nginx Load Balancer (Port 80/443)
                  │ (Algoritma: least_conn + keepalive 64)
                  ├─ Probe /api/health (Auto-Failover 3s)
                  ├─ Rate Limiting (50 req/s per IP)
                  ├──→ Pixtale Instance 1 (Port 8082)
                  ├──→ Pixtale Instance 2 (Port 8082)
                  └──→ Pixtale Instance 3 (Port 8082)
```

---

## 2. Model B: Menjalankan Cluster Docker Multi-Instance dengan Nginx Load Balancer

Konfigurasi telah disediakan di root proyek via [`docker-compose.yml`](../docker-compose.yml) dan folder [`nginx/`](../nginx/).

### Fitur Utama Nginx Load Balancer Pixtale:
* **Algoritma `least_conn`**: Mengarahkan *request* ke container yang memiliki antrean koneksi paling sedikit, mencegah satu container menjadi *bottleneck*.
* **HTTP/1.1 Persistent Connection Pool (`keepalive 64`)**: Mengurangi latensi *TCP Handshake* antara Load Balancer dan aplikasi backend hingga 70%.
* **Automatic Silent Failover (`proxy_next_upstream`)**: Jika salah satu instance mengalami error 502/503 atau restart, request pengguna langsung dialihkan secara transparan ke instance sehat lainnya dalam waktu <2 detik tanpa memunculkan error page ke pengguna.
* **Rate Limiting Guard**:
  * *General API*: Maksimal 50 request/detik per IP.
  * *Auth / Login*: Maksimal 5 request/detik per IP untuk proteksi *Brute-Force* dan *CPU Exhaustion*.

### Cara Menjalankan:
```bash
# 1. Pastikan file .env telah terisi sesuai konfigurasi database Neon & R2
cp .env.example .env

# 2. Build dan jalankan seluruh cluster (3 app + 1 Nginx LB) di latar belakang
docker compose up -d --build

# 3. Cek status kesehatan seluruh container
docker compose ps
```

---

## 3. Model A: Cloudflare Global Anycast Load Balancer & Overload Shield (Untuk Vercel / Cloud)

Jika Anda men-deploy website di Vercel / Cloud:

1. **Aktifkan Cloudflare Proxy (Orange Cloud ☁️)**:
   * Masuk ke **Cloudflare Dashboard** → **DNS**.
   * Pastikan record `CNAME` domain Anda (misal `gallery.domain.com`) diarahkan dengan status **Proxied**.
2. **Cloudflare Health Checks & Load Balancing**:
   * Endpoint probe kesehatan: `/api/health`
   * Method: `GET` atau `HEAD`
   * Expected Code: `200`
   * Interval: `15 seconds`
3. **Aktifkan Tiered Cache**:
   * Buka **Caching** → **Tiered Cache** → Enable **Argo Tiered Cache**.
   * Fitur ini menyerap hingga **95% request media & thumbnail** di edge network Cloudflare, sehingga server origin tidak akan kelebihan beban (*zero overload*).

---

## 4. Spesifikasi Health Check Endpoint (`/api/health`)

Load balancer (AWS ALB, GCP Load Balancer, Nginx, maupun Cloudflare) dapat memonitor kesehatan instance secara otomatis melalui:

* **Endpoint**: `/api/health`
* **Metode**: `GET` atau `HEAD`
* **Response Contoh (200 OK)**:
  ```json
  {
    "status": "healthy",
    "database": "connected",
    "timestamp": "2026-08-29T11:45:00.000Z",
    "uptime": 3600
  }
  ```
* **Status Error (503 Service Unavailable)**: Dikembalikan secara otomatis jika koneksi database terputus, sehingga Load Balancer langsung mencoret instance tersebut dari antrean distribusi lalu lintas.
