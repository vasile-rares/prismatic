import { CanvasElement, CanvasPageModel, CanvasProjectDocument, IRNode } from '@app/core';
import { buildCanvasIR } from './canvas-to-ir.mapper';
import { buildCanvasElementsFromIR } from './ir-to-canvas.mapper';

const CANVAS_DOCUMENT_PROP = 'favigonCanvasDocument';
const CURRENT_DOCUMENT_VERSION = '3.0';
const DEFAULT_PAGE_VIEWPORT_WIDTH = 1280;
const DEFAULT_PAGE_VIEWPORT_HEIGHT = 720;

export function buildCanvasProjectDocument(
  pages: CanvasPageModel[],
  projectId: string,
  activePageId: string | null,
): CanvasProjectDocument {
  const normalizedPages = pages;

  return {
    version: CURRENT_DOCUMENT_VERSION,
    projectId,
    activePageId: activePageId ?? normalizedPages[0]?.id ?? null,
    pages: normalizedPages.map((page) => ({
      id: page.id,
      name: page.name,
      viewportPreset: normalizeViewportPreset(page.viewportPreset),
      viewportWidth: normalizePageDimension(page.viewportWidth, DEFAULT_PAGE_VIEWPORT_WIDTH),
      viewportHeight: normalizePageDimension(page.viewportHeight, DEFAULT_PAGE_VIEWPORT_HEIGHT),
      canvasX: normalizeCanvasCoordinate(page.canvasX, 0),
      canvasY: normalizeCanvasCoordinate(page.canvasY, 0),
      elements: page.elements.map((element) => ({
        ...element,
        visible: element.visible !== false,
      })),
    })),
  };
}

export function buildPersistedCanvasDesign(document: CanvasProjectDocument): IRNode {
  const normalizedDocument = buildCanvasProjectDocument(
    document.pages,
    document.projectId,
    document.activePageId,
  );
  const activePage =
    normalizedDocument.pages.find((page) => page.id === normalizedDocument.activePageId) ??
    normalizedDocument.pages[0];
  const root = buildCanvasIR(activePage?.elements ?? [], document.projectId, activePage?.name);

  root.props = {
    ...root.props,
    [CANVAS_DOCUMENT_PROP]: normalizedDocument,
  };

  return root;
}

export function buildCanvasProjectDocumentFromUnknown(
  rawDesign: unknown,
  projectId: string,
): CanvasProjectDocument {
  const persistedDocument = readPersistedCanvasProjectDocument(rawDesign, projectId);
  if (persistedDocument) {
    return migrateDocumentIfNeeded(persistedDocument);
  }

  if (isCanvasProjectDocument(rawDesign)) {
    const rawPages = Array.isArray(rawDesign.pages) ? rawDesign.pages : [];
    const pages = rawPages;
    const fallbackActivePageId = pages[0]?.id ?? null;

    const doc: CanvasProjectDocument = {
      version: typeof rawDesign.version === 'string' ? rawDesign.version : CURRENT_DOCUMENT_VERSION,
      projectId:
        typeof rawDesign.projectId === 'string' && rawDesign.projectId.trim().length > 0
          ? rawDesign.projectId
          : projectId,
      activePageId:
        typeof rawDesign.activePageId === 'string' &&
        pages.some((page) => page.id === rawDesign.activePageId)
          ? rawDesign.activePageId
          : fallbackActivePageId,
      pages: pages.map((page, index) => normalizeCanvasPage(page, index + 1)),
    };
    return migrateDocumentIfNeeded(doc);
  }

  const legacyElements = buildCanvasElementsFromIR(rawDesign as IRNode | null | undefined);
  const defaultElements =
    legacyElements.length > 0
      ? legacyElements
      : [
          {
            id: crypto.randomUUID(),
            type: 'frame' as const,
            name: 'Desktop',
            x: 0,
            y: 0,
            width: DEFAULT_PAGE_VIEWPORT_WIDTH,
            height: DEFAULT_PAGE_VIEWPORT_HEIGHT,
            visible: true,
            fill: '#ffffff',
            strokeWidth: 1,
            strokeStyle: 'Solid' as const,
            opacity: 1,
            cornerRadius: 0,
            parentId: null,
            isPrimary: true,
          },
        ];
  const legacyPages = [
    {
      id: crypto.randomUUID(),
      name: 'Page 1',
      viewportPreset: 'desktop' as const,
      viewportWidth: DEFAULT_PAGE_VIEWPORT_WIDTH,
      viewportHeight: DEFAULT_PAGE_VIEWPORT_HEIGHT,
      canvasX: 0,
      canvasY: 0,
      elements: defaultElements,
    },
  ];
  return buildCanvasProjectDocument(legacyPages, projectId, null);
}

