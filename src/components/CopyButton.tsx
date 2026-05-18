"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="btn btn-dark"
      style={{
        padding: "0.625rem 1.25rem",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--text-xs)",
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
