/**
 * FSP mutual NDA template texts, embedded verbatim from the source agreements.
 *
 * Owns: the canonical MNDA template content and variable metadata. The seed
 * script (scripts/seed-mnda-templates.ts) upserts these into ContractTemplate,
 * and src/lib/mnda.ts falls back to these constants when the DB row is
 * missing. {{snake_case}} placeholders follow the repo's template convention;
 * the <<SIGNATURE_BLOCK>> marker is where the two-column signature block
 * begins, so everything before it is the renderable body text.
 */

export interface MndaTemplateVariable {
  key: string
  label: string
  placeholder: string
}

export const MNDA_TEMPLATE_NAMES = {
  individual: "FSP MNDA (Individual)",
  business: "FSP MNDA (Business)",
} as const

export const mndaIndividualTemplate = `MUTUAL NON-DISCLOSURE AND NON-CIRCUMVENT AGREEMENT

THIS AGREEMENT is made effective as of {{effective_date}} between {{counterparty_name}} having passport number {{counterparty_passport_number}}, and Future Of Sports Labs Inc. a Delaware C Corporation with its registered address at 1401 Pennsylvania Ave, Ste. 105, Wilmington, Delaware, 19806, USA collectively referred to as the "Parties."

This agreement is intended to create a mutually beneficial business relationship between the Parties during the stages of information exchange and provision of services that are required to establish and set the stage for a real and tangible joint business opportunity.

The Parties desire to disclose, on a confidential basis, certain information, process, clients, business contacts and documents considered confidential and/or proprietary by the Parties concerning their respective businesses. The Parties wish to maintain the confidentiality and/or the proprietary nature of the confidential information disclosed.

In consideration of the mutual promises and covenants set forth herein and for other good and valuable consideration, the receipt and adequacy of which is hereby acknowledged, the Parties hereto agree as follows:

1. Confidential Information: The Parties agree that information disclosed orally or in writing or made available by any Party ("Disclosing Party") to another Party ("Recipient"), including, but not limited to, information acquired from employees; trade secrets; strategic plans; invention plans and disclosures; customer information; suppliers; software; distribution channels; marketing studies; intellectual property; information relating to process and products, designs, business plans, business opportunities, marketing plans, finances, research, development, know-how or personnel; confidential information originally received from third parties; information relating to any type of technology, and all other material whether written or oral, tangible or intangible, shall be deemed "Confidential Information." In addition, the existence and terms of this Agreement shall also be treated as confidential information. The parties agree that any confidential information disclosed prior to the execution of this Agreement was intended to be and shall be subject to the terms and conditions of this Agreement.

2. Restrictions and Exceptions: The Parties agree to maintain the confidentiality of the Confidential Information and to prevent its unauthorized dissemination or use for a period of {{term_words}} ({{term_years}}) years from the date of last disclosure by the Disclosing Party, subject to the exceptions enumerated in Section 4 of this Agreement.

3. Recipients' Obligations: The parties expressly agree that the Recipient shall not use Confidential Information in the development of any products or services for its own account or for the account of a third party unless expressly agreed to by the Disclosing Party in writing. Further, the Parties agree not to use the confidential Information for purposes other than that necessary to consider the possibility of entering into a business relationship or transaction between the Parties. The Recipient shall protect the Confidential Information by using the same degree of care, but no less than reasonable care, to prevent the unauthorized use, dissemination or publication of the Confidential Information as the Recipient uses to protect its own Confidential Information. The Recipient shall limit its internal disclosure of the confidential Information to only those employees and agents who have a need to know the information for the limited purpose of the proposed business relationship between the Parties. The Parties agree that they will each direct their respective employees and agents to maintain the confidentiality of the confidential Information.

The obligation not to disclose shall not be affected by bankruptcy, receivership, assignment, attachment or seizure procedures, whether initiated by or against Recipient, nor by the rejection of any agreement between the Disclosing Party and Recipient, by a trustee of Recipient in bankruptcy, or by the Recipient as a debtor-in-possession or the equivalent of any of the foregoing under local law.

4. Exceptions: This Agreement shall impose no obligations with respect to Confidential Information which:

a) is now, or hereafter becomes, through no act or failure to act on the part of the receiving party, generally known or available to the public;
b) was acquired by the receiving party before receiving such information from the disclosing party and without restriction as to use or disclosure;
c) is hereafter rightfully furnished to the receiving party by a third party, without restriction as to use or disclosure;
d) is information which the receiving party can document was independently developed by the receiving party;
e) is required to be disclosed pursuant to law, provided the receiving party uses reasonable efforts to give the disclosing party reasonable notice of such required disclosure; or
f) is disclosed with the prior written consent of the disclosing party.

Additionally, in the event of a disclosure required pursuant to a requirement of a governmental agency or law, the Party seeking to disclose Confidential Information will provide to the Disclosing Party notice prior to such disclosure in order to afford the Disclosing Party a reasonable opportunity to file objections to the disclosure with the appropriate agency or entity.

5. Continued Development Efforts: The Parties acknowledge and agree that all parties have been engaged, and continue to engage in activities to develop, test, market, manufacture and/or sell the technology that is the subject of a potential transaction or business relationship between the Parties and acknowledge and agree that nothing contained in this Agreement shall restrict or prohibit any party from continuing such development efforts whether or not with each other, and that such continuing development efforts will not be considered a breach of the terms and provisions of this Agreement.

Neither this Agreement nor the disclosure or receipt of confidential Information shall constitute or imply any promise or intention to make any purchase of products or services by any party or its affiliated companies or any commitment by any party or its affiliated companies with respect to the present or future marketing of any product or service.

6. Ownership of Confidential Information: All Confidential Information, and all material items delivered by the Disclosing Party to the Recipient, remains the property of the Disclosing Party and no license or other rights in the Confidential Information are granted to the Recipient by this Agreement or by the act of disclosure. No rights, obligations, representations or terms other than those expressly set forth herein are to be implied from this Agreement. In particular, without limitation, no license is hereby granted directly or indirectly to any Party or their respective employees: (a) under any patent, trademark, trade secrets or copyright; or (b) to use the other Party's name, trade names, trademarks, service marks, logos or designs for any purpose; without the other Party's prior written permission.

7. Return of materials and documents: Upon the written request of the Disclosing Party, the Recipient shall return to it (or, at the request of the Disclosing Party, erase or destroy) all materials that contain or embody any Confidential Information of the Disclosing Party, including but not limited to all computer programs, documentation, notes, plans, drawings, and copies thereof. Return or destruction of such material shall not relieve the Recipient of its obligations of confidentiality. Upon the request of the Disclosing Party, the Recipient will certify that it has complied with the provisions of this paragraph.

8. Non-Circumvention: In addition the Parties agree to not circumvent each other and work with business associates, clients, and other third party vendors introduced by each party in this ease. The parties may introduce each other to companies that are interested in acquiring companies or being acquired. It is understood that the introducing party retains ownership of such a referral and that the other party cannot deal directly with such referred company without the written consent of the referring party. This non-circumvention provision shall expire at the termination of this Agreement.

9. Non-Solicitation: During the term of this Agreement, all parties agree that they will not solicit for hire, or hire or advice or assist others with the opportunity to do the same, any employee of any other party, without the prior written consent of such other party.

10. Remedy: The Parties hereby acknowledge that unauthorized disclosure or use of Confidential Information or a breach of this Agreement could cause significant and irreparable harm, which may be difficult to ascertain, and that money damages would be inadequate compensation. Accordingly, the Parties agree that the Disclosing Party shall have the right to seek and obtain injunctive relief from breaches of this Agreement in addition to any other rights and remedies it may have from a court of competent jurisdiction.

11. Termination: This Agreement shall survive and remain in effect until expressly terminated in writing and signed by all Parties, or until {{term_words}} ({{term_years}}) years from the date of execution, whichever is earlier.

12. General: This Agreement contains the entire agreement between the parties, and supersedes any prior written or oral agreements between them concerning the subject matter contained herein. The provisions of this Agreement may be waived, altered, amended or repealed, in whole or in part, only upon the written consent of all parties. The waiver of any party of a breach or violation of any provision of this Agreement shall not operate as or be construed to be a waiver of any subsequent breach hereof. This Agreement constitutes the product of negotiations of the parties hereto and any enforcement hereof will be interpreted in a neutral manner and not more strongly against any party based upon the source of the draftsmanship of this Agreement. Any dispute, difference, controversy, or claim arising out of or in connection with this contract, including (but not limited to) any question regarding its existence, validity, interpretation, performance, discharge and applicable remedies will at the first instance, be attempted to be resolved through mutual discussions and negotiations. In cases where the mutual discussions and negotiations fail between the parties irrevocably submit to the exclusive jurisdiction of the Court of Chancery of the State of Delaware, or if such court does not have subject matter jurisdiction, the state or federal courts located in the State of Delaware.

IN WITNESS WHEREOF, the parties hereto have caused this Non Disclosure Agreement to be executed as of the Effective Date

<<SIGNATURE_BLOCK>>`

