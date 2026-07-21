export type UmbraUiAgentMediaType = 'image' | 'video' | 'both';

export interface UmbraUiAgentInstruction {
  id: string;
  name: string;
  mediaType: UmbraUiAgentMediaType;
  instruction: string;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface UmbraUiAgentPromptSegment {
  id: string;
  text: string;
}

export interface UmbraUiAgentImageContext {
  prompt: string;
  promptSegments: UmbraUiAgentPromptSegment[];
  negativePrompt: string;
  apiWorkflowId: string;
  checkpointName: string;
  loras: Array<{
    name: string;
    strengthModel: number;
    strengthClip: number;
    trainedTags: string[];
  }>;
  controls: Record<string, unknown>;
}

export interface UmbraUiAgentVideoContext {
  prompt: string;
  negativePrompt: string;
  apiWorkflowId: string;
  family: string;
  mode: string;
  controls: Record<string, unknown>;
}

export interface UmbraUiAgentContext {
  updatedAt: number;
  activeMode: 'image' | 'img2img' | 'inpaint' | 'video' | 'extras';
  image: UmbraUiAgentImageContext;
  video: UmbraUiAgentVideoContext;
}

export interface UmbraUiAgentDraftRequest {
  mediaType: 'image' | 'video';
  title?: string;
  instructionId?: string;
  segments?: string[];
  prompt?: string;
  negativePrompt?: string;
  notes?: string;
}

export interface UmbraUiAgentDraft {
  id: string;
  mediaType: 'image' | 'video';
  title: string;
  instructionId: string;
  instructionName: string;
  segments: string[];
  prompt: string;
  negativePrompt: string;
  notes: string;
  warnings: string[];
  createdAt: number;
}

interface UmbraUiAgentInstructionTemplate {
  id: string;
  name: string;
  mediaType: UmbraUiAgentMediaType;
  instruction: string;
}

const DEFAULT_INSTRUCTION_TEMPLATES: UmbraUiAgentInstructionTemplate[] = [
  {
    id: 'image-general-director',
    name: 'General Image Director',
    mediaType: 'image',
    instruction: [
      'Write a production-ready positive image prompt that faithfully follows the user request.',
      'Organize the result into 3 to 6 clean segments: subject and identity, pose or action, composition and camera, setting, lighting and style, then quality details.',
      'Keep each visual fact once, resolve contradictions, preserve requested names and syntax, and do not invent LoRAs, embeddings, checkpoints, or unsupported technical settings.',
      'Use umbra_ui_stage_prompt with mediaType image and put the logical sections in segments. Include a restrained negative prompt only when it materially helps.',
    ].join(' '),
  },
  {
    id: 'image-anima-tags',
    name: 'Anima Tag Composer',
    mediaType: 'image',
    instruction: [
      'Translate the request into concise comma-separated Anima or Danbooru-style visual tags.',
      'Keep identity tags and user-provided trigger tokens exact. Prefer concrete visible attributes over prose, avoid duplicate tags, and do not add unknown character facts.',
      'Segment identity, body and clothing, pose and expression, scene and camera, then lighting and quality.',
      'Stage the result as an image draft through umbra_ui_stage_prompt.',
    ].join(' '),
  },
  {
    id: 'image-character-consistency',
    name: 'Character Consistency',
    mediaType: 'image',
    instruction: [
      'Prioritize stable character identity across iterative generations.',
      'Preserve the exact identity and trigger tokens from the user or current Umbra context, then clearly separate immutable identity traits from changeable outfit, pose, expression, camera, and scene details.',
      'Do not silently replace defining traits. Remove contradictions and stage an image draft with identity as the first segment.',
    ].join(' '),
  },
  {
    id: 'image-cinematic-composition',
    name: 'Cinematic Composition',
    mediaType: 'image',
    instruction: [
      'Act as a visual director. Turn the request into a precise image prompt with an intentional shot size, camera angle, lens feel, subject placement, depth, lighting direction, and readable environment.',
      'Avoid vague mood padding and contradictory camera terms. Keep the requested subject dominant and stage the result as segmented image prompt fields.',
    ].join(' '),
  },
  {
    id: 'video-motion-director',
    name: 'General Video Motion Director',
    mediaType: 'video',
    instruction: [
      'Write one coherent video-generation prompt describing subject, action, environmental motion, camera motion, timing, and continuity.',
      'Favor a single achievable shot over a list of cuts. Make motion physically clear, keep identity and wardrobe stable, and avoid mutually exclusive actions.',
      'Stage the result through umbra_ui_stage_prompt with mediaType video and use prompt for the final natural-language direction.',
    ].join(' '),
  },
  {
    id: 'video-wan-director',
    name: 'Wan Motion Prompt',
    mediaType: 'video',
    instruction: [
      'Compose a concise Wan-oriented motion prompt with explicit subject movement, camera movement, scene response, and temporal progression.',
      'Describe what changes from the opening moment to the ending moment without requesting hard cuts. Keep anatomy, identity, clothing, and object interactions consistent.',
      'Stage a video draft and use the negative prompt for severe temporal artifacts only.',
    ].join(' '),
  },
  {
    id: 'video-ltx-director',
    name: 'LTX Natural Language Director',
    mediaType: 'video',
    instruction: [
      'Write an LTX-friendly natural-language shot description in clear complete sentences.',
      'Specify the subject, setting, action, camera behavior, pace, lighting, and visual continuity. Keep the sequence feasible for one clip and avoid tag soup or abrupt scene changes.',
      'Stage the result as a video draft.',
    ].join(' '),
  },
  {
    id: 'video-image-continuity',
    name: 'Image-to-Video Continuity',
    mediaType: 'video',
    instruction: [
      'Treat the source image as the immutable opening frame.',
      'Describe natural motion that grows from visible poses, gaze, fabric, hair, props, lighting, and camera perspective without redesigning the subject or scene.',
      'Avoid revealing unsupported anatomy or unseen objects unless the user explicitly requests them. Stage a video draft with continuity-focused negative guidance.',
    ].join(' '),
  },
];

export function createDefaultUmbraUiAgentInstructions(now = Date.now()): UmbraUiAgentInstruction[] {
  return DEFAULT_INSTRUCTION_TEMPLATES.map((template, order) => ({
    ...template,
    createdAt: now,
    updatedAt: now,
    order,
  }));
}
