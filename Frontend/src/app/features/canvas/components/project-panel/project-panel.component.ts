import {
  Component,
  ElementRef,
  HostBinding,
  HostListener,
  OnDestroy,
  OnInit,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AiChatMessage,
  CanvasElement,
  CanvasElementType,
  CanvasPageModel,
  IntentBlueprint,
  IRNode,
} from '@app/core';
import { ContextMenuComponent, ToggleGroupComponent } from '@app/shared';
import type { ContextMenuItem, ToggleGroupOption } from '@app/shared';
import {
  CanvasAiChatPersistenceService,
  PersistedAiChatState,
} from '../../services/editor/canvas-ai-chat-persistence.service';
import { DeviceFramePreset, VIEWPORT_PRESET_OPTIONS } from '../../canvas.types';
import { formatCanvasElementTypeLabel } from '../../utils/element/canvas-element-normalization.util';
import type { LayerDropPosition, LayerEntry } from './project-panel-layer-tree.util';
import {
  buildLayerEntriesByPage,
  canDropInside,
  findLayerEntryById,
  getPageViewportLabel,
  isInvalidLayerDrop,
} from './project-panel-layer-tree.util';
import {
  PageRenameSource,
  ProjectPanelPageActionsService,
} from './project-panel-page-actions.service';
import { ProjectPanelAiChatService } from './project-panel-ai-chat.service';

type ProjectPanelTab = 'navigator' | 'ai-chat';
type PageMenuContext = 'pages' | 'layers';

const DEFAULT_PANEL_WIDTH = 280;
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 440;
const PANEL_VIEWPORT_GUTTER = 240;
const DEFAULT_AI_MODEL_ID = 'gpt-5.4-mini';
const AI_CHAT_INTERRUPTED_MESSAGE = 'Generation interrupted by refresh.';
const DEVICE_FRAME_PRESET_OPTIONS = VIEWPORT_PRESET_OPTIONS.filter(
  (
    option,
  ): option is {
    id: Exclude<DeviceFramePreset, 'custom'>;
    label: string;
    width: number;
    height: number;
  } => option.id === 'desktop' || option.id === 'tablet' || option.id === 'mobile',
);

@Component({
  selector: 'app-project-panel',
  standalone: true,
  imports: [ContextMenuComponent, ToggleGroupComponent, FormsModule],
  providers: [ProjectPanelAiChatService, ProjectPanelPageActionsService],
  templateUrl: './project-panel.component.html',
  styleUrl: './project-panel.component.css',
})
export class ProjectPanelComponent implements OnInit, OnDestroy {
  // ── Inputs ────────────────────────────────────────────────

  @HostBinding('style.width.px') panelWidth = DEFAULT_PANEL_WIDTH;
  @HostBinding('class.is-resizing') isResizingPanel = false;

  readonly pages = input<CanvasPageModel[]>([]);
  readonly currentPageId = input<string | null>(null);
  readonly focusedPageId = input<string | null>(null);
  readonly selectedPageLayerId = input<string | null>(null);
  readonly canPastePage = input(false);
  readonly elements = input<CanvasElement[]>([]);
  readonly selectedElementId = input<string | null>(null);
  readonly selectedElementIds = input<string[]>([]);
  readonly currentIr = input<IRNode | null>(null);
  readonly viewportWidth = input(1280);

  // ── Outputs ───────────────────────────────────────────────

  readonly panelWidthChanged = output<number>();
  readonly designApplied = output<IRNode>();
  readonly aiUndoRequested = output<void>();
  readonly pageSelected = output<string>();
  readonly pageLayerSelected = output<string>();
  readonly pageCreateRequested = output<void>();
  readonly pageCopyRequested = output<string>();
  readonly pagePasteRequested = output<string>();
  readonly pageDuplicateRequested = output<string>();
  readonly pageDeleteRequested = output<string>();
  readonly pageNameChanged = output<{ id: string; name: string }>();
  readonly layerSelected = output<{ pageId: string; id: string; additive: boolean }>();
  readonly layerNameChanged = output<{ pageId: string; id: string; name: string }>();
  readonly layerVisibilityToggled = output<{ pageId: string; id: string }>();
  readonly layerMoved = output<{
    pageId: string;
    draggedIds: string[];
    targetId: string | null;
    position: LayerDropPosition;
  }>();
  readonly layerContextMenuRequested = output<{
    pageId: string;
    id: string;
    x: number;
    y: number;
  }>();
  readonly layerHovered = output<string | null>();

