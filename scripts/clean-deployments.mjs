#!/usr/bin/env node

// This script continuously bulk deletes inactive deployments across all pages on Vercel
// to completely purge Functions Storage (10 GB quota).
// It protects the single active production deployment and deletes everything else.

import https from "https";
import fs from "fs";
import path from "path";
import os from "os";

// 1. Resolve Vercel Token from CLI argument, env, or Vercel CLI global auth.json
function resolveToken() {
  if (process.argv[2] && !process.argv[2].startsWith("--")) {
    return process.argv[2];
  }
  if (process.env.VERCEL_TOKEN) {
    return process.env.VERCEL_TOKEN;
  }

  const possibleAuthPaths = [
    path.join(os.homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"),
    path.join(os.homedir(), ".local", "share", "com.vercel.cli", "auth.json"),
    path.join(os.homedir(), ".config", "vercel", "auth.json"),
    path.join(os.homedir(), ".vercel", "auth.json"),
  ];

  for (const authPath of possibleAuthPaths) {
    try {
      if (fs.existsSync(authPath)) {
        const content = JSON.parse(fs.readFileSync(authPath, "utf-8"));
        if (content.token) return content.token;
      }
    } catch {}
  }

  return null;
}

// 2. Resolve Vercel Team ID if project is under a team
function resolveTeamId() {
  if (process.env.VERCEL_TEAM_ID) {
    return process.env.VERCEL_TEAM_ID;
  }

  const possibleConfigPaths = [
    path.join(os.homedir(), "Library", "Application Support", "com.vercel.cli", "config.json"),
    path.join(os.homedir(), ".local", "share", "com.vercel.cli", "config.json"),
    path.join(os.homedir(), ".config", "vercel", "config.json"),
    path.join(os.homedir(), ".vercel", "config.json"),
  ];

  for (const configPath of possibleConfigPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const content = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (content.currentTeam) return content.currentTeam;
      }
    } catch {}
  }

  return null;
}

const token = resolveToken();
const teamId = resolveTeamId();

if (!token) {
  console.log(`
===================================================================
🧹 Vercel Deployment Cleaner - Free Up Functions Storage
===================================================================

Vercel authentication token tidak ditemukan.

Cara Penggunaan:
1. Buat token di https://vercel.com/account/tokens
2. Jalankan perintah:
   node scripts/clean-deployments.mjs <TOKEN_ANDA>

Atau set environment variable:
   export VERCEL_TOKEN=<TOKEN_ANDA>
   node scripts/clean-deployments.mjs
===================================================================
`);
  process.exit(1);
}

function apiRequest(requestPath, method = "GET") {
  return new Promise((resolve, reject) => {
    // Append teamId query parameter if present and not already in path
    let urlPath = requestPath;
    if (teamId && !urlPath.includes("teamId=")) {
      const separator = urlPath.includes("?") ? "&" : "?";
      urlPath = `${urlPath}${separator}teamId=${encodeURIComponent(teamId)}`;
    }

    const options = {
      hostname: "api.vercel.com",
      port: 443,
      path: urlPath,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "NayPict-Deploy-Cleaner/1.1",
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error?.message || `HTTP ${res.statusCode}: ${data}`));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

async function main() {
  console.log("🧹 Memulai pembersihan deployment Vercel...");
  if (teamId) {
    console.log(`🏢 Menggunakan Team ID: ${teamId}`);
  }

  let totalDeleted = 0;
  let iteration = 1;
  let activeProductionUid = null;

  // 1. Dapatkan active production deployment ID dari project 'naypict'
  try {
    const projectRes = await apiRequest("/v9/projects/naypict");
    if (projectRes.targets?.production?.id) {
      activeProductionUid = projectRes.targets.production.id;
      console.log(`🛡️  TERKUNCI ACTIVE PRODUCTION DEPLOYMENT: ${projectRes.targets.production.url || activeProductionUid} (${activeProductionUid})`);
    }
  } catch (err) {
    console.log(`ℹ️  Tidak dapat mengambil project target secara langsung (${err.message}), akan menggunakan deteksi deployment.`);
  }

  while (true) {
    console.log(`\n📄 [Batch #${iteration}] Mengambil daftar deployment dari Vercel...`);
    let listRes;
    try {
      listRes = await apiRequest("/v6/deployments?limit=100");
    } catch (err) {
      console.error("❌ Gagal mengambil deployment:", err.message);
      break;
    }

    const deployments = listRes.deployments || [];
    if (deployments.length === 0) {
      console.log("✨ Tidak ada deployment lagi yang ditemukan.");
      break;
    }

    console.log(`📦 Ditemukan ${deployments.length} deployment dalam batch ini.`);

    // Sort descending by creation time (terbaru ke terlama)
    deployments.sort((a, b) => b.created - a.created);

    // Kunci active production deployment jika belum terkunci
    if (!activeProductionUid) {
      const activeProd = deployments.find(
        (d) => d.target === "production" && d.state === "READY"
      ) || deployments.find((d) => d.state === "READY") || deployments[0];
      activeProductionUid = activeProd.uid;
      console.log(`🛡️  TERKUNCI DEPLOYMENT AKTIF: ${activeProd.url || activeProd.uid} (${activeProd.uid})`);
    }

    const toDelete = deployments.filter((d) => d.uid !== activeProductionUid);

    if (toDelete.length === 0) {
      console.log("✨ Semua deployment lama telah dibersihkan! Hanya 1 deployment aktif yang tersisa.");
      break;
    }

    console.log(`🗑️  Menghapus ${toDelete.length} deployment lama dalam batch ini...\n`);

    let batchSuccess = 0;
    for (let i = 0; i < toDelete.length; i++) {
      const dep = toDelete[i];
      const commit = dep.meta?.githubCommitMessage?.slice(0, 40) || dep.url || dep.uid;
      process.stdout.write(`[${totalDeleted + i + 1}] Menghapus ${dep.uid} (${commit})... `);

      try {
        await apiRequest(`/v13/deployments/${dep.uid}`, "DELETE");
        console.log("✅ OK");
        batchSuccess++;
      } catch (err) {
        if (err.message.includes("Too many requests") || err.message.includes("now-rm")) {
          console.log(`\n⏳ Vercel API Rate Limit: Maksimal 200 deployment per 10 menit.`);
          console.log(`Berhasil menghapus ${totalDeleted + batchSuccess} deployment.`);
          console.log(`Silakan jalankan script ini lagi setelah 10 menit jika masih ada deployment yang tersisa.\n`);
          totalDeleted += batchSuccess;
          return;
        }
        console.log(`❌ Gagal: ${err.message}`);
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    totalDeleted += batchSuccess;
    iteration++;

    // Jeda antar batch
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n🎉 SELESAI! Total deployment lama yang dihapus: ${totalDeleted}.`);
  console.log("📊 Storage Serverless Functions Vercel Anda sekarang sudah lega dan hanya menyisakan 1 deployment yang aktif!");
}

main();
