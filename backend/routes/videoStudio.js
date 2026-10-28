const express = require('express');
const router = express.Router();
const controller = require('../controllers/videoStudioController');
const { authenticate } = require('../middleware/auth');

// All Video Studio routes require authentication
router.use(authenticate);

router.get('/capabilities', controller.getCapabilities);
router.post('/storyboard', controller.generateStoryboard);
router.post('/generate', controller.createVideoJob);
router.get('/jobs', controller.listUserJobs);
router.get('/jobs/:jobId', controller.getJobStatus);
router.delete('/jobs/:jobId', controller.deleteJob);
router.post('/jobs/:jobId/regenerate', controller.regenerateJob);

module.exports = router;

