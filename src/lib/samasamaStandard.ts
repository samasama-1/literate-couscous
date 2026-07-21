import type { Json } from "@/types/database";

export const STANDARD_PAGE_PATH = "/the-samasama-standard";
export const ACTIVE_BATCHES_PATH = "/#deals";

// Placeholder until SamaSama has a public Telegram/Sourcing Circle link.
export const SOURCING_CIRCLE_URL = "#sourcing-circle-placeholder";

export type StandardPillarId =
  | "supplier_integrity"
  | "claims_verification"
  | "sample_evaluation"
  | "safety_compliance"
  | "production_assurance"
  | "after_sales";

export type StandardPillarStatus =
  | "passed"
  | "conditional"
  | "in_review"
  | "not_applicable";

export type StandardEvidence = {
  label: string;
  description?: string;
  documentUrl?: string;
  mediaUrl?: string;
};

export type StandardPillarEvaluation = {
  pillar: StandardPillarId;
  status: StandardPillarStatus;
  summary: string;
  whatWeChecked: string[];
  evidence?: StandardEvidence[];
  limitations?: string[];
};

export type SamaSamaVerdict = {
  headline: string;
  summary: string;
  strengths: string[];
  compromises: string[];
  bestFor: string[];
  notFor: string[];
};

export type ProductStandardEvaluation = {
  productId: string;
  evaluatedAt?: string;
  pillars: StandardPillarEvaluation[];
  verdict?: SamaSamaVerdict;
  afterSalesTerms?: string[];
  regulatoryNotes?: string[];
};

export type StandardPillarDefinition = {
  id: StandardPillarId;
  number: string;
  title: string;
  question: string;
  summary: string;
  customerCopy: string;
  whatWeLookAt: string[];
  proofExamples: string[];
  doesNotMean?: string;
};

