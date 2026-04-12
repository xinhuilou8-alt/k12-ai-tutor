import {
  EnhancedFeynmanModule,
  AIStudentPersona,
  FeynmanPhase,
  AIStudentProfile,
  TeachingScore,
  EnhancedFeynmanSession,
} from '../feynman-enhanced';

describe('EnhancedFeynmanModule', () => {
  let mod: EnhancedFeynmanModule;

  beforeEach(() => {
    mod = new EnhancedFeynmanModule();
  });

  // ===== getPersonas =====

  describe('getPersonas', () => {
    it('returns all 4 AI student personas', () => {
      const personas = mod.getPersonas();
      expect(personas).toHaveLength(4);
      const names = personas.map(p => p.persona);
      expect(names).toContain('curious_baby');
      expect(names).toContain('diligent_student');
      expect(names).toContain('rigorous_scholar');
      expect(names).toContain('confused_bug');
    });

    it('each persona has required fields', () => {
      const personas = mod.getPersonas();
      for (const p of personas) {
        expect(p.persona).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.gradeRange).toBeTruthy();
        expect(p.description).toBeTruthy();
        expect(p.questionStyle).toBeTruthy();
        expect(p.openingLine).toBeTruthy();
      }
    });

    it('personas have Chinese names', () => {
      const personas = mod.getPersonas();
      expect(personas.find(p => p.persona === 'curious_baby')!.name).toBe('好奇宝宝');
      expect(personas.find(p => p.persona === 'diligent_student')!.name).toBe('认真同学');
      expect(personas.find(p => p.persona === 'rigorous_scholar')!.name).toBe('较真学霸');
      expect(personas.find(p => p.persona === 'confused_bug')!.name).toBe('糊涂虫');
    });
  });

  // ===== getPersonaForGrade =====

  describe('getPersonaForGrade', () => {
    it('returns curious_baby for grades 1-2', () => {
      expect(mod.getPersonaForGrade(1).persona).toBe('curious_baby');
      expect(mod.getPersonaForGrade(2).persona).toBe('curious_baby');
    });

    it('returns diligent_student for grades 3-4', () => {
      expect(mod.getPersonaForGrade(3).persona).toBe('diligent_student');
      expect(mod.getPersonaForGrade(4).persona).toBe('diligent_student');
    });

    it('returns rigorous_scholar for grades 5+', () => {
      expect(mod.getPersonaForGrade(5).persona).toBe('rigorous_scholar');
      expect(mod.getPersonaForGrade(6).persona).toBe('rigorous_scholar');
    });
  });

  // ===== createSession =====

  describe('createSession', () => {
    it('creates a session with specified persona', () => {
      const { session, openingLine } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '分数加法',
        persona: 'curious_baby',
      });

      expect(session.sessionId).toBeTruthy();
      expect(session.childId).toBe('child1');
      expect(session.knowledgePoint).toBe('分数加法');
      expect(session.persona).toBe('curious_baby');
      expect(session.currentPhase).toBe('initial_explain');
      expect(session.isComplete).toBe(false);
      expect(openingLine).toContain('分数加法');
    });

    it('auto-selects persona based on grade when not specified', () => {
      const { session } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '乘法',
        childGrade: 1,
      });
      expect(session.persona).toBe('curious_baby');

      const { session: s2 } = mod.createSession({
        childId: 'child2',
        knowledgePoint: '乘法',
        childGrade: 5,
      });
      expect(s2.persona).toBe('rigorous_scholar');
    });

    it('defaults to diligent_student when no grade or persona given', () => {
      const { session } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '面积',
      });
      expect(session.persona).toBe('diligent_student');
    });

    it('includes opening line in exchanges', () => {
      const { session } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '三角形',
        persona: 'rigorous_scholar',
      });
      expect(session.exchanges).toHaveLength(1);
      expect(session.exchanges[0].role).toBe('ai_student');
      expect(session.exchanges[0].phase).toBe('initial_explain');
      expect(session.exchanges[0].text).toContain('三角形');
    });

    it('initializes all phases as not completed', () => {
      const { session } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '除法',
      });
      expect(session.phaseCompleted.initial_explain).toBe(false);
      expect(session.phaseCompleted.probing).toBe(false);
      expect(session.phaseCompleted.deliberate_misunderstand).toBe(false);
      expect(session.phaseCompleted.summary).toBe(false);
    });

    it('generates unique session IDs', () => {
      const { session: s1 } = mod.createSession({ childId: 'c1', knowledgePoint: 'kp1' });
      const { session: s2 } = mod.createSession({ childId: 'c1', knowledgePoint: 'kp2' });
      expect(s1.sessionId).not.toBe(s2.sessionId);
    });
  });


  // ===== submitExplanation =====

  describe('submitExplanation', () => {
    let sessionId: string;

    beforeEach(() => {
      const { session } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '分数',
        persona: 'curious_baby',
      });
      sessionId = session.sessionId;
    });

    it('records child explanation and AI response', () => {
      const { response, session } = mod.submitExplanation(sessionId, '分数就是把东西分成几份');
      expect(response).toBeTruthy();
      // opening + child + AI response = 3
      expect(session.exchanges).toHaveLength(3);
      expect(session.exchanges[1].role).toBe('child');
      expect(session.exchanges[1].text).toBe('分数就是把东西分成几份');
      expect(session.exchanges[2].role).toBe('ai_student');
    });

    it('AI response is in Chinese', () => {
      const { response } = mod.submitExplanation(sessionId, '分数就是把东西分成几份');
      // Chinese characters present
      expect(/[\u4e00-\u9fff]/.test(response)).toBe(true);
    });

    it('curious_baby asks for examples when none given', () => {
      const { response } = mod.submitExplanation(sessionId, '分数就是把东西分成几份');
      expect(response).toContain('例子');
    });

    it('curious_baby responds differently when examples are given', () => {
      const { response } = mod.submitExplanation(sessionId, '分数就是把东西分成几份，比如一个蛋糕分成4份');
      expect(response).toContain('为什么');
    });

    it('throws when session does not exist', () => {
      expect(() => mod.submitExplanation('nonexistent', 'text')).toThrow('会话不存在');
    });

    it('throws when session is complete', () => {
      // Fast-forward to completion
      mod.submitExplanation(sessionId, '解释');
      mod.advancePhase(sessionId);
      mod.submitExplanation(sessionId, '更多解释');
      mod.advancePhase(sessionId);
      mod.generateMisunderstanding(sessionId);
      mod.submitCorrection(sessionId, '不对，应该是这样的，因为...');
      mod.requestSummary(sessionId);
      mod.submitSummary(sessionId, '总结：分数就是...');

      expect(() => mod.submitExplanation(sessionId, 'more')).toThrow('会话已结束');
    });

    it('throws when in deliberate_misunderstand phase', () => {
      mod.submitExplanation(sessionId, '解释');
      mod.advancePhase(sessionId);
      mod.submitExplanation(sessionId, '更多解释');
      mod.advancePhase(sessionId);

      expect(() => mod.submitExplanation(sessionId, 'text')).toThrow('submitCorrection');
    });

    it('throws when in summary phase', () => {
      mod.submitExplanation(sessionId, '解释');
      mod.advancePhase(sessionId);
      mod.submitExplanation(sessionId, '更多解释');
      mod.advancePhase(sessionId);
      mod.generateMisunderstanding(sessionId);
      mod.submitCorrection(sessionId, '不对');
      mod.requestSummary(sessionId);

      expect(() => mod.submitExplanation(sessionId, 'text')).toThrow('submitSummary');
    });
  });

  // ===== Persona-specific responses =====

  describe('persona-specific responses', () => {
    it('diligent_student asks for examples', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: '面积',
        persona: 'diligent_student',
      });
      const { response } = mod.submitExplanation(session.sessionId, '面积就是一个图形占多大的地方');
      expect(response).toContain('例子');
    });

    it('rigorous_scholar challenges with edge cases', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: '面积',
        persona: 'rigorous_scholar',
      });
      const { response } = mod.submitExplanation(session.sessionId, '面积就是长乘以宽');
      expect(response).toMatch(/如果|特殊/);
    });

    it('confused_bug shows confusion', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: '面积',
        persona: 'confused_bug',
      });
      const { response } = mod.submitExplanation(session.sessionId, '面积就是长乘以宽');
      expect(response).toMatch(/搞混|再说一遍/);
    });
  });

  // ===== advancePhase =====

  describe('advancePhase', () => {
    let sessionId: string;

    beforeEach(() => {
      const { session } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '分数',
        persona: 'diligent_student',
      });
      sessionId = session.sessionId;
    });

    it('advances from initial_explain to probing', () => {
      mod.submitExplanation(sessionId, '分数就是...');
      const { newPhase, message } = mod.advancePhase(sessionId);
      expect(newPhase).toBe('probing');
      expect(message).toContain('分数');
    });

    it('advances from probing to deliberate_misunderstand', () => {
      mod.submitExplanation(sessionId, '解释');
      mod.advancePhase(sessionId);
      mod.submitExplanation(sessionId, '更多解释');
      const { newPhase } = mod.advancePhase(sessionId);
      expect(newPhase).toBe('deliberate_misunderstand');
    });

    it('advances from deliberate_misunderstand to summary', () => {
      mod.submitExplanation(sessionId, '解释');
      mod.advancePhase(sessionId);
      mod.submitExplanation(sessionId, '更多解释');
      mod.advancePhase(sessionId);
      mod.generateMisunderstanding(sessionId);
      mod.submitCorrection(sessionId, '不对，应该是...');
      const { newPhase } = mod.advancePhase(sessionId);
      expect(newPhase).toBe('summary');
    });

    it('throws when trying to advance past summary', () => {
      mod.submitExplanation(sessionId, '解释');
      mod.advancePhase(sessionId);
      mod.submitExplanation(sessionId, '更多');
      mod.advancePhase(sessionId);
      mod.generateMisunderstanding(sessionId);
      mod.submitCorrection(sessionId, '不对');
      mod.advancePhase(sessionId);
      // Now in summary, submit summary text
      mod.submitSummary(sessionId, '总结');
      // Session is complete, can't advance
      expect(() => mod.advancePhase(sessionId)).toThrow('会话已结束');
    });

    it('throws when no child exchange in current phase', () => {
      // No explanation submitted yet
      expect(() => mod.advancePhase(sessionId)).toThrow('至少完成一次交流');
    });

    it('marks current phase as completed', () => {
      mod.submitExplanation(sessionId, '解释');
      mod.advancePhase(sessionId);
      const state = mod.getSessionState(sessionId);
      expect(state.phaseCompleted.initial_explain).toBe(true);
    });

    it('adds transition message to exchanges', () => {
      mod.submitExplanation(sessionId, '解释');
      const beforeCount = mod.getSessionState(sessionId).exchanges.length;
      mod.advancePhase(sessionId);
      const afterCount = mod.getSessionState(sessionId).exchanges.length;
      expect(afterCount).toBe(beforeCount + 1);
    });
  });

  // ===== generateMisunderstanding =====

  describe('generateMisunderstanding', () => {
    let sessionId: string;

    beforeEach(() => {
      const { session } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '光合作用',
        persona: 'curious_baby',
      });
      sessionId = session.sessionId;
      mod.submitExplanation(sessionId, '光合作用就是植物用阳光制造食物');
      mod.advancePhase(sessionId);
      mod.submitExplanation(sessionId, '因为植物需要阳光和水');
      mod.advancePhase(sessionId);
    });

    it('generates a deliberate misunderstanding', () => {
      const { misunderstanding } = mod.generateMisunderstanding(sessionId);
      expect(misunderstanding).toBeTruthy();
      expect(misunderstanding).toContain('光合作用');
    });

    it('adds misunderstanding to exchanges', () => {
      const before = mod.getSessionState(sessionId).exchanges.length;
      mod.generateMisunderstanding(sessionId);
      const after = mod.getSessionState(sessionId).exchanges.length;
      expect(after).toBe(before + 1);
    });

    it('throws when not in deliberate_misunderstand phase', () => {
      const { session: s2 } = mod.createSession({
        childId: 'c2',
        knowledgePoint: 'kp',
        persona: 'diligent_student',
      });
      expect(() => mod.generateMisunderstanding(s2.sessionId)).toThrow('纠错引导');
    });

    it('each persona has distinct misunderstanding style', () => {
      // Test with different personas
      const personas: AIStudentPersona[] = ['curious_baby', 'diligent_student', 'rigorous_scholar', 'confused_bug'];
      const misunderstandings: string[] = [];

      for (const persona of personas) {
        const m = new EnhancedFeynmanModule();
        const { session } = m.createSession({ childId: 'c', knowledgePoint: '重力', persona });
        m.submitExplanation(session.sessionId, '重力就是地球吸引物体的力');
        m.advancePhase(session.sessionId);
        m.submitExplanation(session.sessionId, '因为地球有质量');
        m.advancePhase(session.sessionId);
        const { misunderstanding } = m.generateMisunderstanding(session.sessionId);
        misunderstandings.push(misunderstanding);
      }

      // All should be different
      const unique = new Set(misunderstandings);
      expect(unique.size).toBe(4);
    });
  });


  // ===== submitCorrection =====

  describe('submitCorrection', () => {
    let sessionId: string;

    beforeEach(() => {
      const { session } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '光合作用',
        persona: 'diligent_student',
      });
      sessionId = session.sessionId;
      mod.submitExplanation(sessionId, '光合作用就是植物用阳光制造食物');
      mod.advancePhase(sessionId);
      mod.submitExplanation(sessionId, '因为植物需要阳光和水');
      mod.advancePhase(sessionId);
      mod.generateMisunderstanding(sessionId);
    });

    it('accepts correction with clear error identification', () => {
      const { response } = mod.submitCorrection(
        sessionId,
        '不对，光合作用不是随便来的，应该是植物利用阳光、水和二氧化碳来制造养分',
      );
      expect(response).toContain('纠正');
    });

    it('asks for more detail when correction is too brief', () => {
      const { response } = mod.submitCorrection(sessionId, '不对');
      expect(response).toContain('详细');
    });

    it('asks child to identify the error when no correction markers found', () => {
      const { response } = mod.submitCorrection(sessionId, '嗯嗯');
      expect(response).toContain('不对');
    });

    it('records correction in exchanges', () => {
      mod.submitCorrection(sessionId, '不对，应该是...');
      const state = mod.getSessionState(sessionId);
      const childCorrections = state.exchanges.filter(
        e => e.role === 'child' && e.phase === 'deliberate_misunderstand',
      );
      expect(childCorrections.length).toBeGreaterThanOrEqual(1);
    });

    it('throws when not in deliberate_misunderstand phase', () => {
      const { session: s2 } = mod.createSession({
        childId: 'c2',
        knowledgePoint: 'kp',
      });
      expect(() => mod.submitCorrection(s2.sessionId, 'text')).toThrow('纠错引导');
    });
  });

  // ===== requestSummary =====

  describe('requestSummary', () => {
    let sessionId: string;

    beforeEach(() => {
      const { session } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '分数',
        persona: 'diligent_student',
      });
      sessionId = session.sessionId;
    });

    it('transitions to summary phase', () => {
      mod.submitExplanation(sessionId, '解释');
      mod.requestSummary(sessionId);
      const state = mod.getSessionState(sessionId);
      expect(state.currentPhase).toBe('summary');
    });

    it('returns a message asking for summary', () => {
      mod.submitExplanation(sessionId, '解释');
      const { message } = mod.requestSummary(sessionId);
      expect(message).toContain('分数');
      expect(message).toContain('总结');
    });

    it('works even when called from initial_explain phase', () => {
      mod.submitExplanation(sessionId, '解释');
      const { message } = mod.requestSummary(sessionId);
      expect(message).toBeTruthy();
      const state = mod.getSessionState(sessionId);
      expect(state.currentPhase).toBe('summary');
    });

    it('adds message to exchanges', () => {
      mod.submitExplanation(sessionId, '解释');
      const before = mod.getSessionState(sessionId).exchanges.length;
      mod.requestSummary(sessionId);
      const after = mod.getSessionState(sessionId).exchanges.length;
      expect(after).toBe(before + 1);
    });
  });

  // ===== submitSummary =====

  describe('submitSummary', () => {
    let sessionId: string;

    beforeEach(() => {
      const { session } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '分数',
        persona: 'diligent_student',
      });
      sessionId = session.sessionId;
      mod.submitExplanation(sessionId, '分数就是把东西分成几份，比如一个蛋糕分成4份');
      mod.advancePhase(sessionId);
      mod.submitExplanation(sessionId, '因为分数可以表示部分和整体的关系');
      mod.advancePhase(sessionId);
      mod.generateMisunderstanding(sessionId);
      mod.submitCorrection(sessionId, '不对，分数不是反过来的，分子在上分母在下，应该是这样的');
      mod.requestSummary(sessionId);
    });

    it('completes the session', () => {
      const { session } = mod.submitSummary(
        sessionId,
        '总结：分数表示部分与整体的关系，分子在上分母在下，比如1/4表示四份中的一份',
      );
      expect(session.isComplete).toBe(true);
    });

    it('returns a teaching score', () => {
      const { score } = mod.submitSummary(
        sessionId,
        '总结：分数表示部分与整体的关系，比如1/4表示四份中的一份',
      );
      expect(score.clarity).toBeGreaterThanOrEqual(0);
      expect(score.clarity).toBeLessThanOrEqual(100);
      expect(score.accuracy).toBeGreaterThanOrEqual(0);
      expect(score.accuracy).toBeLessThanOrEqual(100);
      expect(score.examples).toBeGreaterThanOrEqual(0);
      expect(score.examples).toBeLessThanOrEqual(100);
      expect(score.correctionAbility).toBeGreaterThanOrEqual(0);
      expect(score.correctionAbility).toBeLessThanOrEqual(100);
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(100);
      expect(score.feedback).toBeTruthy();
    });

    it('returns AI response', () => {
      const { response } = mod.submitSummary(sessionId, '分数就是...');
      expect(response).toBeTruthy();
      expect(/[\u4e00-\u9fff]/.test(response)).toBe(true);
    });

    it('marks summary phase as completed', () => {
      const { session } = mod.submitSummary(sessionId, '总结');
      expect(session.phaseCompleted.summary).toBe(true);
    });

    it('detects gaps', () => {
      const { session } = mod.submitSummary(sessionId, '总结');
      // gapsFound should be populated
      expect(Array.isArray(session.gapsFound)).toBe(true);
    });

    it('throws when not in summary phase', () => {
      const { session: s2 } = mod.createSession({
        childId: 'c2',
        knowledgePoint: 'kp',
      });
      expect(() => mod.submitSummary(s2.sessionId, 'text')).toThrow('总结升华');
    });

    it('throws when session is already complete', () => {
      mod.submitSummary(sessionId, '总结');
      expect(() => mod.submitSummary(sessionId, '再次总结')).toThrow('会话已结束');
    });
  });

  // ===== getTeachingScore =====

  describe('getTeachingScore', () => {
    it('returns zero scores when no exchanges', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: 'kp',
      });
      const score = mod.getTeachingScore(session.sessionId);
      expect(score.overall).toBe(0);
      expect(score.clarity).toBe(0);
      expect(score.accuracy).toBe(0);
      expect(score.examples).toBe(0);
      expect(score.correctionAbility).toBe(0);
    });

    it('gives higher clarity score for longer explanations', () => {
      const { session: s1 } = mod.createSession({ childId: 'c1', knowledgePoint: 'kp', persona: 'diligent_student' });
      mod.submitExplanation(s1.sessionId, '短');
      const score1 = mod.getTeachingScore(s1.sessionId);

      const { session: s2 } = mod.createSession({ childId: 'c2', knowledgePoint: 'kp', persona: 'diligent_student' });
      mod.submitExplanation(s2.sessionId, '这是一个非常详细的解释，首先我们需要理解基本概念，然后通过例子来说明，最后总结关键要点');
      const score2 = mod.getTeachingScore(s2.sessionId);

      expect(score2.clarity).toBeGreaterThan(score1.clarity);
    });

    it('gives higher example score when examples are provided', () => {
      const { session: s1 } = mod.createSession({ childId: 'c1', knowledgePoint: 'kp', persona: 'diligent_student' });
      mod.submitExplanation(s1.sessionId, '这个概念就是这样的');
      const score1 = mod.getTeachingScore(s1.sessionId);

      const { session: s2 } = mod.createSession({ childId: 'c2', knowledgePoint: 'kp', persona: 'diligent_student' });
      mod.submitExplanation(s2.sessionId, '比如说一个蛋糕，例如我们把它分成四份');
      const score2 = mod.getTeachingScore(s2.sessionId);

      expect(score2.examples).toBeGreaterThan(score1.examples);
    });

    it('gives higher accuracy score when causal reasoning is present', () => {
      const { session: s1 } = mod.createSession({ childId: 'c1', knowledgePoint: 'kp', persona: 'diligent_student' });
      mod.submitExplanation(s1.sessionId, '就是这样的');
      const score1 = mod.getTeachingScore(s1.sessionId);

      const { session: s2 } = mod.createSession({ childId: 'c2', knowledgePoint: 'kp', persona: 'diligent_student' });
      mod.submitExplanation(s2.sessionId, '因为地球有引力，所以物体会往下掉，这和其他力不同');
      const score2 = mod.getTeachingScore(s2.sessionId);

      expect(score2.accuracy).toBeGreaterThan(score1.accuracy);
    });

    it('evaluates correction ability from deliberate_misunderstand phase', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: '重力',
        persona: 'diligent_student',
      });
      mod.submitExplanation(session.sessionId, '重力就是地球吸引物体的力');
      mod.advancePhase(session.sessionId);
      mod.submitExplanation(session.sessionId, '因为地球有质量');
      mod.advancePhase(session.sessionId);
      mod.generateMisunderstanding(session.sessionId);
      mod.submitCorrection(
        session.sessionId,
        '不对！你说的完全错了。应该是地球因为有很大的质量，所以会产生引力，把物体吸引向地面',
      );

      const score = mod.getTeachingScore(session.sessionId);
      expect(score.correctionAbility).toBeGreaterThan(0);
    });

    it('gives positive feedback for high scores', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: '分数',
        persona: 'diligent_student',
      });
      // Submit rich explanations
      mod.submitExplanation(
        session.sessionId,
        '首先，分数表示部分和整体的关系。比如一个蛋糕分成4份，拿1份就是四分之一。因为分数可以帮助我们精确表示不是整数的量，所以在数学中非常重要。它和小数不同，分数更直观。',
      );
      mod.advancePhase(session.sessionId);
      mod.submitExplanation(
        session.sessionId,
        '例如在生活中，我们说半杯水就是二分之一杯。因为分数的分母表示总共分成几份，分子表示取了几份。',
      );
      mod.advancePhase(session.sessionId);
      mod.generateMisunderstanding(session.sessionId);
      mod.submitCorrection(
        session.sessionId,
        '不对！分数不是反过来的。应该是分子在上面表示取的份数，分母在下面表示总份数。比如3/4就是4份里取3份。',
      );

      const score = mod.getTeachingScore(session.sessionId);
      expect(score.overall).toBeGreaterThan(50);
      expect(score.feedback).toBeTruthy();
    });

    it('throws for nonexistent session', () => {
      expect(() => mod.getTeachingScore('nonexistent')).toThrow('会话不存在');
    });
  });

  // ===== getSessionState =====

  describe('getSessionState', () => {
    it('returns a copy of the session', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: 'kp',
      });
      const state = mod.getSessionState(session.sessionId);
      expect(state.sessionId).toBe(session.sessionId);
      // Modifying the returned state should not affect internal state
      state.exchanges.push({ role: 'child', text: 'hack', phase: 'initial_explain' });
      const state2 = mod.getSessionState(session.sessionId);
      expect(state2.exchanges).toHaveLength(session.exchanges.length);
    });

    it('throws for nonexistent session', () => {
      expect(() => mod.getSessionState('nonexistent')).toThrow('会话不存在');
    });
  });

  // ===== Full flow integration tests =====

  describe('full teaching flow', () => {
    it('completes all 4 phases with curious_baby', () => {
      const { session, openingLine } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '光合作用',
        persona: 'curious_baby',
      });
      expect(openingLine).toContain('光合作用');

      // Phase 1: Initial explain
      const { response: r1 } = mod.submitExplanation(session.sessionId, '光合作用就是植物吃阳光长大，比如向日葵');
      expect(r1).toBeTruthy();

      // Phase 2: Probing
      mod.advancePhase(session.sessionId);
      const { response: r2 } = mod.submitExplanation(session.sessionId, '因为植物需要阳光才能制造食物');
      expect(r2).toBeTruthy();

      // Phase 3: Deliberate misunderstand
      mod.advancePhase(session.sessionId);
      const { misunderstanding } = mod.generateMisunderstanding(session.sessionId);
      expect(misunderstanding).toContain('光合作用');
      const { response: r3 } = mod.submitCorrection(
        session.sessionId,
        '不对不对！光合作用不是随便来的，应该是植物用阳光、水和二氧化碳来制造养分和氧气',
      );
      expect(r3).toBeTruthy();

      // Phase 4: Summary
      mod.requestSummary(session.sessionId);
      const { response: r4, score, session: finalSession } = mod.submitSummary(
        session.sessionId,
        '总结：光合作用是植物利用阳光、水和二氧化碳制造养分的过程，比如向日葵就是通过光合作用生长的',
      );
      expect(r4).toBeTruthy();
      expect(finalSession.isComplete).toBe(true);
      expect(score.overall).toBeGreaterThan(0);
      expect(score.feedback).toBeTruthy();
    });

    it('completes all 4 phases with rigorous_scholar', () => {
      const { session } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '勾股定理',
        persona: 'rigorous_scholar',
      });

      // Phase 1
      mod.submitExplanation(session.sessionId, '勾股定理说的是直角三角形中，两条直角边的平方和等于斜边的平方');
      mod.advancePhase(session.sessionId);

      // Phase 2
      mod.submitExplanation(session.sessionId, '比如3的平方加4的平方等于5的平方，因为9+16=25');
      mod.advancePhase(session.sessionId);

      // Phase 3
      mod.generateMisunderstanding(session.sessionId);
      mod.submitCorrection(session.sessionId, '不对，勾股定理不是在所有情况下都不成立，它只适用于直角三角形，这是它的适用条件');
      mod.advancePhase(session.sessionId);

      // Phase 4
      const { score, session: final } = mod.submitSummary(
        session.sessionId,
        '首先，勾股定理是a²+b²=c²，其中c是斜边。其次，它只适用于直角三角形。例如3-4-5就是一组勾股数。',
      );

      expect(final.isComplete).toBe(true);
      expect(final.phaseCompleted.initial_explain).toBe(true);
      expect(final.phaseCompleted.probing).toBe(true);
      expect(final.phaseCompleted.deliberate_misunderstand).toBe(true);
      expect(final.phaseCompleted.summary).toBe(true);
      expect(score.overall).toBeGreaterThan(0);
    });

    it('handles multiple concurrent sessions', () => {
      const { session: s1 } = mod.createSession({
        childId: 'child1',
        knowledgePoint: '分数',
        persona: 'curious_baby',
      });
      const { session: s2 } = mod.createSession({
        childId: 'child2',
        knowledgePoint: '面积',
        persona: 'rigorous_scholar',
      });

      mod.submitExplanation(s1.sessionId, '分数就是把东西分开');
      mod.submitExplanation(s2.sessionId, '面积就是长乘以宽');

      const state1 = mod.getSessionState(s1.sessionId);
      const state2 = mod.getSessionState(s2.sessionId);

      expect(state1.knowledgePoint).toBe('分数');
      expect(state2.knowledgePoint).toBe('面积');
      expect(state1.persona).toBe('curious_baby');
      expect(state2.persona).toBe('rigorous_scholar');
    });
  });

  // ===== Gap detection =====

  describe('gap detection', () => {
    it('detects missing examples', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: '分数',
        persona: 'diligent_student',
      });
      mod.submitExplanation(session.sessionId, '分数就是这样的');
      mod.requestSummary(session.sessionId);
      const { session: final } = mod.submitSummary(session.sessionId, '分数就是分数');
      expect(final.gapsFound.some(g => g.includes('例子'))).toBe(true);
    });

    it('detects missing causal reasoning', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: '分数',
        persona: 'diligent_student',
      });
      mod.submitExplanation(session.sessionId, '分数就是把东西分开');
      mod.requestSummary(session.sessionId);
      const { session: final } = mod.submitSummary(session.sessionId, '分数就是分数');
      expect(final.gapsFound.some(g => g.includes('因果'))).toBe(true);
    });

    it('detects short explanations', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: '分数',
        persona: 'diligent_student',
      });
      mod.submitExplanation(session.sessionId, '就这样');
      mod.requestSummary(session.sessionId);
      const { session: final } = mod.submitSummary(session.sessionId, '就这样');
      expect(final.gapsFound.some(g => g.includes('简短'))).toBe(true);
    });

    it('does not flag examples gap when examples are given', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: '分数',
        persona: 'diligent_student',
      });
      mod.submitExplanation(session.sessionId, '分数就是把东西分开，比如一个蛋糕分成四份，因为我们需要表示部分');
      mod.requestSummary(session.sessionId);
      const { session: final } = mod.submitSummary(
        session.sessionId,
        '总结：分数表示部分和整体的关系，例如四分之一',
      );
      expect(final.gapsFound.some(g => g.includes('例子'))).toBe(false);
    });
  });

  // ===== Edge cases =====

  describe('edge cases', () => {
    it('handles empty explanation text', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: 'kp',
        persona: 'curious_baby',
      });
      const { response } = mod.submitExplanation(session.sessionId, '');
      expect(response).toBeTruthy();
    });

    it('handles very long explanation text', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: 'kp',
        persona: 'diligent_student',
      });
      const longText = '这是一个很长的解释。'.repeat(100);
      const { response } = mod.submitExplanation(session.sessionId, longText);
      expect(response).toBeTruthy();
    });

    it('handles special characters in knowledge point', () => {
      const { session, openingLine } = mod.createSession({
        childId: 'c1',
        knowledgePoint: '1/2 + 1/3 = ?',
        persona: 'curious_baby',
      });
      expect(openingLine).toContain('1/2 + 1/3 = ?');
      expect(session.knowledgePoint).toBe('1/2 + 1/3 = ?');
    });

    it('multiple explanations in same phase accumulate', () => {
      const { session } = mod.createSession({
        childId: 'c1',
        knowledgePoint: 'kp',
        persona: 'diligent_student',
      });
      mod.submitExplanation(session.sessionId, '第一次解释');
      mod.submitExplanation(session.sessionId, '第二次解释');
      mod.submitExplanation(session.sessionId, '第三次解释');

      const state = mod.getSessionState(session.sessionId);
      const childExchanges = state.exchanges.filter(e => e.role === 'child');
      expect(childExchanges).toHaveLength(3);
    });
  });
});
