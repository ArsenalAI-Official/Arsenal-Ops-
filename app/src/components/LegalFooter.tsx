interface LegalFooterProps {
  /** Extra classes for the <footer> element (layout/borders per host page). */
  className?: string;
}

/**
 * Shared footer with links to the public legal pages (Privacy Policy + EULA).
 *
 * The targets (`/privacy`, `/eula`) are static HTML pages served by Vercel
 * OUTSIDE the auth-gated SPA (see `public/*.html` + `vercel.json` rewrites),
 * so they're reachable without logging in. They're plain `<a>` tags (not
 * react-router `<Link>`) so the browser does a full navigation to the static
 * file rather than trying to match a client route.
 */
export function LegalFooter({ className = '' }: LegalFooterProps) {
  return (
    <footer className={`py-3 text-center ${className}`}>
      <a
        href="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-[#737373] hover:text-[#E0B954] transition-colors"
      >
        Privacy Policy
      </a>
      <span className="mx-2 text-[#3a3a3a]">·</span>
      <a
        href="/eula"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-[#737373] hover:text-[#E0B954] transition-colors"
      >
        EULA
      </a>
    </footer>
  );
}
