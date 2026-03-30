
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL_ANALYSIS, GEMINI_MODEL_IMAGE, GEMINI_MODEL_TTS, VOICE_OPTIONS, GEMINI_MODEL_ANALYSIS_FALLBACK, TARGET_MARKETS } from "../constants";
import { ProductData, AspectRatio, ImageResolution, SceneDraft } from "../types";

// Voice Profiles for Audio Consistency
const VOICE_PROFILES: Record<string, string> = {
  'Kore': 'Female, Young Adult (20-30s), Clear, Energetic, Professional tone. Visual Match: Young professional woman, approachable, modern style.',
  'Fenrir': 'Male, Adult (30-40s), Deep, Authoritative, Resonant tone. Visual Match: Mature man, confident, possibly bearded or sharp jawline, business or smart casual.',
  'Puck': 'Male, Young Adult (20s), Playful, Casual, Friendly tone. Visual Match: Young man, casual street style, smiling, energetic, Gen-Z look.',
  'Charon': 'Male, Older Adult (50s+), Gravelly, Cinematic, Serious tone. Visual Match: Older man, distinguished, silver hair, texture in face, serious storytelling expression.',
  'Zephyr': 'Female, Young Adult (20-30s), Soft, Breathless, Calm, ASMR-style. Visual Match: Young woman, soft features, gentle aesthetic, cozy clothing, calm demeanor.'
};

// 官方客户端（负责文字分析、多模态、声音合成）
const getClient = async (): Promise<GoogleGenAI> => {
  const apiKey = process.env.API_KEY || "YOUR_OFFICIAL_API_KEY"; // 这里填您真实的官方 Gemini Key
  return new GoogleGenAI({ apiKey: apiKey });
};

// 本地代工厂客户端（专职负责通过 Flow API 白嫖图片和视频生成）
const getFlowClient = async (): Promise<GoogleGenAI> => {
  // 生产环境/本地环境自动适配：使用同源代理，避免 CORS 报错和 HTTPS mixed content 拦截
  const proxyBaseUrl = typeof window !== 'undefined' ? window.location.origin + "/api" : "http://100.55.152.110:8000";
  return new GoogleGenAI({ 
      apiKey: "han1234", // 给代工厂随便配的一把假钥匙
      httpOptions: {
          baseUrl: proxyBaseUrl
      }
  });
};

// Retry Helper
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(operation: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_RETRY_DELAY): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const msg = error.message || '';
    const status = error.status || error.code;
    
    // Check for overloaded (503), internal server error (500), or rate limit (429)
    const isOverloaded = msg.includes('overloaded') || status === 503;
    const isInternalError = status === 500;
    // Enhanced 429 check (Resource Exhausted)
    const isRateLimit = status === 429 || msg.includes('exhausted') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
    
    // We retry 429s a few times with backoff, but usually it requires model switching
    if (retries > 0 && (isOverloaded || isInternalError || isRateLimit)) {
      console.warn(`Gemini API Warning: ${msg} (Status: ${status}). Retrying in ${delay}ms...`);
      await sleep(delay);
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Helper: Check if error is a quota error
const isQuotaError = (error: any) => {
    const msg = error.message || '';
    const status = error.status || error.code;
    return status === 429 || msg.includes('exhausted') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
};

// Helper: Convert Raw PCM to WAV
const pcmToWav = (base64PCM: string, sampleRate: number = 24000): string => {
  const binaryString = atob(base64PCM);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Create WAV headers
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + len, true); // ChunkSize
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(view, 36, 'data');
  view.setUint32(40, len, true); // Subchunk2Size

  // Combine header and data
  const headerBytes = new Uint8Array(wavHeader);
  const wavBytes = new Uint8Array(headerBytes.length + bytes.length);
  wavBytes.set(headerBytes);
  wavBytes.set(bytes, headerBytes.length);

  // Convert to Base64 (chunked to avoid stack overflow on large buffers)
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < wavBytes.length; i += chunkSize) {
    const chunk = wavBytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk); // Fixed: was incorrectly reading bytes[i]
  }
  return btoa(binary);
};

