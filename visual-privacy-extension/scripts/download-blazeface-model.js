import fs from 'fs';
import path from 'path';
import https from 'https';

const MODEL_DIR = path.resolve('public/models/blazeface');

if (!fs.existsSync(MODEL_DIR)) {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
}

// Download helper supporting redirects
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log(`Following redirect to ${response.headers.location}...`);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: Status code ${response.statusCode}`));
      }
      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`Downloaded: ${path.basename(destPath)} (${fs.statSync(destPath).size} bytes)`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading BlazeFace model files for 100% offline extension packaging...');
  
  // BlazeFace TFHub URLs
  const modelJsonUrl = 'https://tfhub.dev/tensorflow/tfjs-model/blazeface/1/default/1/model.json?tfjs-format=file';
  const shardBinUrl = 'https://tfhub.dev/tensorflow/tfjs-model/blazeface/1/default/1/group1-shard1of1.bin?tfjs-format=file';

  const modelJsonPath = path.join(MODEL_DIR, 'model.json');
  const shardBinPath = path.join(MODEL_DIR, 'group1-shard1of1.bin');

  await downloadFile(modelJsonUrl, modelJsonPath);
  await downloadFile(shardBinUrl, shardBinPath);

  console.log('BlazeFace model files successfully packaged in public/models/blazeface/');
}

main().catch((err) => {
  console.error('Model download error:', err);
  process.exit(1);
});
