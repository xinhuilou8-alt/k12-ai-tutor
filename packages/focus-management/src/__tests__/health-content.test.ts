import {
  getPostureGuide,
  getEyeCareMethods,
  getEyeExercise,
  getHealthContent,
  PostureGuide,
  EyeCareMethod,
  EyeExercise,
  HealthContent,
} from '../health-content';

describe('HealthContent', () => {
  describe('getPostureGuide', () => {
    let guide: PostureGuide;

    beforeEach(() => {
      guide = getPostureGuide();
    });

    it('returns a guide with a title', () => {
      expect(guide.title).toBe('正确坐姿五步法');
    });

    it('contains exactly 5 steps', () => {
      expect(guide.steps).toHaveLength(5);
    });

    it('includes key posture points in steps', () => {
      const joined = guide.steps.join('');
      expect(joined).toContain('双脚平放');
      expect(joined).toContain('背部挺直');
      expect(joined).toContain('50厘米');
      expect(joined).toContain('90度');
      expect(joined).toContain('头部微微低');
    });

    it('has a non-empty imageDescription', () => {
      expect(guide.imageDescription.length).toBeGreaterThan(0);
    });

    it('lists 4 common mistakes', () => {
      expect(guide.commonMistakes).toHaveLength(4);
    });

    it('includes specific common mistakes', () => {
      const joined = guide.commonMistakes.join('');
      expect(joined).toContain('驼背');
      expect(joined).toContain('二郎腿');
      expect(joined).toContain('趴');
      expect(joined).toContain('歪头');
    });

    it('returns a new object each call (no shared mutation)', () => {
      const guide2 = getPostureGuide();
      expect(guide).toEqual(guide2);
      expect(guide).not.toBe(guide2);
    });
  });

  describe('getEyeCareMethods', () => {
    let methods: EyeCareMethod[];

    beforeEach(() => {
      methods = getEyeCareMethods();
    });

    it('returns exactly 3 methods', () => {
      expect(methods).toHaveLength(3);
    });

    it('includes the 20-20-20 rule', () => {
      const rule = methods.find((m) => m.name.includes('20-20-20'));
      expect(rule).toBeDefined();
      expect(rule!.description).toContain('20分钟');
      expect(rule!.description).toContain('20英尺');
      expect(rule!.description).toContain('20秒');
    });

    it('includes the distance gazing method', () => {
      const method = methods.find((m) => m.name.includes('远眺'));
      expect(method).toBeDefined();
      expect(method!.description).toContain('绿色植物');
      expect(method!.duration).toContain('1-2分钟');
    });

    it('includes the blinking method', () => {
      const method = methods.find((m) => m.name.includes('眨眼'));
      expect(method).toBeDefined();
      expect(method!.steps.join('')).toContain('眨眼20次');
      expect(method!.steps.join('')).toContain('10秒');
    });

    it('every method has name, description, duration, and non-empty steps', () => {
      for (const method of methods) {
        expect(method.name.length).toBeGreaterThan(0);
        expect(method.description.length).toBeGreaterThan(0);
        expect(method.duration.length).toBeGreaterThan(0);
        expect(method.steps.length).toBeGreaterThan(0);
      }
    });

    it('returns a new array each call', () => {
      const methods2 = getEyeCareMethods();
      expect(methods).toEqual(methods2);
      expect(methods).not.toBe(methods2);
    });
  });

  describe('getEyeExercise', () => {
    let exercise: EyeExercise;

    beforeEach(() => {
      exercise = getEyeExercise();
    });

    it('has a name and description', () => {
      expect(exercise.name).toContain('眼保健操');
      expect(exercise.description.length).toBeGreaterThan(0);
    });

    it('has totalDuration of 4 minutes', () => {
      expect(exercise.totalDuration).toBe('4分钟');
    });

    it('contains exactly 4 sections', () => {
      expect(exercise.sections).toHaveLength(4);
    });

    it('section 1 is 按揉攒竹穴', () => {
      expect(exercise.sections[0].name).toContain('攒竹穴');
      expect(exercise.sections[0].duration).toBe('1分钟');
      expect(exercise.sections[0].instruction).toContain('攒竹穴');
    });

    it('section 2 is 按压睛明穴', () => {
      expect(exercise.sections[1].name).toContain('睛明穴');
      expect(exercise.sections[1].duration).toBe('1分钟');
      expect(exercise.sections[1].instruction).toContain('睛明穴');
    });

    it('section 3 is 按揉四白穴', () => {
      expect(exercise.sections[2].name).toContain('四白穴');
      expect(exercise.sections[2].duration).toBe('1分钟');
      expect(exercise.sections[2].instruction).toContain('四白穴');
    });

    it('section 4 is 按揉太阳穴 + 轮刮眼眶', () => {
      expect(exercise.sections[3].name).toContain('太阳穴');
      expect(exercise.sections[3].name).toContain('眼眶');
      expect(exercise.sections[3].duration).toBe('1分钟');
    });

    it('each section has 1 minute duration', () => {
      for (const section of exercise.sections) {
        expect(section.duration).toBe('1分钟');
      }
    });

    it('voiceScript is a non-empty TTS-ready string', () => {
      expect(typeof exercise.voiceScript).toBe('string');
      expect(exercise.voiceScript.length).toBeGreaterThan(0);
    });

    it('voiceScript contains timing cues for all 4 sections', () => {
      expect(exercise.voiceScript).toContain('第一节');
      expect(exercise.voiceScript).toContain('第二节');
      expect(exercise.voiceScript).toContain('第三节');
      expect(exercise.voiceScript).toContain('第四节');
    });

    it('voiceScript contains counting beats', () => {
      expect(exercise.voiceScript).toContain('一二三四');
      expect(exercise.voiceScript).toContain('五六七八');
    });

    it('voiceScript has opening and closing instructions', () => {
      expect(exercise.voiceScript).toContain('开始做眼保健操');
      expect(exercise.voiceScript).toContain('眼保健操结束');
    });

    it('returns a new object each call', () => {
      const exercise2 = getEyeExercise();
      expect(exercise).toEqual(exercise2);
      expect(exercise).not.toBe(exercise2);
    });
  });

  describe('getHealthContent', () => {
    let content: HealthContent;

    beforeEach(() => {
      content = getHealthContent();
    });

    it('bundles posture guide', () => {
      expect(content.posture).toEqual(getPostureGuide());
    });

    it('bundles eye care methods', () => {
      expect(content.eyeCareMethods).toEqual(getEyeCareMethods());
    });

    it('bundles eye exercise', () => {
      expect(content.eyeExercise).toEqual(getEyeExercise());
    });

    it('returns all three content types', () => {
      expect(content.posture).toBeDefined();
      expect(content.eyeCareMethods).toBeDefined();
      expect(content.eyeExercise).toBeDefined();
    });
  });
});
