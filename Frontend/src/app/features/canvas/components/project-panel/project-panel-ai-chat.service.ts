import { Injectable, effect, inject, signal } from '@angular/core';
import { AiChatMessage, AiDesignService, CanvasPageModel, IntentBlueprint, IRNode } from '@app/core';
import {
  CanvasAiChatPersistenceService,
  PersistedAiChatState,
} from '../../services/editor/canvas-ai-chat-persistence.service';
import { LayerEntry } from './project-panel-layer-tree.util';

type ProjectPanelTab = 'navigator' | 'ai-chat';

interface ProjectPanelAiChatContext {
  getCurrentIr: () => IRNode | null;
  getViewportWidth: () => number;
  getPages: () => CanvasPageModel[];
  getCurrentPageId: () => string | null;
  getFocusedPageId: () => string | null;
  getSelectedPageLayerId: () => string | null;
  getSelectedElementId: () => string | null;
  getSelectedElementIds: () => string[];
  findLayerEntryById: (id: string) => LayerEntry | null;
  getLayerEntriesForPage: (pageId: string) => LayerEntry[];
  getPageViewportLabel: (page: CanvasPageModel) => string;
  getActiveTab: () => ProjectPanelTab;
  setActiveTab: (tab: ProjectPanelTab) => void;
  emitDesignApplied: (ir: IRNode) => void;
  emitUndoRequested: () => void;
}

interface AiPromptSuggestion {
  label: string;
  prompt: string;
}

const DEFAULT_AI_MODEL_ID = 'gpt-5.4-mini';
const AI_CHAT_INTERRUPTED_MESSAGE = 'Generation interrupted by refresh.';

@Injectable()
export class ProjectPanelAiChatService {
  private readonly aiDesignService = inject(AiDesignService);
  private readonly aiChatPersistence = inject(CanvasAiChatPersistenceService);

  readonly aiMessages = signal<AiChatMessage[]>([]);
  readonly aiUserInput = signal('');
  readonly aiIsLoading = signal(false);
  readonly aiSelectedModel = signal(DEFAULT_AI_MODEL_ID);
  readonly aiModelDropdownOpen = signal(false);
  readonly aiCanUndo = signal(false);

  readonly AI_MODELS: readonly { id: string; label: string }[] = [
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
  ];

  readonly AI_PROMPT_SUGGESTIONS: readonly AiPromptSuggestion[] = [
    {
      label: 'SaaS landing',
      prompt:
        'Create a polished SaaS landing page for a design-to-code platform with hero, feature proof, pricing, testimonials and a strong CTA.',
    },
    {
      label: 'Restyle page',
      prompt:
        'Restyle the current page to feel more premium, with stronger hierarchy, cleaner spacing and a more confident visual system.',
    },
    {
      label: 'Add pricing',
      prompt:
        'Add a pricing section with three clear plans, concise benefits and a primary conversion CTA.',
    },
    {
      label: 'Rewrite hero',
      prompt:
        'Improve the hero section copy so the value proposition is sharper, more specific and easier to scan.',
    },
  ];

  private context: ProjectPanelAiChatContext | null = null;
  private aiStreamAbort: AbortController | null = null;
  private lastAiPrompt: string | null = null;
  private lastAiIntent: IntentBlueprint | null = null;
  private appliedRestoredAiChatProjectId: number | null = null;
  private isApplyingPersistedAiChatState = false;

  constructor() {
    effect(() => {
      const currentProjectId = this.aiChatPersistence.currentProjectId();
      const restoredProjectId = this.aiChatPersistence.restoredProjectId();
      if (!this.context || !currentProjectId || restoredProjectId !== currentProjectId) {
        return;
      }

      if (this.appliedRestoredAiChatProjectId === currentProjectId) {
        return;
      }

      this.applyPersistedAiChatState(this.aiChatPersistence.restoredState());
      this.appliedRestoredAiChatProjectId = currentProjectId;
    });

    effect(() => {
      const currentProjectId = this.aiChatPersistence.currentProjectId();
      const restoredProjectId = this.aiChatPersistence.restoredProjectId();
      const messages = this.aiMessages();
      const draftInput = this.aiUserInput();
      const selectedModel = this.aiSelectedModel();

      if (
        !this.context ||
        this.isApplyingPersistedAiChatState ||
        !currentProjectId ||
        restoredProjectId !== currentProjectId ||
        this.appliedRestoredAiChatProjectId !== currentProjectId
      ) {
        return;
      }

      this.aiChatPersistence.persist(
        currentProjectId,
        this.buildPersistedAiChatState(currentProjectId, messages, draftInput, selectedModel),
      );
    });
  }

