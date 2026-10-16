import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// 1. Setup native FFmpeg wrapper in bin directory
const binDir = path.resolve('bin');
const ffmpegExe = path.join(binDir, 'ffmpeg.exe');
const ffmpegRealExe = path.join(binDir, 'ffmpeg-real.exe');
const wrapperSrc = path.resolve('scripts/FfmpegWrapper.cs');

if (process.platform === 'win32' && fs.existsSync(binDir)) {
  try {
    // If ffmpeg.exe exists and is the original heavy binary (> 10MB), copy to ffmpeg-real.exe
    if (fs.existsSync(ffmpegExe)) {
      const stat = fs.statSync(ffmpegExe);
      if (stat.size > 10 * 1024 * 1024) {
        fs.copyFileSync(ffmpegExe, ffmpegRealExe);
        console.log('[patch-remotion] Backed up original FFmpeg to bin/ffmpeg-real.exe');
      }
    }

    // Compile wrapper to bin/ffmpeg.exe if needed
    if (fs.existsSync(ffmpegRealExe) && fs.existsSync(wrapperSrc)) {
      const cscPaths = [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
      ];
      const csc = cscPaths.find(p => fs.existsSync(p));
      if (csc) {
        const ffmpegStat = fs.existsSync(ffmpegExe) ? fs.statSync(ffmpegExe) : null;
        // Recompile if ffmpeg.exe doesn't exist or is the heavy binary
        if (!ffmpegStat || ffmpegStat.size > 10 * 1024 * 1024) {
          execSync(`"${csc}" /nologo /optimize /target:exe /out:"${ffmpegExe}" "${wrapperSrc}"`, { stdio: 'inherit' });
          console.log('[patch-remotion] Compiled FFmpeg wrapper to bin/ffmpeg.exe');
        }
      }
    }
  } catch (err) {
    console.error('[patch-remotion] Warning setting up FFmpeg wrapper:', err);
  }
}

// 2. Patch CommonJS: node_modules/@remotion/renderer/dist/call-ffmpeg.js
const callFfPath = path.resolve('node_modules/@remotion/renderer/dist/call-ffmpeg.js');

