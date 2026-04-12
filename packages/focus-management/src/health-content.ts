// ===== Health Content Interfaces =====

/** 坐姿指导 */
export interface PostureGuide {
  title: string;
  steps: string[];
  imageDescription: string;
  commonMistakes: string[];
}

/** 护眼方法 */
export interface EyeCareMethod {
  name: string;
  description: string;
  duration: string;
  steps: string[];
}

/** 眼保健操 */
export interface EyeExercise {
  name: string;
  description: string;
  totalDuration: string;
  sections: { name: string; duration: string; instruction: string }[];
  voiceScript: string;
}

/** 健康内容合集 */
export interface HealthContent {
  posture: PostureGuide;
  eyeCareMethods: EyeCareMethod[];
  eyeExercise: EyeExercise;
}

/**
 * 获取正确坐姿指导（5步）。
 */
export function getPostureGuide(): PostureGuide {
  return {
    title: '正确坐姿五步法',
    steps: [
      '双脚平放在地面上，与肩同宽',
      '背部挺直，轻轻靠在椅背上',
      '眼睛与屏幕保持约50厘米距离',
      '手肘自然弯曲约90度，放在桌面上',
      '头部微微低下，目光自然落在屏幕中央',
    ],
    imageDescription:
      '小朋友端正坐在书桌前，双脚平放地面，背部挺直靠椅背，双手自然放在桌面上，眼睛平视前方屏幕，屏幕距离约50厘米。',
    commonMistakes: [
      '驼背弯腰，头部过度前倾',
      '翘二郎腿，导致骨盆倾斜',
      '趴在桌子上写字或看屏幕',
      '歪头看屏幕，导致颈椎不适',
    ],
  };
}

/**
 * 获取3种护眼方法。
 */
export function getEyeCareMethods(): EyeCareMethod[] {
  return [
    {
      name: '20-20-20法则',
      description: '每学习20分钟，看20英尺（约6米）外的物体，持续20秒。',
      duration: '20秒',
      steps: [
        '停下手中的学习任务',
        '抬起头，目光看向窗外或远处',
        '选择6米以外的一个目标物体',
        '持续注视该物体20秒',
        '缓慢眨眼几次后继续学习',
      ],
    },
    {
      name: '远眺放松法',
      description: '看窗外远处的绿色植物或风景，让眼睛充分放松。',
      duration: '1-2分钟',
      steps: [
        '站起来走到窗边',
        '目光看向远处的绿色植物或树木',
        '让眼睛自然聚焦在远处景物上',
        '保持1到2分钟，期间自然眨眼',
        '感觉眼睛放松后回到座位',
      ],
    },
    {
      name: '眨眼放松法',
      description: '通过有意识地眨眼来缓解眼睛干涩和疲劳。',
      duration: '30秒',
      steps: [
        '坐直身体，放松面部肌肉',
        '快速眨眼20次，每次完全闭合再睁开',
        '闭上双眼，保持10秒钟',
        '缓慢睁开眼睛，感受眼睛的湿润',
      ],
    },
  ];
}

/**
 * 获取完整眼保健操教程（4节）。
 */
export function getEyeExercise(): EyeExercise {
  return {
    name: '少儿眼保健操',
    description: '通过按摩眼部周围穴位，促进眼部血液循环，缓解视疲劳。共4节，每节1分钟。',
    totalDuration: '4分钟',
    sections: [
      {
        name: '第一节：按揉攒竹穴',
        duration: '1分钟',
        instruction:
          '用双手大拇指指腹按在眉头内侧的攒竹穴上，其余四指自然弯曲放在额头上。以穴位为中心，轻轻旋转按揉，每拍一圈，做四个八拍。',
      },
      {
        name: '第二节：按压睛明穴',
        duration: '1分钟',
        instruction:
          '用双手食指指腹按在鼻根两侧的睛明穴上，轻轻上下按压，每拍按压一次，做四个八拍。注意力度适中，不要过重。',
      },
      {
        name: '第三节：按揉四白穴',
        duration: '1分钟',
        instruction:
          '用双手食指指腹按在眼眶下缘中点向下约一横指处的四白穴上。以穴位为中心，轻轻旋转按揉，每拍一圈，做四个八拍。',
      },
      {
        name: '第四节：按揉太阳穴，轮刮眼眶',
        duration: '1分钟',
        instruction:
          '用双手大拇指按在太阳穴上，用食指第二节内侧面轮刮上下眼眶。上眼眶从眉头到眉梢，下眼眶从内眼角到外眼角，先上后下为一拍，做四个八拍。',
      },
    ],
    voiceScript: [
      '同学们，现在开始做眼保健操。请坐好，闭上眼睛，全身放松。',
      '',
      '第一节，按揉攒竹穴。',
      '请将大拇指放在眉头内侧的攒竹穴上。',
      '一二三四，五六七八。二二三四，五六七八。三二三四，五六七八。四二三四，五六七八。',
      '',
      '第二节，按压睛明穴。',
      '请将食指放在鼻根两侧的睛明穴上。',
      '一二三四，五六七八。二二三四，五六七八。三二三四，五六七八。四二三四，五六七八。',
      '',
      '第三节，按揉四白穴。',
      '请将食指放在眼眶下方的四白穴上。',
      '一二三四，五六七八。二二三四，五六七八。三二三四，五六七八。四二三四，五六七八。',
      '',
      '第四节，按揉太阳穴，轮刮眼眶。',
      '请将大拇指放在太阳穴上，食指弯曲准备刮眼眶。',
      '一二三四，五六七八。二二三四，五六七八。三二三四，五六七八。四二三四，五六七八。',
      '',
      '眼保健操结束。请慢慢睁开眼睛，眨眼几次，让眼睛适应光线。',
    ].join('\n'),
  };
}

/**
 * 获取全部健康内容（坐姿指导 + 护眼方法 + 眼保健操）。
 */
export function getHealthContent(): HealthContent {
  return {
    posture: getPostureGuide(),
    eyeCareMethods: getEyeCareMethods(),
    eyeExercise: getEyeExercise(),
  };
}
