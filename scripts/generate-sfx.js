const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function getFfmpeg() {
  const local = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(local)) return local;
  return 'ffmpeg';
}

const ffmpeg = getFfmpeg();
const sfxDir = path.join(process.cwd(), 'public', 'audio', 'sfx');
if (!fs.existsSync(sfxDir)) {
  fs.mkdirSync(sfxDir, { recursive: true });
}

const sfxList = [
  {
    name: 'whoosh.mp3',
    lavfi: 'anoisesrc=d=0.35:c=white:r=44100,lowpass=f=1200,afade=t=in:ss=0:d=0.15,afade=t=out:st=0.15:d=0.20,volume=1.2',
  },
  {
    name: 'ding.mp3',
    lavfi: 'sine=f=1760:d=0.6,afade=t=out:st=0.05:d=0.55,volume=0.8',
  },
  {
    name: 'kaching.mp3',
    lavfi: 'sine=f=2200:d=0.4,afade=t=out:st=0.08:d=0.32,volume=0.9',
  },
  {
    name: 'pop.mp3',
    lavfi: 'sine=f=800:d=0.12,afade=t=out:st=0.02:d=0.10,volume=1.0',
  },
  {
    name: 'impact.mp3',
    lavfi: 'sine=f=95:d=0.45,afade=t=out:st=0.05:d=0.40,volume=1.5',
  },
];

for (const sfx of sfxList) {
  const outPath = path.join(sfxDir, sfx.name);
  try {
    execFileSync(ffmpeg, [
      '-y',
      '-f', 'lavfi',
      '-i', sfx.lavfi,
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      outPath,
    ], { stdio: 'ignore' });
    console.log(`Generated: ${sfx.name}`);
  } catch (err) {
    console.warn(`Failed to generate ${sfx.name}:`, err.message);
  }
}

console.log('SFX Generation finished successfully!');
