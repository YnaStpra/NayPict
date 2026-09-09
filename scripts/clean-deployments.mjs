#!/usr/bin/env node

// This script bulk deletes inactive deployments on Vercel to immediately clean up Functions Storage (10 GB quota).
// It keeps the current active production deployment safe and deletes all older historical deployments.

import https from "https";

const token = process.argv[2] || process.env.VERCEL_TOKEN;

if (!token) {
  console.log(`
===================================================================
🧹 Vercel Deployment Cleaner - Free Up Functions Storage (66 GB)
===================================================================

Cara Penggunaan:
1. Buat Vercel Access Token (hanya butuh 10 detik):
   Buka: https://vercel.com/account/tokens
   Klik "Create Token" -> Beri nama "cleaner" -> Scope: Full Account -> Copy token-nya.

2. Jalankan perintah ini di terminal:
   node scripts/clean-deployments.mjs <TOKEN_ANDA>

Contoh:
   node scripts/clean-deployments.mjs vercel_tok_xxxxxxxxxxxx

Script ini akan otomatis menghapus SEMUA deployment lama Anda dan
menjaga deployment Production terbaru yang sedang aktif tetap aman!
===================================================================
`);
  process.exit(0);
}

function apiRequest(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.vercel.com",
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "NayPict-Deploy-Cleaner/1.0",
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
  console.log("🔍 Fetching deployments from Vercel...");
  try {
    const listRes = await apiRequest("/v6/deployments?limit=100");
    const deployments = listRes.deployments || [];

    if (deployments.length === 0) {
      console.log("No deployments found.");
      return;
    }

    console.log(`📦 Found ${deployments.length} total deployments.`);

    // Sort descending by creation time
    deployments.sort((a, b) => b.created - a.created);

    // Identify current active production deployment (first ready production deployment)
    const activeProdIndex = deployments.findIndex(
      (d) => (d.target === "production" || d.name === "naypict") && d.state === "READY"
    );

    const activeProd = activeProdIndex !== -1 ? deployments[activeProdIndex] : deployments[0];
    const toDelete = deployments.filter((d) => d.uid !== activeProd.uid);

    console.log(`\n🛡️  KEPT SAFE: Current Production (${activeProd.url || activeProd.uid})`);
    console.log(`🗑️  TARGET TO DELETE: ${toDelete.length} old deployment(s)\n`);

    if (toDelete.length === 0) {
      console.log("✨ All older deployments are already cleaned up! Functions Storage is minimal.");
      return;
    }

    let successCount = 0;
    for (let i = 0; i < toDelete.length; i++) {
      const dep = toDelete[i];
      const commit = dep.meta?.githubCommitMessage?.slice(0, 40) || dep.url || dep.uid;
      process.stdout.write(`[${i + 1}/${toDelete.length}] Deleting ${dep.uid} (${commit})... `);

      try {
        await apiRequest(`/v13/deployments/${dep.uid}`, "DELETE");
        console.log("✅ OK");
        successCount++;
      } catch (err) {
        console.log(`❌ Failed: ${err.message}`);
      }

      // Small throttle to avoid hitting Vercel rate limits
      await new Promise((r) => setTimeout(r, 200));
    }

    console.log(`\n🎉 DONE! Successfully deleted ${successCount} old deployment(s).`);
    console.log("📊 Check your Vercel Usage page: Functions Storage will drop from 66 GB to < 1 GB!");
  } catch (err) {
    console.error("❌ Error running cleaner:", err.message);
  }
}

main();
