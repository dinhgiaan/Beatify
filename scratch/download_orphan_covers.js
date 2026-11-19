// Script A2: Tải 503 orphan covers về local backup
// Chỉ tải về, không xóa gì
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Load env
function loadEnv(envPath) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const ROOT = path.resolve(__dirname, '..');
loadEnv(path.join(ROOT, 'tools/indexer/.env'));

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error('❌ Thiếu biến môi trường R2. Kiểm tra tools/indexer/.env');
  process.exit(1);
}

const LOGS_DIR = path.join(ROOT, 'tools/indexer/backups/reorg_logs_20261118');
const ORPHANS_LIST = path.join(LOGS_DIR, 'r2_orphans_list.json');
const BACKUP_DIR = path.join(LOGS_DIR, 'orphan_covers_backup');

// Lấy danh sách 503 orphan covers từ report đã tạo
const verificationReport = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, 'orphan_covers_verification.json'), 'utf8'));
const allCoverKeys = [
  ...verificationReport.details.onlyInCustomCache,
  ...verificationReport.details.fullyOrphan,
  ...(verificationReport.details.inLibrary || []),
  ...(verificationReport.details.onlyInOverrides || []),
].map(o => o.key);

console.log(`\n📋 Sẽ tải về: ${allCoverKeys.length} covers`);

// Tạo thư mục backup
fs.mkdirSync(BACKUP_DIR, { recursive: true });

// AWS Signature V4 để GET từ R2
const { createHmac, createHash } = require('crypto');

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

function getSigningKey(secretKey, date, region, service) {
  const kDate = hmacSha256('AWS4' + secretKey, date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  return kSigning;
}

function downloadR2Object(key) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateOnly = dateStr.slice(0, 8);
    
    const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const region = 'auto';
    const service = 's3';
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const path_ = `/${R2_BUCKET}/${encodedKey}`;
    
    const headers = {
      'Host': host,
      'x-amz-date': dateStr,
      'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    
    const headerKeys = Object.keys(headers).sort();
    const canonicalHeaders = headerKeys.map(k => `${k.toLowerCase()}:${headers[k]}\n`).join('');
    const signedHeaders = headerKeys.map(k => k.toLowerCase()).join(';');
    
    const canonicalRequest = [
      'GET',
      path_,
      '',
      canonicalHeaders,
      signedHeaders,
      headers['x-amz-content-sha256'],
    ].join('\n');
    
    const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      dateStr,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n');
    
    const signingKey = getSigningKey(R2_SECRET_ACCESS_KEY, dateOnly, region, service);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    
    const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    const options = {
      hostname: host,
      path: path_,
      method: 'GET',
      headers: {
        ...headers,
        'Authorization': authorization,
      },
    };
    
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode} for ${key}: ${body.slice(0, 200)}`)));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  let downloaded = 0;
  let failed = 0;
  let totalBytes = 0;
  const failedKeys = [];

  for (let i = 0; i < allCoverKeys.length; i++) {
    const key = allCoverKeys[i];
    const basename = path.basename(key); // e.g. "abc123.jpg"
    const destPath = path.join(BACKUP_DIR, basename);
    
    // Skip nếu đã tải
    if (fs.existsSync(destPath)) {
      downloaded++;
      totalBytes += fs.statSync(destPath).size;
      if ((i + 1) % 50 === 0) {
        console.log(`  [${i + 1}/${allCoverKeys.length}] ${downloaded} tải (skip), ${failed} lỗi`);
      }
      continue;
    }
    
    try {
      const buf = await downloadR2Object(key);
      fs.writeFileSync(destPath, buf);
      downloaded++;
      totalBytes += buf.length;
      if ((i + 1) % 50 === 0 || i === allCoverKeys.length - 1) {
        console.log(`  [${i + 1}/${allCoverKeys.length}] ${downloaded} tải, ${failed} lỗi, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
      }
    } catch (err) {
      failed++;
      failedKeys.push({ key, error: err.message });
      console.error(`  ❌ [${i + 1}] ${key}: ${err.message.slice(0, 100)}`);
    }
    
    // Delay nhỏ để tránh rate limit
    await new Promise(r => setTimeout(r, 20));
  }
  
  console.log('\n=== KẾT QUẢ ===');
  console.log(`✅ Tải thành công: ${downloaded}/${allCoverKeys.length}`);
  console.log(`❌ Lỗi: ${failed}`);
  console.log(`💾 Tổng dung lượng: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📁 Lưu tại: ${BACKUP_DIR}`);
  
  if (failedKeys.length > 0) {
    const failPath = path.join(LOGS_DIR, 'orphan_covers_download_errors.json');
    fs.writeFileSync(failPath, JSON.stringify(failedKeys, null, 2));
    console.log(`\n⚠️  Danh sách lỗi: ${failPath}`);
  }
  
  // Ghi summary
  const summary = {
    generatedAt: new Date().toISOString(),
    totalKeys: allCoverKeys.length,
    downloaded,
    failed,
    totalMB: (totalBytes / 1024 / 1024).toFixed(2),
    backupDir: BACKUP_DIR,
    failedKeys,
  };
  fs.writeFileSync(path.join(LOGS_DIR, 'orphan_covers_download_summary.json'), JSON.stringify(summary, null, 2));
}

main().catch(err => { console.error('❌ Fatal:', err.message); process.exit(1); });