export const mndaIndividualVariables: MndaTemplateVariable[] = [
  { key: "effective_date", label: "Effective Date", placeholder: "5th August 2026" },
  { key: "counterparty_name", label: "Counterparty Name", placeholder: "Full legal name of the individual" },
  {
    key: "counterparty_passport_number",
    label: "Counterparty Passport Number",
    placeholder: "Passport number; left blank it becomes a fill-in field at signing",
  },
  { key: "term_words", label: "Term In Words", placeholder: "two" },
  { key: "term_years", label: "Term In Years", placeholder: "2" },
]

export const mndaBusinessTemplate = `MUTUAL NON-DISCLOSURE AND NON-CIRCUMVENT AGREEMENT

THIS AGREEMENT is made effective as of {{effective_date}} between {{counterparty_company}}, represented by {{counterparty_name}} having, with its registered address at {{counterparty_address}}, and Future Of Sports Labs Inc. a Delaware C Corporation with its registered address at 1401 Pennsylvania Ave, Ste. 105, Wilmington, Delaware, 19806, USA collectively referred to as the "Parties."

This agreement is intended to create a mutually beneficial business relationship between the Parties during the stages of information exchange and provision of services that are required to establish and set the stage for a real and tangible joint business opportunity.

The Parties desire to disclose, on a confidential basis, certain information, process, clients, business contacts and documents considered confidential and/or proprietary by the Parties concerning their respective businesses. The Parties wish to maintain the confidentiality and/or the proprietary nature of the confidential information disclosed.

In consideration of the mutual promises and covenants set forth herein and for other good and valuable consideration, the receipt and adequacy of which is hereby acknowledged, the Parties hereto agree as follows:

1. Confidential Information: The Parties agree that information disclosed orally or in writing or made available by any Party ("Disclosing Party") to another Party ("Recipient"), including, but not limited to, information acquired from employees; trade secrets; strategic plans; invention plans and disclosures; customer information; suppliers; software; distribution channels; marketing studies; intellectual property; information relating to process and products, designs, business plans, business opportunities, marketing plans, finances, research, development, know-how or personnel; confidential information originally received from third parties; information relating to any type of technology, and all other material whether written or oral, tangible or intangible, shall be deemed "Confidential Information." In addition, the existence and terms of this Agreement shall also be treated as confidential information. The parties agree that any confidential information disclosed prior to the execution of this Agreement was intended to be and shall be subject to the terms and conditions of this Agreement.

2. Restrictions and Exceptions: The Parties agree to maintain the confidentiality of the Confidential Information and to prevent its unauthorized dissemination or use for a period of {{term_words}} ({{term_years}}) years from the date of last disclosure by the Disclosing Party, subject to the exceptions enumerated in Section 4 of this Agreement.

3. Recipients' Obligations: The parties expressly agree that the Recipient shall not use Confidential Information in the development of any products or services for its own account or for the account of a third party unless expressly agreed to by the Disclosing Party in writing. Further, the Parties agree not to use the confidential Information for purposes other than that necessary to consider the possibility of entering into a business relationship or transaction between the Parties. The Recipient shall protect the Confidential Information by using the same degree of care, but no less than reasonable care, to prevent the unauthorized use, dissemination or publication of the Confidential Information as the Recipient uses to protect its own Confidential Information. The Recipient shall limit its internal disclosure of the confidential Information to only those employees and agents who have a need to know the information for the limited purpose of the proposed business relationship between the Parties. The Parties agree that they will each direct their respective employees and agents to maintain the confidentiality of the confidential Information.

The obligation not to disclose shall not be affected by bankruptcy, receivership, assignment, attachment or seizure procedures, whether initiated by or against Recipient, nor by the rejection of any agreement between the Disclosing Party and Recipient, by a trustee of Recipient in bankruptcy, or by the Recipient as a debtor-in-possession or the equivalent of any of the foregoing under local law.

4. Exceptions: This Agreement shall impose no obligations with respect to Confidential Information which:

a) is now, or hereafter becomes, through no act or failure to act on the part of the receiving party, generally known or available to the public;
b) was acquired by the receiving party before receiving such information from the disclosing party and without restriction as to use or disclosure;
c) is hereafter rightfully furnished to the receiving party by a third party, without restriction as to use or disclosure;
d) is information which the receiving party can document was independently developed by the receiving party;
e) is required to be disclosed pursuant to law, provided the receiving party uses reasonable efforts to give the disclosing party reasonable notice of such required disclosure; or
f) is disclosed with the prior written consent of the disclosing party.

Additionally, in the event of a disclosure required pursuant to a requirement of a governmental agency or law, the Party seeking to disclose Confidential Information will provide to the Disclosing Party notice prior to such disclosure in order to afford the Disclosing Party a reasonable opportunity to file objections to the disclosure with the appropriate agency or entity.

5. Continued Development Efforts: The Parties acknowledge and agree that all parties have been engaged, and continue to engage in activities to develop, test, market, manufacture and/or sell the technology that is the subject of a potential transaction or business relationship between the Parties and acknowledge and agree that nothing contained in this Agreement shall restrict or prohibit any party from continuing such development efforts whether or not with each other, and that such continuing development efforts will not be considered a breach of the terms and provisions of this Agreement.

Neither this Agreement nor the disclosure or receipt of confidential Information shall constitute or imply any promise or intention to make any purchase of products or services by any party or its affiliated companies or any commitment by any party or its affiliated companies with respect to the present or future marketing of any product or service.

6. Ownership of Confidential Information: All Confidential Information, and all material items delivered by the Disclosing Party to the Recipient, remains the property of the Disclosing Party and no license or other rights in the Confidential Information are granted to the Recipient by this Agreement or by the act of disclosure. No rights, obligations, representations or terms other than those expressly set forth herein are to be implied from this Agreement. In particular, without limitation, no license is hereby granted directly or indirectly to any Party or their respective employees: (a) under any patent, trademark, trade secrets or copyright; or (b) to use the other Party's name, trade names, trademarks, service marks, logos or designs for any purpose; without the other Party's prior written permission.

7. Return of materials and documents: Upon the written request of the Disclosing Party, the Recipient shall return to it (or, at the request of the Disclosing Party, erase or destroy) all materials that contain or embody any Confidential Information of the Disclosing Party, including but not limited to all computer programs, documentation, notes, plans, drawings, and copies thereof. Return or destruction of such material shall not relieve the Recipient of its obligations of confidentiality. Upon the request of the Disclosing Party, the Recipient will certify that it has complied with the provisions of this paragraph.

8. Non-Circumvention: In addition the Parties agree to not circumvent each other and work with business associates, clients, and other third party vendors introduced by each party in this ease. The parties may introduce each other to companies that are interested in acquiring companies or being acquired. It is understood that the introducing party retains ownership of such a referral and that the other party cannot deal directly with such referred company without the written consent of the referring party. This non-circumvention provision shall expire at the termination of this Agreement.

9. Non-Solicitation: During the term of this Agreement, all parties agree that they will not solicit for hire, or hire or advice or assist others with the opportunity to do the same, any employee of any other party, without the prior written consent of such other party.

10. Remedy: The Parties hereby acknowledge that unauthorized disclosure or use of Confidential Information or a breach of this Agreement could cause significant and irreparable harm, which may be difficult to ascertain, and that money damages would be inadequate compensation. Accordingly, the Parties agree that the Disclosing Party shall have the right to seek and obtain injunctive relief from breaches of this Agreement in addition to any other rights and remedies it may have from a court of competent jurisdiction.

11. Termination: This Agreement shall survive and remain in effect until expressly terminated in writing and signed by all Parties, or until {{term_words}} ({{term_years}}) years from the date of execution, whichever is earlier.

12. General: This Agreement contains the entire agreement between the parties, and supersedes any prior written or oral agreements between them concerning the subject matter contained herein. The provisions of this Agreement may be waived, altered, amended or repealed, in whole or in part, only upon the written consent of all parties. The waiver of any party of a breach or violation of any provision of this Agreement shall not operate as or be construed to be a waiver of any subsequent breach hereof. This Agreement constitutes the product of negotiations of the parties hereto and any enforcement hereof will be interpreted in a neutral manner and not more strongly against any party based upon the source of the draftsmanship of this Agreement. Any dispute, difference, controversy, or claim arising out of or in connection with this contract, including (but not limited to) any question regarding its existence, validity, interpretation, performance, discharge and applicable remedies will at the first instance, be attempted to be resolved through mutual discussions and negotiations. In cases where the mutual discussions and negotiations fail between the parties irrevocably submit to the exclusive jurisdiction of the Court of Chancery of the State of Delaware, or if such court does not have subject matter jurisdiction, the state or federal courts located in the State of Delaware.

IN WITNESS WHEREOF, the parties hereto have caused this Non Disclosure Agreement to be executed as of the Effective Date

<<SIGNATURE_BLOCK>>`

export const mndaBusinessVariables: MndaTemplateVariable[] = [
  { key: "effective_date", label: "Effective Date", placeholder: "5th August 2026" },
  { key: "counterparty_company", label: "Counterparty Company", placeholder: "Registered company name" },
  { key: "counterparty_name", label: "Counterparty Representative", placeholder: "Full name of the signing representative" },
  { key: "counterparty_address", label: "Counterparty Address", placeholder: "Registered address of the company" },
  { key: "term_words", label: "Term In Words", placeholder: "two" },
  { key: "term_years", label: "Term In Years", placeholder: "2" },
]