// Client-side Veo Manifest Construction (Instant)
const formatVeoManifest = (scene: any, voiceName: string = 'Kore', marketLabel: string = 'US'): string => {
    const voiceProfile = VOICE_PROFILES[voiceName] || VOICE_PROFILES['Kore'];
    const region = marketLabel.split('(')[0].trim(); // e.g. "United States" from "United States (美国)"

    const manifest = {
        veo_production_manifest: {
            version: "4.0",
            shot_summary: scene.visual_en || scene.visual,
            description: "Cinematic commercial video.", // CHANGED: Removed "Industrial-grade" to avoid factory hallucinations
            global_settings: {
                input_assets: { reference_image: "Start Frame" },
                output_specifications: {
                    resolution: "1080p",
                    aspect_ratio_lock: { enabled: true },
                    color_space: "Rec. 2020",
                    dynamic_range: "HDR"
                },
                rendering_pipeline: {
                    engine: "Physically-Based Rendering (PBR)",
                    light_transport: "Path Tracing"
                }
            },
            director_mandates: {
                positive_mandates: [
                    "The video MUST start with the provided start frame.",
                    "Maintenance of texture, lighting, and resolution from the start frame is critical at 0s, 2s, 4s, and 6s.",
                    "Maintain EXACT character identity, facial features, and clothing details.",
                    `AUDIO: Voice MUST be ${voiceProfile}.`,
                    `AUDIO: Accent MUST be Native ${region}.`,
                    "AUDIO: Maintain strict voice consistency across the entire video."
                ],
                negative_mandates: [
                    "NO smooth or stable camera motion if action is chaotic.",
                    "NO morphing of character features.",
                    "NO lowering of resolution or quality.",
                    "NO warehouses, factories, or industrial backgrounds unless explicitly requested.",
                    "NO AI look, plastic skin, or unnatural smoothing.",
                    "NO robotic or inconsistent voice changes."
                ]
            },
            timeline_script: [
                {
                    time_start: "0.0s",
                    time_end: "8.0s",
                    description: scene.visual_en || scene.visual,
                    elements: {
                        visuals: {
                            subject_action: scene.action_en || scene.action,
                            background_action: "Consistent environment",
                            consistency_check: "At 0s, 2s, 4s, 6s: Ensure absolute consistency."
                        },
                        camera: {
                            primary_movement: scene.camera_en || scene.camera,
                            movement_description: "Cinematic execution",
                            speed: "Normal"
                        },
                        audio_scape: {
                            dialogue: { 
                                transcript: scene.dialogue,
                                voice_specification: {
                                    character_profile: voiceProfile,
                                    region_accent: `Native ${region}`,
                                    consistency_enforcement: "Strict"
                                }
                            },
                            sfx: ["Ambient noise"],
                            ambient: "Natural room tone"
                        }
                    }
                }
            ]
        }
    };
    return JSON.stringify(manifest, null, 2);
};

