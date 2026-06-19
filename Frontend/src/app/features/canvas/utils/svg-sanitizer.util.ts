
export function sanitizeSvg(svgString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${svgString}</body>`, 'text/html');

  const rootSvg = doc.querySelector('svg');
  if (!rootSvg) return '';

  const BLOCKED_TAGS = ['script', 'foreignObject'];
  for (const tag of BLOCKED_TAGS) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }

  const allElements = doc.querySelectorAll('*');
  for (const el of Array.from(allElements)) {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (
        (name === 'href' || name === 'xlink:href') &&
        attr.value.trim().toLowerCase().startsWith('javascript:')
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }

  rootSvg.setAttribute('width', '100%');
  rootSvg.setAttribute('height', '100%');
  rootSvg.style.display = 'block';

  return rootSvg.outerHTML;
}

export function parseSvgDimensions(svgString: string): { width: number; height: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${svgString}</body>`, 'text/html');
  const root = doc.querySelector('svg');

  const MAX_W = 800;
  const MAX_H = 600;
  const DEFAULT = { width: 200, height: 200 };

  if (!root) return DEFAULT;

  const wAttr = root.getAttribute('width');
  const hAttr = root.getAttribute('height');

  if (wAttr && hAttr) {
    const w = parseFloat(wAttr);
    const h = parseFloat(hAttr);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      return {
        width: Math.round(Math.min(w, MAX_W)),
        height: Math.round(Math.min(h, MAX_H)),
      };
    }
  }

  const viewBox = root.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/);
    if (parts.length === 4) {
      const vw = parseFloat(parts[2]);
      const vh = parseFloat(parts[3]);
      if (!isNaN(vw) && !isNaN(vh) && vw > 0 && vh > 0) {
        const scale = Math.min(1, MAX_W / vw, MAX_H / vh);
        return {
          width: Math.round(vw * scale),
          height: Math.round(vh * scale),
        };
      }
    }
  }

  return DEFAULT;
}