export const STANDARD_PILLARS: StandardPillarDefinition[] = [
  {
    id: "supplier_integrity",
    number: "01",
    title: "Supplier Integrity",
    question: "Who is behind the product, and are we comfortable dealing with them?",
    summary:
      "We investigate who is behind every product and do not proceed when material concerns remain unresolved.",
    customerCopy:
      "Before trusting the product, we want to understand who is making it, whether their capabilities match their claims and whether we are comfortable holding them accountable.",
    whatWeLookAt: [
      "Who the supplier is and their role in the supply chain",
      "Whether they are the manufacturer, brand owner or intermediary",
      "Relevant operating background and export experience",
      "Material commercial, legal or reputational concerns where information is available",
      "Transparency, communication and responsiveness",
    ],
    proofExamples: [
      "Supplier background notes",
      "Factory or business profile reviewed",
      "Communication and escalation route recorded",
    ],
    doesNotMean:
      "This does not mean we can guarantee a supplier has no issues. It means we do not proceed when material concerns remain unresolved.",
  },
  {
    id: "claims_verification",
    number: "02",
    title: "Product & Claims Verification",
    question: "Does the product actually match what the supplier says it is?",
    summary:
      "Important specifications and product claims need support from documents, evidence or our own evaluation before we present them as fact.",
    customerCopy:
      "We do not rely on catalogue descriptions alone. Trust me, very good quality is not a technical specification.",
    whatWeLookAt: [
      "Product specifications and quoted model details",
      "Material, component, capacity, output and performance claims where relevant",
      "Food-contact, coating and material documents where relevant",
      "Whether documents apply to the actual model being quoted",
      "Claims that should be avoided until verified",
    ],
    proofExamples: [
      "Specification sheet reviewed",
      "Model number matched to supplier documents",
      "Material or coating evidence checked where relevant",
    ],
  },
  {
    id: "sample_evaluation",
    number: "03",
    title: "Real-World Sample Evaluation",
    question: "Does the product actually work well in real life?",
    summary:
      "We use samples in realistic scenarios and look for everyday ownership issues, not just whether the product powers on.",
    customerCopy:
      "Can switch on does not mean good. We use the product properly and test it in realistic scenarios.",
    whatWeLookAt: [
      "Core function in realistic use cases",
      "Usability, controls and setup",
      "Noise, heat, airflow, smell, vibration, cleaning and maintenance where relevant",
      "Weaknesses, compromises and irritating ownership issues",
      "Whether we would be comfortable using or recommending it ourselves",
    ],
    proofExamples: [
      "Sample-use notes",
      "Testing photos or short clips",
      "Founder evaluation notes",
    ],
    doesNotMean:
      "Sample evaluation does not guarantee long-term durability or that a product can never develop a fault.",
  },
  {
    id: "safety_compliance",
    number: "04",
    title: "Regulatory & Safety Compliance",
    question: "Has the product addressed the safety and regulatory requirements applicable in Singapore?",
    summary:
      "We review the Singapore requirements that apply to the product category and show official approvals separately where relevant.",
    customerCopy:
      "For products that require a Singapore SAFETY Mark, no valid mark means no launch.",
    whatWeLookAt: [
      "Applicable Singapore safety and regulatory requirements",
      "Electrical suitability including voltage, frequency and plug configuration",
      "Food-contact, material or coating documentation where relevant",
      "Required instructions, warnings or technical information",
      "Valid Singapore SAFETY Mark before launching any Controlled Good",
    ],
    proofExamples: [
      "Singapore SAFETY Mark details where applicable",
      "Voltage and plug suitability confirmed",
      "Safety or material documents reviewed",
    ],
    doesNotMean:
      "The SamaSama Standard is not a government certification, independent laboratory accreditation or replacement for official regulatory marks.",
  },
  {
    id: "production_assurance",
    number: "05",
    title: "Production Quality Assurance",
    question: "Can the factory reproduce the approved quality across the actual production batch?",
    summary:
      "A good sample is not enough. We also assess how the factory maintains quality across production.",
    customerCopy:
      "We look at how the approved quality can be reproduced, so the product customers receive is consistent with the one we approved.",
    whatWeLookAt: [
      "Factory quality-control processes where practical",
      "Production and testing stations during factory visits where practical",
      "Incoming-material, in-process and final checks",
      "Production output compared with the approved sample",
      "Packaging, pre-shipment checks, sampling and inspection proportional to product risk",
      "Defects, replacements and complaints after fulfilment",
    ],
    proofExamples: [
      "Factory QC process reviewed",
      "Production line visited",
      "Finished units sampled",
      "Packaging checked",
      "Independent inspection completed",
    ],
    doesNotMean:
      "This does not mean SamaSama inspects every unit unless that is specifically stated for the product.",
  },
  {
    id: "after_sales",
    number: "06",
    title: "After-Sales Accountability",
    question: "Can SamaSama responsibly stand behind the product after the sale?",
    summary:
      "Faults, replacements and support arrangements should be understood before a product launches.",
    customerCopy:
      "We plan for what happens when something goes wrong, instead of figuring it out only after a customer needs help.",
    whatWeLookAt: [
      "How dead-on-arrival cases will be handled",
      "Warranty responsibility and exclusions",
      "Replacement procedures",
      "Spare-unit, parts or consumable support where relevant",
      "Troubleshooting and escalation routes",
      "Clear support terms before the batch opens",
    ],
    proofExamples: [
      "DOA window stated",
      "Replacement route prepared",
      "Supplier escalation contact recorded",
      "Support terms shown on product page",
    ],
  },
];

export const STATUS_LABELS: Record<StandardPillarStatus, string> = {
  passed: "Passed",
  conditional: "Conditional",
  in_review: "In review",
  not_applicable: "Not applicable",
};

