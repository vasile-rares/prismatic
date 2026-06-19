import { IRNode } from './ir.models';

export interface AiDesignRequest {
  prompt: string;
  existingIr?: IRNode;
  viewportWidth?: number;
  model?: string;
}

export interface AiDesignResponse {
  success: boolean;
  ir?: IRNode;
  message?: string;
}

// 3-Phase pipeline

export interface AiPipelineRequest {
  prompt: string;
  existingIr?: IRNode;
  viewportWidth?: number;
  model?: string;
  stopAfterPhase?: 1 | 2 | 3;
}

export interface IntentSection {
  name: string;
  purpose: string;
  layoutHint: string;
  order: number;
}

export interface IntentBlueprint {
  pageType: string;
  colorMood: string;
  brandPersonality: string;
  targetAudience: string;
  primaryCta: string;
  sections: IntentSection[];
}

export interface AiPipelineResponse {
  success: boolean;
  message?: string;
  intent?: IntentBlueprint;
  structure?: IRNode;
  ir?: IRNode;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ir?: IRNode;
  error?: boolean;
  isStreaming?: boolean;
  timestamp: number;
}
