import {
  SandwichWritingModule,
  SandwichLayer,
  SandwichWritingSession,
  WritingFeedback,
  MIN_DRAFT_LENGTH,
} from '../sandwich-writing';

function createModule(): SandwichWritingModule {
  return new SandwichWritingModule();
}

const LONG_DRAFT = '今天阳光明媚，我和爸爸妈妈一起去了公园。公园里有很多花，红的、黄的、紫的，非常好看。我们在草地上铺了一块毯子，坐下来吃东西。';

describe('SandwichWritingModule', () => {
  describe('createSession', () => {
    it('creates a session at bread_1_ideation', () => {
      const mod = createModule();
      const session = mod.createSession('s1', 'child-1');

      expect(session.sessionId).toBe('s1');
      expect(session.childId).toBe('child-1');
      expect(session.currentLayer).toBe('bread_1_ideation');
      expect(session.isComplete).toBe(false);
    });

    it('throws on duplicate session id', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      expect(() => mod.createSession('s1', 'child-2')).toThrow('already exists');
    });
  });

  describe('layer enforcement — cannot skip layers', () => {
    it('cannot call getBrainstormHelp before submitIdeation', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      expect(() => mod.getBrainstormHelp('s1')).toThrow('Expected layer');
    });

    it('cannot call submitDraft before getBrainstormHelp', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      expect(() => mod.submitDraft('s1', LONG_DRAFT)).toThrow('Expected layer');
    });

    it('cannot call getFeedback before submitDraft', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');
      expect(() => mod.getFeedback('s1')).toThrow('Expected layer');
    });

    it('cannot call submitFinal before getFeedback', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');
      mod.submitDraft('s1', LONG_DRAFT);
      expect(() => mod.submitFinal('s1', '最终版')).toThrow('Expected layer');
    });

    it('cannot call submitIdeation twice', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      expect(() => mod.submitIdeation('s1', '夏天', '夏天很热')).toThrow('Expected layer');
    });
  });

  describe('submitIdeation', () => {
    it('transitions from bread_1 to filling_1 with topic and idea', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      const session = mod.submitIdeation('s1', '我的小狗', '小狗是我最好的朋友');

      expect(session.currentLayer).toBe('filling_1_brainstorm');
      expect(session.topic).toBe('我的小狗');
      expect(session.coreIdea).toBe('小狗是我最好的朋友');
    });

    it('trims whitespace from topic and idea', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      const session = mod.submitIdeation('s1', '  春天  ', '  春天很美  ');

      expect(session.topic).toBe('春天');
      expect(session.coreIdea).toBe('春天很美');
    });

    it('rejects empty topic', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      expect(() => mod.submitIdeation('s1', '', '有想法')).toThrow('Topic cannot be empty');
    });

    it('rejects empty core idea', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      expect(() => mod.submitIdeation('s1', '春天', '')).toThrow('Core idea cannot be empty');
    });
  });

  describe('getBrainstormHelp', () => {
    it('generates outline and expansion ideas, transitions to bread_2', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      const session = mod.getBrainstormHelp('s1');

      expect(session.currentLayer).toBe('bread_2_draft');
      expect(session.aiOutline).toBeDefined();
      expect(session.aiOutline!.length).toBeGreaterThan(0);
      expect(session.expansionIdeas).toBeDefined();
      expect(session.expansionIdeas!.length).toBeGreaterThan(0);
    });

    it('outline references the topic and core idea', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '我的小狗', '忠诚的伙伴');
      const session = mod.getBrainstormHelp('s1');

      const outlineText = session.aiOutline!.join(' ');
      expect(outlineText).toContain('我的小狗');
      expect(outlineText).toContain('忠诚的伙伴');
    });
  });

  describe('submitDraft', () => {
    it('accepts draft ≥50 chars and transitions to filling_2', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');
      const session = mod.submitDraft('s1', LONG_DRAFT);

      expect(session.currentLayer).toBe('filling_2_feedback');
      expect(session.childDraft).toBe(LONG_DRAFT);
    });

    it('rejects draft shorter than 50 characters', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');

      expect(() => mod.submitDraft('s1', '太短了')).toThrow(`at least ${MIN_DRAFT_LENGTH}`);
    });

    it('rejects draft of exactly 49 characters', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');

      const shortDraft = 'a'.repeat(49);
      expect(() => mod.submitDraft('s1', shortDraft)).toThrow(`at least ${MIN_DRAFT_LENGTH}`);
    });

    it('accepts draft of exactly 50 characters', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');

      const exactDraft = 'a'.repeat(50);
      const session = mod.submitDraft('s1', exactDraft);
      expect(session.currentLayer).toBe('filling_2_feedback');
    });
  });

  describe('getFeedback', () => {
    it('generates feedback and transitions to bread_3', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');
      mod.submitDraft('s1', LONG_DRAFT);
      const session = mod.getFeedback('s1');

      expect(session.currentLayer).toBe('bread_3_finalize');
      expect(session.aiFeedback).toBeDefined();
      const fb = session.aiFeedback!;
      expect(fb.contentSuggestions.length).toBeGreaterThan(0);
      expect(fb.structureSuggestions.length).toBeGreaterThan(0);
      expect(fb.languageSuggestions.length).toBeGreaterThan(0);
      expect(fb.overallComment).toBeTruthy();
    });

    it('feedback contains only suggestions, not complete rewritten sentences', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');
      mod.submitDraft('s1', LONG_DRAFT);
      const session = mod.getFeedback('s1');

      const fb = session.aiFeedback!;
      const allSuggestions = [
        ...fb.contentSuggestions,
        ...fb.structureSuggestions,
        ...fb.languageSuggestions,
      ];
      // Suggestions should be directive/advisory, not full paragraph rewrites
      for (const s of allSuggestions) {
        expect(s.length).toBeLessThan(200);
      }
    });

    it('provides synonym replacements for common words', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');
      const draftWithCommonWords = '今天天气很好，公园里的花很多，颜色很好看。我很高兴能和家人一起出来玩，公园很大，风景也很好看。我们在草地上坐了很久。';
      mod.submitDraft('s1', draftWithCommonWords);
      const session = mod.getFeedback('s1');

      const fb = session.aiFeedback!;
      expect(fb.synonymReplacements.length).toBeGreaterThan(0);
      for (const r of fb.synonymReplacements) {
        expect(r.original).toBeTruthy();
        expect(r.alternatives.length).toBeGreaterThan(0);
      }
    });

    it('suggests rhetoric when draft lacks it', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');
      // Draft without any rhetorical devices
      const plainDraft = '今天我去了公园。公园里有花有草。我在草地上玩了一会儿。然后我们就回家了。天气不错，心情也不错。这是快乐的一天。';
      mod.submitDraft('s1', plainDraft);
      const session = mod.getFeedback('s1');

      const fb = session.aiFeedback!;
      const langText = fb.languageSuggestions.join(' ');
      expect(langText).toContain('比喻');
    });
  });

  describe('submitFinal', () => {
    it('completes the session', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');
      mod.submitDraft('s1', LONG_DRAFT);
      mod.getFeedback('s1');
      const session = mod.submitFinal('s1', '这是我修改后的最终版本，加入了更多细节描写。');

      expect(session.isComplete).toBe(true);
      expect(session.finalDraft).toBe('这是我修改后的最终版本，加入了更多细节描写。');
    });

    it('rejects empty final text', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');
      mod.submitDraft('s1', LONG_DRAFT);
      mod.getFeedback('s1');

      expect(() => mod.submitFinal('s1', '')).toThrow('Final text cannot be empty');
    });

    it('rejects whitespace-only final text', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');
      mod.submitDraft('s1', LONG_DRAFT);
      mod.getFeedback('s1');

      expect(() => mod.submitFinal('s1', '   ')).toThrow('Final text cannot be empty');
    });
  });

  describe('getState', () => {
    it('returns a snapshot of current session', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');

      const state = mod.getState('s1');
      expect(state.sessionId).toBe('s1');
      expect(state.topic).toBe('春天');
      expect(state.currentLayer).toBe('filling_1_brainstorm');
    });

    it('throws for non-existent session', () => {
      const mod = createModule();
      expect(() => mod.getState('nope')).toThrow('not found');
    });

    it('returns a copy, not a reference', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      const state1 = mod.getState('s1');
      mod.submitIdeation('s1', '春天', '春天很美');
      const state2 = mod.getState('s1');

      expect(state1.currentLayer).toBe('bread_1_ideation');
      expect(state2.currentLayer).toBe('filling_1_brainstorm');
    });
  });

  describe('completed session is locked', () => {
    it('cannot perform any action on a completed session', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.submitIdeation('s1', '春天', '春天很美');
      mod.getBrainstormHelp('s1');
      mod.submitDraft('s1', LONG_DRAFT);
      mod.getFeedback('s1');
      mod.submitFinal('s1', '最终版');

      expect(() => mod.submitIdeation('s1', 'x', 'y')).toThrow('already complete');
      expect(() => mod.getBrainstormHelp('s1')).toThrow('already complete');
      expect(() => mod.submitDraft('s1', LONG_DRAFT)).toThrow('already complete');
      expect(() => mod.getFeedback('s1')).toThrow('already complete');
      expect(() => mod.submitFinal('s1', 'again')).toThrow('already complete');
    });
  });

  describe('full five-layer flow', () => {
    it('completes the entire sandwich writing process', () => {
      const mod = createModule();

      // Layer 1: bread — child picks topic
      const s1 = mod.createSession('s1', 'child-1');
      expect(s1.currentLayer).toBe('bread_1_ideation');

      // Layer 1 → 2: child submits ideation
      const s2 = mod.submitIdeation('s1', '我的小猫', '小猫给我带来了快乐');
      expect(s2.currentLayer).toBe('filling_1_brainstorm');
      expect(s2.topic).toBe('我的小猫');

      // Layer 2: filling — AI brainstorms
      const s3 = mod.getBrainstormHelp('s1');
      expect(s3.currentLayer).toBe('bread_2_draft');
      expect(s3.aiOutline!.length).toBeGreaterThan(0);

      // Layer 3: bread — child writes draft
      const draft = '我家有一只小猫，它的名字叫咪咪。咪咪有一身雪白的毛，两只眼睛像两颗蓝宝石。每天放学回家，咪咪都会在门口等我，看到我就喵喵叫。';
      const s4 = mod.submitDraft('s1', draft);
      expect(s4.currentLayer).toBe('filling_2_feedback');
      expect(s4.childDraft).toBe(draft);

      // Layer 4: filling — AI gives feedback
      const s5 = mod.getFeedback('s1');
      expect(s5.currentLayer).toBe('bread_3_finalize');
      expect(s5.aiFeedback).toBeDefined();

      // Layer 5: bread — child finalizes
      const finalText = draft + '我非常喜欢咪咪，它是我最好的朋友。';
      const s6 = mod.submitFinal('s1', finalText);
      expect(s6.isComplete).toBe(true);
      expect(s6.finalDraft).toBe(finalText);
    });
  });

  describe('multiple independent sessions', () => {
    it('manages multiple sessions independently', () => {
      const mod = createModule();
      mod.createSession('s1', 'child-1');
      mod.createSession('s2', 'child-2');

      mod.submitIdeation('s1', '春天', '春天很美');
      // s2 should still be at bread_1
      expect(mod.getState('s2').currentLayer).toBe('bread_1_ideation');
      expect(mod.getState('s1').currentLayer).toBe('filling_1_brainstorm');
    });
  });
});
