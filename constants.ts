
import { AspectRatio, VideoMode, ImageResolution } from './types';

// Using Gemini 2.5 Pro for high-level reasoning/analysis
export const GEMINI_MODEL_ANALYSIS = 'gemini-2.5-pro';

// Fallback model with higher quotas/rate limits (Gemini 2.5 Flash)
export const GEMINI_MODEL_ANALYSIS_FALLBACK = 'gemini-2.5-flash';

// Using Gemini 3.0 Pro Image (Banana Pro equivalent) for high quality assets
export const GEMINI_MODEL_IMAGE = 'gemini-3.0-pro-image'; 

// TTS Model
export const GEMINI_MODEL_TTS = 'gemini-2.5-flash-preview-tts';

export const TARGET_MARKETS = [
  { value: 'MX', label: 'Mexico (墨西哥)', language: 'Spanish', culture: 'Mexican/Latin American ethnicity, vibrant, warm, family-oriented and social style', disabled: false },
  { value: 'BR', label: 'Brazil (巴西)', language: 'Portuguese', culture: 'Brazilian ethnicity, vibrant, diverse, and energetic South American style', disabled: false },
  { value: 'US', label: 'United States (美国)', language: 'English', culture: 'Western, diverse American style, energetic and direct', disabled: false },
];

export const ASPECT_RATIOS = [
  { value: AspectRatio.Ratio_9_16, label: '9:16 (竖屏通用)' },
  { value: AspectRatio.Ratio_16_9, label: '16:9 (横屏通用)' },
  { value: AspectRatio.Ratio_1_1, label: '1:1 (正方形)' },
  { value: AspectRatio.Ratio_3_4, label: '3:4 (肖像)' },
  { value: AspectRatio.Ratio_4_3, label: '4:3 (传统)' },
];

export const IMAGE_RESOLUTIONS = [
  { value: ImageResolution.Res_1K, label: '1K (标准)' },
  { value: ImageResolution.Res_2K, label: '2K (高清 - 推荐)' },
  { value: ImageResolution.Res_4K, label: '4K (超清)' },
];

export const VIDEO_MODES = [
  { value: VideoMode.Standard, label: '首帧图 (仅生成首图)' },
  { value: VideoMode.StartEnd, label: '连贯模式 (首图+尾图)' },
  { value: VideoMode.Intermediate, label: '运镜控制模式 (首图+草稿+尾图)' },
];

// Removed Flash model option to strictly enforce Pro quality
export const IMAGE_MODELS = [
  { value: 'gemini-3.0-pro-image', label: 'Banana Pro (专业 - 高清)' },
];

export const VOICE_OPTIONS = ['Kore', 'Fenrir', 'Puck', 'Charon', 'Zephyr'];

export const CAMERA_DEVICES = [
  { value: 'iphone_16_pro_max', label: 'iPhone 16 Pro Max', prompt: 'shot on iPhone 16 Pro Max, 48MP raw, sharp focus, computational photography, natural hdr, highly detailed' },
  { value: 'iphone_15_pro_max', label: 'iPhone 15 Pro Max', prompt: 'shot on iPhone 15 Pro Max, 48MP, realistic texture, apple color science, ultra wide angle' },
  { value: 'sony_a7r_v', label: 'Sony A7R V (专业摄影)', prompt: 'shot on Sony A7R V, 61MP, FE 24-70mm GM lens, shallow depth of field, sharp details, bokeh, professional photography' },
  { value: 'arri_alexa', label: 'ARRI Alexa (电影级)', prompt: 'shot on ARRI Alexa Mini, cinematic lighting, color graded, movie production quality, anamorphic lens, film look' },
  { value: 'film_camera', label: 'Film Camera (胶片感)', prompt: 'shot on Kodak Portra 400, 35mm film grain, vintage texture, warm tones, analog photography' },
  { value: 'gopro_hero_12', label: 'GoPro Hero 12 (运动)', prompt: 'shot on GoPro Hero 12, wide angle, fisheye effect, high contrast, sharp, action camera style' },
];

export const SHOOTING_STYLES = [
  { value: 'fixed', label: '固定机位 (Fixed)', prompt: 'static camera, tripod shot, stable composition, centered subject' },
  { value: 'pov', label: '第一人称 (POV)', prompt: 'POV shot, first-person view, immersive perspective, looking through eyes, hands visible in frame' },
  { value: 'handheld', label: '手持跟拍 (Handheld)', prompt: 'handheld camera, slight shake, documentary style, realistic movement, dynamic angle' },
  { value: 'gimbal', label: '稳定器运镜 (Gimbal)', prompt: 'smooth gimbal shot, cinematic movement, floating camera, steady flow' },
  { value: 'mixed', label: '混合运镜 (Mixed)', prompt: 'cinematic movement, dynamic angles, smooth transition, creative camera work' },
];
