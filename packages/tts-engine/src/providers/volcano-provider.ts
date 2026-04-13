/**
 * 火山引擎 TTS Provider
 * 调用字节跳动火山引擎语音合成 HTTP API
 */

export interface VolcanoTTSConfig {
  endpoint: string;
  token: string;
  appid: string;
  cluster: string;
  voiceType: string;
  speedRatio: number;
  audioFormat: string;
}

export interface VolcanoTTSResult {
  audioBase64: string;
  audioFormat: string;
  duration?: number;
}

/**
 * 调用火山引擎 TTS API 合成语音
 */
export async function volcanoSynthesize(
  text: string,
  config: VolcanoTTSConfig,
): Promise<VolcanoTTSResult> {
  const payload = {
    app: {
      appid: config.appid,
      token: 'access_token',
      cluster: config.cluster,
    },
    user: {
      uid: 'k12-ai-tutor',
    },
    audio: {
      voice_type: config.voiceType,
      encoding: config.audioFormat === 'mp3' ? 'mp3' : 'wav',
      speed_ratio: config.speedRatio,
    },
    request: {
      reqid: `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      text_type: 'plain',
      operation: 'query',
    },
  };

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer;${config.token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Volcano TTS error (${response.status}): ${errText}`);
  }

  const data = await response.json() as any;

  if (data.code !== 3000) {
    throw new Error(`Volcano TTS API error: code=${data.code}, message=${data.message}`);
  }

  return {
    audioBase64: data.data,
    audioFormat: config.audioFormat,
  };
}
