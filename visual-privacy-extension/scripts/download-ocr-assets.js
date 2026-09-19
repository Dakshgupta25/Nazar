import fs from 'fs';
import path from 'path';
import https from 'https';
import zlib from 'zlib';

const OCR_DIR = path.resolve('public/models/ocr');

if (!fs.existsSync(OCR_DIR)) {
  fs.mkdirSync(OCR_DIR, { recursive: true });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return fetchBuffer(response.headers.location).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url}: Status code ${response.statusCode}`));
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadFile(url, destPath) {
  const buf = await fetchBuffer(url);
  fs.writeFileSync(destPath, buf);
  console.log(`Downloaded: ${path.basename(destPath)} (${buf.length} bytes)`);
}

async function downloadAndGzipLanguage(url, destPath) {
  const rawBuf = await fetchBuffer(url);
  let gzippedBuf;
  // Check if already gzip header (0x1f 0x8b)
  if (rawBuf[0] === 0x1f && rawBuf[1] === 0x8b) {
    gzippedBuf = rawBuf;
  } else {
    gzippedBuf = zlib.gzipSync(rawBuf);
  }
  fs.writeFileSync(destPath, gzippedBuf);
  console.log(`Downloaded & Gzipped: ${path.basename(destPath)} (${gzippedBuf.length} bytes)`);
}

async function main() {
  console.log('Downloading local Tesseract.js v7 WASM, Worker, and Gzipped Language assets...');

  // Exact matching version 7.0.0 assets for installed tesseract.js@7.0.0 package
  const workerUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js';
  const coreJsUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/tesseract-core.wasm.js';
  const coreWasmUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/tesseract-core.wasm';
  const langUrl = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata';

  const workerPath = path.join(OCR_DIR, 'worker.min.js');
  const coreJsPath = path.join(OCR_DIR, 'tesseract-core.wasm.js');
  const coreWasmPath = path.join(OCR_DIR, 'tesseract-core.wasm');
  const langPath = path.join(OCR_DIR, 'eng.traineddata.gz');

  await downloadFile(workerUrl, workerPath);
  await downloadFile(coreJsUrl, coreJsPath);
  await downloadFile(coreWasmUrl, coreWasmPath);
  await downloadAndGzipLanguage(langUrl, langPath);

  console.log('All matching Tesseract v7 OCR assets successfully packaged in public/models/ocr/');
}

main().catch((err) => {
  console.error('OCR asset download error:', err);
  process.exit(1);
});
