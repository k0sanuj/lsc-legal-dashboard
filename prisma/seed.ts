import "dotenv/config"
import pg from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"
import { hashPassword } from "../src/lib/password"

const pool = new pg.Pool({
  connectionString:
    process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Seeding database...")

  // ─── Users ───────────────────────────────────────────────────────────────
  const password = await hashPassword("lsc2026!")

  const users = await Promise.all([
    prisma.appUser.upsert({
      where: { email: "ak@leaguesports.co" },
      update: {},
      create: { full_name: "Adi K Mishra", email: "ak@leaguesports.co", role: "PLATFORM_ADMIN", password_hash: password },
    }),
    prisma.appUser.upsert({
      where: { email: "anuj@leaguesports.co" },
      update: {},
      create: { full_name: "Anuj Kumar Singh", email: "anuj@leaguesports.co", role: "FINANCE_ADMIN", password_hash: password },
    }),
    prisma.appUser.upsert({
      where: { email: "arvind@leaguesports.co" },
      update: {},
      create: { full_name: "Arvind Verma", email: "arvind@leaguesports.co", role: "LEGAL_ADMIN", password_hash: password },
    }),
    prisma.appUser.upsert({
      where: { email: "am@leaguesports.co" },
      update: {},
      create: { full_name: "AM Operations", email: "am@leaguesports.co", role: "OPS_ADMIN", password_hash: password },
    }),
    prisma.appUser.upsert({
      where: { email: "tabitha@leaguesports.co" },
      update: {},
      create: { full_name: "Tabitha FSP", email: "tabitha@leaguesports.co", role: "FSP_FINANCE", password_hash: password },
    }),
    prisma.appUser.upsert({
      where: { email: "sayan@leaguesports.co" },
      update: {},
      create: { full_name: "Sayan FSP", email: "sayan@leaguesports.co", role: "FSP_FINANCE", password_hash: password },
    }),
    prisma.appUser.upsert({
      where: { email: "commercial@leaguesports.co" },
      update: {},
      create: { full_name: "Commercial Officer", email: "commercial@leaguesports.co", role: "COMMERCIAL_OFFICER", password_hash: password },
    }),
    prisma.appUser.upsert({
      where: { email: "team@leaguesports.co" },
      update: {},
      create: { full_name: "Team Member", email: "team@leaguesports.co", role: "TEAM_MEMBER", password_hash: password },
    }),
  ])

  const [ak, anuj, arvind, am] = users
  console.log(`Created ${users.length} users`)

  // ─── Tracker Items (85 items) ────────────────────────────────────────────
  const trackerItems = [
    // Platform Documents (P1-P20)
    { ref_code: "P1", title: "Terms of Service / User Agreement", category: "PLATFORM" as const, priority: "CRITICAL" as const, status: "IN_PROGRESS" as const, dependency_refs: [], blocking_notes: "Foundation doc; blocks P3, P5, P9, P10, P13, P19, P20" },
    { ref_code: "P2", title: "Privacy Policy", category: "PLATFORM" as const, priority: "CRITICAL" as const, status: "IN_PROGRESS" as const, dependency_refs: [], blocking_notes: "Blocks P4, P7, P11" },
    { ref_code: "P3", title: "Competition & Challenge Rules", category: "PLATFORM" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1", "IP4"] },
    { ref_code: "P4", title: "AI & Data Processing Notice", category: "PLATFORM" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["P2"] },
    { ref_code: "P5", title: "Content License Agreement", category: "PLATFORM" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1"] },
    { ref_code: "P6", title: "Social Media Terms", category: "PLATFORM" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1"] },
    { ref_code: "P7", title: "Cookie Policy", category: "PLATFORM" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["P2"] },
    { ref_code: "P8", title: "Parental Consent (COPPA)", category: "PLATFORM" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1", "P2"], blocking_notes: "App store blocking requirement" },
    { ref_code: "P9", title: "Creator / Arena Host Agreement", category: "PLATFORM" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1", "P3"], blocking_notes: "Core to arena monetization" },
    { ref_code: "P10", title: "Referral Program Terms", category: "PLATFORM" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1"] },
    { ref_code: "P11", title: "Data Deletion Request Process", category: "PLATFORM" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["P2"] },
    { ref_code: "P12", title: "Skill-Based Game Classification", category: "PLATFORM" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: ["IP4"] },
    { ref_code: "P13", title: "Virtual Currency Terms", category: "PLATFORM" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1"] },
    { ref_code: "P14", title: "Accessibility Statement", category: "PLATFORM" as const, priority: "LOW" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "P15", title: "BNPL Consumer Finance Disclosure", category: "PLATFORM" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["BK1", "BK2", "BK3"], blocking_notes: "Cannot launch BNPL without this" },
    { ref_code: "P16", title: "Beta Testing Agreement", category: "PLATFORM" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1"] },
    { ref_code: "P17", title: "Anti-Fraud & Acceptable Use", category: "PLATFORM" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1"] },
    { ref_code: "P18", title: "Escrow & Prize Pool Terms", category: "PLATFORM" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["IP4", "P3"], blocking_notes: "Language review mandatory" },
    { ref_code: "P19", title: "Platform Fee Schedule", category: "PLATFORM" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1"] },
    { ref_code: "P20", title: "Dispute Resolution Policy", category: "PLATFORM" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1", "P3", "P18"], blocking_notes: "Must embed in P1, P3, P18" },

    // Vaunt Acquisition (V1-V18)
    { ref_code: "V1", title: "Asset Purchase Agreement (APA)", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: [], blocking_notes: "Foundation for all Vaunt docs" },
    { ref_code: "V2", title: "Disclosure Schedule - IP", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "V3", title: "Disclosure Schedule - Contracts", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "V4", title: "Disclosure Schedule - Litigation", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "V5", title: "Disclosure Schedule - Employee", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "V6", title: "Shareholders Agreement (Rivals)", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "V7", title: "Rollover SPV Constitutional Documents", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1", "V6"] },
    { ref_code: "V8", title: "Escrow Agreement", category: "VAUNT_ACQUISITION" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "V9", title: "SHA / Governance Deed (Pong/Quarterback)", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "V10", title: "Transition Services Agreement", category: "VAUNT_ACQUISITION" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "V11", title: "Employee Offer Letters (Vaunt Team)", category: "VAUNT_ACQUISITION" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1", "V5"] },
    { ref_code: "V12", title: "Closing Release Letters", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1", "V2", "V3", "V4", "V5"] },
    { ref_code: "V13", title: "IP Assignment (Vaunt → FSP)", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1", "V2"] },
    { ref_code: "V14", title: "Third-Party Consent Letters", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1", "V3"] },
    { ref_code: "V15", title: "Working Capital Adjustment Mechanism", category: "VAUNT_ACQUISITION" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "V16", title: "Non-Compete (Roger Mason Jr.)", category: "VAUNT_ACQUISITION" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"], blocking_notes: "Parallel with V1. Pre-closing requirement" },
    { ref_code: "V17", title: "Board Resolutions (both sides)", category: "VAUNT_ACQUISITION" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "V18", title: "Regulatory Filings (if required)", category: "VAUNT_ACQUISITION" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },

    // Key Agreements (K1-K9)
    { ref_code: "K1", title: "TBR Anand Agreement", category: "KEY_AGREEMENTS" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "K2", title: "Saurav Equity Terms", category: "KEY_AGREEMENTS" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "K3", title: "Pilot Contract (Primary)", category: "KEY_AGREEMENTS" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "K4", title: "Pilot Contract (Reserve)", category: "KEY_AGREEMENTS" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["K3"] },
    { ref_code: "K5", title: "Team Manager Agreement", category: "KEY_AGREEMENTS" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "K6", title: "Hospitality Partner Agreements", category: "KEY_AGREEMENTS" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "K7", title: "Top 8 Athlete Equity Agreements", category: "KEY_AGREEMENTS" as const, priority: "CRITICAL" as const, status: "IN_REVIEW" as const, dependency_refs: ["CF2"], blocking_notes: "In Review. Requires CF2 ESOP Plan" },
    { ref_code: "K8", title: "Advisor Agreements", category: "KEY_AGREEMENTS" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["CF2"] },
    { ref_code: "K9", title: "Board Observer Rights", category: "KEY_AGREEMENTS" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["CF2"] },

    // Corporate (CF1-CF6)
    { ref_code: "CF1", title: "Delaware Franchise Tax Filing", category: "CORPORATE" as const, priority: "CRITICAL" as const, status: "IN_PROGRESS" as const, dependency_refs: [], blocking_notes: "Urgent filing requirement" },
    { ref_code: "CF2", title: "ESOP Plan Document", category: "CORPORATE" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: [], blocking_notes: "Prerequisite for all ESOP grants (K7-K9)" },
    { ref_code: "CF3", title: "Board Resolution - ESOP Adoption", category: "CORPORATE" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["CF2"] },
    { ref_code: "CF4", title: "409A Valuation Report", category: "CORPORATE" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["CF2"] },
    { ref_code: "CF5", title: "Investor Deck Legal Disclosures", category: "CORPORATE" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "CF6", title: "Athlete Deck Legal Disclosures", category: "CORPORATE" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: [] },

    // Payments (BK1-BK4)
    { ref_code: "BK1", title: "Stripe Outstanding Resolution", category: "PAYMENTS" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: [], blocking_notes: "Blocks everything in payments" },
    { ref_code: "BK2", title: "MSB Classification Review", category: "PAYMENTS" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["BK1"], blocking_notes: "May require FinCEN registration" },
    { ref_code: "BK3", title: "Payout Rails Legal Framework", category: "PAYMENTS" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["BK1"] },
    { ref_code: "BK4", title: "Payment Processor Agreements", category: "PAYMENTS" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["BK1", "BK2"] },

    // IP & Patents (IP1-IP6)
    { ref_code: "IP1", title: "Provisional Patent Application", category: "IP_PATENTS" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: ["IP3"], blocking_notes: "IP3 must precede filing" },
    { ref_code: "IP2", title: "Trademark Applications", category: "IP_PATENTS" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "IP3", title: "IP Assignment (Founders → Company)", category: "IP_PATENTS" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "IP4", title: "Legal Opinion (Game of Skill)", category: "IP_PATENTS" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: [], blocking_notes: "Blocks P3, P12, P18" },
    { ref_code: "IP5", title: "Open Source License Audit", category: "IP_PATENTS" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "IP6", title: "Domain Name Portfolio Review", category: "IP_PATENTS" as const, priority: "LOW" as const, status: "NOT_STARTED" as const, dependency_refs: [] },

    // Gig Workers (GW1-GW3)
    { ref_code: "GW1", title: "Gig Worker Agreement (India)", category: "GIG_MARKETING" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "GW2", title: "Gig Worker Agreement (US)", category: "GIG_MARKETING" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["GW1"] },
    { ref_code: "GW3", title: "Independent Contractor Classification", category: "GIG_MARKETING" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: [] },

    // Marketing (MK1-MK3)
    { ref_code: "MK1", title: "Arena Liability Push-Down Clause", category: "GIG_MARKETING" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "MK2", title: "Influencer Agreement Template", category: "GIG_MARKETING" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "MK3", title: "Language Audit (App Content)", category: "GIG_MARKETING" as const, priority: "CRITICAL" as const, status: "NOT_STARTED" as const, dependency_refs: [], blocking_notes: "App currently contains prohibited language — blocking NOW" },

    // Additional items to reach 85
    { ref_code: "P21", title: "Age Verification Protocol", category: "PLATFORM" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["P8"] },
    { ref_code: "P22", title: "API Terms of Use", category: "PLATFORM" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: ["P1"] },
    { ref_code: "P23", title: "Data Retention Policy", category: "PLATFORM" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["P2"] },
    { ref_code: "V19", title: "Indemnification Agreement", category: "VAUNT_ACQUISITION" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "V20", title: "Tax Allocation Agreement", category: "VAUNT_ACQUISITION" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: ["V1"] },
    { ref_code: "K10", title: "Venue Rental Master Agreement", category: "KEY_AGREEMENTS" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "K11", title: "Broadcast Rights Agreement", category: "KEY_AGREEMENTS" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "CF7", title: "Annual Report Filing (Delaware)", category: "CORPORATE" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "CF8", title: "Board Meeting Minutes Template", category: "CORPORATE" as const, priority: "LOW" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "BK5", title: "Escrow Account Agreement", category: "PAYMENTS" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: ["BK1"] },
    { ref_code: "BK6", title: "Multi-Currency Payment Terms", category: "PAYMENTS" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: ["BK3"] },
    { ref_code: "GW4", title: "Athlete Payout Agreement Template", category: "GIG_MARKETING" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "GW5", title: "Prize Distribution Rules", category: "GIG_MARKETING" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: ["P3"] },
    { ref_code: "MK4", title: "Sponsor Activation Agreement", category: "GIG_MARKETING" as const, priority: "HIGH" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "MK5", title: "Event Photography Release", category: "GIG_MARKETING" as const, priority: "LOW" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "IP7", title: "Trade Secret Protection Policy", category: "IP_PATENTS" as const, priority: "MEDIUM" as const, status: "NOT_STARTED" as const, dependency_refs: [] },
    { ref_code: "IP8", title: "Brand Guidelines Enforcement", category: "IP_PATENTS" as const, priority: "LOW" as const, status: "NOT_STARTED" as const, dependency_refs: ["IP2"] },
  ]

  for (const item of trackerItems) {
    await prisma.trackerItem.upsert({
      where: { ref_code: item.ref_code },
      update: {},
      create: item,
    })
  }
  console.log(`Created ${trackerItems.length} tracker items`)

  // ─── Sample Documents ────────────────────────────────────────────────────
  const now = new Date()
  const future = (days: number) => new Date(now.getTime() + days * 86400000)

  const docs = [
    {
      title: "TBR Season 3 Title Sponsorship — RedBull",
      category: "SPONSORSHIP" as const,
      lifecycle_status: "ACTIVE" as const,
      entity: "TBR" as const,
      owner_id: anuj.id,
      value: 1500000,
      currency: "AED",
      expiry_date: future(45),
      file_url: "https://drive.google.com/file/d/tbr-redbull-s3-sponsorship-signed",
      parties: [{ name: "RedBull Racing", role: "Sponsor", email: "legal@redbull.com" }],
    },
    {
      title: "FSP Platform Terms of Service v2.1",
      category: "TERMS_OF_SERVICE" as const,
      lifecycle_status: "IN_REVIEW" as const,
      entity: "FSP" as const,
      owner_id: arvind.id,
      parties: [{ name: "Future of Sports Inc.", role: "Platform", email: "legal@fsp.co" }],
    },
    {
      title: "E1 Championship Venue Agreement — Monaco",
      category: "VENDOR" as const,
      lifecycle_status: "AWAITING_SIGNATURE" as const,
      entity: "TBR" as const,
      owner_id: ak.id,
      value: 750000,
      currency: "AED",
      expiry_date: future(120),
      parties: [
        { name: "Monaco Yacht Club", role: "Venue", email: "events@myc.mc" },
        { name: "Team Blue Rising", role: "Team", email: "ops@tbr.co" },
      ],
    },
    {
      title: "Pilot Employment Contract — Primary Driver",
      category: "EMPLOYMENT" as const,
      lifecycle_status: "SIGNED" as const,
      entity: "TBR" as const,
      owner_id: anuj.id,
      value: 500000,
      currency: "AED",
      expiry_date: future(365),
      file_url: "https://drive.google.com/file/d/tbr-pilot-employment-signed",
      parties: [{ name: "Primary Pilot", role: "Employee", email: "pilot@tbr.co" }],
    },
    {
      title: "NDA — Potential Series B Investor",
      category: "NDA" as const,
      lifecycle_status: "DRAFT" as const,
      entity: "LSC" as const,
      owner_id: arvind.id,
      parties: [{ name: "Venture Capital Fund", role: "Investor", email: "deals@vc.com" }],
    },
    {
      title: "Bowling Tournament Venue Lease — Dubai",
      category: "VENDOR" as const,
      lifecycle_status: "EXPIRING" as const,
      entity: "BOWLING" as const,
      owner_id: am.id,
      value: 250000,
      currency: "AED",
      expiry_date: future(12),
      parties: [{ name: "Dubai Sports Complex", role: "Venue", email: "leasing@dsc.ae" }],
    },
    {
      title: "ESOP Grant Letter — CTO",
      category: "ESOP" as const,
      lifecycle_status: "SIGNED" as const,
      entity: "LSC" as const,
      owner_id: ak.id,
      value: 200000,
      currency: "AED",
      expiry_date: future(1460),
      parties: [{ name: "CTO", role: "Employee", email: "cto@leaguesports.co" }],
    },
    {
      title: "IP Assignment — FSP Platform Code",
      category: "IP_ASSIGNMENT" as const,
      lifecycle_status: "NEGOTIATION" as const,
      entity: "FSP" as const,
      owner_id: arvind.id,
      parties: [
        { name: "Original Developer", role: "Assignor", email: "dev@contract.co" },
        { name: "Future of Sports", role: "Assignee", email: "legal@fsp.co" },
      ],
    },
  ]

  const createdDocs: Array<{ id: string; title: string; owner_id: string; lifecycle_status: string }> = []

  for (const doc of docs) {
    const created = await prisma.legalDocument.create({
      data: {
        ...doc,
        value: doc.value ?? null,
        parties: doc.parties as any,
      },
    })
    createdDocs.push({ id: created.id, title: created.title, owner_id: doc.owner_id, lifecycle_status: doc.lifecycle_status })

    // Create initial version
    await prisma.documentVersion.create({
      data: {
        document_id: created.id,
        version_number: 1,
        change_summary: "Initial draft created",
        created_by: doc.owner_id,
      },
    })

    // Create lifecycle event
    await prisma.lifecycleEvent.create({
      data: {
        document_id: created.id,
        from_status: "DRAFT",
        to_status: doc.lifecycle_status,
        transitioned_by: doc.owner_id,
        notes: "Document created",
      },
    })

    // Create signature requests for documents awaiting signature
    if (doc.lifecycle_status === "AWAITING_SIGNATURE" || doc.lifecycle_status === "SIGNED") {
      for (const party of doc.parties) {
        await prisma.signatureRequest.create({
          data: {
            document_id: created.id,
            signatory_name: party.name,
            signatory_email: party.email,
            status: doc.lifecycle_status === "SIGNED" ? "SIGNED" : "SENT",
            sent_at: new Date(),
            signed_at: doc.lifecycle_status === "SIGNED" ? new Date() : null,
          },
        })
      }
    }
  }
  console.log(`Created ${docs.length} sample documents`)

  // ─── Contract Templates ──────────────────────────────────────────────────
  const templates = [
    {
      name: "Sponsorship Agreement",
      category: "SPONSORSHIP" as const,
      entity: "TBR" as const,
      content: "SPONSORSHIP AGREEMENT\n\nThis Agreement is made between {{sponsor_name}} (\"Sponsor\") and {{entity_name}} (\"Team\")...\n\n1. TERM: {{start_date}} to {{end_date}}\n2. SPONSORSHIP FEE: {{currency}} {{amount}}\n3. DELIVERABLES: {{deliverables}}\n4. PAYMENT SCHEDULE: {{payment_terms}}\n5. EXCLUSIVITY: {{exclusivity_clause}}\n6. TERMINATION: Either party may terminate with {{notice_period}} written notice.\n\nGoverning Law: UAE",
      variables: [
        { name: "sponsor_name", type: "text", required: true, description: "Name of the sponsoring entity" },
        { name: "entity_name", type: "text", required: true, description: "LSC entity name" },
        { name: "start_date", type: "date", required: true, description: "Contract start date" },
        { name: "end_date", type: "date", required: true, description: "Contract end date" },
        { name: "currency", type: "select", required: true, description: "Currency (AED/USD/EUR)" },
        { name: "amount", type: "number", required: true, description: "Total sponsorship value" },
        { name: "deliverables", type: "textarea", required: true, description: "List of deliverables" },
        { name: "payment_terms", type: "text", required: true, description: "Payment schedule (e.g., 25% on signing)" },
        { name: "exclusivity_clause", type: "textarea", required: false, description: "Exclusivity terms if any" },
        { name: "notice_period", type: "text", required: true, description: "Notice period for termination" },
      ],
    },
    {
      name: "Non-Disclosure Agreement",
      category: "NDA" as const,
      content: "NON-DISCLOSURE AGREEMENT\n\nThis NDA is made between League Sports Co (\"Discloser\") and {{recipient_name}} (\"Recipient\")...\n\n1. PURPOSE: {{purpose}}\n2. DURATION: {{duration}} from the date of execution\n3. SCOPE: All proprietary information shared...\n4. OBLIGATIONS: Recipient shall not disclose...\n5. EXCLUSIONS: Information that is publicly available...\n\nGoverning Law: {{jurisdiction}}",
      variables: [
        { name: "recipient_name", type: "text", required: true, description: "Name of receiving party" },
        { name: "purpose", type: "textarea", required: true, description: "Purpose of the NDA" },
        { name: "duration", type: "text", required: true, description: "NDA duration (e.g., 2 years)" },
        { name: "jurisdiction", type: "text", required: true, description: "Governing law jurisdiction" },
      ],
    },
    {
      name: "Employment Agreement",
      category: "EMPLOYMENT" as const,
      content: "EMPLOYMENT AGREEMENT\n\nThis Agreement is between {{entity_name}} (\"Employer\") and {{employee_name}} (\"Employee\")...\n\n1. POSITION: {{position}}\n2. START DATE: {{start_date}}\n3. COMPENSATION: {{currency}} {{salary}} per {{pay_period}}\n4. BENEFITS: {{benefits}}\n5. PROBATION: {{probation_period}}\n6. NON-COMPETE: {{non_compete_clause}}\n7. TERMINATION: {{termination_terms}}",
      variables: [
        { name: "entity_name", type: "text", required: true, description: "Employing entity" },
        { name: "employee_name", type: "text", required: true, description: "Employee full name" },
        { name: "position", type: "text", required: true, description: "Job title" },
        { name: "start_date", type: "date", required: true, description: "Employment start date" },
        { name: "currency", type: "select", required: true, description: "Currency" },
        { name: "salary", type: "number", required: true, description: "Annual salary" },
        { name: "pay_period", type: "text", required: true, description: "Pay period (month/year)" },
        { name: "benefits", type: "textarea", required: false, description: "Benefits package" },
        { name: "probation_period", type: "text", required: true, description: "Probation period" },
        { name: "non_compete_clause", type: "textarea", required: false, description: "Non-compete terms" },
        { name: "termination_terms", type: "textarea", required: true, description: "Termination conditions" },
      ],
    },
    {
      name: "ESOP Grant Letter",
      category: "ESOP" as const,
      content: "STOCK OPTION GRANT NOTICE\n\n{{entity_name}} grants to {{employee_name}}:\n\nShares: {{total_shares}}\nExercise Price: {{currency}} {{exercise_price}} per share\nVesting Schedule: {{vesting_schedule}}\nCliff Period: {{cliff_period}}\nGrant Date: {{grant_date}}\n\nClawback Triggers: {{clawback_triggers}}\nAcceleration Events: {{acceleration_events}}",
      variables: [
        { name: "entity_name", type: "text", required: true, description: "Granting entity" },
        { name: "employee_name", type: "text", required: true, description: "Grant recipient" },
        { name: "total_shares", type: "number", required: true, description: "Number of shares" },
        { name: "currency", type: "select", required: true, description: "Currency" },
        { name: "exercise_price", type: "number", required: true, description: "Price per share" },
        { name: "vesting_schedule", type: "text", required: true, description: "Vesting schedule" },
        { name: "cliff_period", type: "text", required: true, description: "Cliff period" },
        { name: "grant_date", type: "date", required: true, description: "Grant date" },
        { name: "clawback_triggers", type: "textarea", required: false, description: "Clawback conditions" },
        { name: "acceleration_events", type: "textarea", required: false, description: "Acceleration events" },
      ],
    },
    {
      name: "Vendor Services Agreement",
      category: "VENDOR" as const,
      content: "VENDOR SERVICES AGREEMENT\n\nBetween {{entity_name}} (\"Client\") and {{vendor_name}} (\"Vendor\")...\n\n1. SERVICES: {{services_description}}\n2. TERM: {{start_date}} to {{end_date}}\n3. FEES: {{currency}} {{amount}}\n4. PAYMENT TERMS: {{payment_terms}}\n5. SLA: {{service_level}}\n6. LIABILITY: {{liability_cap}}",
      variables: [
        { name: "entity_name", type: "text", required: true, description: "LSC entity" },
        { name: "vendor_name", type: "text", required: true, description: "Vendor name" },
        { name: "services_description", type: "textarea", required: true, description: "Services scope" },
        { name: "start_date", type: "date", required: true, description: "Start date" },
        { name: "end_date", type: "date", required: true, description: "End date" },
        { name: "currency", type: "select", required: true, description: "Currency" },
        { name: "amount", type: "number", required: true, description: "Total fees" },
        { name: "payment_terms", type: "text", required: true, description: "Payment terms" },
        { name: "service_level", type: "textarea", required: false, description: "SLA terms" },
        { name: "liability_cap", type: "text", required: false, description: "Liability limitation" },
      ],
    },
    {
      name: "Arena Host Agreement",
      category: "ARENA_HOST" as const,
      entity: "FSP" as const,
      content: "ARENA HOST AGREEMENT\n\nBetween Future of Sports (\"Platform\") and {{host_name}} (\"Host\")...\n\n1. VENUE: {{venue_details}}\n2. EVENTS: {{event_types}}\n3. REVENUE SHARE: {{revenue_split}}\n4. DURATION: {{duration}}\n5. INSURANCE: Host shall maintain {{insurance_requirements}}\n6. LIABILITY: {{liability_terms}}",
      variables: [
        { name: "host_name", type: "text", required: true, description: "Arena host name" },
        { name: "venue_details", type: "textarea", required: true, description: "Venue description" },
        { name: "event_types", type: "textarea", required: true, description: "Types of events" },
        { name: "revenue_split", type: "text", required: true, description: "Revenue share terms" },
        { name: "duration", type: "text", required: true, description: "Agreement duration" },
        { name: "insurance_requirements", type: "textarea", required: true, description: "Insurance requirements" },
        { name: "liability_terms", type: "textarea", required: true, description: "Liability terms" },
      ],
    },
  ]

  for (const tmpl of templates) {
    await prisma.contractTemplate.create({
      data: {
        ...tmpl,
        entity: tmpl.entity ?? null,
        variables: tmpl.variables as any,
      },
    })
  }
  console.log(`Created ${templates.length} contract templates`)

  // ─── Compliance Deadlines ────────────────────────────────────────────────
  const deadlines = [
    { title: "UAE Trade License Renewal", jurisdiction: "UAE" as const, category: "Corporate", deadline_date: future(30), status: "DUE_SOON" as const },
    { title: "Delaware Franchise Tax Payment", jurisdiction: "US_DELAWARE" as const, category: "Tax", deadline_date: future(15), status: "DUE_SOON" as const },
    { title: "Annual Data Protection Audit", jurisdiction: "UAE" as const, category: "Data Privacy", deadline_date: future(60), status: "UPCOMING" as const },
    { title: "E1 Series Team Registration", jurisdiction: "GLOBAL" as const, category: "Regulatory", deadline_date: future(45), status: "UPCOMING" as const },
    { title: "COPPA Compliance Certification", jurisdiction: "US_DELAWARE" as const, category: "Regulatory", deadline_date: future(-5), status: "OVERDUE" as const },
    { title: "Insurance Policy Renewal (TBR)", jurisdiction: "UAE" as const, category: "Insurance", deadline_date: future(90), status: "UPCOMING" as const },
    { title: "UAE Labor Law Compliance Review", jurisdiction: "UAE" as const, category: "Employment", deadline_date: future(120), status: "UPCOMING" as const },
    { title: "SEC Regulation D Filing", jurisdiction: "US_DELAWARE" as const, category: "Securities", deadline_date: future(20), status: "DUE_SOON" as const },
  ]

  for (const dl of deadlines) {
    await prisma.complianceDeadline.create({ data: dl })
  }
  console.log(`Created ${deadlines.length} compliance deadlines`)

  // ─── ESOP Grants ─────────────────────────────────────────────────────────
  const grants = [
    {
      employee_name: "Adi K Mishra",
      employee_email: "ak@leaguesports.co",
      entity: "LSC" as const,
      grant_date: new Date("2024-01-15"),
      total_shares: 100000,
      vested_shares: 25000,
      exercise_price: 1.0,
      vesting_type: "STANDARD_4Y_1Y_CLIFF" as const,
      clawback_triggers: ["Voluntary termination before cliff", "Termination for cause"],
      acceleration_events: ["Acquisition", "IPO"],
    },
    {
      employee_name: "Anuj Kumar Singh",
      employee_email: "anuj@leaguesports.co",
      entity: "LSC" as const,
      grant_date: new Date("2024-03-01"),
      total_shares: 75000,
      vested_shares: 18750,
      exercise_price: 1.0,
      vesting_type: "STANDARD_4Y_1Y_CLIFF" as const,
      clawback_triggers: ["Voluntary termination before cliff", "Non-compete breach"],
      acceleration_events: ["Acquisition", "IPO", "Change of control"],
    },
    {
      employee_name: "JP Deal Partner",
      employee_email: "jp@partner.co",
      entity: "FSP" as const,
      grant_date: new Date("2024-06-01"),
      total_shares: 50000,
      vested_shares: 0,
      exercise_price: 1.5,
      vesting_type: "MILESTONE" as const,
      jp_split_ratio: 0.5,
      clawback_triggers: ["Confidentiality breach", "Non-compete breach"],
      acceleration_events: ["Acquisition"],
    },
  ]

  for (const grant of grants) {
    await prisma.eSOPGrant.create({
      data: {
        ...grant,
        clawback_triggers: grant.clawback_triggers as any,
        acceleration_events: grant.acceleration_events as any,
        jp_split_ratio: grant.jp_split_ratio ?? null,
      },
    })
  }
  console.log(`Created ${grants.length} ESOP grants`)

  // ─── Policies ────────────────────────────────────────────────────────────
  const policies = [
    { title: "Employee Code of Conduct", category: "CONDUCT", effective_date: new Date("2024-01-01"), version: 2, acknowledgment_required: true },
    { title: "Travel & Expense Policy", category: "TRAVEL", effective_date: new Date("2024-03-15"), version: 1, acknowledgment_required: true },
    { title: "Intellectual Property Policy", category: "IP", effective_date: new Date("2024-02-01"), version: 1, acknowledgment_required: true },
    { title: "Remote Work Policy", category: "HR", effective_date: new Date("2024-06-01"), version: 1, acknowledgment_required: true },
    { title: "Data Classification Policy", category: "SECURITY", effective_date: new Date("2024-04-01"), version: 1, acknowledgment_required: true },
  ]

  for (const policy of policies) {
    await prisma.policyDocument.create({ data: policy })
  }
  console.log(`Created ${policies.length} policies`)

  // ─── Sample Issues ───────────────────────────────────────────────────────
  const issues = [
    {
      title: "Trademark infringement claim from competitor",
      description: "Received cease and desist letter regarding 'Future of Sports' name from a similar gaming platform.",
      category: "IP" as const,
      reporter_id: arvind.id,
      assigned_to: arvind.id,
      priority: "HIGH" as const,
      sla_deadline: future(5),
      status: "IN_PROGRESS" as const,
    },
    {
      title: "UAE labor law compliance gap — contractor classification",
      description: "Several team members in UAE may be misclassified as contractors. Need legal review of employment status.",
      category: "EMPLOYMENT" as const,
      reporter_id: anuj.id,
      assigned_to: arvind.id,
      priority: "CRITICAL" as const,
      sla_deadline: future(3),
      status: "OPEN" as const,
    },
    {
      title: "E1 regulatory requirement — additional insurance",
      description: "E1 series requires additional liability insurance for Season 3. Need to review and procure.",
      category: "REGULATORY" as const,
      reporter_id: am.id,
      priority: "MEDIUM" as const,
      sla_deadline: future(14),
      status: "OPEN" as const,
    },
  ]

  for (const issue of issues) {
    await prisma.legalIssue.create({ data: issue })
  }
  console.log(`Created ${issues.length} legal issues`)

  // ─── Document Notes ──────────────────────────────────────────────────────
  for (const doc of createdDocs.slice(0, 4)) {
    await prisma.documentNote.create({
      data: {
        document_id: doc.id,
        content: "Initial review completed. Key terms verified against market standards.",
        author_id: arvind.id,
        created_at: new Date(Date.now() - 5 * 86400000),
      },
    })
    await prisma.documentNote.create({
      data: {
        document_id: doc.id,
        content: "Finance team confirmed budget allocation. Ready for next stage.",
        author_id: anuj.id,
        created_at: new Date(Date.now() - 2 * 86400000),
      },
    })
  }
  console.log("Created document notes")

  // ─── Document Comments (on IN_REVIEW docs) ──────────────────────────────
  const reviewDocs = createdDocs.filter((d) => d.lifecycle_status === "IN_REVIEW")
  for (const doc of reviewDocs) {
    await prisma.documentComment.create({
      data: {
        document_id: doc.id,
        content: "Section 4.2 needs updated liability cap — current language is too broad for UAE jurisdiction.",
        author_id: arvind.id,
        resolved: false,
      },
    })
    await prisma.documentComment.create({
      data: {
        document_id: doc.id,
        content: "Indemnification clause reviewed and approved.",
        author_id: ak.id,
        resolved: true,
      },
    })
  }
  console.log("Created document comments")

  // ─── Additional Signature Requests (for Kanban variety) ──────────────────
  // Add PENDING and STALLED signatures to non-signed documents
  const negotiationDocs = createdDocs.filter((d) => d.lifecycle_status === "NEGOTIATION")
  for (const doc of negotiationDocs) {
    await prisma.signatureRequest.create({
      data: {
        document_id: doc.id,
        signatory_name: "External Counsel",
        signatory_email: "counsel@lawfirm.ae",
        status: "PENDING",
      },
    })
  }
  const expiringDocs = createdDocs.filter((d) => d.lifecycle_status === "EXPIRING")
  for (const doc of expiringDocs) {
    await prisma.signatureRequest.create({
      data: {
        document_id: doc.id,
        signatory_name: "Renewal Signatory",
        signatory_email: "renewal@partner.co",
        status: "STALLED",
        stalled_reason: "Awaiting renewal terms from counterparty",
        sent_at: new Date(Date.now() - 10 * 86400000),
      },
    })
  }
  const draftDocs = createdDocs.filter((d) => d.lifecycle_status === "DRAFT")
  for (const doc of draftDocs) {
    await prisma.signatureRequest.create({
      data: {
        document_id: doc.id,
        signatory_name: "Internal Review",
        signatory_email: "arvind@leaguesports.co",
        status: "PENDING",
      },
    })
  }
  console.log("Created additional signature requests")

  // ─── Incoming Notices ────────────────────────────────────────────────────
  const notices = [
    {
      subject: "GDPR Data Subject Access Request — User #4821",
      from_email: "dpo@regulatorybody.eu",
      body: "We have received a data subject access request from a user of your platform. Please respond within 30 days.",
      category: "DATA_PROTECTION" as const,
      status: "NEW" as const,
      forwarded_to: ["arvind@leaguesports.co", "ak@leaguesports.co"],
    },
    {
      subject: "Complaint: Prize Pool Distribution Delay",
      from_email: "player@gmail.com",
      body: "I won a tournament 3 weeks ago and have not received the prize. This is unacceptable.",
      category: "COMPLAINT" as const,
      status: "ACKNOWLEDGED" as const,
      assigned_to: arvind.id,
      forwarded_to: ["arvind@leaguesports.co", "ak@leaguesports.co"],
    },
    {
      subject: "UAE Economic Substance Regulations — Annual Filing Reminder",
      from_email: "notifications@moec.gov.ae",
      body: "This is a reminder that your annual Economic Substance filing is due within 12 months of your financial year end.",
      category: "REGULATORY" as const,
      status: "NEW" as const,
      forwarded_to: ["arvind@leaguesports.co", "ak@leaguesports.co"],
    },
  ]

  for (const notice of notices) {
    await prisma.incomingNotice.create({ data: notice as any })
  }
  console.log(`Created ${notices.length} incoming notices`)

  // ─── Notifications ───────────────────────────────────────────────────────
  const notificationData = [
    { user_id: ak.id, type: "NOTICE_RECEIVED", title: "New data protection notice", message: "GDPR Data Subject Access Request received", link: "/legal/compliance", read: false },
    { user_id: arvind.id, type: "NOTICE_RECEIVED", title: "New data protection notice", message: "GDPR Data Subject Access Request received", link: "/legal/compliance", read: false },
    { user_id: arvind.id, type: "COMMENT_ADDED", title: "New comment on FSP ToS", message: "AK commented on Section 4.2 liability cap", link: "/legal/documents/review", read: true },
    { user_id: anuj.id, type: "EXPIRATION_WARNING", title: "Document expiring soon", message: "Bowling Venue Lease expires in 12 days", link: "/legal/expirations", read: false },
    { user_id: ak.id, type: "STATUS_CHANGE", title: "Document signed", message: "Pilot Employment Contract has been signed", link: "/legal/signatures", read: true },
  ]

  for (const notif of notificationData) {
    await prisma.notification.create({ data: notif })
  }
  console.log(`Created ${notificationData.length} notifications`)

  console.log("Seeding complete!")
}

main()
  .catch((e) => {
    console.error("Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
