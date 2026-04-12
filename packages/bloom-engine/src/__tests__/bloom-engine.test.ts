import { BloomTagger } from '../bloom-tagger';
import { BloomProgressionEngine } from '../bloom-progression';
import { BloomMasteryTracker } from '../bloom-mastery-tracker';

describe('BloomTagger', () => {
  const tagger = new BloomTagger();

  it('tags content with "recall" keyword as remember', () => {
    expect(tagger.tag('Please recall the definition')).toBe('remember');
  });

  it('tags content with "explain" keyword as understand', () => {
    expect(tagger.tag('Explain the concept in your own words')).toBe('understand');
  });

  it('tags content with "apply" keyword as apply', () => {
    expect(tagger.tag('Apply the formula to solve this problem')).toBe('apply');
  });

  it('tags content with "analyze" keyword as analyze', () => {
    expect(tagger.tag('Analyze the differences between these two methods')).toBe('analyze');
  });

  it('tags content with "evaluate" keyword as evaluate', () => {
    expect(tagger.tag('Evaluate the effectiveness of this approach')).toBe('evaluate');
  });

  it('tags content with "create" keyword as create', () => {
    expect(tagger.tag('Create a new solution for this problem')).toBe('create');
  });

  it('tags Chinese content with 记忆 as remember', () => {
    expect(tagger.tag('请记忆这些生字词')).toBe('remember');
  });

  it('tags Chinese content with 分析 as analyze', () => {
    expect(tagger.tag('分析这篇文章的主题')).toBe('analyze');
  });

  it('defaults to remember when no keywords match', () => {
    expect(tagger.tag('hello world')).toBe('remember');
  });

  it('prefers higher cognitive level on tie', () => {
    // "explain" (understand) and "analyze" (analyze) both have 1 match
    const result = tagger.tag('explain and analyze');
    expect(result).toBe('analyze');
  });

  it('tagBatch processes multiple items', () => {
    const results = tagger.tagBatch(['recall this', 'create something new']);
    expect(results).toEqual(['remember', 'create']);
  });

  it('getLevelsOrdered returns all 6 levels in order', () => {
    const levels = BloomTagger.getLevelsOrdered();
    expect(levels).toEqual([
      'remember', 'understand', 'apply', 'analyze', 'evaluate', 'create',
    ]);
  });

  it('getLevelIndex returns correct indices', () => {
    expect(BloomTagger.getLevelIndex('remember')).toBe(0);
    expect(BloomTagger.getLevelIndex('create')).toBe(5);
  });
});

describe('BloomProgressionEngine', () => {
  let engine: BloomProgressionEngine;

  beforeEach(() => {
    engine = new BloomProgressionEngine(3);
  });

  it('starts at remember level', () => {
    const state = engine.getState('child1', 'kp1');
    expect(state.currentLevel).toBe('remember');
    expect(state.consecutiveCorrect).toBe(0);
  });

  it('does not advance before reaching stability threshold', () => {
    const r1 = engine.recordPerformance('child1', 'kp1', true);
    expect(r1.shouldAdvance).toBe(false);
    expect(r1.currentLevel).toBe('remember');

    const r2 = engine.recordPerformance('child1', 'kp1', true);
    expect(r2.shouldAdvance).toBe(false);
  });

  it('advances after 3 consecutive correct answers', () => {
    engine.recordPerformance('child1', 'kp1', true);
    engine.recordPerformance('child1', 'kp1', true);
    const result = engine.recordPerformance('child1', 'kp1', true);

    expect(result.shouldAdvance).toBe(true);
    expect(result.currentLevel).toBe('understand');
    expect(result.followUpQuestion).toBeTruthy();
  });

  it('resets consecutive count on incorrect answer', () => {
    engine.recordPerformance('child1', 'kp1', true);
    engine.recordPerformance('child1', 'kp1', true);
    engine.recordPerformance('child1', 'kp1', false); // reset

    const state = engine.getState('child1', 'kp1');
    expect(state.consecutiveCorrect).toBe(0);
    expect(state.currentLevel).toBe('remember');
  });

  it('progresses through multiple levels', () => {
    // remember -> understand
    for (let i = 0; i < 3; i++) engine.recordPerformance('c1', 'kp1', true);
    // understand -> apply
    for (let i = 0; i < 3; i++) engine.recordPerformance('c1', 'kp1', true);
    // apply -> analyze
    for (let i = 0; i < 3; i++) engine.recordPerformance('c1', 'kp1', true);

    const state = engine.getState('c1', 'kp1');
    expect(state.currentLevel).toBe('analyze');
  });

  it('does not advance beyond create level', () => {
    // Advance through all levels
    for (let level = 0; level < 5; level++) {
      for (let i = 0; i < 3; i++) engine.recordPerformance('c1', 'kp1', true);
    }
    const state = engine.getState('c1', 'kp1');
    expect(state.currentLevel).toBe('create');

    // More correct answers should not crash or advance further
    const result = engine.recordPerformance('c1', 'kp1', true);
    expect(result.shouldAdvance).toBe(false);
    expect(result.nextLevel).toBeNull();
  });

  it('tracks separate states per child and knowledge point', () => {
    engine.recordPerformance('c1', 'kp1', true);
    engine.recordPerformance('c2', 'kp1', true);
    engine.recordPerformance('c2', 'kp1', true);

    expect(engine.getState('c1', 'kp1').consecutiveCorrect).toBe(1);
    expect(engine.getState('c2', 'kp1').consecutiveCorrect).toBe(2);
  });

  it('reset clears state', () => {
    engine.recordPerformance('c1', 'kp1', true);
    engine.reset('c1', 'kp1');
    const state = engine.getState('c1', 'kp1');
    expect(state.currentLevel).toBe('remember');
    expect(state.consecutiveCorrect).toBe(0);
  });
});

