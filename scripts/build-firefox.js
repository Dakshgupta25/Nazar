import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distDir = path.join(rootDir, 'dist');
const distFirefoxDir = path.join(rootDir, 'dist-firefox');

console.log('[Firefox Build] Copying dist/ to dist-firefox/ ...');
if (fs.existsSync(distFirefoxDir)) {
    fs.rmSync(distFirefoxDir, { recursive: true, force: true });
}
fs.cpSync(distDir, distFirefoxDir, { recursive: true });

console.log('[Firefox Build] Patching manifest.json for Firefox MV3...');
const manifestPath = path.join(distFirefoxDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Inject Firefox explicit extension ID & Privacy compliance requirement
manifest.browser_specific_settings = {
    gecko: {
        id: "nazar@isro.extension",
        strict_min_version: "109.0",
        data_collection_permissions: {
            required: ["none"]
        }
    }
};

// Convert Chrome service_worker to Firefox background.scripts
if (manifest.background && manifest.background.service_worker) {
    const workerScript = manifest.background.service_worker;
    delete manifest.background.service_worker;
    manifest.background.scripts = [workerScript];
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log('[Firefox Build] ✅ Success! Firefox extension is ready in dist-firefox/');
