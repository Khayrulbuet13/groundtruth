import DOMPurify from 'dompurify';
import katex from 'katex';

const ALLOWED = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'code', 'sub', 'sup', 'br'],
  ALLOWED_ATTR: [],
};

/** Render user/content text safely. Supports inline $...$ KaTeX. */
export function renderSafeText(text) {
  if (!text) return '';
  const parts = String(text).split(/(\$[^$]+\$)/g);
  return parts
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) {
        try {
          return katex.renderToString(part.slice(1, -1), {
            throwOnError: false,
            displayMode: false,
          });
        } catch {
          return DOMPurify.sanitize(part, ALLOWED);
        }
      }
      return DOMPurify.sanitize(part, ALLOWED);
    })
    .join('');
}

export function SafeText({ text, className, as: Tag = 'span' }) {
  return (
    <Tag className={className} dangerouslySetInnerHTML={{ __html: renderSafeText(text) }} />
  );
}
