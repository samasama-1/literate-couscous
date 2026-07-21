import Link from "next/link";
import {
  hasPassedStandard,
  STANDARD_PAGE_PATH,
  STANDARD_PILLARS,
  STATUS_LABELS,
  type ProductStandardEvaluation,
} from "@/lib/samasamaStandard";

type Props = {
  evaluation: ProductStandardEvaluation;
  productName: string;
};

export default function SamaSamaStandardSummary({ evaluation, productName }: Props) {
  const passedStandard = hasPassedStandard(evaluation);
  const title = passedStandard ? "Passed the SamaSama Standard" : "Evaluation in progress";
  const publishedPillars = STANDARD_PILLARS.map((pillar) => ({
    definition: pillar,
    evaluation: evaluation.pillars.find((item) => item.pillar === pillar.id),
  }));

  return (
    <section className="standard-summary" aria-labelledby="standard-summary-title">
      <style>{`
        .standard-summary {
          margin-top: 5rem;
          padding: clamp(2.25rem, 5vw, 3.25rem);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          background: linear-gradient(180deg, rgba(255,255,255,0.82), var(--color-surface));
        }

        .standard-summary-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 2rem;
          align-items: start;
          margin-bottom: 2.25rem;
        }

        .standard-summary-eyebrow {
          display: inline-block;
          margin-bottom: 0.75rem;
          font-size: var(--text-xs);
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--color-primary);
        }

        .standard-summary h2 {
          font-size: clamp(1.75rem, 3vw, 2.35rem);
          font-weight: 500;
          margin-bottom: 0.75rem;
        }

        .standard-summary-intro {
          max-width: 720px;
          font-size: var(--text-base);
          line-height: 1.75;
        }

        .standard-disclosure {
          margin-top: 1rem;
          max-width: 720px;
          font-size: var(--text-xs);
          line-height: 1.7;
          color: var(--color-text-muted);
        }

        .standard-pillars-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .standard-pillar-detail {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          background: rgba(255,255,255,0.7);
          overflow: hidden;
        }

        .standard-pillar-detail summary {
          cursor: pointer;
          list-style: none;
          padding: 1.25rem;
        }

        .standard-pillar-detail summary::-webkit-details-marker {
          display: none;
        }

        .standard-pillar-summary-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1rem;
          align-items: start;
        }

        .standard-pillar-kicker {
          display: block;
          margin-bottom: 0.35rem;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--color-text-light);
        }

        .standard-pillar-detail h3 {
          font-size: var(--text-base);
          font-weight: 650;
          margin-bottom: 0.4rem;
        }

        .standard-pillar-question {
          font-size: var(--text-xs);
          color: var(--color-primary-muted);
          line-height: 1.55;
        }

        .standard-status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 7.5rem;
          border-radius: var(--radius-md);
          border: 1px solid var(--color-border);
          padding: 0.45rem 0.65rem;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: white;
          color: var(--color-text-muted);
        }

        .standard-status-passed {
          border-color: rgba(42, 91, 62, 0.28);
          background: var(--color-success-bg);
          color: var(--color-success);
        }

        .standard-status-conditional {
          border-color: rgba(179, 107, 33, 0.34);
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }

        .standard-status-in_review {
          background: var(--color-surface);
          color: var(--color-primary);
        }

        .standard-pillar-body {
          padding: 0 1.25rem 1.25rem;
        }

        .standard-pillar-body p {
          font-size: var(--text-sm);
          line-height: 1.7;
          margin-bottom: 1rem;
        }

        .standard-mini-heading {
          margin: 1rem 0 0.4rem;
          font-size: var(--text-xs);
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--color-text);
        }

        .standard-list {
          margin: 0;
          padding-left: 1rem;
          color: var(--color-primary-muted);
          font-size: var(--text-sm);
          line-height: 1.75;
        }

        .standard-evidence-links {
          display: flex;
          flex-wrap: wrap;
          gap: 0.625rem;
          margin-top: 0.75rem;
        }

        .standard-evidence-link {
          display: inline-flex;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: 0.55rem 0.75rem;
          background: white;
          color: var(--color-primary);
          font-size: var(--text-xs);
          font-weight: 600;
        }

        .standard-verdict {
          margin-top: 2rem;
          padding-top: 2rem;
          border-top: 1px solid var(--color-border);
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          gap: 2rem;
        }

        .standard-verdict h3 {
          font-size: clamp(1.35rem, 2.5vw, 1.8rem);
          font-weight: 500;
          margin-bottom: 0.75rem;
        }

        .standard-verdict-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1.25rem;
        }

        .standard-verdict-panel {
          border-top: 1px solid var(--color-border);
          padding-top: 1rem;
        }

        .standard-verdict-panel h4 {
          margin-bottom: 0.45rem;
          font-size: var(--text-sm);
        }

        @media (max-width: 860px) {
          .standard-summary-header,
          .standard-verdict {
            grid-template-columns: 1fr;
          }

          .standard-pillars-grid,
          .standard-verdict-grid {
            grid-template-columns: 1fr;
          }

          .standard-status {
            min-width: auto;
          }
        }
      `}</style>

      <div className="standard-summary-header">
        <div>
          <span className="standard-summary-eyebrow">The SamaSama Standard</span>
          <h2 id="standard-summary-title">{title}</h2>
          <p className="standard-summary-intro">
            {passedStandard
              ? `${productName} has been evaluated against SamaSama's own sourcing, product, production and support criteria.`
              : `${productName} is being reviewed against SamaSama's own sourcing, product, production and support criteria. Product-specific evidence will appear here before we call it passed.`}
          </p>
          <p className="standard-disclosure">
            The SamaSama Standard is our own evaluation framework. It is not a
            government certification, independent laboratory accreditation or guarantee
            that a product will never develop a fault. Official regulatory approvals
            and test documents are shown separately where applicable.
          </p>
        </div>
        <Link
          href={STANDARD_PAGE_PATH}
          className="btn btn-secondary"
          data-track="product-standard-page-click"
        >
          How the Standard works
        </Link>
      </div>

      <div className="standard-pillars-grid">
        {publishedPillars.map(({ definition, evaluation }) => (
          <details
            key={definition.id}
            className="standard-pillar-detail"
            data-track="product-standard-detail-expand"
          >
            <summary>
              <div className="standard-pillar-summary-row">
                <div>
                  <span className="standard-pillar-kicker">
                    {definition.number} / {definition.title}
                  </span>
                  <h3>{definition.customerCopy.split(".")[0]}.</h3>
                  <p className="standard-pillar-question">{definition.question}</p>
                </div>
                <span className={`standard-status standard-status-${evaluation?.status || "in_review"}`}>
                  {STATUS_LABELS[evaluation?.status || "in_review"]}
                </span>
              </div>
            </summary>
            <div className="standard-pillar-body">
              <p>{evaluation?.summary || definition.summary}</p>

              {evaluation && evaluation.whatWeChecked.length > 0 ? (
                <>
                  <p className="standard-mini-heading">What we checked</p>
                  <ul className="standard-list">
                    {evaluation.whatWeChecked.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="standard-mini-heading">What this pillar covers</p>
                  <ul className="standard-list">
                    {definition.whatWeLookAt.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              )}

              {evaluation?.evidence && evaluation.evidence.length > 0 && (
                <>
                  <p className="standard-mini-heading">Selected evidence</p>
                  <div className="standard-evidence-links">
                    {evaluation.evidence.map((evidence) => {
                      const href = evidence.documentUrl || evidence.mediaUrl;
                      if (!href) {
                        return (
                          <span key={evidence.label} className="standard-evidence-link">
                            {evidence.label}
                          </span>
                        );
                      }

                      return (
                        <a
                          key={evidence.label}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="standard-evidence-link"
                          data-track={
                            evidence.documentUrl
                              ? "product-standard-document-click"
                              : "product-standard-media-click"
                          }
                        >
                          {evidence.label}
                        </a>
                      );
                    })}
                  </div>
                </>
              )}

              {evaluation?.limitations && evaluation.limitations.length > 0 && (
                <>
                  <p className="standard-mini-heading">Known limitations</p>
                  <ul className="standard-list">
                    {evaluation.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </details>
        ))}
      </div>

      {evaluation.regulatoryNotes && evaluation.regulatoryNotes.length > 0 && (
        <div className="standard-verdict-panel" style={{ marginTop: "2rem" }}>
          <h3 style={{ fontSize: "var(--text-md)", marginBottom: "0.75rem" }}>
            Official regulatory information
          </h3>
          <ul className="standard-list">
            {evaluation.regulatoryNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.afterSalesTerms && evaluation.afterSalesTerms.length > 0 && (
        <div className="standard-verdict-panel" style={{ marginTop: "2rem" }}>
          <h3 style={{ fontSize: "var(--text-md)", marginBottom: "0.75rem" }}>
            Clear after-sales terms
          </h3>
          <ul className="standard-list">
            {evaluation.afterSalesTerms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="standard-verdict">
        <div>
          <span className="standard-summary-eyebrow">SamaSama Verdict</span>
          <h3>{evaluation.verdict?.headline || "Final verdict pending"}</h3>
          <p>
            {evaluation.verdict?.summary ||
              "We will publish our final take once the product-specific evaluation is complete. Passing the six pillars is only the start; we still ask whether the product is genuinely a smarter purchase for homeowners at the price and support level available."}
          </p>
        </div>

        {evaluation.verdict && (
          <div className="standard-verdict-grid">
            <div className="standard-verdict-panel">
              <h4>What we liked</h4>
              <ul className="standard-list">
                {evaluation.verdict.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="standard-verdict-panel">
              <h4>What could be better</h4>
              <ul className="standard-list">
                {evaluation.verdict.compromises.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="standard-verdict-panel">
              <h4>Who it is for</h4>
              <ul className="standard-list">
                {evaluation.verdict.bestFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="standard-verdict-panel">
              <h4>Who should skip it</h4>
              <ul className="standard-list">
                {evaluation.verdict.notFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
