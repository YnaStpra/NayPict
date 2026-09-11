#!/usr/bin/env node

// This script continuously bulk deletes inactive deployments across all pages on Vercel
// to completely purge Functions Storage (10 GB quota).
// It protects the single active production deployment and deletes everything else.

import https from "https";

const token = process.argv[2] || process.env.VERCEL_TOKEN;

if (!token) {
  console.log(`
===================================================================
🧹 Vercel Deployment Cleaner - Free Up Functions Storage (66 GB)
===================================================================

Cara Penggunaan:
   node scripts/clean-deployments.mjs <TOKEN_ANDA>
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
  console.log("🧹 Starting continuous Vercel deployment cleaner...");

  let totalDeleted = 0;
  let iteration = 1;
  let activeProductionUid = null;

  while (true) {
    console.log(`\n📄 [Batch #${iteration}] Fetching deployments from Vercel...`);
    let listRes;
    try {
      listRes = await apiRequest("/v6/deployments?limit=100");
    } catch (err) {
      console.error("❌ Error fetching deployments:", err.message);
      break;
    }

    const deployments = listRes.deployments || [];
    if (deployments.length === 0) {
      console.log("✨ No more deployments found.");
      break;
    }

    console.log(`📦 Found ${deployments.length} deployments in this batch.`);

    // Sort descending by creation time
    deployments.sort((a, b) => b.created - a.created);

    // Lock active production deployment on first batch
    if (!activeProductionUid) {
      const activeProd = deployments.find(
        (d) => (d.target === "production" || d.name === "naypict") && d.state === "READY"
      ) || deployments[0];
      activeProductionUid = activeProd.uid;
      console.log(`🛡️  LOCKED PRODUCTION DEPLOYMENT: ${activeProd.url || activeProd.uid} (${activeProd.uid})`);

      // Ensure custom domain aliases are assigned before deleting older deployments
      if (activeProd.target === "production") {
        try {
          const depDetails = await apiRequest(`/v13/deployments/${activeProd.uid}`);
          if (!depDetails.aliasAssigned) {
            console.log(`⏳ Waiting 8s for Vercel domain alias assignment on ${activeProd.uid}...`);
            await new Promise((r) => setTimeout(r, 8000));
          }
        } catch {}
      }
    }

    const toDelete = deployments.filter((d) => d.uid !== activeProductionUid);

    if (toDelete.length === 0) {
      console.log("✨ All older deployments are deleted! Only the active production deployment remains.");
      break;
    }

    console.log(`🗑️  Deleting ${toDelete.length} deployment(s) in this batch...\n`);

    let batchSuccess = 0;
    for (let i = 0; i < toDelete.length; i++) {
      const dep = toDelete[i];
      const commit = dep.meta?.githubCommitMessage?.slice(0, 40) || dep.url || dep.uid;
      process.stdout.write(`[${totalDeleted + i + 1}] Deleting ${dep.uid} (${commit})... `);

      try {
        await apiRequest(`/v13/deployments/${dep.uid}`, "DELETE");
        console.log("✅ OK");
        batchSuccess++;
      } catch (err) {
        if (err.message.includes("Too many requests") || err.message.includes("now-rm")) {
          console.log(`\n⏳ Vercel API Rate Limit Reached: Maksimal 200 deployment per 10 menit.`);
          console.log(`Sudah berhasil menghapus ${totalDeleted + batchSuccess} deployment!`);
          console.log(`Silakan istirahat sejenak, jalankan script ini lagi setelah 10 menit jika masih ada sisa.\n`);
          totalDeleted += batchSuccess;
          return;
        }
        console.log(`❌ Failed: ${err.message}`);
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    totalDeleted += batchSuccess;
    iteration++;

    // Small delay between batches
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n🎉 COMPLETED! Total deleted across all batches: ${totalDeleted} old deployment(s).`);
  console.log("📊 Your Functions Storage is now completely purged down to only the current active deployment!");
}

main();