// 1. Multi-Agent Product Analysis & Script Generation
export const analyzeProduct = async (
  product: ProductData, 
  sceneCount: number
): Promise<any> => {
  const client = await getClient();
  const assignedVoice = VOICE_OPTIONS[Math.floor(Math.random() * VOICE_OPTIONS.length)];
  const voiceProfile = VOICE_PROFILES[assignedVoice] || "Standard Voice";
  const market = TARGET_MARKETS.find(m => m.value === product.targetMarket) || TARGET_MARKETS[0];
  const hasUserBackgrounds = product.backgroundImages && product.backgroundImages.length > 0;

  // IMPORTANT: Prioritize User Creative Ideas
  const creativeInstruction = product.creativeIdeas && product.creativeIdeas.trim().length > 0 
    ? `
    🔥 CRITICAL PRIORITY - USER CREATIVE DIRECTION 🔥:
    The user has explicitly provided the following creative ideas:
    "${product.creativeIdeas}"
    
    YOU MUST EXECUTE THESE IDEAS EXACTLY. 
    1. Ignore standard marketing formulas if they conflict with the user's idea.
    2. If the user asks for a specific plot, character action, or visual style (e.g., "Cyberpunk", "ASMR", "Comedy", "Dark"), YOU MUST USE IT.
    3. The analysis strategy and hooks must be derived directly from these user ideas.
    4. Do not override the user's vision with "safe" or "generic" e-commerce tropes.
    ` 
    : "No specific user creative direction provided. Use your expert judgment to create the best converting content.";

  const systemInstruction = `
  你是一个由5位专家组成的顶级TikTok电商创意团队（面向 **${market.label}** 市场）：

  1. **产品分析师**：负责识别产品规格、材质、用途。
  2. **营销大师**：负责挖掘痛点、设计强钩子（Hook）。
  3. **品牌专家**：确保内容符合品牌调性。
  4. **导演大师**：设计分镜、运镜、画面内容。
     - **人物与声音一致性 (CRITICAL PRIORITY)**:
       - 核心指令: **声音决定长相 (Voice dictates Visuals)**.
       - 配音 (Voice): **${assignedVoice}**
       - 声音画像 (Profile): **${voiceProfile}**
       - **执行要求**: Scene 1 的人物描写 (Visual) 必须是这个声音的"物理化身"。
         - 声音是女性 -> 画面必须是女性。
         - 声音是男性 -> 画面必须是男性。
         - 声音是年轻 -> 画面必须年轻。
         - 声音是深沉/权威 -> 画面必须成熟/专业。
       - **错误示范**: 声音是"Deep Male"但画面是"Cute Girl" -> **绝对禁止**！
     - **人物一致性规则 (绝对优先级)**:
       - **Scene 1 必须定义具体的模特特征**（符合上述声音特征，以及年龄、肤色、发型、具体服装，如 "25yo girl, messy bun, beige sweater"）。
       - **所有后续分镜 (Scene 2, 3...) 的 'visual_en' 必须开头包含这个模特描述**，确保人物完全一致。
     - **背景规则 (绝对一致性)**: 
       - 如果用户提供了背景图，必须使用。
       - 如果用户**没有**提供背景图，请设定一个**唯一**的核心高格调场景（如 "Modern minimalist living room", "Cozy Bedroom", "Sunlit Studio"）。**严禁**随意切换场景。
       - **负面提示 (Negative Constraints)**: 除非产品是大型工业设备，否则**绝对禁止**生成工厂 (Factory)、仓库 (Warehouse)、杂乱的货架 (Messy Shelves) 或昏暗的工业环境。背景必须干净、高级、生活化。
     - **模特规则**: 分镜中的人物必须符合 **${market.culture}** 的种族和审美特征。
  5. **TikTok 合规专员**: 负责审查内容是否符合 **${market.label}** 的 TikTok 广告政策。

  ${creativeInstruction}

  你的目标是：生成一份高转化率、强钩子、符合当地文化的TikTok带货视频脚本。

  **输出语言规则 (必须严格遵守)**:
  1. **分析报告部分** (productType, sellingPoints, targetAudience, hook, painPoints, strategy, complianceCheck): **全部使用中文输出**。
  2. **分镜脚本-展示部分** (visual, action, camera): **必须使用中文**。
  3. **分镜脚本-翻译部分** (dialogue_cn): **必须使用中文**。
  4. **分镜脚本-生成部分** (visual_en, action_en, camera_en, prompt): **必须使用英文** (用于AI生成高质量画面)。
  5. **对白 (dialogue)**: **必须使用地道的 ${market.language}** (用于TTS配音)。

  **输出结构要求**：
  - **Compliance Report**: 提供合规性检查结果 (riskLevel, report, culturalNotes)。Report和Notes用中文。
  - **Scenes**: 
    - visual (中文): 包含详细的画面描述。**Scene 1 必须详细定义模特和背景**。
    - visual_en (英文): 对应的英文描述，用于生成提示词。
    - action (中文): 动作描述。
    - action_en (英文): 动作英文描述。
    - camera (中文): 运镜描述。
    - camera_en (英文): 运镜英文描述。
    - dialogue: 地道的 ${market.language}。
    - dialogue_cn: 对应的中文翻译。
  
  请确保脚本首尾呼应，开头3秒必须有强烈的视觉或语言钩子。
  `;

  // Prepare content parts
  const parts: any[] = [];
  
  // Images
  [...product.images, ...product.modelImages, ...product.backgroundImages].forEach(base64 => {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
  });

  if (product.referenceVideo) {
      parts.push({ inlineData: { mimeType: product.referenceVideo.mimeType, data: product.referenceVideo.data } });
  }

  // Construct Prompt based on Scene Count (0 = Auto)
  let promptText = "";
  if (sceneCount > 0) {
      promptText = `Generate a ${sceneCount} scene TikTok script for target market: ${market.label}.`;
  } else {
      promptText = `Generate a TikTok script for target market: ${market.label}. Determine the optimal number of scenes (usually 3-8) based on the content needs.`;
  }
  
  if (product.referenceVideo) {
      // Analyze video with AUTO vs FORCED count logic
      if (sceneCount > 0) {
           promptText += ` Analyze the Reference Video for visual style and pacing. HOWEVER, you MUST generate exactly ${sceneCount} scenes. Adapt the reference video's structure to fit this count and user creative ideas.`;
      } else {
           promptText += ` Analyze the Reference Video for visual style and pacing. Determine the optimal scene count based on the reference video's structure (pacing, cuts) and the user's creative ideas.`;
      }
  }
  
  promptText += `
  Product: ${product.title || "Not specified"}
  Description: ${product.description || "Not specified"}
  
  REMEMBER: Scene 1 Prompt MUST define the specific model look (Age, Hair, Clothes). Scene 2+ MUST copy that description EXACTLY.
  NO WAREHOUSES OR FACTORIES. Use Home/Studio settings.
  ENSURE 'visual', 'action', 'camera' are in CHINESE.
  `;

  parts.push({ text: promptText });

  const generationConfig: any = {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          productType: { type: Type.STRING, description: "中文" },
          sellingPoints: { type: Type.STRING, description: "中文" },
          targetAudience: { type: Type.STRING, description: "中文" },
          hook: { type: Type.STRING, description: "中文" },
          painPoints: { type: Type.STRING, description: "中文" },
          strategy: { type: Type.STRING, description: "中文" },
          assignedVoice: { type: Type.STRING },
          complianceCheck: {
            type: Type.OBJECT,
            properties: {
                isCompliant: { type: Type.BOOLEAN },
                riskLevel: { type: Type.STRING, enum: ["Safe", "Warning", "High Risk"] },
                report: { type: Type.STRING, description: "中文" },
                culturalNotes: { type: Type.STRING, description: "中文" }
            },
            required: ["isCompliant", "riskLevel", "report", "culturalNotes"]
          },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                visual: { type: Type.STRING, description: "中文画面描述" },
                visual_en: { type: Type.STRING, description: "English visual description" },
                action: { type: Type.STRING, description: "中文动作描述" },
                action_en: { type: Type.STRING, description: "English action description" },
                camera: { type: Type.STRING, description: "中文运镜描述" },
                camera_en: { type: Type.STRING, description: "English camera description" },
                dialogue: { type: Type.STRING, description: "Target language dialogue" },
                dialogue_cn: { type: Type.STRING, description: "中文对白翻译" },
                prompt: {
                    type: Type.OBJECT,
                    properties: {
                        imagePrompt: { type: Type.STRING, description: "Detailed English prompt for Image/Video generation." }
                    },
                    required: ["imagePrompt"]
                }
              },
              required: ["id", "visual", "visual_en", "action", "action_en", "camera", "camera_en", "dialogue", "dialogue_cn", "prompt"]
            }
          }
        },
        required: ["productType", "sellingPoints", "targetAudience", "hook", "painPoints", "strategy", "complianceCheck", "scenes"]
      }
  };

  let response: GenerateContentResponse;
  
  try {
      // Try Primary Model (Pro)
      response = await withRetry(() => client.models.generateContent({
        model: GEMINI_MODEL_ANALYSIS,
        contents: { parts },
        config: generationConfig
      }));
  } catch (error: any) {
      if (isQuotaError(error)) {
          console.warn("Primary model quota exhausted. Switching to Fallback (Flash)...");
          try {
             response = await withRetry(() => client.models.generateContent({
                model: GEMINI_MODEL_ANALYSIS_FALLBACK,
                contents: { parts },
                config: generationConfig
             }));
          } catch (fallbackError) {
             throw fallbackError;
          }
      } else {
          throw error;
      }
  }

  let jsonText = response.text || '{}';
  
  // Robust JSON Extraction
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
      jsonText = jsonMatch[0];
  } else {
      jsonText = jsonText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  }

  try {
    const result = JSON.parse(jsonText);
    
    // Validate Structure
    if (!result.scenes || !Array.isArray(result.scenes)) {
         throw new Error("AI response format invalid: missing 'scenes' array.");
    }

    result.assignedVoice = assignedVoice; 
    
    // Structure the prompts:
    // textPrompt: The text prompt returned by the AI (used for Image Gen)
    // imagePrompt: The Veo JSON manifest (used for Video Gen)
    result.scenes = result.scenes.map((s: any) => ({
        ...s,
        prompt: {
            textPrompt: s.prompt?.imagePrompt || s.visual_en, // Store the raw text prompt from AI
            imagePrompt: formatVeoManifest(s, assignedVoice, market.label) // Pass voice & market for consistency
        }
    }));

    return result;
  } catch (e) {
    console.error("JSON Parse Error:", e, "Raw Text:", jsonText);
    throw new Error("无法解析 AI 返回的分析结果，请重试。");
  }
};

