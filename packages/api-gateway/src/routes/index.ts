import { Router, Request, Response } from 'express';
import { authenticate, authorize, parentReadOnly } from '../middleware/auth';

const router = Router();

// --- Health check (public) ---
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// --- Homework routes (child only) ---
router.post('/api/homework/sessions', authenticate, authorize('child'), (_req, res) => {
  res.json({ message: 'proxy to homework-orchestrator: createSession' });
});
router.post('/api/homework/sessions/:sessionId/steps', authenticate, authorize('child'), (_req, res) => {
  res.json({ message: 'proxy to homework-orchestrator: submitStep' });
});
router.get('/api/homework/sessions/:sessionId/guidance', authenticate, authorize('child'), (_req, res) => {
  res.json({ message: 'proxy to homework-orchestrator: getNextGuidance' });
});
router.post('/api/homework/sessions/:sessionId/complete', authenticate, authorize('child'), (_req, res) => {
  res.json({ message: 'proxy to homework-orchestrator: completeSession' });
});

// --- Learning profile routes (child: full, parent: read-only per req 26.2) ---
router.get('/api/profiles/:childId', authenticate, authorize('child', 'parent'), (_req, res) => {
  res.json({ message: 'proxy to learning-profile-service: getProfile' });
});
router.get('/api/profiles/:childId/portrait', authenticate, authorize('child', 'parent'), (_req, res) => {
  res.json({ message: 'proxy to learning-profile-service: generateAbilityPortrait' });
});

// --- Reports routes (child: full, parent: read-only per req 26.2) ---
router.get('/api/reports/:childId', authenticate, authorize('child', 'parent'), (_req, res) => {
  res.json({ message: 'proxy to learning-profile-service: generateReport' });
});

// --- Error book routes (child: full, parent: read-only) ---
router.get('/api/errors/:childId', authenticate, authorize('child', 'parent'), (_req, res) => {
  res.json({ message: 'proxy to error-book-service: aggregateErrors' });
});
router.post('/api/errors/:childId/mastered', authenticate, authorize('child'), (_req, res) => {
  res.json({ message: 'proxy to error-book-service: markMastered' });
});

// --- Review routes (child only) ---
router.get('/api/reviews/:childId/today', authenticate, authorize('child'), (_req, res) => {
  res.json({ message: 'proxy to spaced-repetition-service: getTodayReviewList' });
});
router.post('/api/reviews/:reviewId/result', authenticate, authorize('child'), (_req, res) => {
  res.json({ message: 'proxy to spaced-repetition-service: submitReviewResult' });
});

// --- Learning plan routes (child: full, parent: read-only) ---
router.get('/api/plans/:childId', authenticate, authorize('child', 'parent'), (_req, res) => {
  res.json({ message: 'proxy to adaptive-engine: generateLearningPlan' });
});

// --- Notification routes (parent only) ---
router.get('/api/notifications', authenticate, authorize('parent'), (_req, res) => {
  res.json({ message: 'proxy to notification-service: getNotificationHistory' });
});

// --- Parent settings (parent only, write allowed for own settings) ---
router.put('/api/settings/:childId', authenticate, authorize('parent'), (_req, res) => {
  res.json({ message: 'proxy to learning-profile-service: updateChildSettings' });
});

export { router };
