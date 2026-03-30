"use server"

import { requireRole } from "@/lib/auth"

export async function generateContract(
  templateId: string,
  variables: Record<string, string>,
  entity: string
) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  // Placeholder mock generation -- will wire up Claude API later
  const entityLabel =
    entity === "LSC"
      ? "League Sports Co"
      : entity === "TBR"
        ? "Team Blue Rising"
        : entity === "FSP"
          ? "Future of Sports"
          : entity

  const variablesList = Object.entries(variables)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join("\n")

  const mockDraft = `DRAFT CONTRACT
==============

Entity: ${entityLabel}
Template: ${templateId}
Generated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

PARTIES
-------
This agreement ("Agreement") is entered into by and between ${entityLabel} ("Company")
and ${variables["counterparty"] || "[Counterparty Name]"} ("Counterparty").

TERMS
-----
${variablesList ? `Variables applied:\n${variablesList}\n` : ""}
1. SCOPE OF AGREEMENT
   The parties agree to the terms and conditions set forth in this Agreement.

2. TERM AND TERMINATION
   This Agreement shall commence on the effective date and continue for the
   duration specified herein unless terminated earlier in accordance with its terms.

3. CONFIDENTIALITY
   Each party agrees to maintain the confidentiality of all proprietary information
   disclosed by the other party during the term of this Agreement.

4. GOVERNING LAW
   This Agreement shall be governed by the laws of the United Arab Emirates.

---
[AI-Generated Draft -- Review Required]
`

  return { success: true, draft: mockDraft }
}