// 2. Image Generation (Standard) with Abort Support
export const generateImage = async (
  prompt: string, 
  aspectRatio: AspectRatio,
  resolution: ImageResolution,
  referenceImages: string[] = [],
  signal?: AbortSignal,
  modelName: string = GEMINI_MODEL_IMAGE, // Default to Pro if not passed
  cameraPrompt: string = '', // New: Device Prompt
  stylePrompt: string = ''   // New: Style Prompt
): Promise<string> => {
  const client = await getFlowClient();
  
  if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
  }

  // If the prompt is the Veo JSON manifest (which it likely is now), we need to extract a text description
  // because the image generation model (Banana/Imagen) expects text, not JSON config.
  let textPrompt = prompt;
  if (prompt.trim().startsWith('{')) {
      try {
          const json = JSON.parse(prompt);
          const visual = json.veo_production_manifest?.timeline_script?.[0]?.elements?.visuals?.subject_action;
          const camera = json.veo_production_manifest?.timeline_script?.[0]?.elements?.camera?.primary_movement;
          const desc = json.veo_production_manifest?.description || json.veo_production_manifest?.shot_summary;
          
          // Construct a rich text prompt from JSON fields
          if (visual) {
              textPrompt = `${camera ? camera + ' shot of ' : ''}${visual}. ${desc || ''}`;
          }
      } catch (e) {
          // If parse fails, fallback to using raw string (maybe it wasn't JSON)
      }
  }

  // ENFORCE HYPER-REALISM & CONSISTENCY IN THE FINAL PROMPT
  // Base Realism
  let realismBoosters = " , raw photo, 8k uhd, dslr, soft lighting, high quality, film grain. ";
  
  // Append Specific Camera and Style
  if (cameraPrompt) {
      realismBoosters += ` ${cameraPrompt}. `;
  } else {
      realismBoosters += " Fujifilm XT3. "; // Default fallback
  }

  if (stylePrompt) {
      realismBoosters += ` ${stylePrompt}. `;
  }

  const negativeConstraints = " DO NOT GENERATE: 3d render, cartoon, anime, illustration, painting, plastic skin, smooth skin, artificial, blurry, distorted face. ";
  
  const finalPrompt = textPrompt + realismBoosters + negativeConstraints;

  const parts: any[] = [{ text: finalPrompt }];
  
  // Limit reference images for Banana Pro to 3 to reduce payload size and instability (500 errors)
  referenceImages.slice(0, 3).forEach(ref => {
    parts.unshift({ inlineData: { mimeType: 'image/jpeg', data: ref } });
  });

  // Construct config dynamically based on model capabilities
  const config: any = {
      imageConfig: { aspectRatio: aspectRatio as any }
  };
  
  // Only add imageSize if model supports it (Gemini 3 Pro Image)
  if (modelName === 'gemini-3.0-pro-image') {
      config.imageConfig.imageSize = resolution as any;
  }

  try {
    const apiCall = withRetry<GenerateContentResponse>(() => client.models.generateContent({
        model: modelName,
        contents: { parts },
        config: config
    }));

    let response: GenerateContentResponse;
    
    if (signal) {
         const abortPromise = new Promise<never>((_, reject) => {
            const onAbort = () => {
                signal.removeEventListener('abort', onAbort);
                reject(new DOMException('Aborted', 'AbortError'));
            };
            signal.addEventListener('abort', onAbort);
         });
         // Race the API call against the abort signal
         response = await Promise.race([apiCall, abortPromise]);
    } else {
         response = await apiCall;
    }

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
  } catch(error: any) {
      if (error.name === 'AbortError') throw error;
      throw error;
  }
};

