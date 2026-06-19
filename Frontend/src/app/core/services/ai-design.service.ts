import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AiDesignRequest,
  AiDesignResponse,
  AiPipelineRequest,
  AiPipelineResponse,
  IntentBlueprint,
} from '../models/ai-design.models';
import { IRNode } from '../models/ir.models';

export interface AiStreamCallbacks {
  onChunk: (text: string) => void;
  onResult: (ir: AiDesignResponse) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

export interface AiPipelineCallbacks {
  onPhaseStart?: (phase: number, label: string) => void;
  onIntentReady?: (blueprint: IntentBlueprint) => void;
  onStructureReady?: (structure: IRNode) => void;
  onResult: (response: AiPipelineResponse) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

@Injectable({ providedIn: 'root' })
export class AiDesignService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  generateDesign(request: AiDesignRequest): Observable<AiDesignResponse> {
    return this.http.post<AiDesignResponse>(`${this.baseUrl}/ai/design`, request);
  }

  async generateDesignStream(
    request: AiDesignRequest,
    callbacks: AiStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/ai/design/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      credentials: 'include',
      signal,
    });

    if (!response.ok || !response.body) {
      callbacks.onError('AI service is temporarily unavailable.');
      callbacks.onDone();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6).replace(/\\n/g, '\n');
            this.handleStreamEvent(eventType, data, callbacks);
            eventType = '';
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      callbacks.onError('Connection to AI service was lost.');
    } finally {
      callbacks.onDone();
    }
  }

  // 3-Phase pipeline

  generatePipeline(request: AiPipelineRequest): Observable<AiPipelineResponse> {
    return this.http.post<AiPipelineResponse>(`${this.baseUrl}/ai/design/pipeline`, request);
  }

  async generatePipelineStream(
    request: AiPipelineRequest,
    callbacks: AiPipelineCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/ai/design/pipeline/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      credentials: 'include',
      signal,
    });

    if (!response.ok || !response.body) {
      callbacks.onError('AI service is temporarily unavailable.');
      callbacks.onDone();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6).replace(/\\n/g, '\n');
            this.handlePipelineEvent(eventType, data, callbacks);
            eventType = '';
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      callbacks.onError('Connection to AI service was lost.');
    } finally {
      callbacks.onDone();
    }
  }

  private handleStreamEvent(type: string, data: string, callbacks: AiStreamCallbacks): void {
    switch (type) {
      case 'chunk':
        callbacks.onChunk(data);
        break;
      case 'result':
        try {
          const ir = JSON.parse(data);
          callbacks.onResult({ success: true, ir });
        } catch {
          callbacks.onError('Failed to parse AI result.');
        }
        break;
      case 'error':
        callbacks.onError(data);
        break;
    }
  }

  private handlePipelineEvent(type: string, data: string, callbacks: AiPipelineCallbacks): void {
    try {
      switch (type) {
        case 'phase_start': {
          const parsed = JSON.parse(data) as { phase: number; label: string };
          callbacks.onPhaseStart?.(parsed.phase, parsed.label);
          break;
        }
        case 'phase_complete': {
          const parsed = JSON.parse(data) as { phase: number; data?: string };
          if (parsed.phase === 1 && parsed.data) {
            callbacks.onIntentReady?.(JSON.parse(parsed.data));
          } else if (parsed.phase === 2 && parsed.data) {
            callbacks.onStructureReady?.(JSON.parse(parsed.data));
          }
          break;
        }
        case 'result': {
          const response = JSON.parse(data) as AiPipelineResponse;
          callbacks.onResult(response);
          break;
        }
        case 'error':
          callbacks.onError(data);
          break;
      }
    } catch {
      callbacks.onError('Failed to parse pipeline event.');
    }
  }
}
