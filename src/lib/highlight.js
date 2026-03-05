/**
 * highlight.js — hljs setup with tree-shaken language imports.
 * Replaces the hand-rolled detectLanguage() + Prism rendering pipeline.
 */
import hljs from 'highlight.js/lib/core';

import python     from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml        from 'highlight.js/lib/languages/xml';       // covers html
import css        from 'highlight.js/lib/languages/css';
import sql        from 'highlight.js/lib/languages/sql';
import json       from 'highlight.js/lib/languages/json';
import yaml       from 'highlight.js/lib/languages/yaml';
import bash       from 'highlight.js/lib/languages/bash';
import go         from 'highlight.js/lib/languages/go';
import rust       from 'highlight.js/lib/languages/rust';
import toml       from 'highlight.js/lib/languages/ini';       // toml ≈ ini
import diff       from 'highlight.js/lib/languages/diff';
import markdown   from 'highlight.js/lib/languages/markdown';

hljs.registerLanguage('python',     python);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml',        xml);
hljs.registerLanguage('html',       xml);
hljs.registerLanguage('css',        css);
hljs.registerLanguage('sql',        sql);
hljs.registerLanguage('json',       json);
hljs.registerLanguage('yaml',       yaml);
hljs.registerLanguage('bash',       bash);
hljs.registerLanguage('shell',      bash);
hljs.registerLanguage('go',         go);
hljs.registerLanguage('rust',       rust);
hljs.registerLanguage('toml',       toml);
hljs.registerLanguage('diff',       diff);
hljs.registerLanguage('markdown',   markdown);

// Languages to try for auto-detection. CSS, XML/HTML, markdown, and diff are
// excluded from the subset because their grammars match too much plain English
// text, producing false positives. They are still registered above so that
// explicit hintLang highlighting works correctly.
const DETECT_SUBSET = [
  'python', 'javascript', 'typescript',
  'sql', 'json', 'yaml', 'bash', 'shell',
  'go', 'rust', 'toml',
];

/**
 * Highlight code and detect language.
 * @param {string} code - source code to highlight
 * @param {string|null} hintLang - known language (skips auto-detection)
 * @returns {{ html: string, language: string|null }}
 */
export function highlightSnippet(code, hintLang = null) {
  if (!code) return { html: '', language: null };

  if (hintLang) {
    try {
      const result = hljs.highlight(code, { language: hintLang, ignoreIllegals: true });
      return { html: result.value, language: hintLang };
    } catch {
      // fall through to auto
    }
  }

  try {
    // Use a restricted subset to avoid false positives from CSS/XML/markdown/diff
    // grammars, which match common English words. Require relevance >= 2 to
    // further filter ambiguous low-confidence results.
    const result = hljs.highlightAuto(code, DETECT_SUBSET);
    const lang = result.language ?? null;
    if (!lang || result.relevance < 2) {
      return { html: escHtml(code), language: null };
    }
    // hljs may return 'ini' for toml — normalise
    const normLang = lang === 'ini' ? 'toml' : lang;
    return { html: result.value, language: normLang };
  } catch {
    return { html: escHtml(code), language: null };
  }
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