  connect(context: ProjectPanelAiChatContext): void {
    this.context = context;
  }

  sendAiMessage(promptOverride?: string): void {
    const context = this.context;
    if (!context) {
      return;
    }

    const prompt = (promptOverride ?? this.aiUserInput()).trim();
    if (!prompt || this.aiIsLoading()) {
      return;
    }

    if (!promptOverride && this.shouldAskForAiClarification(prompt)) {
      this.aiMessages.update((messages) => [
        ...messages,
        { role: 'user', content: prompt, timestamp: Date.now() },
        {
          role: 'assistant',
          content:
            'What should this be for? Add page type, audience and style direction, then send again.',
          timestamp: Date.now() + 1,
        },
      ]);
      this.aiUserInput.set('');
      return;
    }

    const requestPrompt = this.buildAiRequestPrompt(prompt);
    this.lastAiPrompt = prompt;
    this.lastAiIntent = null;

    this.aiMessages.update((messages) => [
      ...messages,
      { role: 'user', content: prompt, timestamp: Date.now() },
    ]);
    this.aiUserInput.set('');
    this.aiIsLoading.set(true);

    const streamingMessage: AiChatMessage = {
      role: 'assistant',
      content: 'Analyzing your request...',
      isStreaming: true,
      timestamp: Date.now(),
    };
    this.aiMessages.update((messages) => [...messages, streamingMessage]);

    this.aiStreamAbort = new AbortController();
    const request = {
      prompt: requestPrompt,
      existingIr: context.getCurrentIr() ?? undefined,
      viewportWidth: context.getViewportWidth(),
      model: this.aiSelectedModel(),
    };

    this.aiDesignService.generatePipelineStream(
      request,
      {
        onPhaseStart: (_phase, label) => {
          this.aiMessages.update((messages) => {
            const updated = [...messages];
            const last = updated[updated.length - 1];
            if (last?.isStreaming) {
              updated[updated.length - 1] = { ...last, content: label };
            }
            return updated;
          });
        },
        onIntentReady: (blueprint) => {
          this.lastAiIntent = blueprint;
        },
        onResult: (response) => {
          if (!response.success || !response.ir) {
            return;
          }

          context.emitDesignApplied(response.ir);
          this.aiCanUndo.set(true);
          this.aiMessages.update((messages) => {
            const updated = [...messages];
            const last = updated[updated.length - 1];
            if (last?.isStreaming) {
              updated[updated.length - 1] = {
                ...last,
                content: this.buildAiAppliedSummary(response.intent ?? this.lastAiIntent),
                isStreaming: false,
              };
            }
            return updated;
          });
        },
        onError: (message) => {
          this.aiMessages.update((messages) => {
            const updated = [...messages];
            const last = updated[updated.length - 1];
            if (last?.isStreaming) {
              updated[updated.length - 1] = {
                ...last,
                content: message,
                error: true,
                isStreaming: false,
              };
            }
            return updated;
          });
        },
        onDone: () => {
          this.aiIsLoading.set(false);
          this.aiStreamAbort = null;
        },
      },
      this.aiStreamAbort.signal,
    );
  }

  onAiKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendAiMessage();
    }
  }

  clearAiChat(): void {
    this.aiMessages.set([]);
    this.aiUserInput.set('');
    this.lastAiPrompt = null;
    this.aiCanUndo.set(false);

    const projectId = this.aiChatPersistence.currentProjectId();
    if (projectId) {
      this.aiChatPersistence.clear(projectId);
      this.scheduleAiChatPersistence();
    }
  }

  stopAiGeneration(): void {
    if (!this.aiStreamAbort) {
      return;
    }

    this.aiStreamAbort.abort();
    this.aiStreamAbort = null;
    this.aiIsLoading.set(false);
    this.aiMessages.update((messages) => {
      const updated = [...messages];
      const last = updated[updated.length - 1];
      if (last?.isStreaming) {
        updated[updated.length - 1] = {
          ...last,
          content: 'Generation stopped.',
          isStreaming: false,
        };
      }
      return updated;
    });
    this.scheduleAiChatPersistence();
  }

  regenerateAiMessage(): void {
    if (!this.lastAiPrompt || this.aiIsLoading()) {
      return;
    }

    this.sendAiMessage(this.lastAiPrompt);
  }

  undoLastAiApply(): void {
    if (this.aiIsLoading() || !this.aiCanUndo()) {
      return;
    }

    this.context?.emitUndoRequested();
    this.aiCanUndo.set(false);
    this.aiMessages.update((messages) => [
      ...messages,
      {
        role: 'assistant',
        content: 'Reverted the last canvas change.',
        timestamp: Date.now(),
      },
    ]);
  }

  applyAiSuggestion(suggestion: AiPromptSuggestion): void {
    this.aiUserInput.set(suggestion.prompt);
  }

  canRegenerateAiMessage(): boolean {
    return !!this.lastAiPrompt && !this.aiIsLoading();
  }

  getModelLabel(modelId: string): string {
    return this.AI_MODELS.find((model) => model.id === modelId)?.label ?? modelId;
  }

  closeModelDropdown(): void {
    if (this.aiModelDropdownOpen()) {
      this.aiModelDropdownOpen.set(false);
    }
  }

  getAiContextSummary(): string {
    const selectedIds = this.getSelectedAiElementIds();
    if (selectedIds.length > 0) {
      const entries = selectedIds
        .map((id) => this.context?.findLayerEntryById(id) ?? null)
        .filter((entry): entry is LayerEntry => !!entry);

      if (entries.length === 0) {
        return 'Selected element context';
      }

      const page = this.context?.getPages().find((candidate) => candidate.id === entries[0].pageId) ?? null;
      const names = entries.slice(0, 2).map((entry) => entry.name);
      const elementLabel =
        entries.length === 1
          ? names[0]
          : `${names.join(', ')}${entries.length > names.length ? ` +${entries.length - names.length}` : ''}`;

      return page ? `${elementLabel} · ${page.name}` : elementLabel;
    }

    const page = this.getSelectedAiPage();
    return page ? `Page · ${page.name}` : 'Current page context';
  }

  getAiContextKindLabel(): string {
    return this.getSelectedAiElementIds().length > 0 ? 'Element context' : 'Page context';
  }

  scheduleAiChatPersistence(): void {
    const context = this.context;
    const projectId = this.aiChatPersistence.currentProjectId();
    const restoredProjectId = this.aiChatPersistence.restoredProjectId();
    if (
      !context ||
      this.isApplyingPersistedAiChatState ||
      !projectId ||
      restoredProjectId !== projectId ||
      this.appliedRestoredAiChatProjectId !== projectId
    ) {
      return;
    }

    this.aiChatPersistence.persist(
      projectId,
      this.buildPersistedAiChatState(
        projectId,
        this.aiMessages(),
        this.aiUserInput(),
        this.aiSelectedModel(),
      ),
    );
  }

  private buildAiRequestPrompt(userPrompt: string): string {
    const parts = ['User request:', userPrompt];
    parts.push('', 'Target context:', this.buildAiTargetInstruction());

    const targetContext = this.buildAiTargetContextDetails();
    if (targetContext) {
      parts.push('', 'Canvas context:', targetContext);
    }

    return parts.join('\n');
  }

  private buildPersistedAiChatState(
    projectId: number,
    messages: AiChatMessage[],
    draftInput: string,
    selectedModel: string,
  ): PersistedAiChatState {
    return {
      projectId,
      messages: messages.slice(-40).map((message, index, source) => {
        const isLast = index === source.length - 1;
        const isInterruptedStream = isLast && message.role === 'assistant' && message.isStreaming;
        return {
          role: message.role,
          content: isInterruptedStream ? AI_CHAT_INTERRUPTED_MESSAGE : message.content,
          timestamp: message.timestamp,
          error: isInterruptedStream ? true : message.error,
        };
      }),
      draftInput,
      selectedModel,
      activeTab: this.context?.getActiveTab() === 'ai-chat' ? 'ai-chat' : 'navigator',
      lastAiPrompt: this.lastAiPrompt,
      savedAt: Date.now(),
    };
  }

  private applyPersistedAiChatState(state: PersistedAiChatState | null): void {
    this.isApplyingPersistedAiChatState = true;

    try {
      this.aiMessages.set(
        state?.messages.map((message) => ({
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
          error: message.error,
        })) ?? [],
      );
      this.aiUserInput.set(state?.draftInput ?? '');
      const restoredModelId = state?.selectedModel;
      this.aiSelectedModel.set(
        this.isSupportedAiModel(restoredModelId) ? restoredModelId : DEFAULT_AI_MODEL_ID,
      );
      this.context?.setActiveTab(state?.activeTab === 'ai-chat' ? 'ai-chat' : 'navigator');
      this.lastAiPrompt = state?.lastAiPrompt ?? null;
      this.aiIsLoading.set(false);
      this.aiModelDropdownOpen.set(false);
      this.aiCanUndo.set(false);
      this.aiStreamAbort = null;
    } finally {
      this.isApplyingPersistedAiChatState = false;
    }
  }

  private isSupportedAiModel(modelId: string | null | undefined): modelId is string {
    return !!modelId && this.AI_MODELS.some((model) => model.id === modelId);
  }

  private getSelectedAiElementIds(): string[] {
    const selectedIds = this.context?.getSelectedElementIds() ?? [];
    if (selectedIds.length > 0) {
      return [...new Set(selectedIds)];
    }

    const selectedId = this.context?.getSelectedElementId() ?? null;
    return selectedId ? [selectedId] : [];
  }

  private getSelectedAiPage(): CanvasPageModel | null {
    const pageId =
      this.context?.getFocusedPageId() ??
      this.context?.getSelectedPageLayerId() ??
      this.context?.getCurrentPageId() ??
      null;
    if (!pageId) {
      return null;
    }

    return this.context?.getPages().find((page) => page.id === pageId) ?? null;
  }

  private buildAiTargetInstruction(): string {
    const selectedIds = this.getSelectedAiElementIds();
    if (selectedIds.length > 0) {
      return selectedIds.length === 1
        ? 'Apply the request only to the selected element. Preserve unrelated canvas content unless the user explicitly asks otherwise.'
        : 'Apply the request only to the selected elements. Preserve unrelated canvas content unless the user explicitly asks otherwise.';
    }

    return 'Apply the request only to the selected page context. Preserve unrelated pages unless the user explicitly asks otherwise.';
  }

  private buildAiTargetContextDetails(): string | null {
    const selectedIds = this.getSelectedAiElementIds();
    if (selectedIds.length > 0) {
      return this.buildAiElementContextDetails(selectedIds);
    }

    return this.buildAiPageContextDetails(this.getSelectedAiPage());
  }

  private buildAiElementContextDetails(selectedIds: string[]): string | null {
    const entries = selectedIds
      .map((id) => this.context?.findLayerEntryById(id) ?? null)
      .filter((entry): entry is LayerEntry => !!entry);

    if (entries.length === 0) {
      return null;
    }

    const page = this.context?.getPages().find((candidate) => candidate.id === entries[0].pageId) ?? null;
    const parts = [
      page
        ? `Page: ${page.name} (id: ${page.id}, viewport: ${this.context?.getPageViewportLabel(page)})`
        : null,
      ...entries
        .slice(0, 8)
        .map(
          (entry) =>
            `- ${entry.name} (${entry.typeLabel}, id: ${entry.id}${entry.parentId ? `, parent: ${entry.parentId}` : ''})`,
        ),
    ].filter((value): value is string => !!value);

    return parts.join('\n');
  }

  private buildAiPageContextDetails(page: CanvasPageModel | null): string | null {
    if (!page || !this.context) {
      return null;
    }

    const layerEntries = this.context.getLayerEntriesForPage(page.id).filter((entry) => entry.depth === 0);
    const topLevelSummary =
      layerEntries.length > 0
        ? layerEntries
            .slice(0, 6)
            .map((entry) => `- ${entry.name} (${entry.typeLabel}, id: ${entry.id})`)
            .join('\n')
        : '- No top-level layers on this page.';

    return [
      `Page: ${page.name} (id: ${page.id}, viewport: ${this.context.getPageViewportLabel(page)})`,
      'Top-level layers:',
      topLevelSummary,
    ].join('\n');
  }

  private shouldAskForAiClarification(prompt: string): boolean {
    const normalized = prompt.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length <= 3) {
      return true;
    }

    const hasPageIntent = [
      'landing',
      'dashboard',
      'auth',
      'login',
      'signup',
      'pricing',
      'hero',
      'section',
      'page',
      'navbar',
      'footer',
      'card',
      'form',
      'portfolio',
      'ecommerce',
      'blog',
    ].some((term) => normalized.includes(term));

    const hasStyleIntent = [
      'premium',
      'minimal',
      'bold',
      'dark',
      'clean',
      'modern',
      'professional',
      'playful',
      'elegant',
      'vibrant',
      'rewrite',
      'restyle',
      'add',
      'improve',
      'create',
      'make',
      'schimba',
      'adauga',
      'imbunatateste',
      'creeaza',
    ].some((term) => normalized.includes(term));

    return words.length < 8 && !hasPageIntent && !hasStyleIntent;
  }

  private buildAiAppliedSummary(intent: IntentBlueprint | null | undefined): string {
    if (!intent) {
      return 'Applied the generated design to the canvas.';
    }

    const sectionNames = intent.sections
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((section) => section.name)
      .slice(0, 5);
    const sectionsText =
      sectionNames.length > 0
        ? ` Sections: ${sectionNames.join(', ')}${intent.sections.length > sectionNames.length ? ', ...' : ''}.`
        : '';

    return `Applied a ${intent.colorMood} ${intent.pageType} design for ${intent.targetAudience}. Primary CTA: "${intent.primaryCta}".${sectionsText}`;
  }
}
