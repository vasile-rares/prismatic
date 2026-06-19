import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  NgZone,
  OnDestroy,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import gsap from 'gsap';
import { GeneratedFile, IRNode } from '@app/core';
import { SupportedFramework } from '../../../canvas.types';

type CopyKind = 'current' | 'ir';

@Component({
  selector: 'app-generation-tab',
  standalone: true,
  imports: [],
  templateUrl: './generation-tab.component.html',
  styleUrl: './generation-tab.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class GenerationTabComponent implements OnDestroy {
  readonly selectedFramework = input<SupportedFramework>('html');
  readonly validationResult = input<boolean | null>(null);
  readonly apiError = input<string | null>(null);
  readonly isValidating = input(false);
  readonly isGenerating = input(false);
  readonly generatedHtml = input('');
  readonly generatedCss = input('');
  readonly generatedFiles = input<GeneratedFile[]>([]);
  readonly irPreview = input<IRNode | null>(null);
  readonly designJson = input<string | null>(null);
  readonly projectName = input<string>('project');

  readonly isViewerOpen = signal(false);
  readonly showViewer = signal(false);
  viewerTab: 'code' | 'json' = 'code';
  highlightedDesignJson = '';

  private readonly viewerDialogRef = viewChild<ElementRef<HTMLElement>>('viewerDialog');
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);

  readonly frameworkChanged = output<SupportedFramework>();
  readonly validateRequested = output<void>();
  readonly generateRequested = output<void>();

  activeFileIndex = 0;
  readonly copiedKind = signal<CopyKind | null>(null);
  highlightedCode = '';
  highlightedIr = '';
  copyDesignJsonLabel = 'Copy JSON';

  private copyResetTimer: number | null = null;

  constructor() {
    effect(() => {
      const files = this.generatedFiles();
      if (this.activeFileIndex >= files.length) {
        this.activeFileIndex = 0;
      }
      this.refreshHighlightedCode();
    });
    effect(() => {
      const ir = this.irPreview();
      this.highlightedIr = this.highlightJson(ir ? JSON.stringify(ir, null, 2) : '');
    });
    effect(() => {
      const raw = this.designJson() ?? '';
      let pretty = raw;
      try {
        pretty = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        /* keep raw */
      }
      this.highlightedDesignJson = this.highlightJson(pretty);
    });
    effect(() => {
      if (this.isViewerOpen()) {
        this.showViewer.set(true);
        afterNextRender(() => this.animateViewerOpen(), { injector: this.injector });
      } else if (this.showViewer()) {
        this.animateViewerClose(() => this.showViewer.set(false));
      }
    });
  }

  readonly frameworkOptions: ReadonlyArray<{
    value: SupportedFramework;
    label: string;
  }> = [
    { value: 'html', label: 'HTML' },
    { value: 'react', label: 'React' },
    { value: 'angular', label: 'Angular' },
  ];

  ngOnDestroy(): void {
    if (this.copyResetTimer !== null) {
      window.clearTimeout(this.copyResetTimer);
    }
    if (this.isViewerOpen()) {
      document.body.style.overflow = '';
    }
  }

  selectFramework(framework: SupportedFramework): void {
    if (framework === this.selectedFramework()) {
      return;
    }

    this.frameworkChanged.emit(framework);
  }

  selectFile(index: number): void {
    if (index >= 0 && index < this.generatedFiles().length) {
      this.activeFileIndex = index;
      this.refreshHighlightedCode();
    }
  }

  hasGeneratedCode(): boolean {
    return this.generatedFiles().length > 0;
  }

  getActiveFile(): GeneratedFile | null {
    return this.generatedFiles()[this.activeFileIndex] ?? null;
  }

  getActiveFileContent(): string {
    return this.getActiveFile()?.content ?? '';
  }

  getActiveFilePath(): string {
    return this.getActiveFile()?.path ?? '';
  }

  getActiveFileName(): string {
    const path = this.getActiveFilePath();
    return path.split('/').pop() ?? path;
  }

  getFileIcon(path: string): string {
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.jsx')) return 'jsx';
    if (path.endsWith('.ts')) return 'ts';
    return 'file';
  }

  getStatusTone(): 'idle' | 'working' | 'success' | 'error' {
    if (this.apiError() || this.validationResult() === false) {
      return 'error';
    }

    if (this.isValidating() || this.isGenerating()) {
      return 'working';
    }

    if (this.hasGeneratedCode() || this.validationResult() === true) {
      return 'success';
    }

    return 'idle';
  }

  getStatusLabel(): string {
    if (this.apiError()) {
      return 'Generation failed';
    }

    if (this.isGenerating()) {
      return 'Generating code';
    }

    if (this.isValidating()) {
      return 'Checking IR';
    }

    if (this.validationResult() === false) {
      return 'IR needs attention';
    }

    if (this.hasGeneratedCode()) {
      return `${this.generatedFiles().length} files ready`;
    }

    if (this.validationResult() === true) {
      return 'IR ready';
    }

    return 'Ready to generate';
  }

  getStatusHint(): string {
    if (this.apiError()) {
      return this.apiError()!;
    }

    if (this.hasGeneratedCode()) {
      return 'Click a file to preview. Save individually or download all as ZIP.';
    }

    return 'Validate first if you want a quick structural check.';
  }

  getCopyButtonLabel(kind: CopyKind): string {
    if (this.copiedKind() === kind) {
      return 'Copied';
    }

    return kind === 'ir' ? 'Copy IR' : 'Copy';
  }

  lineCount(value: string): number {
    if (!value.trim()) {
      return 0;
    }

    return value.split(/\r?\n/).length;
  }

  copy(kind: CopyKind): void {
    const value =
      kind === 'ir'
        ? this.irPreview()
          ? JSON.stringify(this.irPreview(), null, 2)
          : ''
        : this.getActiveFileContent();
    if (!value) {
      return;
    }

    void this.writeToClipboard(value).then(() => {
      this.copiedKind.set(kind);

      if (this.copyResetTimer !== null) {
        window.clearTimeout(this.copyResetTimer);
      }

      this.copyResetTimer = window.setTimeout(() => {
        this.copiedKind.set(null);
        this.copyResetTimer = null;
      }, 1400);
    });
  }

  copyDesignJson(): void {
    const json = this.designJson();
    if (!json) return;
    void this.writeToClipboard(json).then(() => {
      this.copyDesignJsonLabel = 'Copied!';
      window.setTimeout(() => {
        this.copyDesignJsonLabel = 'Copy JSON';
      }, 1400);
    });
  }

  openViewer(tab: 'code' | 'json' = 'code'): void {
    this.viewerTab = tab;
    this.isViewerOpen.set(true);
    document.body.style.overflow = 'hidden';
  }

  closeViewer(): void {
    this.isViewerOpen.set(false);
  }

  onViewerBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeViewer();
  }

  private animateViewerOpen(): void {
    const el = this.viewerDialogRef()?.nativeElement;
    if (!el) return;
    this.zone.runOutsideAngular(() => {
      gsap.fromTo(
        el,
        { opacity: 0, scale: 0.96, y: 18, transformOrigin: 'center center' },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.28,
          ease: 'back.out(1.6)',
          clearProps: 'transform',
        },
      );
    });
  }

  private animateViewerClose(onDone: () => void): void {
    const el = this.viewerDialogRef()?.nativeElement;
    if (!el) {
      document.body.style.overflow = '';
      onDone();
      return;
    }
    this.zone.runOutsideAngular(() => {
      gsap.to(el, {
        opacity: 0,
        scale: 0.96,
        y: 18,
        duration: 0.18,
        ease: 'power2.in',
        transformOrigin: 'center center',
        onComplete: () =>
          this.zone.run(() => {
            document.body.style.overflow = '';
            onDone();
          }),
      });
    });
  }

  exportCurrentFile(): void {
    const file = this.getActiveFile();
    if (!file) return;

    const mimeType = file.path.endsWith('.css')
      ? 'text/css;charset=utf-8'
      : file.path.endsWith('.html')
        ? 'text/html;charset=utf-8'
        : file.path.endsWith('.json')
          ? 'application/json;charset=utf-8'
          : file.path.endsWith('.jsx') || file.path.endsWith('.tsx')
            ? 'text/javascript;charset=utf-8'
            : 'text/plain;charset=utf-8';
    this.downloadBlob(file.content, this.getActiveFileName(), mimeType);
  }

  async exportAsZip(): Promise<void> {
    if (this.generatedFiles().length === 0) return;

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    const { rewrittenFiles, assetEntries } = await this.bundleImageAssets(this.generatedFiles());

    for (const file of rewrittenFiles) {
      zip.file(file.path, file.content);
    }
    for (const { zipPath, blob } of assetEntries) {
      zip.file(zipPath, blob);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const slug =
      this.projectName()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'project';
    const fw = this.selectedFramework();
    this.downloadBlob(blob, `${slug}-${fw}.zip`, 'application/zip');
  }

  private async bundleImageAssets(files: GeneratedFile[]): Promise<{
    rewrittenFiles: GeneratedFile[];
    assetEntries: { zipPath: string; blob: Blob }[];
  }> {
    const urlPattern = /(?:https?:\/\/[^\s"')]+)?\/project-assets\/[^\s"')]+/g;

    const urlSet = new Set<string>();
    for (const file of files) {
      for (const match of file.content.matchAll(urlPattern)) {
        urlSet.add(match[0]);
      }
    }

    if (urlSet.size === 0) {
      return { rewrittenFiles: files, assetEntries: [] };
    }

    const urlToAssetPath = new Map<string, string>();
    const usedNames = new Set<string>();
    for (const url of urlSet) {
      const rawName = url.split('/').pop()?.split('?')[0] ?? 'image';
      let name = rawName;
      let counter = 1;
      while (usedNames.has(name)) {
        const dotIdx = rawName.lastIndexOf('.');
        const base = dotIdx >= 0 ? rawName.slice(0, dotIdx) : rawName;
        const ext = dotIdx >= 0 ? rawName.slice(dotIdx) : '';
        name = `${base}_${counter++}${ext}`;
      }
      usedNames.add(name);
      urlToAssetPath.set(url, `assets/${name}`);
    }

    const assetEntries: { zipPath: string; blob: Blob }[] = [];
    await Promise.all(
      [...urlToAssetPath.entries()].map(async ([url, zipPath]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) return;
          assetEntries.push({ zipPath, blob: await response.blob() });
        } catch {
          urlToAssetPath.delete(url);
        }
      }),
    );

    const rewrittenFiles = files.map((file) => {
      let content = file.content;
      for (const [originalUrl, assetPath] of urlToAssetPath) {
        const depth = file.path.split('/').length - 1;
        const relPrefix = depth > 0 ? '../'.repeat(depth) : './';
        content = content.replaceAll(originalUrl, relPrefix + assetPath);
      }
      return content === file.content ? file : { ...file, content };
    });

    return { rewrittenFiles, assetEntries };
  }

  private downloadBlob(content: string | Blob, fileName: string, mimeType: string): void {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private refreshHighlightedCode(): void {
    const file = this.getActiveFile();
    if (!file) {
      this.highlightedCode = '';
      return;
    }

    const path = file.path;
    if (path.endsWith('.css')) {
      this.highlightedCode = this.highlightCss(file.content);
    } else if (path.endsWith('.json')) {
      this.highlightedCode = this.highlightJson(file.content);
    } else if (path.endsWith('.html') || path.endsWith('.jsx')) {
      this.highlightedCode = this.highlightMarkup(file.content);
    } else if (path.endsWith('.ts')) {
      this.highlightedCode = this.highlightMarkup(file.content);
    } else {
      this.highlightedCode = this.escapeHtml(file.content);
    }
  }

  private highlightMarkup(code: string): string {
    if (!code.trim()) {
      return '';
    }

    return this.escapeHtml(code)
      .split(/\r?\n/)
      .map((line) => {
        if (!line.trim()) {
          return '';
        }

        if (line.includes('&lt;!--')) {
          return line.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="token-comment">$1</span>');
        }

        return line.replace(
          /(&lt;\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?&gt;)/g,
          (_match, open, tag, attrs, close) => {
            const highlightedAttrs = attrs.replace(
              /([\[\]\(\)\*#:@A-Za-z_][\w\-.:\[\]\(\)\*#@]*)(\s*=\s*)("[^"]*"|'[^']*')/g,
              '<span class="token-attr-name">$1</span>$2<span class="token-string">$3</span>',
            );

            return `<span class="token-punctuation">${open}</span><span class="token-tag">${tag}</span>${highlightedAttrs}<span class="token-punctuation">${close}</span>`;
          },
        );
      })
      .join('\n');
  }

  private highlightCss(code: string): string {
    if (!code.trim()) {
      return '';
    }

    return this.escapeHtml(code)
      .split(/\r?\n/)
      .map((line) => this.highlightCssLine(line))
      .join('\n');
  }

  private highlightCssLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) {
      return '';
    }

    if (trimmed.startsWith('/*')) {
      return `<span class="token-comment">${line}</span>`;
    }

    if (trimmed === '}') {
      return line.replace('}', '<span class="token-punctuation">}</span>');
    }

    if (trimmed.startsWith('@')) {
      return line
        .replace(/(@[\w-]+)/, '<span class="token-at-rule">$1</span>')
        .replace(/(\([^)]*\))/, '<span class="token-condition">$1</span>')
        .replace('{', '<span class="token-punctuation">{</span>');
    }

    const propertyMatch = line.match(/^(\s*)([a-z-]+)(\s*:\s*)(.*?)(;\s*)?$/);
    if (propertyMatch) {
      const [, indent, property, separator, value, suffix = ''] = propertyMatch;
      const highlightedSuffix = suffix.includes(';')
        ? suffix.replace(';', '<span class="token-punctuation">;</span>')
        : suffix;

      return `${indent}<span class="token-property">${property}</span>${separator}${this.highlightCssValue(value)}${highlightedSuffix}`;
    }

    if (line.includes('{')) {
      const braceIndex = line.indexOf('{');
      const selector = line.slice(0, braceIndex);
      const rest = line.slice(braceIndex + 1);
      return `<span class="token-selector">${selector}</span><span class="token-punctuation">{</span>${rest}`;
    }

    return line;
  }

  private highlightCssValue(value: string): string {
    const stashes: string[] = [];
    let result = value;

    result = this.stashMatches(
      result,
      /("(?:\\.|[^"])*"|'(?:\\.|[^'])*')/g,
      stashes,
      (match) => `<span class="token-string">${match}</span>`,
    );

    result = this.stashMatches(
      result,
      /(#[0-9a-fA-F]{3,8})/g,
      stashes,
      (match) => `<span class="token-color">${match}</span>`,
    );

    result = result
      .replace(/\b(-?\d*\.?\d+(?:px|rem|em|vh|vw|%|fr))\b/g, '<span class="token-number">$1</span>')
      .replace(/\b(-?\d*\.?\d+)\b/g, '<span class="token-number">$1</span>')
      .replace(
        /\b(auto|none|solid|dashed|dotted|double|flex|grid|block|absolute|relative|fixed|sticky|column|row|center|stretch|space-between|space-around|space-evenly|wrap|nowrap|hidden|visible|clip|repeat|minmax)\b/g,
        '<span class="token-keyword">$1</span>',
      );

    return this.restoreStashes(result, stashes);
  }

  private highlightJson(code: string): string {
    if (!code.trim()) {
      return '';
    }

    return this.escapeHtml(code)
      .replace(/("(?:\\.|[^"])*")(?=\s*:)/g, '<span class="token-key">$1</span>')
      .replace(/:\s*("(?:\\.|[^"])*")/g, ': <span class="token-string">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="token-keyword">$1</span>')
      .replace(/\b(-?\d*\.?\d+)\b/g, '<span class="token-number">$1</span>');
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private stashMatches(
    value: string,
    regex: RegExp,
    stashes: string[],
    formatter: (match: string) => string,
  ): string {
    return value.replace(regex, (match) => {
      const token = `__TOK${this.toAlphabetIndex(stashes.length)}__`;
      stashes.push(formatter(match));
      return token;
    });
  }

  private restoreStashes(value: string, stashes: string[]): string {
    return stashes.reduce(
      (current, stash, index) => current.replace(`__TOK${this.toAlphabetIndex(index)}__`, stash),
      value,
    );
  }

  private toAlphabetIndex(index: number): string {
    let value = index;
    let result = '';

    do {
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26) - 1;
    } while (value >= 0);

    return result;
  }

  private async writeToClipboard(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
