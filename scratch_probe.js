const { spawnSync } = require('child_process');
const fs = require('fs');
const res = spawnSync('ffprobe', [
  '-v', 'error',
  '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height',
  '-of', 'json',
  'storage/caption-maker/asset_1791704581324_syf05/image_20261009_230502.jpg'
], { encoding: 'utf8' });
console.log('ffprobe output:', res.stdout);