// 2.5 Video Generation (Veo I2V Fast)
export const generateVideo = async (
  prompt: string, 
  aspectRatio: AspectRatio,
  referenceImage: string, // Require one reference image for I2V
  signal?: AbortSignal
): Promise<string> => {
  const client = await getFlowClient();
  
  if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
  }

  // Check if prompt is a Veo Manifest JSON, extract text if so. 
  // Veo text-to-video / image-to-video takes plain text prompt in this proxy.
  let textPrompt = prompt;
  if (prompt.trim().startsWith('{')) {
      try {
          const json = JSON.parse(prompt);
          // Try to get shot_summary or description
          const visual = json.veo_production_manifest?.shot_summary || json.veo_production_manifest?.description;
          if (visual) {
              textPrompt = visual;
          }
      } catch (e) {
          // fallback to raw prompt
      }
  }

  // The proxy will automatically use I2V mapping when it detects an image.
  const parts: any[] = [
    { inlineData: { mimeType: 'image/jpeg', data: referenceImage } }, // I2V Anchor
    { text: textPrompt }
  ];

  // Pass aspectRatio into imageConfig, Flow API proxy will natively map it to _landscape or _portrait
  const config: any = {
      imageConfig: { aspectRatio: aspectRatio as any }
  };

  // Flow API explicitly expects the full model string for Veo video generation.
  // It does not use the auto-resolver for videos.
  let veoModel = "veo_3_1_i2v_s_fast_fl"; // Landscape / Square default
  if (aspectRatio === AspectRatio.Ratio_9_16 || aspectRatio === AspectRatio.Ratio_3_4) {
      veoModel = "veo_3_1_i2v_s_fast_portrait_fl";
  }

  try {
    const apiCall = withRetry<GenerateContentResponse>(() => client.models.generateContent({
        model: veoModel,
        contents: { parts },
        // Veo ignores imageConfig in direct mode, but we keep it just in case
        config: config
    }));

    let response: GenerateContentResponse;
    
    if (signal) {
         const abortPromise = new Promise<never>((_, reject) => {
            const onAbort = () => {
                signal.removeEventListener('abort', onAbort);
                reject(new DOMException('Aborted', 'AbortError'));
            };
            signal.addEventListener('abort', onAbort);
         });
         response = await Promise.race([apiCall, abortPromise]);
    } else {
         response = await apiCall;
    }

    const part = response.candidates?.[0]?.content?.parts?.[0] as any;
    
    // Flow API returns video as a URL inside fileData
    if (part?.fileData?.fileUri) {
        return part.fileData.fileUri;
    }

    // Fallback to inlineData if it ever returns base64
    return part?.inlineData?.data || "";
  } catch(error: any) {
      if (error.name === 'AbortError') throw error;
      throw error;
  }
};

