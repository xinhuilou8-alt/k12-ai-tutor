import { OralRecordingService } from '../oral-recording-service';
import { AudioRecording, RecordingType } from '../types';

// ── Helpers ──────────────────────────────────────────────

function makeRecording(overrides: Partial<AudioRecording> = {}): Omit<AudioRecording, 'id' | 'childId'> {
  return {
    type: 'reading' as RecordingType,
    audioUrl: 'https://cdn.example.com/audio/test.mp3',
    duration: 60,
    score: 85,
    details: {
      fluencyScore: 80,
      accuracyScore: 90,
      missingWords: [],
      stutterCount: 1,
    },
    createdAt: new Date('2024-06-01T10:00:00Z'),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────

describe('OralRecordingService', () => {
  let service: OralRecordingService;

  beforeEach(() => {
    service = new OralRecordingService();
  });

  // ── saveRecording ──────────────────────────────────────

  describe('saveRecording', () => {
    it('saves a recording and returns an id', async () => {
      const id = await service.saveRecording('child1', makeRecording());
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('generates unique ids for each recording', async () => {
      const id1 = await service.saveRecording('child1', makeRecording());
      const id2 = await service.saveRecording('child1', makeRecording());
      expect(id1).not.toBe(id2);
    });

    it('rejects empty childId', async () => {
      await expect(service.saveRecording('', makeRecording())).rejects.toThrow('childId is required');
    });

    it('rejects empty audioUrl', async () => {
      await expect(
        service.saveRecording('child1', makeRecording({ audioUrl: '' })),
      ).rejects.toThrow('audioUrl is required');
    });

    it('rejects non-positive duration', async () => {
      await expect(
        service.saveRecording('child1', makeRecording({ duration: 0 })),
      ).rejects.toThrow('duration must be positive');
    });

    it('rejects score out of range', async () => {
      await expect(
        service.saveRecording('child1', makeRecording({ score: 101 })),
      ).rejects.toThrow('score must be 0-100');
      await expect(
        service.saveRecording('child1', makeRecording({ score: -1 })),
      ).rejects.toThrow('score must be 0-100');
    });
  });

  // ── getGrowthCollection ────────────────────────────────

  describe('getGrowthCollection', () => {
    it('returns empty array when no recordings exist', async () => {
      const result = await service.getGrowthCollection('child1');
      expect(result).toEqual([]);
    });

    it('returns only recordings for the specified child', async () => {
      await service.saveRecording('child1', makeRecording());
      await service.saveRecording('child2', makeRecording());

      const result = await service.getGrowthCollection('child1');
      expect(result).toHaveLength(1);
      expect(result[0].childId).toBe('child1');
    });

    it('filters by recording type', async () => {
      await service.saveRecording('child1', makeRecording({ type: 'reading' }));
      await service.saveRecording('child1', makeRecording({ type: 'recitation' }));

      const result = await service.getGrowthCollection('child1', { type: 'recitation' });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('recitation');
    });

    it('filters by date range', async () => {
      await service.saveRecording('child1', makeRecording({ createdAt: new Date('2024-01-01') }));
      await service.saveRecording('child1', makeRecording({ createdAt: new Date('2024-06-15') }));
      await service.saveRecording('child1', makeRecording({ createdAt: new Date('2024-12-01') }));

      const result = await service.getGrowthCollection('child1', {
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-07-01'),
      });
      expect(result).toHaveLength(1);
    });

    it('filters by contentId', async () => {
      await service.saveRecording('child1', makeRecording({ contentId: 'poem-1' }));
      await service.saveRecording('child1', makeRecording({ contentId: 'poem-2' }));

      const result = await service.getGrowthCollection('child1', { contentId: 'poem-1' });
      expect(result).toHaveLength(1);
    });

    it('returns results sorted by createdAt ascending', async () => {
      await service.saveRecording('child1', makeRecording({ createdAt: new Date('2024-06-15') }));
      await service.saveRecording('child1', makeRecording({ createdAt: new Date('2024-01-01') }));
      await service.saveRecording('child1', makeRecording({ createdAt: new Date('2024-03-10') }));

      const result = await service.getGrowthCollection('child1');
      expect(result[0].createdAt.getTime()).toBeLessThan(result[1].createdAt.getTime());
      expect(result[1].createdAt.getTime()).toBeLessThan(result[2].createdAt.getTime());
    });

    it('combines multiple filters', async () => {
      await service.saveRecording('child1', makeRecording({
        type: 'reading', createdAt: new Date('2024-06-15'), contentId: 'poem-1',
      }));
      await service.saveRecording('child1', makeRecording({
        type: 'recitation', createdAt: new Date('2024-06-15'), contentId: 'poem-1',
      }));
      await service.saveRecording('child1', makeRecording({
        type: 'reading', createdAt: new Date('2024-01-01'), contentId: 'poem-1',
      }));

      const result = await service.getGrowthCollection('child1', {
        type: 'reading',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-07-01'),
        contentId: 'poem-1',
      });
      expect(result).toHaveLength(1);
    });
  });

  // ── generateOralReport ─────────────────────────────────

  describe('generateOralReport', () => {
    const period = { start: new Date('2024-06-01'), end: new Date('2024-06-30') };

    it('returns empty report when no recordings in period', async () => {
      const report = await service.generateOralReport('child1', period);
      expect(report.totalRecordings).toBe(0);
      expect(report.averageProficiency).toBe(0);
      expect(report.fluencyTrend).toEqual([]);
      expect(report.byType).toEqual({});
    });

    it('computes correct averages', async () => {
      await service.saveRecording('child1', makeRecording({
        score: 80, duration: 60, createdAt: new Date('2024-06-05'),
        details: { fluencyScore: 70, accuracyScore: 90, missingWords: ['word1'], stutterCount: 2 },
      }));
      await service.saveRecording('child1', makeRecording({
        score: 90, duration: 40, createdAt: new Date('2024-06-10'),
        details: { fluencyScore: 85, accuracyScore: 95, missingWords: [], stutterCount: 0 },
      }));

      const report = await service.generateOralReport('child1', period);
      expect(report.totalRecordings).toBe(2);
      expect(report.averageProficiency).toBe(85); // (80+90)/2
      expect(report.averageStutterCount).toBe(1); // (2+0)/2
      // missingWordRate = 1 total missing word / 100 total seconds
      expect(report.averageMissingWordRate).toBe(0.01);
    });

    it('generates fluency trend in chronological order', async () => {
      await service.saveRecording('child1', makeRecording({
        createdAt: new Date('2024-06-20'),
        details: { fluencyScore: 90, accuracyScore: 95, missingWords: [], stutterCount: 0 },
      }));
      await service.saveRecording('child1', makeRecording({
        createdAt: new Date('2024-06-05'),
        details: { fluencyScore: 70, accuracyScore: 80, missingWords: [], stutterCount: 3 },
      }));

      const report = await service.generateOralReport('child1', period);
      expect(report.fluencyTrend).toHaveLength(2);
      expect(report.fluencyTrend[0].fluencyScore).toBe(70);
      expect(report.fluencyTrend[1].fluencyScore).toBe(90);
    });

    it('breaks down stats by recording type', async () => {
      await service.saveRecording('child1', makeRecording({
        type: 'reading', score: 80, createdAt: new Date('2024-06-05'),
        details: { fluencyScore: 75, accuracyScore: 85, missingWords: [], stutterCount: 1 },
      }));
      await service.saveRecording('child1', makeRecording({
        type: 'recitation', score: 70, createdAt: new Date('2024-06-10'),
        details: { fluencyScore: 65, accuracyScore: 75, missingWords: ['a'], stutterCount: 3 },
      }));

      const report = await service.generateOralReport('child1', period);
      expect(report.byType['reading']).toBeDefined();
      expect(report.byType['reading'].count).toBe(1);
      expect(report.byType['reading'].averageScore).toBe(80);
      expect(report.byType['recitation'].count).toBe(1);
      expect(report.byType['recitation'].averageScore).toBe(70);
    });

    it('excludes recordings outside the period', async () => {
      await service.saveRecording('child1', makeRecording({ createdAt: new Date('2024-05-01') }));
      await service.saveRecording('child1', makeRecording({ createdAt: new Date('2024-06-15') }));
      await service.saveRecording('child1', makeRecording({ createdAt: new Date('2024-07-15') }));

      const report = await service.generateOralReport('child1', period);
      expect(report.totalRecordings).toBe(1);
    });
  });

  // ── compareRecordings ──────────────────────────────────

  describe('compareRecordings', () => {
    it('computes positive deltas when later recording is better', () => {
      const earlier: AudioRecording = {
        id: 'r1', childId: 'child1', type: 'reading',
        audioUrl: 'url1', duration: 60, score: 70,
        details: { fluencyScore: 60, accuracyScore: 70, missingWords: ['a', 'b'], stutterCount: 5 },
        createdAt: new Date('2024-06-01'),
      };
      const later: AudioRecording = {
        id: 'r2', childId: 'child1', type: 'reading',
        audioUrl: 'url2', duration: 60, score: 90,
        details: { fluencyScore: 85, accuracyScore: 95, missingWords: [], stutterCount: 1 },
        createdAt: new Date('2024-06-15'),
      };

      const cmp = service.compareRecordings(earlier, later);
      expect(cmp.scoreDelta).toBe(20);
      expect(cmp.fluencyDelta).toBe(25);
      expect(cmp.accuracyDelta).toBe(25);
      expect(cmp.stutterDelta).toBe(-4);
      expect(cmp.missingWordsDelta).toBe(-2);
      expect(cmp.improved).toBe(true);
    });

    it('detects regression', () => {
      const earlier: AudioRecording = {
        id: 'r1', childId: 'child1', type: 'reading',
        audioUrl: 'url1', duration: 60, score: 90,
        details: { fluencyScore: 85, accuracyScore: 95, missingWords: [], stutterCount: 1 },
        createdAt: new Date('2024-06-01'),
      };
      const later: AudioRecording = {
        id: 'r2', childId: 'child1', type: 'reading',
        audioUrl: 'url2', duration: 60, score: 70,
        details: { fluencyScore: 60, accuracyScore: 70, missingWords: ['a'], stutterCount: 4 },
        createdAt: new Date('2024-06-15'),
      };

      const cmp = service.compareRecordings(earlier, later);
      expect(cmp.scoreDelta).toBe(-20);
      expect(cmp.improved).toBe(false);
    });

    it('auto-swaps if arguments are in wrong chronological order', () => {
      const earlier: AudioRecording = {
        id: 'r1', childId: 'child1', type: 'reading',
        audioUrl: 'url1', duration: 60, score: 70,
        details: { fluencyScore: 60, accuracyScore: 70, missingWords: [], stutterCount: 3 },
        createdAt: new Date('2024-06-01'),
      };
      const later: AudioRecording = {
        id: 'r2', childId: 'child1', type: 'reading',
        audioUrl: 'url2', duration: 60, score: 85,
        details: { fluencyScore: 80, accuracyScore: 90, missingWords: [], stutterCount: 1 },
        createdAt: new Date('2024-06-15'),
      };

      // Pass in reverse order
      const cmp = service.compareRecordings(later, earlier);
      expect(cmp.earlier.id).toBe('r1');
      expect(cmp.later.id).toBe('r2');
      expect(cmp.scoreDelta).toBe(15);
      expect(cmp.improved).toBe(true);
    });

    it('considers same score with fewer stutters as improved', () => {
      const earlier: AudioRecording = {
        id: 'r1', childId: 'child1', type: 'reading',
        audioUrl: 'url1', duration: 60, score: 80,
        details: { fluencyScore: 75, accuracyScore: 85, missingWords: [], stutterCount: 5 },
        createdAt: new Date('2024-06-01'),
      };
      const later: AudioRecording = {
        id: 'r2', childId: 'child1', type: 'reading',
        audioUrl: 'url2', duration: 60, score: 80,
        details: { fluencyScore: 78, accuracyScore: 82, missingWords: [], stutterCount: 2 },
        createdAt: new Date('2024-06-15'),
      };

      const cmp = service.compareRecordings(earlier, later);
      expect(cmp.scoreDelta).toBe(0);
      expect(cmp.improved).toBe(true);
    });
  });
});