  // ── AI Chat State ─────────────────────────────────────────

  private readonly aiChat = inject(ProjectPanelAiChatService);
  private readonly pageActions = inject(ProjectPanelPageActionsService);
  private readonly aiChatPersistence = inject(CanvasAiChatPersistenceService);
  private readonly aiMessagesContainer = viewChild<ElementRef<HTMLElement>>('aiMessagesContainer');

  readonly aiMessages = this.aiChat.aiMessages;
  readonly aiUserInput = this.aiChat.aiUserInput;
  readonly aiIsLoading = this.aiChat.aiIsLoading;
  readonly aiSelectedModel = this.aiChat.aiSelectedModel;
  readonly aiModelDropdownOpen = this.aiChat.aiModelDropdownOpen;
  readonly aiCanUndo = this.aiChat.aiCanUndo;
  readonly AI_MODELS = this.aiChat.AI_MODELS;
  readonly AI_PROMPT_SUGGESTIONS = this.aiChat.AI_PROMPT_SUGGESTIONS;

  // ── Private State ─────────────────────────────────────────

  private cachedLayerEntriesByPage = new Map<string, LayerEntry[]>();
  private draggedLayerId: string | null = null;
  private draggedLayerPageId: string | null = null;
  private draggedLayerIds: string[] = [];
  private dragOverLayerId: string | null = null;
  private dragOverLayerPageId: string | null = null;
  private dragOverPosition: LayerDropPosition = 'before';
  private collapsedLayers = new Set<string>();
  private collapsedPageLayers = new Set<string>();

  // ── Public State ──────────────────────────────────────────

  editingLayerId: string | null = null;
  editingLayerName = '';
  editingPageId: string | null = null;
  pageMenuPageId: string | null = null;
  pageMenuItems: ContextMenuItem[] = [];
  pageMenuX = 0;
  pageMenuY = 0;
  activeTab: ProjectPanelTab = 'navigator';
  readonly panelTabOptions: readonly ToggleGroupOption[] = [
    {
      label: 'Navigator',
      value: 'navigator',
      ariaLabel: 'Open navigator tab',
      title: 'Navigator',
    },
    {
      label: 'AI Chat',
      value: 'ai-chat',
      ariaLabel: 'Open AI chat tab',
      title: 'AI Chat',
    },
  ];
  private pageMenuContext: PageMenuContext | null = null;
  private editingPageName = '';
  private editingPageSource: PageRenameSource | null = null;
  private resizeStartX = 0;
  private resizeStartWidth = DEFAULT_PANEL_WIDTH;
  private lastAiPrompt: string | null = null;
  private lastAiIntent: IntentBlueprint | null = null;
  private appliedRestoredAiChatProjectId: number | null = null;
  private isApplyingPersistedAiChatState = false;
  private readonly renameRequestListener: EventListener = (event) => {
    const renameEvent = event as CustomEvent<{ id?: string }>;
    const layerId = renameEvent.detail?.id;
    if (!layerId || !this.findLayerEntryById(layerId)) {
      return;
    }

    this.startRename(layerId);
  };

  // ── Getters ───────────────────────────────────────────────

  get layerEntries(): LayerEntry[] {
    const focusedPageId = this.focusedPageId();
    return focusedPageId ? this.getLayerEntriesForPage(focusedPageId) : [];
  }

  get visiblePageLayers(): CanvasPageModel[] {
    const targetId = this.focusedPageId() ?? this.selectedPageLayerId() ?? this.currentPageId();
    if (targetId) {
      const found = this.pages().find((p) => p.id === targetId);
      return found ? [found] : [];
    }
    return this.pages().slice(0, 1);
  }


  // ── Lifecycle ─────────────────────────────────────────────

