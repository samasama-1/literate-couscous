import type { PolicyDocument } from "@/lib/policies";

function isMainHeading(line: string) {
  return /^\d+\.\s/.test(line);
}

function isSubHeading(line: string) {
  return /^\d+\.\d+\s/.test(line);
}

function normalizeLines(body: string, title: string) {
  const titleSeen = { count: 0 };

  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line === "________________") return false;
      if (line === title && titleSeen.count < 2) {
        titleSeen.count += 1;
        return false;
      }
      return true;
    });
}

export default function PolicyPage({ policy }: { policy: PolicyDocument }) {
  const lines = normalizeLines(policy.body, policy.title);
  const content: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    content.push(
      <ul key={`list-${content.length}`} className="policy-list">
        {listItems.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line) => {
    if (line.startsWith("* ")) {
      listItems.push(line.slice(2));
      return;
    }

    flushList();

    if (isSubHeading(line)) {
      content.push(<h3 key={`line-${content.length}`}>{line}</h3>);
    } else if (isMainHeading(line)) {
      content.push(<h2 key={`line-${content.length}`}>{line}</h2>);
    } else {
      content.push(<p key={`line-${content.length}`}>{line}</p>);
    }
  });

  flushList();

  return (
    <div style={{ background: "var(--color-bg)", minHeight: "100vh" }}>
      <style>{`
        .policy-shell {
          max-width: 840px;
          margin: 0 auto;
        }

        .policy-eyebrow {
          font-family: var(--font-body);
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--color-primary);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 1rem;
          display: inline-block;
        }

        .policy-content {
          background: white;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          padding: clamp(1.5rem, 4vw, 3rem);
          box-shadow: var(--shadow-md);
        }

        .policy-content h2 {
          font-family: var(--font-display);
          font-size: clamp(1.35rem, 3vw, 1.8rem);
          font-weight: 500;
          margin: 2.5rem 0 1rem;
          color: var(--color-text);
        }

        .policy-content h2:first-child { margin-top: 0; }

        .policy-content h3 {
          font-family: var(--font-body);
          font-size: var(--text-md);
          font-weight: 700;
          margin: 1.5rem 0 0.5rem;
          color: var(--color-text);
        }

        .policy-content p {
          font-size: var(--text-sm);
          line-height: 1.75;
          color: var(--color-primary-muted);
          margin-bottom: 0.875rem;
        }

        .policy-list {
          margin: 0.5rem 0 1.25rem;
          padding-left: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .policy-list li {
          font-size: var(--text-sm);
          line-height: 1.65;
          color: var(--color-primary-muted);
        }
      `}</style>

      <section className="section" style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="container-site">
          <div className="policy-shell" style={{ textAlign: "center" }}>
            <span className="policy-eyebrow">Sama Sama Policies</span>
            <h1 style={{ marginBottom: "1rem" }}>{policy.title}</h1>
            <p style={{ fontSize: "var(--text-md)", maxWidth: "680px", margin: "0 auto" }}>
              {policy.description}
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-site">
          <article className="policy-shell policy-content">{content}</article>
        </div>
      </section>
    </div>
  );
}
