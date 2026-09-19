import fs from 'fs';
import path from 'path';

// Valid 1x1 transparent/blue PNG buffer encoded as base64
const base64Png = 'iVBORw0KGgoAAAANSU5ErkJggg=='; 
// Better: a valid 16x16 blue PNG binary block
const bluePng16 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000100000001008060000001fff3f340000000d49444154789c63601805a360140c00030d0001150c9f8d0000000049454e44ae426082',
  'hex'
);

const bluePng48 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000300000003008060000005702f90000000d49444154789c63601805a360140c00030d0001150c9f8d0000000049454e44ae426082',
  'hex'
);

const bluePng128 = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000080000000800806000000c33e8b0000000d49444154789c63601805a360140c00030d0001150c9f8d0000000049454e44ae426082',
  'hex'
);

const iconsDir = path.resolve('public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'icon16.png'), bluePng16);
fs.writeFileSync(path.join(iconsDir, 'icon48.png'), bluePng48);
fs.writeFileSync(path.join(iconsDir, 'icon128.png'), bluePng128);

console.log('Icons generated successfully in public/icons/');
