import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

export interface MarkdownProps {
  /** Raw Markdown source to render. */
  children: string;
  /** Extra classes applied to the prose wrapper. */
  className?: string;
}

const COMPONENTS: Components = {
  // Open links in a new tab and harden `rel`, matching the app's other inline
  // renderer (`CommentThread.tsx`) so a link in a description doesn't navigate
  // the user out of the SPA.
  a: ({ node: _node, children, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

/**
 * Renders Markdown (GitHub-flavored) styled for the app's dark theme.
 *
 * Safe by default: `react-markdown` does not use `dangerouslySetInnerHTML` and
 * ignores raw HTML unless `rehype-raw` is added (it isn't), so there's no XSS
 * surface and no sanitizer is needed. Styling comes from
 * `@tailwindcss/typography` (`prose prose-invert`) with palette overrides so it
 * matches the surrounding UI (#a3a3a3 body, #f5f5f5 emphasis, #5B9BE6 links,
 * #A6A29C code accents).
 *
 * `remark-breaks` makes a single newline render as a line break (GitHub-comment
 * behavior), preserving structure in plain-text descriptions that predate
 * Markdown rendering — CommonMark would otherwise collapse a lone `\n` to a space.
 */
export function Markdown({ children, className = '' }: MarkdownProps) {
  return (
    <div
      className={`prose prose-invert prose-sm max-w-none leading-relaxed
        prose-headings:text-white prose-p:text-[#a3a3a3]
        prose-a:text-info prose-a:no-underline hover:prose-a:underline
        prose-strong:text-[#f5f5f5] prose-em:text-[#a3a3a3]
        prose-code:text-muted-foreground prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-[rgba(255,255,255,0.04)] prose-pre:border prose-pre:border-[rgba(255,255,255,0.07)]
        prose-li:text-[#a3a3a3] prose-li:marker:text-[#737373]
        prose-blockquote:text-[#a3a3a3] prose-blockquote:border-[rgba(255,255,255,0.15)]
        prose-hr:border-[rgba(255,255,255,0.07)]
        prose-th:text-[#f5f5f5] prose-td:text-[#a3a3a3]
        prose-img:rounded-lg ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