const STANDARD_PILLAR_IDS = new Set<StandardPillarId>(
  STANDARD_PILLARS.map((pillar) => pillar.id)
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStatus(value: unknown): value is StandardPillarStatus {
  return (
    value === "passed" ||
    value === "conditional" ||
    value === "in_review" ||
    value === "not_applicable"
  );
}

function isPillarId(value: unknown): value is StandardPillarId {
  return typeof value === "string" && STANDARD_PILLAR_IDS.has(value as StandardPillarId);
}

function parseEvidence(value: unknown): StandardEvidence[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const evidence: StandardEvidence[] = [];

  for (const item of value) {
    if (!isRecord(item) || typeof item.label !== "string") continue;

    evidence.push({
      label: item.label,
      ...(typeof item.description === "string" ? { description: item.description } : {}),
      ...(typeof item.documentUrl === "string" ? { documentUrl: item.documentUrl } : {}),
      ...(typeof item.mediaUrl === "string" ? { mediaUrl: item.mediaUrl } : {}),
    });
  }

  return evidence.length > 0 ? evidence : undefined;
}

function parsePillarEvaluation(value: unknown): StandardPillarEvaluation | null {
  if (!isRecord(value)) return null;

  const { pillar, status, summary, whatWeChecked } = value;
  if (
    !isPillarId(pillar) ||
    !isStatus(status) ||
    typeof summary !== "string" ||
    !isStringArray(whatWeChecked)
  ) {
    return null;
  }

  return {
    pillar,
    status,
    summary,
    whatWeChecked,
    evidence: parseEvidence(value.evidence),
    limitations: isStringArray(value.limitations) ? value.limitations : undefined,
  };
}

function parseVerdict(value: unknown): SamaSamaVerdict | undefined {
  if (!isRecord(value)) return undefined;

  if (
    typeof value.headline !== "string" ||
    typeof value.summary !== "string" ||
    !isStringArray(value.strengths) ||
    !isStringArray(value.compromises) ||
    !isStringArray(value.bestFor) ||
    !isStringArray(value.notFor)
  ) {
    return undefined;
  }

  return {
    headline: value.headline,
    summary: value.summary,
    strengths: value.strengths,
    compromises: value.compromises,
    bestFor: value.bestFor,
    notFor: value.notFor,
  };
}

export function getProductStandardEvaluation(
  productId: string,
  features: Json | null
): ProductStandardEvaluation {
  const maybeEvaluation =
    isRecord(features) && isRecord(features.standardEvaluation)
      ? features.standardEvaluation
      : null;

  if (maybeEvaluation && Array.isArray(maybeEvaluation.pillars)) {
    const pillars = maybeEvaluation.pillars
      .map(parsePillarEvaluation)
      .filter((item): item is StandardPillarEvaluation => item !== null);

    if (pillars.length > 0) {
      return {
        productId,
        evaluatedAt:
          typeof maybeEvaluation.evaluatedAt === "string"
            ? maybeEvaluation.evaluatedAt
            : undefined,
        pillars,
        verdict: parseVerdict(maybeEvaluation.verdict),
        afterSalesTerms: isStringArray(maybeEvaluation.afterSalesTerms)
          ? maybeEvaluation.afterSalesTerms
          : undefined,
        regulatoryNotes: isStringArray(maybeEvaluation.regulatoryNotes)
          ? maybeEvaluation.regulatoryNotes
          : undefined,
      };
    }
  }

  return {
    productId,
    pillars: STANDARD_PILLARS.map((pillar) => ({
      pillar: pillar.id,
      status: "in_review",
      summary:
        "Evaluation in progress. We will publish product-specific notes when the review for this batch is complete.",
      whatWeChecked: [],
      limitations: ["Product-specific evidence has not been published yet."],
    })),
  };
}

export function hasPassedStandard(evaluation: ProductStandardEvaluation) {
  return STANDARD_PILLARS.every((pillar) => {
    const productPillar = evaluation.pillars.find((item) => item.pillar === pillar.id);
    return productPillar?.status === "passed" || productPillar?.status === "not_applicable";
  });
}
