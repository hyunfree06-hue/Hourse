/**
 * Lightweight SVG sanitizer for uploads.
 * Removes scripts, foreignObject, event handlers, and external resource hints.
 */
export function sanitizeSvg(svg: string): string {
  let out = svg;
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(
    /xlink:href\s*=\s*("|')\s*https?:\/\/[^"']+\1/gi,
    'xlink:href="#"',
  );
  out = out.replace(/href\s*=\s*("|')\s*https?:\/\/[^"']+\1/gi, 'href="#"');
  out = out.replace(/javascript:/gi, "");
  return out;
}
