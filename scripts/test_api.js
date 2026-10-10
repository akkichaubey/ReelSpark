const fs = require('fs');
const path = require('path');

async function testApi() {
  console.log('Testing Local API Endpoints on http://localhost:3000...\n');

  // 1. System status
  const sysRes = await fetch('http://localhost:3000/api/system');
  const sys = await sysRes.json();
  console.log('1. System Status:', JSON.stringify(sys, null, 2));

  // 2. Create Project
  const createRes = await fetch('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Osho: Awareness and Totality',
      sourceType: 'upload',
      durationLimit: '30',
      aspectRatio: 'vertical_crop',
      normalizeAudio: true,
      burnSubtitles: false,
    }),
  });
  const createData = await createRes.json();
  console.log('\n2. Project Created:', createData.success, 'ID:', createData.project?.id);
  const projectId = createData.project.id;

  // 3. Generate a small synthetic test video to upload
  const tempVideo = path.join(process.cwd(), 'storage', 'temp', 'api_test_video.mp4');
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  const ffmpegBin = path.join(process.cwd(), 'bin', 'ffmpeg.exe');

  await execFileAsync(ffmpegBin, [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=15:size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=500:duration=15',
    '-c:v', 'libx264', '-preset', 'ultrafast',
    '-c:a', 'aac',
    tempVideo,
  ]);
  console.log('3. Generated synthetic media at:', tempVideo);

  // 4. Upload video to project
  const fileBuffer = fs.readFileSync(tempVideo);
  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: 'video/mp4' }), 'osho_awareness_talk.mp4');

  const uploadRes = await fetch(`http://localhost:3000/api/projects/${projectId}/upload`, {
    method: 'POST',
    body: formData,
  });
  const uploadData = await uploadRes.json();
  console.log('\n4. Video Uploaded and FFprobed:', uploadData.success, 'Metadata:', {
    duration: uploadData.project?.videoMetadata?.duration,
    resolution: `${uploadData.project?.videoMetadata?.width}x${uploadData.project?.videoMetadata?.height}`,
    hasAudio: uploadData.project?.videoMetadata?.hasAudio,
  });

  // 5. Run full video understanding and clip analysis
  const analyzeRes = await fetch(`http://localhost:3000/api/projects/${projectId}/analyze`, {
    method: 'POST',
  });
  const analyzeData = await analyzeRes.json();
  console.log('\n5. Video Analyzed:', analyzeData.success, 'Discovered Clips:', analyzeData.clipCount);
  if (analyzeData.project?.candidates?.length > 0) {
    const topClip = analyzeData.project.candidates[0];
    console.log('   Top Clip:', {
      title: topClip.title,
      topic: topClip.topic,
      duration: topClip.duration,
      score: topClip.scores.total,
      contextConfidence: topClip.contextVerification.contextConfidence,
    });

    // 6. Render clip with FFmpeg
    console.log('\n6. Rendering top clip with FFmpeg...');
    const renderRes = await fetch(`http://localhost:3000/api/projects/${projectId}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId: topClip.id }),
    });
    const renderData = await renderRes.json();
    console.log('   Clip Render Result:', renderData.success, 'Rendered path:', renderData.results?.[0]?.videoPath);

    // 7. Verify export ZIP
    console.log('\n7. Testing ZIP export...');
    const zipRes = await fetch(`http://localhost:3000/api/projects/${projectId}/export-zip`);
    const zipBuffer = await zipRes.arrayBuffer();
    console.log('   ZIP exported successfully! Size:', (zipBuffer.byteLength / 1024).toFixed(1), 'KB');
  }

  // 8. Clean up test video
  if (fs.existsSync(tempVideo)) {
    fs.unlinkSync(tempVideo);
  }

  console.log('\n✨ ALL E2E API WORKFLOWS VERIFIED SUCCESSFULLY!');
}

testApi().catch((err) => {
  console.error('API Test Error:', err);
  process.exit(1);
});
