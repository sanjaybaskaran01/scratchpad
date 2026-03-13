const RE_NUMBERED = /^(\s*)(\d+)\.\s(.*)$/;
const RE_BULLET   = /^(\s*)([-*])\s(.*)$/;

/**
 * Auto-continue numbered and bullet lists on Enter in a textarea.
 * @param {KeyboardEvent} e
 * @param {HTMLTextAreaElement} textarea
 * @param {() => string} getValue
 * @param {(v: string) => void} setValue
 * @param {(() => void)} [afterChange]
 */
export function handleListContinuation(e, textarea, getValue, setValue, afterChange) {
  if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;

  const start = textarea.selectionStart;
  const text  = textarea.value;

  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const line      = text.substring(lineStart, start);

  const matchNum = line.match(RE_NUMBERED);
  const matchBul = line.match(RE_BULLET);

  if (matchNum) {
    const [, indent, num, content] = matchNum;
    e.preventDefault();
    if (!content) {
      const newText = text.substring(0, lineStart) + text.substring(start);
      setValue(newText);
      requestAnimationFrame(() => { textarea.selectionStart = textarea.selectionEnd = lineStart; });
    } else {
      const next    = `\n${indent}${Number(num) + 1}. `;
      const newText = text.substring(0, start) + next + text.substring(start);
      setValue(newText);
      const cursor = start + next.length;
      requestAnimationFrame(() => { textarea.selectionStart = textarea.selectionEnd = cursor; });
    }
    if (afterChange) afterChange();
  } else if (matchBul) {
    const [, indent, marker, content] = matchBul;
    e.preventDefault();
    if (!content) {
      const newText = text.substring(0, lineStart) + text.substring(start);
      setValue(newText);
      requestAnimationFrame(() => { textarea.selectionStart = textarea.selectionEnd = lineStart; });
    } else {
      const next    = `\n${indent}${marker} `;
      const newText = text.substring(0, start) + next + text.substring(start);
      setValue(newText);
      const cursor = start + next.length;
      requestAnimationFrame(() => { textarea.selectionStart = textarea.selectionEnd = cursor; });
    }
    if (afterChange) afterChange();
  }
}
