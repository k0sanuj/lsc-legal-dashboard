# Legal Tracker Seed Data — 85 Items from PRD

This is the complete tracker item data to seed into the `TrackerItem` table. Source: PRD Section 5.3, Legal_Tracker_2026.xlsx.

## Platform Documents (P1-P20)

| Ref | Title | Priority | Status | Dependencies |
|-----|-------|----------|--------|-------------|
| P1 | Terms of Service / User Agreement | CRITICAL | IN_PROGRESS | [] (foundation doc) |
| P2 | Privacy Policy | CRITICAL | IN_PROGRESS | [] |
| P3 | Competition & Challenge Rules | CRITICAL | NOT_STARTED | ["P1", "IP4"] |
| P4 | AI & Data Processing Notice | CRITICAL | NOT_STARTED | ["P2"] |
| P5 | Content License Agreement | HIGH | NOT_STARTED | ["P1"] |
| P6 | Social Media Terms | MEDIUM | NOT_STARTED | ["P1"] |
| P7 | Cookie Policy | HIGH | NOT_STARTED | ["P2"] |
| P8 | Parental Consent (COPPA) | CRITICAL | NOT_STARTED | ["P1", "P2"] |
| P9 | Creator / Arena Host Agreement | CRITICAL | NOT_STARTED | ["P1", "P3"] |
| P10 | Referral Program Terms | HIGH | NOT_STARTED | ["P1"] |
| P11 | Data Deletion Request Process | HIGH | NOT_STARTED | ["P2"] |
| P12 | Skill-Based Game Classification | MEDIUM | NOT_STARTED | ["IP4"] |
| P13 | Virtual Currency Terms | HIGH | NOT_STARTED | ["P1"] |
| P14 | Accessibility Statement | LOW | NOT_STARTED | [] |
| P15 | BNPL Consumer Finance Disclosure | CRITICAL | NOT_STARTED | ["BK1", "BK2", "BK3"] |
| P16 | Beta Testing Agreement | MEDIUM | NOT_STARTED | ["P1"] |
| P17 | Anti-Fraud & Acceptable Use | CRITICAL | NOT_STARTED | ["P1"] |
| P18 | Escrow & Prize Pool Terms | CRITICAL | NOT_STARTED | ["IP4", "P3"] |
| P19 | Platform Fee Schedule | HIGH | NOT_STARTED | ["P1"] |
| P20 | Dispute Resolution Policy | CRITICAL | NOT_STARTED | ["P1", "P3", "P18"] |

Blocking notes for P1: "Foundation doc; blocks P3, P5, P9, P10, P13, P19, P20"
Blocking notes for P2: "Blocks P4, P7, P11"
Blocking notes for P8: "App store blocking requirement"
Blocking notes for P9: "Core to arena monetization"
Blocking notes for P15: "Cannot launch BNPL without this"
Blocking notes for P18: "Language review mandatory"
Blocking notes for P20: "Must embed in P1, P3, P18"

## Vaunt Acquisition (V1-V18)

| Ref | Title | Priority | Dependencies |
|-----|-------|----------|-------------|
| V1 | Asset Purchase Agreement (APA) | CRITICAL | [] (foundation for all Vaunt) |
| V2 | Disclosure Schedule - IP | CRITICAL | ["V1"] |
| V3 | Disclosure Schedule - Contracts | CRITICAL | ["V1"] |
| V4 | Disclosure Schedule - Litigation | CRITICAL | ["V1"] |
| V5 | Disclosure Schedule - Employee | CRITICAL | ["V1"] |
| V6 | Shareholders Agreement (Rivals) | CRITICAL | ["V1"] |
| V7 | Rollover SPV Constitutional Documents | CRITICAL | ["V1", "V6"] |
| V8 | Escrow Agreement | HIGH | ["V1"] |
| V9 | SHA / Governance Deed (Pong/Quarterback) | CRITICAL | ["V1"] |
| V10 | Transition Services Agreement | HIGH | ["V1"] |
| V11 | Employee Offer Letters (Vaunt Team) | HIGH | ["V1", "V5"] |
| V12 | Closing Release Letters | CRITICAL | ["V1", "V2", "V3", "V4", "V5"] |
| V13 | IP Assignment (Vaunt → FSP) | CRITICAL | ["V1", "V2"] |
| V14 | Third-Party Consent Letters | CRITICAL | ["V1", "V3"] |
| V15 | Working Capital Adjustment Mechanism | MEDIUM | ["V1"] |
| V16 | Non-Compete (Roger Mason Jr.) | CRITICAL | ["V1"] |
| V17 | Board Resolutions (both sides) | MEDIUM | ["V1"] |
| V18 | Regulatory Filings (if required) | HIGH | ["V1"] |

