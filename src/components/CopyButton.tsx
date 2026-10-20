"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setFailed(false);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
          setFailed(true);
        }
      }}
      className="btn btn-dark"
      style={{
        padding: "0.625rem 1.25rem",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--text-xs)",
      }}
    >
      {copied ? "Copied!" : failed ? "Select link to copy" : "Copy"}
    </button>
  );
}