function readPersistedCanvasProjectDocument(
  rawDesign: unknown,
  projectId: string,
): CanvasProjectDocument | null {
  if (!rawDesign || typeof rawDesign !== 'object') {
    return null;
  }

  const rawRoot = rawDesign as Partial<IRNode>;
  const props = rawRoot.props;
  if (!props || typeof props !== 'object') {
    return null;
  }

  const rawDocument = (props as Record<string, unknown>)[CANVAS_DOCUMENT_PROP];
  if (!rawDocument || typeof rawDocument !== 'object') {
    return null;
  }

  return buildCanvasProjectDocumentFromUnknown(rawDocument, projectId);
}

function isCanvasProjectDocument(rawDesign: unknown): rawDesign is Partial<CanvasProjectDocument> {
  if (!rawDesign || typeof rawDesign !== 'object') {
    return false;
  }

  return Array.isArray((rawDesign as { pages?: unknown }).pages);
}

function normalizeCanvasPage(rawPage: unknown, pageIndex: number): CanvasPageModel {
  const page = rawPage && typeof rawPage === 'object' ? (rawPage as Partial<CanvasPageModel>) : {};
  const normalizedName =
    typeof page.name === 'string' && page.name.trim().length > 0
      ? page.name.trim()
      : `Page ${pageIndex}`;

  return {
    id: typeof page.id === 'string' && page.id.trim().length > 0 ? page.id : crypto.randomUUID(),
    name: normalizedName,
    viewportPreset: normalizeViewportPreset(page.viewportPreset),
    viewportWidth: normalizePageDimension(page.viewportWidth, DEFAULT_PAGE_VIEWPORT_WIDTH),
    viewportHeight: normalizePageDimension(page.viewportHeight, DEFAULT_PAGE_VIEWPORT_HEIGHT),
    canvasX: normalizeCanvasCoordinate(page.canvasX, 0),
    canvasY: normalizeCanvasCoordinate(page.canvasY, 0),
    elements: Array.isArray(page.elements)
      ? page.elements.map((element) => ({
          ...element,
          visible: element.visible !== false,
        }))
      : [],
  };
}

function normalizeViewportPreset(value: unknown): 'desktop' | 'tablet' | 'mobile' | 'custom' {
  return value === 'desktop' || value === 'tablet' || value === 'mobile' || value === 'custom'
    ? value
    : 'desktop';
}

function normalizePageDimension(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(100, Math.round(value));
}

function normalizeCanvasCoordinate(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(value);
}


function migrateDocumentIfNeeded(doc: CanvasProjectDocument): CanvasProjectDocument {
  const version = parseFloat(doc.version) || 2.0;
  if (version >= 3.0) {
    return doc;
  }

  return {
    ...doc,
    version: CURRENT_DOCUMENT_VERSION,
    pages: doc.pages.map((page) => ({
      ...page,
      elements: page.elements.map(migrateElementContentBoxToBorderBox),
    })),
  };
}

function migrateElementContentBoxToBorderBox(element: CanvasElement): CanvasElement {
  const paddingH = (element.padding?.left ?? 0) + (element.padding?.right ?? 0);
  const paddingV = (element.padding?.top ?? 0) + (element.padding?.bottom ?? 0);

  if (paddingH === 0 && paddingV === 0) {
    return element;
  }

  const migrated = { ...element };

  migrated.width = element.width + paddingH;
  migrated.height = element.height + paddingV;

  if (typeof element.minWidth === 'number' && element.minWidthMode !== 'relative') {
    migrated.minWidth = element.minWidth + paddingH;
  }
  if (typeof element.maxWidth === 'number' && element.maxWidthMode !== 'relative') {
    migrated.maxWidth = element.maxWidth + paddingH;
  }
  if (typeof element.minHeight === 'number' && element.minHeightMode !== 'relative') {
    migrated.minHeight = element.minHeight + paddingV;
  }
  if (typeof element.maxHeight === 'number' && element.maxHeightMode !== 'relative') {
    migrated.maxHeight = element.maxHeight + paddingV;
  }

  return migrated;
}
