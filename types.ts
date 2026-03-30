
export enum AspectRatio {
  Ratio_9_16 = '9:16',
  Ratio_16_9 = '16:9',
  Ratio_1_1 = '1:1',
  Ratio_4_3 = '4:3',
  Ratio_3_4 = '3:4',
}

export enum ImageResolution {
  Res_1K = '1K',
  Res_2K = '2K',
  Res_4K = '4K',
}

export enum VideoMode {
  Standard = 'standard',      // Prompt -> Image
  StartEnd = 'start_end',     // Start + End Images
  Intermediate = 'intermediate' // Start + Mid + End Images
}

export interface ProductData {
  images: string[]; // Base64 strings
  title: string;
  description: string;
  creativeIdeas: string;
  targetMarket: string; // New: Target Country Code (e.g., 'US', 'TH')
  modelImages: string[]; // New: Custom model reference
  backgroundImages: string[]; // New: Custom background reference
  referenceVideo?: {
    data: string;
    mimeType: string;
  } | null; // New: Reference Video
}

export interface ComplianceCheck {
  isCompliant: boolean;
  riskLevel: 'Safe' | 'Warning' | 'High Risk';
  report: string; // Detailed compliance analysis
  culturalNotes: string; // Specific cultural adaptation notes
}

export interface AnalysisResult {
  productType: string;
  sellingPoints: string;
  targetAudience: string;
  hook: string;
  painPoints: string;
  strategy: string;
  assignedVoice: string; // Ensure consistency
  complianceCheck: ComplianceCheck; // New Compliance Agent Output
  scenes: SceneDraft[];
}

export interface SceneDraft {
  id: string;
  visual: string; // 画面内容 (中文)
  visual_en: string; // New: Visual (English) for instant prompt gen
  action: string; // 动作 (中文)
  action_en: string; // New: Action (English) for instant prompt gen
  camera: string; // 运镜 (中文)
  camera_en: string; // New: Camera (English) for instant prompt gen
  dialogue: string; // 对白 (Target Language)
  dialogue_cn: string; // 对白 (中文)
  prompt: {
    imagePrompt: string; // This holds the Veo JSON (Video Prompt)
    textPrompt: string;  // New: This holds the specific Text-to-Image Prompt
  };
}

export interface GeneratedAsset {
  type: 'image' | 'audio' | 'video'; // Added video
  url: string; // Blob URL or Data URL
  mimeType: string;
  data?: string; // Base64 for re-use
}

export interface StoryboardScene extends SceneDraft {
  startImage?: GeneratedAsset;
  endImage?: GeneratedAsset;
  middleImage?: GeneratedAsset; // For Intermediate mode
  audio?: GeneratedAsset;
  video?: GeneratedAsset; // NEW: Video Asset
  
  // History arrays for append-mode regeneration
  startImageHistory?: GeneratedAsset[];
  videoHistory?: GeneratedAsset[];

  // General states
  isGeneratingImage: boolean; // Deprecated but kept for type compat if needed
  isGeneratingAudio: boolean;
  error?: string;

  // Granular generation states
  isGeneratingStart?: boolean;
  isGeneratingMiddle?: boolean;
  isGeneratingEnd?: boolean;
  isGeneratingVideo?: boolean; // NEW: Video Generation Loader
  
  isUpdatingPrompt?: boolean; // New: Loader for prompt regeneration
}

export interface AppState {
  product: ProductData;
  settings: {
    aspectRatio: AspectRatio;
    imageResolution: ImageResolution;
    videoMode: VideoMode;
    sceneCount: number;
    imageModel: string; // New: Selected Image Generation Model
    cameraDevice: string; // New: Selected Camera Device
    shootingStyle: string; // New: Selected Shooting Style
  };
  analysis: AnalysisResult | null;
  storyboard: StoryboardScene[];
  isAnalyzing: boolean;
  isGeneratingScene: boolean; // Global loader state for scene gen
  activeStep: number; // 0: Input, 1: Analysis/Storyboard
}