  constructor() {
    this.aiChat.connect({
      getCurrentIr: () => this.currentIr(),
      getViewportWidth: () => this.viewportWidth(),
      getPages: () => this.pages(),
      getCurrentPageId: () => this.currentPageId(),
      getFocusedPageId: () => this.focusedPageId(),
      getSelectedPageLayerId: () => this.selectedPageLayerId(),
      getSelectedElementId: () => this.selectedElementId(),
      getSelectedElementIds: () => this.selectedElementIds(),
      findLayerEntryById: (id) => this.findLayerEntryById(id),
      getLayerEntriesForPage: (pageId) => this.getLayerEntriesForPage(pageId),
      getPageViewportLabel: (page) => getPageViewportLabel(page),
      getActiveTab: () => this.activeTab,
      setActiveTab: (tab) => {
        this.activeTab = tab;
      },
      emitDesignApplied: (ir) => this.designApplied.emit(ir),
      emitUndoRequested: () => this.aiUndoRequested.emit(),
    });

    this.pageActions.connect({
      getPages: () => this.pages(),
      canPastePage: () => this.canPastePage(),
      canDeletePage: () => this.canDeletePage(),
      emitPageSelected: (pageId) => this.pageSelected.emit(pageId),
      emitPageLayerSelected: (pageId) => this.pageLayerSelected.emit(pageId),
      emitPageCreateRequested: () => this.pageCreateRequested.emit(),
      emitPageCopyRequested: (pageId) => this.pageCopyRequested.emit(pageId),
      emitPagePasteRequested: (pageId) => this.pagePasteRequested.emit(pageId),
      emitPageDuplicateRequested: (pageId) => this.pageDuplicateRequested.emit(pageId),
      emitPageDeleteRequested: (pageId) => this.pageDeleteRequested.emit(pageId),
      emitPageNameChanged: (change) => this.pageNameChanged.emit(change),
    });

    effect(() => {
      this.editingPageId = this.pageActions.editingPageId();
      this.pageMenuPageId = this.pageActions.pageMenuPageId();
      this.pageMenuItems = this.pageActions.pageMenuItems();
      this.pageMenuX = this.pageActions.pageMenuX();
      this.pageMenuY = this.pageActions.pageMenuY();
    });

    effect(() => {
      this.elements(); // track elements changes
      this.rebuildLayerEntriesByPage();
    });

    effect(() => {
      const selectedId = this.selectedElementId();
      const elements = this.elements();
      if (!selectedId || elements.length === 0) return;

      // Build a quick parentId lookup
      const parentMap = new Map<string, string | null>();
      for (const el of elements) parentMap.set(el.id, el.parentId ?? null);

      // Walk up the ancestor chain and expand any collapsed ancestor
      let expanded = false;
      let current = parentMap.get(selectedId) ?? null;
      while (current !== null) {
        if (this.collapsedLayers.has(current)) {
          this.collapsedLayers.delete(current);
          expanded = true;
        }
        current = parentMap.get(current) ?? null;
      }

      if (expanded) this.rebuildLayerEntriesByPage();
    });

    effect(() => {
      this.aiMessagesContainer();
      this.aiMessages();
      queueMicrotask(() => {
        const el = this.aiMessagesContainer()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  ngOnInit(): void {
    window.addEventListener('canvas:rename-request', this.renameRequestListener);
    this.panelWidthChanged.emit(this.panelWidth);
  }

  ngOnDestroy(): void {
    window.removeEventListener('canvas:rename-request', this.renameRequestListener);
    this.stopPanelResize();
  }

  // ── Panel ───────────────────────────────────────────────────

  onTabValueChange(value: string | number | boolean): void {
    if (value === 'navigator' || value === 'ai-chat') {
      this.activeTab = value;
      this.closePageMenu();
      this.aiChat.scheduleAiChatPersistence();
    }
  }

  // ── AI Chat ───────────────────────────────────────────────

  private aiStreamAbort: AbortController | null = null;

  sendAiMessage(promptOverride?: string): void {
    this.aiChat.sendAiMessage(promptOverride);
  }

  onAiKeyDown(event: KeyboardEvent): void {
    this.aiChat.onAiKeyDown(event);
  }

  clearAiChat(): void {
    this.aiChat.clearAiChat();
  }

  stopAiGeneration(): void {
    this.aiChat.stopAiGeneration();
  }

  regenerateAiMessage(): void {
    this.aiChat.regenerateAiMessage();
  }

  undoLastAiApply(): void {
    this.aiChat.undoLastAiApply();
  }

  applyAiSuggestion(suggestion: { label: string; prompt: string }): void {
    this.aiChat.applyAiSuggestion(suggestion);
  }

  canRegenerateAiMessage(): boolean {
    return this.aiChat.canRegenerateAiMessage();
  }

  getModelLabel(modelId: string): string {
    return this.aiChat.getModelLabel(modelId);
  }

  getAiContextSummary(): string {
    const selectedIds = this.getSelectedAiElementIds();
    if (selectedIds.length > 0) {
      const entries = selectedIds
        .map((id) => this.findLayerEntryById(id))
        .filter((entry): entry is LayerEntry => !!entry);

      if (entries.length === 0) {
        return 'Selected element context';
      }

      const page = this.pages().find((candidate) => candidate.id === entries[0].pageId) ?? null;
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
          content: isInterruptedStream
            ? AI_CHAT_INTERRUPTED_MESSAGE
            : message.content,
          timestamp: message.timestamp,
          error: isInterruptedStream ? true : message.error,
        };
      }),
      draftInput,
      selectedModel,
      activeTab: this.activeTab === 'ai-chat' ? 'ai-chat' : 'navigator',
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
      this.activeTab = state?.activeTab === 'ai-chat' ? 'ai-chat' : 'navigator';
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

  private scheduleAiChatPersistence(): void {
    const projectId = this.aiChatPersistence.currentProjectId();
    const restoredProjectId = this.aiChatPersistence.restoredProjectId();
    if (
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

  private getSelectedAiElementIds(): string[] {
    const selectedIds = this.selectedElementIds();
    if (selectedIds.length > 0) {
      return [...new Set(selectedIds)];
    }

    const selectedId = this.selectedElementId();
    return selectedId ? [selectedId] : [];
  }

  private getSelectedAiPage(): CanvasPageModel | null {
    const pageId = this.focusedPageId() ?? this.selectedPageLayerId() ?? this.currentPageId();
    if (!pageId) {
      return null;
    }

    return this.pages().find((page) => page.id === pageId) ?? null;
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
      .map((id) => this.findLayerEntryById(id))
      .filter((entry): entry is LayerEntry => !!entry);

    if (entries.length === 0) {
      return null;
    }

    const page = this.pages().find((candidate) => candidate.id === entries[0].pageId) ?? null;
    const parts = [
      page ? `Page: ${page.name} (id: ${page.id}, viewport: ${this.getPageViewportLabel(page)})` : null,
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
    if (!page) {
      return null;
    }

    const layerEntries = this.getLayerEntriesForPage(page.id).filter((entry) => entry.depth === 0);
    const topLevelSummary =
      layerEntries.length > 0
        ? layerEntries
            .slice(0, 6)
            .map((entry) => `- ${entry.name} (${entry.typeLabel}, id: ${entry.id})`)
            .join('\n')
        : '- No top-level layers on this page.';

    return [
      `Page: ${page.name} (id: ${page.id}, viewport: ${this.getPageViewportLabel(page)})`,
      'Top-level layers:',
      topLevelSummary,
    ].join('\n');
  }

  private shouldAskForAiClarification(prompt: string): boolean {
    const normalized = prompt.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length <= 3) return true;

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
      .sort((a, b) => a.order - b.order)
      .map((section) => section.name)
      .slice(0, 5);
    const sectionsText =
      sectionNames.length > 0
        ? ` Sections: ${sectionNames.join(', ')}${intent.sections.length > sectionNames.length ? ', ...' : ''}.`
        : '';

    return `Applied a ${intent.colorMood} ${intent.pageType} design for ${intent.targetAudience}. Primary CTA: "${intent.primaryCta}".${sectionsText}`;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.aiModelDropdownOpen()) {
      this.aiModelDropdownOpen.set(false);
    }

    this.closePageMenu();
  }

  @HostListener('window:pointermove', ['$event'])
  onWindowPointerMove(event: PointerEvent): void {
    if (!this.isResizingPanel) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - this.resizeStartX;
    const nextWidth = this.clampPanelWidth(this.resizeStartWidth + deltaX);
    if (nextWidth === this.panelWidth) {
      return;
    }

    this.panelWidth = nextWidth;
    this.panelWidthChanged.emit(this.panelWidth);
  }

  @HostListener('window:pointerup')
  onWindowPointerUp(): void {
    this.stopPanelResize();
  }

  onPageSelect(pageId: string): void {
    this.pageActions.onPageSelect(pageId);
  }

  onLayerPageSelect(pageId: string): void {
    this.pageActions.onLayerPageSelect(pageId);
  }

  onResizeHandlePointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();

    this.isResizingPanel = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.panelWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }

  // ── Page Operations ──────────────────────────────────────

  startPageRename(pageId: string, event?: MouseEvent, source: PageRenameSource = 'pages'): void {
    this.pageActions.startPageRename(pageId, event, source);
  }

  isPageRenameActive(pageId: string, source: PageRenameSource): boolean {
    return this.pageActions.isPageRenameActive(pageId, source);
  }

  stopPageRename(pageId: string): void {
    this.pageActions.stopPageRename(pageId);
  }

  onPageNameInput(_pageId: string, event: Event): void {
    this.pageActions.onPageNameInput(event);
  }

  onPageNameKeyDown(_pageId: string, event: KeyboardEvent): void {
    this.pageActions.onPageNameKeyDown(event);
  }

  onPageCreate(): void {
    this.pageActions.onPageCreate();
  }

  togglePageMenu(pageId: string, event: MouseEvent): void {
    this.pageActions.togglePageMenu(pageId, event);
  }

  onLayerPageContextMenu(pageId: string, event: MouseEvent): void {
    this.pageActions.onLayerPageContextMenu(pageId, event);
  }

  closePageMenu(): void {
    this.pageActions.closePageMenu();
  }

  isPageMenuOpenFor(pageId: string): boolean {
    return this.pageActions.isPageMenuOpenFor(pageId);
  }

  onPageCopy(pageId: string): void {
    this.pageActions.onPageCopy(pageId);
  }

  onPagePaste(pageId: string): void {
    this.pageActions.onPagePaste(pageId);
  }

  onPageDuplicate(pageId: string): void {
    this.pageActions.onPageDuplicate(pageId);
  }

  onPageDelete(pageId: string, event?: MouseEvent): void {
    this.pageActions.onPageDelete(pageId, event);
  }

  // ── Layer Operations ─────────────────────────────────────

  onLayerMouseEnter(layer: LayerEntry): void {
    this.layerHovered.emit(layer.isEffectivelyHidden ? null : layer.id);
  }

  onLayerMouseLeave(): void {
    this.layerHovered.emit(null);
  }

  onLayerSelected(pageId: string, id: string, event?: MouseEvent): void {
    this.closePageMenu();
    const additive = !!(event?.shiftKey || event?.ctrlKey || event?.metaKey);
    this.layerSelected.emit({ pageId, id, additive });
  }

  onLayerNameInput(event: Event): void {
    this.editingLayerName = (event.target as HTMLInputElement).value;
  }

  onLayerNameClick(pageId: string, id: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.editingLayerId !== id) {
      this.layerSelected.emit({
        pageId,
        id,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
      });
    }
  }

  isLayerSelected(id: string): boolean {
    return this.selectedElementIds().includes(id) || this.selectedElementId() === id;
  }

  startRename(id: string, event?: MouseEvent): void {
    event?.stopPropagation();
    this.editingLayerName = this.findLayerEntryById(id)?.name ?? '';
    this.editingLayerId = id;
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-layer-name-id="${id}"]`);
      input?.select();
    });
  }

  stopRename(pageId: string, id: string): void {
    if (this.editingLayerId !== id) {
      return;
    }

    const trimmed = this.editingLayerName.trim();
    if (trimmed) {
      this.layerNameChanged.emit({ pageId, id, name: trimmed });
    }

    this.clearLayerRename();
  }

  onLayerNameKeyDown(id: string, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
      return;
    }

    if (event.key === 'Escape' && this.editingLayerId === id) {
      event.preventDefault();
      this.clearLayerRename();
    }
  }

  onLayerVisibilityToggle(pageId: string, id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.layerVisibilityToggled.emit({ pageId, id });
  }

  onLayerContextMenu(pageId: string, id: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.layerContextMenuRequested.emit({ pageId, id, x: event.clientX, y: event.clientY });
  }

  private clearLayerRename(): void {
    this.editingLayerId = null;
    this.editingLayerName = '';
  }

  private stopPanelResize(): void {
    if (!this.isResizingPanel) {
      return;
    }

    this.isResizingPanel = false;
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  }

  private clampPanelWidth(width: number): number {
    const maxWidth = Math.max(
      MIN_PANEL_WIDTH,
      Math.min(MAX_PANEL_WIDTH, window.innerWidth - PANEL_VIEWPORT_GUTTER),
    );

    return Math.min(Math.max(width, MIN_PANEL_WIDTH), maxWidth);
  }

  private findLayerEntryById(id: string): LayerEntry | null {
    for (const entries of this.cachedLayerEntriesByPage.values()) {
      const match = entries.find((entry) => entry.id === id);
      if (match) {
        return match;
      }
    }

    return null;
  }

  // ── Layer Drag ───────────────────────────────────────────────

  onLayerDragStart(pageId: string, id: string, event: DragEvent): void {
    this.draggedLayerId = id;
    this.draggedLayerPageId = pageId;

    const selectedIds = this.selectedElementIds();
    if (selectedIds.includes(id) && selectedIds.length > 1) {
      const pageLayerIds = new Set(this.getLayerEntriesForPage(pageId).map((entry) => entry.id));
      this.draggedLayerIds = selectedIds.filter((sid) => pageLayerIds.has(sid));
    } else {
      this.draggedLayerIds = [id];
    }

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
    }
  }

  onLayerDragOver(pageId: string, layer: LayerEntry, event: DragEvent): void {
    if (
      !this.draggedLayerId ||
      this.draggedLayerId === layer.id ||
      this.draggedLayerPageId !== pageId
    ) {
      return;
    }

    const currentDraggedLayer = this.getLayerEntriesForPage(pageId).find(
      (entry) => entry.id === this.draggedLayerId,
    );
    if (!currentDraggedLayer || this.isInvalidLayerDrop(pageId, currentDraggedLayer, layer)) {
      return;
    }

    event.preventDefault();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.dragOverLayerId = layer.id;
    this.dragOverLayerPageId = pageId;
    const relativeY = event.clientY - bounds.top;

    if (this.canDropInside(pageId, currentDraggedLayer, layer)) {
      const upperThreshold = bounds.height * 0.3;
      const lowerThreshold = bounds.height * 0.7;

      if (relativeY <= upperThreshold) {
        this.dragOverPosition = 'before';
      } else if (relativeY >= lowerThreshold) {
        this.dragOverPosition = 'after';
      } else {
        this.dragOverPosition = 'inside';
      }

      return;
    }

    this.dragOverPosition = relativeY < bounds.height / 2 ? 'before' : 'after';
  }

  onLayerDrop(pageId: string, layer: LayerEntry, event: DragEvent): void {
    event.preventDefault();

    if (
      !this.draggedLayerId ||
      this.draggedLayerId === layer.id ||
      this.draggedLayerPageId !== pageId
    ) {
      this.clearDragState();
      return;
    }

    const currentDraggedLayer = this.getLayerEntriesForPage(pageId).find(
      (entry) => entry.id === this.draggedLayerId,
    );
    if (!currentDraggedLayer || this.isInvalidLayerDrop(pageId, currentDraggedLayer, layer)) {
      this.clearDragState();
      return;
    }

    this.layerMoved.emit({
      pageId,
      draggedIds: this.draggedLayerIds.filter((did) => did !== layer.id),
      targetId: layer.id,
      position: this.dragOverPosition,
    });

    this.clearDragState();
  }

  onLayerDragEnd(): void {
    this.clearDragState();
  }

  onPageLayerDragOver(pageId: string, event: DragEvent): void {
    if (!this.draggedLayerId || this.draggedLayerPageId !== pageId) {
      return;
    }

    event.preventDefault();
    this.dragOverLayerId = null;
    this.dragOverLayerPageId = pageId;
    this.dragOverPosition = 'inside';
  }

  onPageLayerDrop(pageId: string, event: DragEvent): void {
    event.preventDefault();

    if (!this.draggedLayerId || this.draggedLayerPageId !== pageId) {
      this.clearDragState();
      return;
    }

    this.layerMoved.emit({
      pageId,
      draggedIds: this.draggedLayerIds,
      targetId: null,
      position: 'inside',
    });

    this.clearDragState();
  }

  // ── Layer View ───────────────────────────────────────────────

  isLayerCollapsed(id: string): boolean {
    return this.collapsedLayers.has(id);
  }

  pageLayerHasChildren(pageId: string): boolean {
    return this.getLayerEntriesForPage(pageId).length > 0;
  }

  pageLayerHasActiveLayout(pageId: string): boolean {
    return this.getLayerEntriesForPage(pageId).some(
      (entry) => entry.depth === 0 && entry.hasLayout,
    );
  }

  isPageLayerCollapsed(pageId: string): boolean {
    return this.collapsedPageLayers.has(pageId);
  }

  shouldShowPageLayerEntries(pageId: string): boolean {
    return this.getLayerEntriesForPage(pageId).length > 0 && !this.isPageLayerCollapsed(pageId);
  }

  togglePageLayerCollapse(pageId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.collapsedPageLayers.has(pageId)) {
      this.collapsedPageLayers.delete(pageId);
    } else {
      this.collapsedPageLayers.add(pageId);
    }
  }

  toggleLayerCollapse(id: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.collapsedLayers.has(id)) {
      this.collapsedLayers.delete(id);
    } else {
      this.collapsedLayers.add(id);
    }
    this.rebuildLayerEntriesByPage();
  }

  isLayerDragging(pageId: string, id: string): boolean {
    return this.draggedLayerPageId === pageId && this.draggedLayerId === id;
  }

  isLayerDropTarget(pageId: string, id: string, position: LayerDropPosition): boolean {
    return (
      this.dragOverLayerPageId === pageId &&
      this.dragOverLayerId === id &&
      this.dragOverPosition === position
    );
  }

  isPageRootDropTarget(pageId: string): boolean {
    return (
      this.dragOverLayerPageId === pageId &&
      this.dragOverLayerId === null &&
      this.dragOverPosition === 'inside'
    );
  }

  getLayerEntriesForPage(pageId: string): LayerEntry[] {
    return this.cachedLayerEntriesByPage.get(pageId) ?? [];
  }

  // ── Type Checks & Utils ───────────────────────────────────

  isFrame(type: CanvasElementType): boolean {
    return type === 'frame';
  }

  isRectangle(type: CanvasElementType): boolean {
    return type === 'rectangle';
  }

  usesFilledRectangleLayerIcon(layer: LayerEntry): boolean {
    return layer.type === 'rectangle' && layer.hasChildren && !layer.hasLayout;
  }

  usesImageLayerIcon(layer: LayerEntry): boolean {
    return layer.hasImageFill;
  }

  isText(type: CanvasElementType): boolean {
    return type === 'text';
  }

  trackByLayerId(_: number, layer: LayerEntry): string {
    return layer.id;
  }

  trackByPageId(_: number, page: CanvasPageModel): string {
    return page.id;
  }

  getPageViewportLabel(page: CanvasPageModel): string {
    const preset = page.viewportPreset ?? 'desktop';
    const width =
      typeof page.viewportWidth === 'number' && Number.isFinite(page.viewportWidth)
        ? Math.max(100, Math.round(page.viewportWidth))
        : 1280;
    const height =
      typeof page.viewportHeight === 'number' && Number.isFinite(page.viewportHeight)
        ? Math.max(100, Math.round(page.viewportHeight))
        : 720;

    const presetLabel =
      preset === 'desktop'
        ? 'Desktop'
        : preset === 'tablet'
          ? 'Tablet'
          : preset === 'mobile'
            ? 'Mobile'
            : 'Custom';

    return `${presetLabel} · ${width} × ${height}`;
  }

  canDeletePage(): boolean {
    return this.pages().length > 1;
  }

  // ── Private Helpers ───────────────────────────────────────

  private rebuildLayerEntriesByPage(): void {
    this.cachedLayerEntriesByPage = new Map(
      this.pages().map((page) => [page.id, this.buildLayerEntries(page.elements, page.id)]),
    );
  }

  private buildLayerEntries(elements: CanvasElement[], pageId: string): LayerEntry[] {
    if (elements.length === 0) {
      return [];
    }

    const elementIds = new Set(elements.map((element) => element.id));
    const childrenByParent = new Map<string | null, CanvasElement[]>();

    for (const element of elements) {
      const parentKey =
        element.parentId && elementIds.has(element.parentId) ? element.parentId : null;
      const existingChildren = childrenByParent.get(parentKey);
      if (existingChildren) {
        existingChildren.push(element);
      } else {
        childrenByParent.set(parentKey, [element]);
      }
    }

    const entries: LayerEntry[] = [];
    const seen = new Set<string>();
    const typeCounters = new Map<CanvasElementType, number>();

    const walk = (parentId: string | null, depth: number, isAncestorHidden: boolean) => {
      const children = childrenByParent.get(parentId) ?? [];
      for (const child of children) {
        if (seen.has(child.id)) {
          continue;
        }

        seen.add(child.id);
        const nextTypeCount = (typeCounters.get(child.type) ?? 0) + 1;
        typeCounters.set(child.type, nextTypeCount);

        const typeLabel = formatCanvasElementTypeLabel(child.type);
        const fallbackName =
          child.type === 'rectangle' ||
          child.type === 'text' ||
          child.type === 'image' ||
          child.type === 'frame'
            ? typeLabel
            : `${typeLabel} ${nextTypeCount}`;

        const isVisible = child.visible !== false;
        const isEffectivelyHidden = isAncestorHidden || !isVisible;

        entries.push({
          pageId,
          id: child.id,
          depth,
          type: child.type,
          typeLabel,
          parentId: child.parentId ?? null,
          name: typeof child.name === 'string' ? child.name : fallbackName,
          visible: isVisible,
          isEffectivelyHidden,
          hasChildren: (childrenByParent.get(child.id)?.length ?? 0) > 0,
          hasLayout: !!child.display,
          hasImageFill: child.fillMode === 'image',
          devicePreset: this.getDeviceFramePreset(child),
        });

        if (!this.collapsedLayers.has(child.id)) {
          walk(child.id, depth + 1, isEffectivelyHidden);
        }
      }
    };

    walk(null, 0, false);
    return entries;
  }

  private getDeviceFramePreset(
    element: CanvasElement,
  ): Exclude<DeviceFramePreset, 'custom'> | null {
    if (element.type !== 'frame' || element.parentId) {
      return null;
    }

    const normalizedName = (element.name ?? '').trim().toLowerCase();
    if (normalizedName.startsWith('desktop')) {
      return 'desktop';
    }

    if (normalizedName.startsWith('tablet')) {
      return 'tablet';
    }

    if (normalizedName.startsWith('mobile')) {
      return 'mobile';
    }

    const roundedWidth = Math.round(element.width);
    const matchedPreset = DEVICE_FRAME_PRESET_OPTIONS.find(
      (option) => option.width === roundedWidth,
    );
    return matchedPreset?.id ?? null;
  }

  private clearDragState(): void {
    this.draggedLayerId = null;
    this.draggedLayerPageId = null;
    this.draggedLayerIds = [];
    this.dragOverLayerId = null;
    this.dragOverLayerPageId = null;
    this.dragOverPosition = 'before';
  }

  private canDropInside(pageId: string, dragged: LayerEntry, target: LayerEntry): boolean {
    return (
      this.canContainLayers(target) &&
      dragged.type !== 'frame' &&
      !this.isDescendantOf(pageId, dragged.id, target.id)
    );
  }

  private canContainLayers(layer: LayerEntry): boolean {
    return layer.type === 'frame' || layer.type === 'rectangle';
  }

  private isInvalidLayerDrop(pageId: string, dragged: LayerEntry, target: LayerEntry): boolean {
    return dragged.id === target.id || this.isDescendantOf(pageId, dragged.id, target.id);
  }

  private isDescendantOf(pageId: string, ancestorId: string, elementId: string): boolean {
    const parentById = new Map(
      this.getPageElements(pageId).map((element) => [element.id, element.parentId ?? null]),
    );
    let currentParentId = parentById.get(elementId) ?? null;

    while (currentParentId) {
      if (currentParentId === ancestorId) {
        return true;
      }

      currentParentId = parentById.get(currentParentId) ?? null;
    }

    return false;
  }

  private getPageElements(pageId: string): CanvasElement[] {
    return this.pages().find((page) => page.id === pageId)?.elements ?? [];
  }
}