if (fs.existsSync(callFfPath)) {
  let content = fs.readFileSync(callFfPath, 'utf8');

  // Strip previous patch if present to re-apply cleanly
  if (content.includes('function patchFfmpegArgs')) {
    const startIdx = content.indexOf('const node_fs_1 = __importDefault(require("node:fs"));');
    const endMarker = 'return cleanArgs;\n}\n';
    const endIdx = content.indexOf(endMarker);
    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx) + content.slice(endIdx + endMarker.length);
    }
    content = content.replace(/const defaultBin = [^;]+;\s*const resolvedBinariesDir = [^;]+;\s*/g, '');
    content = content.replace(/binariesDirectory: resolvedBinariesDir,/g, 'binariesDirectory,');
    content = content.replace(/const patchedArgs = patchFfmpegArgs\(args\);\s*const task = \(0, execa_1\.default\)\(executablePath, patchedArgs,/g, 'const task = (0, execa_1.default)(executablePath, args.filter(truthy_1.truthy),');
    content = content.replace(/const patchedArgs = patchFfmpegArgs\(args\);\s*const task = \(0, node_child_process_1\.spawn\)\(executablePath, patchedArgs,/g, 'const task = (0, node_child_process_1.spawn)(executablePath, args.filter(truthy_1.truthy),');
  }

  const patchCode = `
const node_fs_1 = __importDefault(require("node:fs"));

function patchFfmpegArgs(args) {
    const cleanArgs = [...args.filter(truthy_1.truthy)];
    const filterScriptIdx = cleanArgs.findIndex(arg => typeof arg === 'string' && (arg === '-filter_script:a' || arg === '-filter_script' || arg.startsWith('-filter_script:')));
    if (filterScriptIdx !== -1 && filterScriptIdx + 1 < cleanArgs.length) {
        const filterFile = cleanArgs[filterScriptIdx + 1];
        try {
            if (node_fs_1.default.existsSync(filterFile)) {
                const filterContent = node_fs_1.default.readFileSync(filterFile, 'utf8').trim();
                const hasMap = cleanArgs.includes('-map');
                if (!hasMap && filterContent.includes('[a0]')) {
                    cleanArgs.splice(filterScriptIdx, 2, '-filter_complex', filterContent, '-map', '[a0]');
                } else {
                    cleanArgs.splice(filterScriptIdx, 2, '-filter_complex', filterContent);
                }
            }
        } catch (e) {
            console.error('[Remotion Patch] Error reading filter script file:', e);
        }
    }
    const filterComplexScriptIdx = cleanArgs.findIndex(arg => typeof arg === 'string' && arg.startsWith('-filter_complex_script'));
    if (filterComplexScriptIdx !== -1 && filterComplexScriptIdx + 1 < cleanArgs.length) {
        const filterFile = cleanArgs[filterComplexScriptIdx + 1];
        try {
            if (node_fs_1.default.existsSync(filterFile)) {
                const filterContent = node_fs_1.default.readFileSync(filterFile, 'utf8').trim();
                cleanArgs.splice(filterComplexScriptIdx, 2, '-filter_complex', filterContent);
            }
        } catch (e) {
            console.error('[Remotion Patch] Error reading filter_complex_script file:', e);
        }
    }
    const libfdkIdx = cleanArgs.indexOf('libfdk_aac');
    if (libfdkIdx !== -1) {
        cleanArgs[libfdkIdx] = 'aac';
    }
    return cleanArgs;
}
`;

  // Inject patchCode after imports
  content = content.replace(
    'const truthy_1 = require("./truthy");',
    'const truthy_1 = require("./truthy");' + patchCode
  );

  // Update callFf to resolve default bin and patch args
  content = content.replace(
    `    const executablePath = (0, get_executable_path_1.getExecutablePath)({
        type: bin,
        indent,
        logLevel,
        binariesDirectory,
    });
    (0, make_file_executable_1.makeFileExecutableIfItIsNot)(executablePath);
    const cwd = path_1.default.dirname(executablePath);
    const task = (0, execa_1.default)(executablePath, args.filter(truthy_1.truthy), {`,
    `    const defaultBin = path_1.default.resolve(process.cwd(), 'bin');
    const resolvedBinariesDir = binariesDirectory || (node_fs_1.default.existsSync(defaultBin) ? defaultBin : null);
    const executablePath = (0, get_executable_path_1.getExecutablePath)({
        type: bin,
        indent,
        logLevel,
        binariesDirectory: resolvedBinariesDir,
    });
    (0, make_file_executable_1.makeFileExecutableIfItIsNot)(executablePath);
    const cwd = path_1.default.dirname(executablePath);
    const patchedArgs = patchFfmpegArgs(args);
    const task = (0, execa_1.default)(executablePath, patchedArgs, {`
  );

  // Update callFfNative as well
  content = content.replace(
    `    const executablePath = (0, get_executable_path_1.getExecutablePath)({
        type: bin,
        indent,
        logLevel,
        binariesDirectory,
    });
    (0, make_file_executable_1.makeFileExecutableIfItIsNot)(executablePath);
    const cwd = path_1.default.dirname(executablePath);
    const task = (0, node_child_process_1.spawn)(executablePath, args.filter(truthy_1.truthy), {`,
    `    const defaultBin = path_1.default.resolve(process.cwd(), 'bin');
    const resolvedBinariesDir = binariesDirectory || (node_fs_1.default.existsSync(defaultBin) ? defaultBin : null);
    const executablePath = (0, get_executable_path_1.getExecutablePath)({
        type: bin,
        indent,
        logLevel,
        binariesDirectory: resolvedBinariesDir,
    });
    (0, make_file_executable_1.makeFileExecutableIfItIsNot)(executablePath);
    const cwd = path_1.default.dirname(executablePath);
    const patchedArgs = patchFfmpegArgs(args);
    const task = (0, node_child_process_1.spawn)(executablePath, patchedArgs, {`
  );

  fs.writeFileSync(callFfPath, content, 'utf8');
  console.log('[patch-remotion] Successfully patched call-ffmpeg.js');
}