// 3. Audio Generation (TTS)
export const generateSpeech = async (
    text: string,
    voiceName: string = 'Kore'
): Promise<string> => {
    const client = await getClient();
    const validVoice = VOICE_OPTIONS.includes(voiceName) ? voiceName : 'Kore';
    const response = await withRetry<GenerateContentResponse>(() => client.models.generateContent({
        model: GEMINI_MODEL_TTS,
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: validVoice } } },
        },
    }));
    const base64PCM = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64PCM) throw new Error("TTS 服务未返回音频数据。");
    return pcmToWav(base64PCM);
};

// 4. Regenerate Veo Prompt (Updated Logic for Speed)
export const regenerateVeoPrompt = async (scene: SceneDraft): Promise<string> => {
  const client = await getClient();

  // Use Flash model for speed when regenerating/updating prompt based on user edits
  const systemInstruction = `
  You are an expert prompt engineer. Convert the user's scene details into the "veo_production_manifest" JSON format (Version 4.0).
  
  Input:
  Visual: ${scene.visual}
  Action: ${scene.action}
  Camera: ${scene.camera}
  Dialogue: ${scene.dialogue}
  
  Output: Return ONLY the raw JSON string. Translate Chinese inputs to English.
  Structure: { "veo_production_manifest": { ... } }
  Mandates: Ensure consistency check mandates are included for 0s, 2s, 4s, 6s.
  Context: Ensure background description is included in visuals if not provided by user references.
  `;

  const response = await withRetry<GenerateContentResponse>(() => client.models.generateContent({
    model: GEMINI_MODEL_ANALYSIS_FALLBACK, // USE FLASH FOR SPEED
    contents: { parts: [{ text: "Generate JSON" }] },
    config: {
      systemInstruction,
      responseMimeType: "application/json"
    }
  }));

  let jsonText = response.text || '{}';
  jsonText = jsonText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  return jsonText;
};

