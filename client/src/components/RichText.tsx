import katex from 'katex';
import 'katex/dist/katex.min.css';

// Renders question/theory text with embedded LaTeX math.
// Supports $$...$$ (display) and $...$ (inline) segments; everything else is
// plain text with newlines preserved. Malformed LaTeX falls back to the raw
// source instead of throwing, so un-migrated content stays readable.

function mathHtml(src: string, displayMode: boolean): string {
  try {
    return katex.renderToString(src, { displayMode, throwOnError: true });
  } catch {
    return '';
  }
}

interface Segment {
  math?: { src: string; display: boolean };
  text?: string;
}

function split(text: string): Segment[] {
  const segments: Segment[] = [];
  // $$...$$ first, then $...$ — a lone $ (e.g. prices) stays literal text
  const re = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) segments.push({ math: { src: m[1], display: true } });
    else segments.push({ math: { src: m[2], display: false } });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

export default function RichText({ text, className }: { text?: string | null; className?: string }) {
  if (!text) return null;
  const segments = split(text);
  return (
    <span className={`whitespace-pre-wrap ${className || ''}`}>
      {segments.map((s, i) => {
        if (s.text !== undefined) return <span key={i}>{s.text}</span>;
        const html = mathHtml(s.math!.src, s.math!.display);
        if (!html) return <span key={i}>{s.math!.display ? `$$${s.math!.src}$$` : `$${s.math!.src}$`}</span>;
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}