Blocking notes for V1: "Foundation for all Vaunt docs"
Blocking notes for V16: "Parallel with V1. Pre-closing requirement"

## Key Agreements (K1-K9)

| Ref | Title | Priority | Dependencies |
|-----|-------|----------|-------------|
| K1 | TBR Anand Agreement | CRITICAL | [] |
| K2 | Saurav Equity Terms | CRITICAL | [] |
| K3 | Pilot Contract (Primary) | HIGH | [] |
| K4 | Pilot Contract (Reserve) | HIGH | ["K3"] |
| K5 | Team Manager Agreement | MEDIUM | [] |
| K6 | Hospitality Partner Agreements | MEDIUM | [] |
| K7 | Top 8 Athlete Equity Agreements | CRITICAL | ["CF2"] |
| K8 | Advisor Agreements | HIGH | ["CF2"] |
| K9 | Board Observer Rights | HIGH | ["CF2"] |

Blocking notes for K7: "In Review status. Requires CF2 ESOP Plan"

## Corporate (CF1-CF6)

| Ref | Title | Priority | Dependencies |
|-----|-------|----------|-------------|
| CF1 | Delaware Franchise Tax Filing | CRITICAL | [] |
| CF2 | ESOP Plan Document | CRITICAL | [] |
| CF3 | Board Resolution - ESOP Adoption | HIGH | ["CF2"] |
| CF4 | 409A Valuation Report | HIGH | ["CF2"] |
| CF5 | Investor Deck Legal Disclosures | MEDIUM | [] |
| CF6 | Athlete Deck Legal Disclosures | MEDIUM | [] |

Blocking notes for CF1: "Urgent filing requirement"
Blocking notes for CF2: "Prerequisite for all ESOP grants (K7-K9)"

## Payments (BK1-BK4)

| Ref | Title | Priority | Dependencies |
|-----|-------|----------|-------------|
| BK1 | Stripe Outstanding Resolution | CRITICAL | [] |
| BK2 | MSB Classification Review | CRITICAL | ["BK1"] |
| BK3 | Payout Rails Legal Framework | CRITICAL | ["BK1"] |
| BK4 | Payment Processor Agreements | HIGH | ["BK1", "BK2"] |

Blocking notes for BK1: "Blocks everything in payments"
Blocking notes for BK2: "May require FinCEN registration"

## IP & Patents (IP1-IP6)

| Ref | Title | Priority | Dependencies |
|-----|-------|----------|-------------|
| IP1 | Provisional Patent Application | CRITICAL | ["IP3"] |
| IP2 | Trademark Applications | HIGH | [] |
| IP3 | IP Assignment (Founders → Company) | CRITICAL | [] |
| IP4 | Legal Opinion (Game of Skill) | CRITICAL | [] |
| IP5 | Open Source License Audit | MEDIUM | [] |
| IP6 | Domain Name Portfolio Review | LOW | [] |

Blocking notes for IP3: "Must precede IP1 filing"
Blocking notes for IP4: "Blocks P3, P12, P18"

## Gig Workers (GW1-GW3)

| Ref | Title | Priority | Dependencies |
|-----|-------|----------|-------------|
| GW1 | Gig Worker Agreement (India) | CRITICAL | [] |
| GW2 | Gig Worker Agreement (US) | HIGH | ["GW1"] |
| GW3 | Independent Contractor Classification | HIGH | [] |

## Marketing (MK1-MK3)

| Ref | Title | Priority | Dependencies |
|-----|-------|----------|-------------|
| MK1 | Arena Liability Push-Down Clause | CRITICAL | [] |
| MK2 | Influencer Agreement Template | HIGH | [] |
| MK3 | Language Audit (App Content) | CRITICAL | [] |

Blocking notes for MK3: "App currently contains prohibited language — blocking NOW"

---

## Total: 85 items
- Platform: 20
- Vaunt: 18
- Key Agreements: 9
- Corporate: 6
- Payments: 4
- IP & Patents: 6
- Gig Workers: 3
- Marketing: 3
- **Remaining items to reach 85**: Add additional items in each category during seed to reach the total. The PRD mentions 85 items — the above covers the explicitly named ones. Fill remaining slots with reasonable items per category.

## Status defaults for seed
- P1, P2: IN_PROGRESS
- K7: IN_REVIEW
- CF1: IN_PROGRESS (urgent)
- All others: NOT_STARTED (unless marked otherwise)
