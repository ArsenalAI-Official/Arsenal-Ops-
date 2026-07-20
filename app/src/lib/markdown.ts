/**
 * Strip common Markdown syntax to plain text for line-clamped previews
 * (cards, list snippets) so stray `#`, `*`, `` ` ``, or link syntax don't leak
 * into truncated text. This is intentionally conservative and regex-based — it
 * is NOT a parser. For full rendering use the `Markdown` component instead.
 */
// Asterisk emphasis (`**bold**` / `*italic*`): the marker must hug the content
// (`(?=\S)` … `\S`), so a lone `2 * 3` or `a * b` is left intact.
const ASTERISK_EMPHASIS = /(\*\*|\*)(?=\S)([\s\S]*?\S)\1/g;
// Underscore emphasis (`__bold__` / `_italic_`): only when the markers sit on a
// word boundary. Per CommonMark, intra-word `_` does NOT delimit emphasis, so
// `snake_case` / `file_path` identifiers survive untouched — important here
// since descriptions routinely contain code-like text.
const UNDERSCORE_EMPHASIS = /(?<![A-Za-z0-9])(__|_)(?=\S)([\s\S]*?\S)\1(?![A-Za-z0-9])/g;

export function stripMarkdown(text: string): string {
  if (!text) return '';
  let out = text
    // Fenced code blocks → keep inner text, drop the fences.
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, '$1')
    // Images ![alt](url) → alt text.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Links [text](url) → text.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Inline code `code` → code.
    .replace(/`([^`]+)`/g, '$1')
    // Strikethrough ~~text~~ → text.
    .replace(/~~(.*?)~~/g, '$1');

  // Unwrap emphasis. Loop until stable so nested markers like `***x***` don't
  // leave a stray delimiter behind from a single pass.
  let prev: string;
  do {
    prev = out;
    out = out.replace(ASTERISK_EMPHASIS, '$2').replace(UNDERSCORE_EMPHASIS, '$2');
  } while (out !== prev);

  return (
    out
      // Leading heading hashes, blockquotes, list markers per line.
      .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, '')
      // Collapse leftover whitespace/newlines into single spaces.
      .replace(/\s+/g, ' ')
      .trim()
  );
}
