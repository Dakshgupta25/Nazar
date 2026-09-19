import fs from 'fs';
import path from 'path';

function getDirStats(dirPath) {
  let totalBytes = 0;
  let fileCount = 0;
  const filesList = [];

  function traverse(currentPath) {
    const items = fs.readdirSync(currentPath);
    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else {
        totalBytes += stat.size;
        fileCount++;
        const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');
        filesList.push({ path: relPath, size: stat.size });
      }
    }
  }

  traverse(dirPath);
  return { totalBytes, fileCount, filesList };
}

const distPath = path.resolve('dist');
if (fs.existsSync(distPath)) {
  const stats = getDirStats(distPath);
  console.log('=== DIST FOLDER MEASUREMENT ===');
  console.log(`Total Size: ${(stats.totalBytes / (1024 * 1024)).toFixed(2)} MB (${stats.totalBytes} bytes)`);
  console.log(`Total Files: ${stats.fileCount}`);
  console.log('--- File Breakdown ---');
  stats.filesList.sort((a, b) => b.size - a.size).forEach((f) => {
    console.log(`- ${f.path}: ${(f.size / 1024).toFixed(1)} KB (${f.size} bytes)`);
  });
} else {
  console.log('dist/ directory does not exist.');
}