// 5. Optimize Prompt (Consistency & Detail)
export const optimizePrompt = async (
  currentPrompt: string, 
  visualDescription: string, 
  masterPrompt?: string
): Promise<string> => {
  const client = await getClient();

  const systemInstruction = `
  You are an expert AI prompt engineer (Midjourney v6 & Veo style).
  
  Task: Optimize the user's image prompt.
  
  Context:
  - Visual Description: "${visualDescription}"
  - Current Prompt: "${currentPrompt}"
  ${masterPrompt ? `- Master Character Reference (MUST MATCH THIS PERSON EXACTLY): "${masterPrompt}"` : ''}
  
  Directives:
  1. **CRITICAL: CHARACTER CONSISTENCY**. If Master Reference exists, extract the Age, Ethnicity, Hair Style, and Clothes from it and FORCE them into the new prompt.
  2. **STYLE: HYPER-REALISM**. Use tags: "Raw photo, 8k, highly detailed skin texture, soft lighting, film grain, shot on Sony A7R".
  3. **NEGATIVE CONSTRAINTS**: Explicitly avoid: "3d render, cartoon, plastic skin, smooth face, artificial".
  4. Keep it concise but descriptive.
  5. ABSOLUTELY NO WAREHOUSES, FACTORIES, or INDUSTRIAL backgrounds unless specifically requested by the context. Default to clean, modern, high-end environments.
  6. Return ONLY the raw prompt string.
  `;

  try {
      const response = await withRetry<GenerateContentResponse>(() => client.models.generateContent({
        model: GEMINI_MODEL_ANALYSIS_FALLBACK,
        contents: { parts: [{ text: "Optimize prompt" }] },
        config: { systemInstruction }
      }));
      return response.text?.trim() || currentPrompt;
  } catch (e) {
      console.warn("Optimization failed", e);
      return currentPrompt;
  }
};
