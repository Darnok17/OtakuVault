"use client";

// A <script> that runs while the browser parses the server-sent HTML (before first paint) and is
// inert when React renders on the client, where inline scripts never execute and React warns
// about them. The server emits type="text/javascript", the client "text/plain".
export default function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
