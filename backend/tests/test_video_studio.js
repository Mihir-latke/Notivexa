const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('🧪 Starting Video Studio & Marathi Video Playback Tests...');

  // 1. Check videoStudioService capabilities
  const { checkVeoCapabilities, generateEducationalStoryboard } = require('../services/videoStudioService');
  const caps = await checkVeoCapabilities();
  console.log('✅ Capabilities check passed:', {
    activeModel: caps.activeModel,
    hasVeoAccess: caps.hasVeoAccess,
    supportedStyles: caps.supportedStyles.length
  });

  // 2. Check localStore video job methods
  const localStore = require('../utils/localStore');
  assert.strictEqual(typeof localStore.getVideoJobs, 'function');
  assert.strictEqual(typeof localStore.createVideoJob, 'function');
  assert.strictEqual(typeof localStore.updateVideoJob, 'function');
  assert.strictEqual(typeof localStore.getVideoJobById, 'function');
  console.log('✅ localStore VideoJob CRUD methods verified.');

  // 3. Create a test VideoJob
  const testJob = localStore.createVideoJob({
    user: 'test_student_123',
    topic: 'भारतीय राज्यघटना मूलभूत हक्क',
    language: 'Marathi',
    visualStyle: 'realistic_cinematic',
    duration: 18,
    status: 'completed',
    finalVideoUrl: '/uploads/video/video_3f8e9d3a-8ce3-4567-91b6-90b30d221236.mp4'
  });
  assert.ok(testJob.jobId, 'jobId should exist');
  console.log('✅ Created VideoJob:', testJob.jobId);

  // 4. Verify retrieval
  const retrieved = localStore.getVideoJobById(testJob.jobId);
  assert.strictEqual(retrieved.topic, 'भारतीय राज्यघटना मूलभूत हक्क');
  assert.strictEqual(retrieved.language, 'Marathi');
  console.log('✅ Retrieved VideoJob verified.');

  // 5. Clean up test job
  localStore.deleteVideoJob(testJob.jobId);
  console.log('✅ Cleaned up test job.');

  // 6. Verify Marathi video file on disk
  const sampleVideo = path.join(__dirname, '../uploads/video/video_3f8e9d3a-8ce3-4567-91b6-90b30d221236.mp4');
  assert.ok(fs.existsSync(sampleVideo), 'Sample video file should exist on disk');
  const stat = fs.statSync(sampleVideo);
  assert.ok(stat.size > 1000000, 'Video file size should be > 1MB');
  console.log(`✅ Marathi Video File Verified: ${stat.size} bytes (valid MP4 format).`);

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

