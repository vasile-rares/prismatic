import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export interface GoogleFont {
  family: string;
  category: 'sans-serif' | 'serif' | 'monospace' | 'display' | 'handwriting' | 'system';
}

export const GOOGLE_FONTS: GoogleFont[] = [
  // Sans-serif
  { family: 'Inter', category: 'sans-serif' },
  { family: 'Roboto', category: 'sans-serif' },
  { family: 'Open Sans', category: 'sans-serif' },
  { family: 'Lato', category: 'sans-serif' },
  { family: 'Poppins', category: 'sans-serif' },
  { family: 'Montserrat', category: 'sans-serif' },
  { family: 'Nunito', category: 'sans-serif' },
  { family: 'Raleway', category: 'sans-serif' },
  { family: 'Ubuntu', category: 'sans-serif' },
  { family: 'Source Sans 3', category: 'sans-serif' },
  { family: 'Josefin Sans', category: 'sans-serif' },
  { family: 'Cabin', category: 'sans-serif' },
  { family: 'Mulish', category: 'sans-serif' },
  { family: 'Rubik', category: 'sans-serif' },
  { family: 'DM Sans', category: 'sans-serif' },
  { family: 'Manrope', category: 'sans-serif' },
  { family: 'Plus Jakarta Sans', category: 'sans-serif' },
  { family: 'Space Grotesk', category: 'sans-serif' },
  { family: 'Outfit', category: 'sans-serif' },
  { family: 'Figtree', category: 'sans-serif' },
  { family: 'Noto Sans', category: 'sans-serif' },
  { family: 'Work Sans', category: 'sans-serif' },
  { family: 'Karla', category: 'sans-serif' },
  { family: 'Barlow', category: 'sans-serif' },
  { family: 'Jost', category: 'sans-serif' },
  { family: 'Lexend', category: 'sans-serif' },
  { family: 'Quicksand', category: 'sans-serif' },
  { family: 'Exo 2', category: 'sans-serif' },
  { family: 'Titillium Web', category: 'sans-serif' },
  { family: 'Hind', category: 'sans-serif' },
  { family: 'Fira Sans', category: 'sans-serif' },
  { family: 'Oswald', category: 'sans-serif' },
  { family: 'Nunito Sans', category: 'sans-serif' },
  { family: 'PT Sans', category: 'sans-serif' },
  { family: 'Oxygen', category: 'sans-serif' },
  { family: 'Exo', category: 'sans-serif' },
  { family: 'Varela Round', category: 'sans-serif' },
  { family: 'Asap', category: 'sans-serif' },
  { family: 'Dosis', category: 'sans-serif' },
  { family: 'Signika', category: 'sans-serif' },
  { family: 'Assistant', category: 'sans-serif' },
  { family: 'Catamaran', category: 'sans-serif' },
  { family: 'Mada', category: 'sans-serif' },
  { family: 'IBM Plex Sans', category: 'sans-serif' },
  { family: 'Sora', category: 'sans-serif' },
  { family: 'Epilogue', category: 'sans-serif' },
  { family: 'Be Vietnam Pro', category: 'sans-serif' },
  { family: 'Schibsted Grotesk', category: 'sans-serif' },
  { family: 'Geist', category: 'sans-serif' },
  // Serif
  { family: 'Playfair Display', category: 'serif' },
  { family: 'Merriweather', category: 'serif' },
  { family: 'PT Serif', category: 'serif' },
  { family: 'Lora', category: 'serif' },
  { family: 'Cormorant Garamond', category: 'serif' },
  { family: 'EB Garamond', category: 'serif' },
  { family: 'Noto Serif', category: 'serif' },
  { family: 'Libre Baskerville', category: 'serif' },
  { family: 'Crimson Text', category: 'serif' },
  { family: 'Spectral', category: 'serif' },
  { family: 'Bitter', category: 'serif' },
  { family: 'Domine', category: 'serif' },
  { family: 'Gelasio', category: 'serif' },
  { family: 'IBM Plex Serif', category: 'serif' },
  { family: 'Zilla Slab', category: 'serif' },
  { family: 'Cardo', category: 'serif' },
  { family: 'Fraunces', category: 'serif' },
  // Monospace
  { family: 'Fira Code', category: 'monospace' },
  { family: 'JetBrains Mono', category: 'monospace' },
  { family: 'Space Mono', category: 'monospace' },
  { family: 'Source Code Pro', category: 'monospace' },
  { family: 'Roboto Mono', category: 'monospace' },
  { family: 'IBM Plex Mono', category: 'monospace' },
  { family: 'Inconsolata', category: 'monospace' },
  { family: 'Cousine', category: 'monospace' },
  { family: 'Share Tech Mono', category: 'monospace' },
  // Display
  { family: 'Bebas Neue', category: 'display' },
  { family: 'Anton', category: 'display' },
  { family: 'Righteous', category: 'display' },
  { family: 'Fredoka One', category: 'display' },
  { family: 'Boogaloo', category: 'display' },
  { family: 'Lilita One', category: 'display' },
  { family: 'Black Han Sans', category: 'display' },
  { family: 'Teko', category: 'display' },
  { family: 'Russo One', category: 'display' },
  { family: 'Permanent Marker', category: 'display' },
  // Handwriting
  { family: 'Pacifico', category: 'handwriting' },
  { family: 'Lobster', category: 'handwriting' },
  { family: 'Dancing Script', category: 'handwriting' },
  { family: 'Caveat', category: 'handwriting' },
  { family: 'Sacramento', category: 'handwriting' },
  { family: 'Great Vibes', category: 'handwriting' },
  { family: 'Satisfy', category: 'handwriting' },
  { family: 'Kaushan Script', category: 'handwriting' },
  { family: 'Allura', category: 'handwriting' },
  { family: 'Arial', category: 'system' },
  { family: 'Helvetica', category: 'system' },
  { family: 'Georgia', category: 'system' },
  { family: 'Times New Roman', category: 'system' },
  { family: 'Verdana', category: 'system' },
  { family: 'Trebuchet MS', category: 'system' },
  { family: 'Courier New', category: 'system' },
  { family: 'Impact', category: 'system' },
];

@Injectable({ providedIn: 'root' })
export class CanvasFontsService {
  private readonly document = inject(DOCUMENT);
  private readonly loadedFonts = new Set<string>();

  readonly fontList: GoogleFont[] = GOOGLE_FONTS;

  loadFont(family: string): void {
    const font = this.fontList.find((f) => f.family === family);
    if (!font || font.category === 'system') return;
    if (this.loadedFonts.has(family)) return;

    this.loadedFonts.add(family);

    const encoded = family.replace(/ /g, '+');
    const href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@300;400;500;600;700&display=swap`;

    const link = this.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    this.document.head.appendChild(link);
  }

  ensureLoaded(family: string | undefined | null): void {
    if (family) this.loadFont(family);
  }
}