// 3. Patch preprocess-audio-track.js in CJS
const preprocessAudioPath = path.resolve('node_modules/@remotion/renderer/dist/preprocess-audio-track.js');
if (fs.existsSync(preprocessAudioPath)) {
  let content = fs.readFileSync(preprocessAudioPath, 'utf8');
  if (content.includes("['-filter_script:a', file]")) {
    content = content.replace(
      "['-filter_script:a', file]",
      "file ? ['-filter_complex', filter.filter, '-map', '[a0]'] : null"
    );
    fs.writeFileSync(preprocessAudioPath, content, 'utf8');
    console.log('[patch-remotion] Successfully patched preprocess-audio-track.js');
  }
}

// 4. Patch ESM: node_modules/@remotion/renderer/dist/esm/index.mjs
const esmIndexPath = path.resolve('node_modules/@remotion/renderer/dist/esm/index.mjs');

if (fs.existsSync(esmIndexPath)) {
  let esmContent = fs.readFileSync(esmIndexPath, 'utf8');

  // Strip previous patch if present to re-apply cleanly
  if (esmContent.includes('import fs_node from "node:fs";')) {
    const startIdx = esmContent.indexOf('import fs_node from "node:fs";');
    const endMarker = 'return cleanArgs;\n}\n';
    const endIdx = esmContent.indexOf(endMarker, startIdx);
    if (startIdx !== -1 && endIdx !== -1) {
      esmContent = esmContent.slice(0, startIdx) + esmContent.slice(endIdx + endMarker.length);
    }
  }

  // Clean any old artifacts in callFf / callFfNative
  esmContent = esmContent.replace(/const defaultBin = [^;]+;\s*const resolvedBinariesDir = [^;]+;\s*/g, '');
  esmContent = esmContent.replace(/binariesDirectory: resolvedBinariesDir/g, 'binariesDirectory');
  esmContent = esmContent.replace(/const patchedArgs = patchFfmpegArgsEsm\(args\);\s*const task = execa\(executablePath, patchedArgs,/g, 'const task = execa(executablePath, args.filter(truthy),');
  esmContent = esmContent.replace(/const patchedArgs = patchFfmpegArgsEsm\(args\);\s*const task = spawn2\(executablePath, patchedArgs,/g, 'const task = spawn2(executablePath, args.filter(truthy),');

  const esmPatchCode = `
import fs_node from "node:fs";

function patchFfmpegArgsEsm(args) {
  const cleanArgs = [...args.filter(truthy)];
  const filterScriptIdx = cleanArgs.findIndex(arg => typeof arg === 'string' && (arg === '-filter_script:a' || arg === '-filter_script' || arg.startsWith('-filter_script:')));
  if (filterScriptIdx !== -1 && filterScriptIdx + 1 < cleanArgs.length) {
    const filterFile = cleanArgs[filterScriptIdx + 1];
    try {
      if (fs_node.existsSync(filterFile)) {
        const filterContent = fs_node.readFileSync(filterFile, 'utf8').trim();
        const hasMap = cleanArgs.includes('-map');
        if (!hasMap && filterContent.includes('[a0]')) {
          cleanArgs.splice(filterScriptIdx, 2, '-filter_complex', filterContent, '-map', '[a0]');
        } else {
          cleanArgs.splice(filterScriptIdx, 2, '-filter_complex', filterContent);
        }
      }
    } catch (e) {
      console.error('[Remotion ESM Patch] Error reading filter script file:', e);
    }
  }
  const filterComplexScriptIdx = cleanArgs.findIndex(arg => typeof arg === 'string' && arg.startsWith('-filter_complex_script'));
  if (filterComplexScriptIdx !== -1 && filterComplexScriptIdx + 1 < cleanArgs.length) {
    const filterFile = cleanArgs[filterComplexScriptIdx + 1];
    try {
      if (fs_node.existsSync(filterFile)) {
        const filterContent = fs_node.readFileSync(filterFile, 'utf8').trim();
        cleanArgs.splice(filterComplexScriptIdx, 2, '-filter_complex', filterContent);
      }
    } catch (e) {
      console.error('[Remotion ESM Patch] Error reading filter_complex_script file:', e);
    }
  }
  const libfdkIdx = cleanArgs.indexOf('libfdk_aac');
  if (libfdkIdx !== -1) {
    cleanArgs[libfdkIdx] = 'aac';
  }
  return cleanArgs;
}
`;

  // Inject esmPatchCode before `var callFf =`
  if (/\/\/\s*src\/call-ffmpeg\.ts[\r\n]+var callFf =/.test(esmContent)) {
    esmContent = esmContent.replace(
      /(\/\/\s*src\/call-ffmpeg\.ts[\r\n]+)(var callFf =)/,
      `$1${esmPatchCode}\n$2`
    );
  } else if (esmContent.includes('var callFf =')) {
    esmContent = esmContent.replace('var callFf =', `${esmPatchCode}\nvar callFf =`);
  }

  // Update callFf in ESM: Add resolvedBinariesDir and patchedArgs
  esmContent = esmContent.replace(
    /(var callFf = \(\{[\s\S]*?\}\) => \{\r?\n)/,
    `$1  const defaultBin = path5.resolve(process.cwd(), 'bin');\n  const resolvedBinariesDir = binariesDirectory || (fs_node.existsSync(defaultBin) ? defaultBin : null);\n`
  );
  esmContent = esmContent.replace(
    /binariesDirectory\r?\n\s*\}\);\r?\n\s*makeFileExecutableIfItIsNot\(executablePath\);\r?\n\s*const cwd = path5\.dirname\(executablePath\);\r?\n\s*const task = execa\(executablePath, args\.filter\(truthy\), \{/,
    `binariesDirectory: resolvedBinariesDir
  });
  makeFileExecutableIfItIsNot(executablePath);
  const cwd = path5.dirname(executablePath);
  const patchedArgs = patchFfmpegArgsEsm(args);
  const task = execa(executablePath, patchedArgs, {`
  );

  // Update callFfNative in ESM: Add resolvedBinariesDir and patchedArgs
  esmContent = esmContent.replace(
    /(var callFfNative = \(\{[\s\S]*?\}\) => \{\r?\n)/,
    `$1  const defaultBin = path5.resolve(process.cwd(), 'bin');\n  const resolvedBinariesDir = binariesDirectory || (fs_node.existsSync(defaultBin) ? defaultBin : null);\n`
  );
  esmContent = esmContent.replace(
    /binariesDirectory\r?\n\s*\}\);\r?\n\s*makeFileExecutableIfItIsNot\(executablePath\);\r?\n\s*const cwd = path5\.dirname\(executablePath\);\r?\n\s*const task = spawn2\(executablePath, args\.filter\(truthy\), \{/,
    `binariesDirectory: resolvedBinariesDir
  });
  makeFileExecutableIfItIsNot(executablePath);
  const cwd = path5.dirname(executablePath);
  const patchedArgs = patchFfmpegArgsEsm(args);
  const task = spawn2(executablePath, patchedArgs, {`
  );

  // Also patch ESM audio preprocessing line if present
  esmContent = esmContent.replace(
    'file ? ["-filter_script:a", file] : null,',
    'file ? ["-filter_complex", filter.filter, "-map", "[a0]"] : null,'
  );

  fs.writeFileSync(esmIndexPath, esmContent, 'utf8');
  console.log('[patch-remotion] Successfully patched dist/esm/index.mjs');
}