describe('BloomMasteryTracker', () => {
  let tracker: BloomMasteryTracker;

  beforeEach(() => {
    tracker = new BloomMasteryTracker();
  });

  it('returns all zeros for unknown child/knowledge point', () => {
    const dist = tracker.getMasteryDistribution('c1', 'kp1');
    expect(dist.remember).toBe(0);
    expect(dist.create).toBe(0);
  });

  it('updates mastery based on correct answers', () => {
    tracker.updateMastery('c1', 'kp1', 'remember', true);
    tracker.updateMastery('c1', 'kp1', 'remember', true);

    const dist = tracker.getMasteryDistribution('c1', 'kp1');
    expect(dist.remember).toBe(100); // 2/2
  });

  it('updates mastery based on mixed results', () => {
    tracker.updateMastery('c1', 'kp1', 'apply', true);
    tracker.updateMastery('c1', 'kp1', 'apply', false);
    tracker.updateMastery('c1', 'kp1', 'apply', true);

    const dist = tracker.getMasteryDistribution('c1', 'kp1');
    expect(dist.apply).toBe(67); // round(2/3 * 100)
  });

  it('tracks different bloom levels independently', () => {
    tracker.updateMastery('c1', 'kp1', 'remember', true);
    tracker.updateMastery('c1', 'kp1', 'understand', false);

    const dist = tracker.getMasteryDistribution('c1', 'kp1');
    expect(dist.remember).toBe(100);
    expect(dist.understand).toBe(0);
  });

  it('getEntry returns null for unknown entries', () => {
    expect(tracker.getEntry('c1', 'kp1')).toBeNull();
  });

  it('getEntry returns attempt counts', () => {
    tracker.updateMastery('c1', 'kp1', 'analyze', true);
    tracker.updateMastery('c1', 'kp1', 'analyze', false);

    const entry = tracker.getEntry('c1', 'kp1');
    expect(entry).not.toBeNull();
    expect(entry!.totalAttempts.analyze).toBe(2);
    expect(entry!.correctAttempts.analyze).toBe(1);
    expect(entry!.bloomMastery.analyze).toBe(50);
  });

  it('tracks separate entries per child and knowledge point', () => {
    tracker.updateMastery('c1', 'kp1', 'remember', true);
    tracker.updateMastery('c1', 'kp2', 'remember', false);

    expect(tracker.getMasteryDistribution('c1', 'kp1').remember).toBe(100);
    expect(tracker.getMasteryDistribution('c1', 'kp2').remember).toBe(0);
  });
});
