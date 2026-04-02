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

  // ─── Compliance Records ───────────────────────────────────────────────────
  const complianceRecords = [
    { entity: "LSC" as const, jurisdiction: "UAE" as const, check_type: "Business Registration", status: "ACTIVE" as const, registration_number: "LLC-2024-001234", last_checked: new Date("2026-03-15"), next_check: new Date("2026-06-15"), notes: "Dubai DED trade license — annual renewal" },
    { entity: "LSC" as const, jurisdiction: "UAE" as const, check_type: "VAT Registration", status: "ACTIVE" as const, registration_number: "TRN-100234567890003", last_checked: new Date("2026-03-01"), next_check: new Date("2026-09-01") },
    { entity: "LSC" as const, jurisdiction: "UAE" as const, check_type: "Corporate Tax", status: "ACTIVE" as const, registration_number: "CT-2024-00456", last_checked: new Date("2026-02-20"), next_check: new Date("2026-08-20") },
    { entity: "TBR" as const, jurisdiction: "UAE" as const, check_type: "Business Registration", status: "ACTIVE" as const, registration_number: "LLC-2024-005678", last_checked: new Date("2026-03-10"), next_check: new Date("2026-06-10") },
    { entity: "TBR" as const, jurisdiction: "UAE" as const, check_type: "Sports Authority License", status: "ACTIVE" as const, registration_number: "SA-2025-0042", last_checked: new Date("2026-01-15"), next_check: new Date("2026-07-15"), notes: "E1 series license — bi-annual" },
    { entity: "FSP" as const, jurisdiction: "UAE" as const, check_type: "Business Registration", status: "ACTIVE" as const, registration_number: "FZCO-2024-00321", last_checked: new Date("2026-03-12"), next_check: new Date("2026-06-12"), notes: "DMCC free zone company" },
    { entity: "FSP" as const, jurisdiction: "UAE" as const, check_type: "Data Protection Registration", status: "PENDING" as const, last_checked: new Date("2026-02-01"), next_check: new Date("2026-04-15"), notes: "PDPL registration pending with UAE DPA" },
    { entity: "FSP" as const, jurisdiction: "INDIA" as const, check_type: "Business Registration", status: "ACTIVE" as const, registration_number: "CIN-U74999MH2024PTC", last_checked: new Date("2026-03-05"), next_check: new Date("2026-09-05"), notes: "India subsidiary — MCA registered" },
    { entity: "LSC" as const, jurisdiction: "CAYMAN" as const, check_type: "Registered Agent", status: "AT_RISK" as const, last_checked: new Date("2025-12-01"), next_check: new Date("2026-03-01"), notes: "Registered agent agreement expired — needs renewal urgently" },
  ]
  for (const cr of complianceRecords) {
    await prisma.complianceRecord.upsert({ where: { entity_jurisdiction_check_type: { entity: cr.entity, jurisdiction: cr.jurisdiction, check_type: cr.check_type } }, update: cr, create: cr })
  }
  console.log(`Created ${complianceRecords.length} compliance records`)

  // ─── Compliance Officers ─────────────────────────────────────────────────
  await prisma.complianceOfficer.upsert({ where: { entity_user_id: { entity: "LSC", user_id: arvind.id } }, update: {}, create: { entity: "LSC", user_id: arvind.id, is_primary: true } })
  await prisma.complianceOfficer.upsert({ where: { entity_user_id: { entity: "LSC", user_id: ak.id } }, update: {}, create: { entity: "LSC", user_id: ak.id } })
  await prisma.complianceOfficer.upsert({ where: { entity_user_id: { entity: "TBR", user_id: arvind.id } }, update: {}, create: { entity: "TBR", user_id: arvind.id, is_primary: true } })
  await prisma.complianceOfficer.upsert({ where: { entity_user_id: { entity: "FSP", user_id: ak.id } }, update: {}, create: { entity: "FSP", user_id: ak.id, is_primary: true } })
  console.log("Created compliance officers")

  // ─── Registered Office Agreements ────────────────────────────────────────
  const offices = [
    { entity: "LSC" as const, jurisdiction: "UAE" as const, address: "Office 1204, Aspect Tower, Business Bay, Dubai", landlord: "Aspect Properties LLC", renewal_date: new Date("2026-12-31"), cost_annual: 85000, auto_renew: true },
    { entity: "TBR" as const, jurisdiction: "UAE" as const, address: "Unit 502, DMCC Business Centre, JLT, Dubai", landlord: "DMCC Authority", renewal_date: new Date("2026-06-15"), cost_annual: 62000, auto_renew: false, notes: "Needs renewal negotiation — 30 days" },
    { entity: "FSP" as const, jurisdiction: "UAE" as const, address: "Suite 3A, One JLT Tower, JLT, Dubai", landlord: "One JLT Management", renewal_date: new Date("2027-03-01"), cost_annual: 78000, auto_renew: true },
    { entity: "FSP" as const, jurisdiction: "INDIA" as const, address: "WeWork, Prestige Atlanta, MG Road, Bangalore 560001", landlord: "WeWork India", renewal_date: new Date("2026-09-30"), cost_annual: 24000, currency: "INR" as const },
  ]
  for (const o of offices) { await prisma.registeredOfficeAgreement.create({ data: o }) }
  console.log(`Created ${offices.length} registered office agreements`)

  // ─── Data Protection Records ─────────────────────────────────────────────
  const dpRecords = [
    { entity: "LSC" as const, jurisdiction: "UAE" as const, applicable_law: "UAE PDPL (Federal Decree-Law No. 45/2021)", dpo_required: true, dpo_name: "Arvind Verma", dpo_email: "arvind@leaguesports.co", registration_status: "Registered", dpa_in_place: true, breach_procedure: true, health_score: 85 },
    { entity: "TBR" as const, jurisdiction: "UAE" as const, applicable_law: "UAE PDPL", dpo_required: true, dpo_name: "Arvind Verma", dpo_email: "arvind@leaguesports.co", registration_status: "Registered", dpa_in_place: true, breach_procedure: false, health_score: 65, notes: "Breach notification procedure not yet documented" },
    { entity: "FSP" as const, jurisdiction: "UAE" as const, applicable_law: "UAE PDPL", dpo_required: true, dpo_name: "Adi K Mishra", dpo_email: "ak@leaguesports.co", registration_status: "Pending", dpa_in_place: false, breach_procedure: false, health_score: 35, notes: "DPA and breach procedure both missing" },
    { entity: "FSP" as const, jurisdiction: "INDIA" as const, applicable_law: "DPDPA 2023 (Digital Personal Data Protection Act)", dpo_required: true, registration_status: "Not registered", dpa_in_place: false, breach_procedure: false, health_score: 20, notes: "India DPDPA compliance not started" },
  ]
  for (const dp of dpRecords) {
    await prisma.dataProtectionRecord.upsert({ where: { entity_jurisdiction: { entity: dp.entity, jurisdiction: dp.jurisdiction } }, update: dp, create: dp })
  }
  console.log(`Created ${dpRecords.length} data protection records`)

  // ─── Company Emails ──────────────────────────────────────────────────────
  const emails = [
    { entity: "LSC" as const, email_address: "legal@leaguesportsco.com", owner_name: "Legal Team", domain: "leaguesportsco.com", domain_expiry: new Date("2027-06-15"), status: "active", last_activity: new Date("2026-03-31") },
    { entity: "LSC" as const, email_address: "ak@leaguesports.co", owner_name: "Adi K Mishra", domain: "leaguesports.co", domain_expiry: new Date("2027-06-15"), status: "active", last_activity: new Date("2026-03-31") },
    { entity: "LSC" as const, email_address: "anuj@leaguesports.co", owner_name: "Anuj Kumar Singh", domain: "leaguesports.co", domain_expiry: new Date("2027-06-15"), status: "active", last_activity: new Date("2026-03-31") },
    { entity: "LSC" as const, email_address: "arvind@leaguesports.co", owner_name: "Arvind Verma", domain: "leaguesports.co", domain_expiry: new Date("2027-06-15"), status: "active", last_activity: new Date("2026-03-30") },
    { entity: "TBR" as const, email_address: "racing@teambluerising.com", owner_name: "TBR Operations", domain: "teambluerising.com", domain_expiry: new Date("2026-12-01"), status: "active", last_activity: new Date("2026-03-28") },
    { entity: "TBR" as const, email_address: "sponsors@teambluerising.com", owner_name: "TBR Sponsorships", domain: "teambluerising.com", domain_expiry: new Date("2026-12-01"), status: "inactive", last_activity: new Date("2025-11-15") },
    { entity: "FSP" as const, email_address: "hello@futureofsports.io", owner_name: "FSP General", domain: "futureofsports.io", domain_expiry: new Date("2026-05-10"), status: "active", last_activity: new Date("2026-03-30") },
    { entity: "FSP" as const, email_address: "support@futureofsports.io", owner_name: "FSP Support", domain: "futureofsports.io", domain_expiry: new Date("2026-05-10"), status: "suspended" },
  ]
  for (const e of emails) { await prisma.companyEmail.upsert({ where: { email_address: e.email_address }, update: e, create: e }) }
  console.log(`Created ${emails.length} company emails`)

  // ─── KYC Documents ───────────────────────────────────────────────────────
  const kycDocs = [
    { entity: "LSC" as const, jurisdiction: "UAE" as const, document_type: "Trade License", document_name: "LSC Dubai DED Trade License 2026", status: "VERIFIED" as const, expiry_date: new Date("2027-03-31"), verified_by: arvind.id, verified_at: new Date("2026-03-01") },
    { entity: "LSC" as const, jurisdiction: "UAE" as const, document_type: "Certificate of Incorporation", document_name: "LSC Memorandum of Association", status: "VERIFIED" as const },
    { entity: "LSC" as const, jurisdiction: "UAE" as const, document_type: "Passport Copy", document_name: "Director passport — AK", status: "VERIFIED" as const, expiry_date: new Date("2030-08-15") },
    { entity: "TBR" as const, jurisdiction: "UAE" as const, document_type: "Trade License", document_name: "TBR DMCC Trade License 2026", status: "VERIFIED" as const, expiry_date: new Date("2027-01-15") },
    { entity: "TBR" as const, jurisdiction: "UAE" as const, document_type: "Sports Authority License", document_name: "E1 Championship Team License", status: "COLLECTED" as const, expiry_date: new Date("2026-12-31"), notes: "Awaiting verification from authority" },
    { entity: "FSP" as const, jurisdiction: "UAE" as const, document_type: "Trade License", document_name: "FSP DMCC Free Zone License", status: "VERIFIED" as const, expiry_date: new Date("2026-12-31") },
    { entity: "FSP" as const, jurisdiction: "INDIA" as const, document_type: "Certificate of Incorporation", document_name: "FSP India Pvt Ltd — MCA Certificate", status: "VERIFIED" as const },
    { entity: "FSP" as const, jurisdiction: "INDIA" as const, document_type: "GST Certificate", document_name: "FSP India GST Registration", status: "EXPIRED" as const, expiry_date: new Date("2026-01-31"), notes: "GST certificate lapsed — needs immediate renewal" },
    { entity: "LSC" as const, jurisdiction: "CAYMAN" as const, document_type: "Registered Agent Agreement", document_name: "Cayman Islands RA Agreement", status: "NEEDS_RENEWAL" as const, expiry_date: new Date("2026-03-01") },
  ]
  for (const k of kycDocs) { await prisma.kycDocument.create({ data: k }) }
  console.log(`Created ${kycDocs.length} KYC documents`)

  // ─── Admin Accounts ──────────────────────────────────────────────────────
  const adminAccts = [
    { entity: "LSC" as const, platform_name: "Google Workspace", platform_url: "https://admin.google.com", account_holder: "Adi K Mishra", access_level: "Super Admin", two_factor_enabled: true, recovery_documented: true, last_verified: new Date("2026-03-20") },
    { entity: "LSC" as const, platform_name: "Neon Database", platform_url: "https://console.neon.tech", account_holder: "Anuj Kumar Singh", access_level: "Owner", two_factor_enabled: true, recovery_documented: true, last_verified: new Date("2026-03-25") },
    { entity: "LSC" as const, platform_name: "Vercel", platform_url: "https://vercel.com", account_holder: "Anuj Kumar Singh", access_level: "Owner", two_factor_enabled: true, recovery_documented: false, last_verified: new Date("2026-03-25") },
    { entity: "LSC" as const, platform_name: "AWS (S3)", platform_url: "https://console.aws.amazon.com", account_holder: "Anuj Kumar Singh", access_level: "IAM Admin", two_factor_enabled: true, recovery_documented: true, last_verified: new Date("2026-03-20") },
    { entity: "LSC" as const, platform_name: "GitHub", platform_url: "https://github.com/k0sanuj", account_holder: "Anuj Kumar Singh", access_level: "Owner", two_factor_enabled: true, recovery_documented: true, last_verified: new Date("2026-03-28") },
    { entity: "TBR" as const, platform_name: "E1 Portal", platform_url: "https://portal.e1series.com", account_holder: "Adi K Mishra", access_level: "Team Admin", two_factor_enabled: false, recovery_documented: false, last_verified: new Date("2025-11-01"), notes: "2FA not enabled — security risk" },
    { entity: "FSP" as const, platform_name: "App Store Connect", platform_url: "https://appstoreconnect.apple.com", account_holder: "Adi K Mishra", access_level: "Admin", two_factor_enabled: true, recovery_documented: true, last_verified: new Date("2026-02-15") },
    { entity: "FSP" as const, platform_name: "Google Play Console", platform_url: "https://play.google.com/console", account_holder: "Adi K Mishra", access_level: "Owner", two_factor_enabled: true, recovery_documented: false },
    { entity: "LSC" as const, platform_name: "GoDaddy (Domains)", platform_url: "https://godaddy.com", account_holder: "Adi K Mishra", access_level: "Owner", two_factor_enabled: false, recovery_documented: false, notes: "Multiple domains — leaguesports.co, teambluerising.com, futureofsports.io" },
  ]
  for (const a of adminAccts) { await prisma.adminAccount.create({ data: a }) }
  console.log(`Created ${adminAccts.length} admin accounts`)

  // ─── Litigation Cases ────────────────────────────────────────────────────
  const litCase1 = await prisma.litigationCase.create({ data: {
    case_name: "LSC vs. Vaunt Technologies — IP Dispute", case_number: "DIFC-2026-0142", jurisdiction: "UAE", court_tribunal: "DIFC Courts", entity: "LSC", plaintiff: "League Sports Co LLC", defendant: "Vaunt Technologies FZ-LLC", status: "FILED", filing_date: new Date("2026-02-15"), next_hearing: new Date("2026-04-20"), assigned_counsel: "Arvind Verma", external_counsel: "Al Tamimi & Company", estimated_liability: 350000, legal_fees_to_date: 45000, projected_total_cost: 120000, assigned_to: arvind.id,
  }})
  await prisma.litigationEvent.createMany({ data: [
    { case_id: litCase1.id, event_type: "filing", title: "Case filed with DIFC Courts", event_date: new Date("2026-02-15") },
    { case_id: litCase1.id, event_type: "hearing", title: "Preliminary hearing — judge assigned", event_date: new Date("2026-03-10") },
    { case_id: litCase1.id, event_type: "document", title: "Statement of claim submitted", event_date: new Date("2026-03-18") },
  ]})

  const litCase2 = await prisma.litigationCase.create({ data: {
    case_name: "TBR — Venue Damage Claim (Monaco)", case_number: "MC-CIV-2026-0089", jurisdiction: "GLOBAL", court_tribunal: "Monaco Civil Court", entity: "TBR", plaintiff: "Monaco Port Authority", defendant: "Team Blue Rising Ltd", status: "DISCOVERY", filing_date: new Date("2026-01-20"), next_hearing: new Date("2026-05-12"), assigned_counsel: "External — Monaco firm", estimated_liability: 180000, legal_fees_to_date: 22000, projected_total_cost: 60000, assigned_to: ak.id,
  }})
  await prisma.litigationEvent.create({ data: { case_id: litCase2.id, event_type: "filing", title: "Claim received from port authority", event_date: new Date("2026-01-20") }})

  console.log("Created 2 litigation cases with events")

  // ─── Subsidies ───────────────────────────────────────────────────────────
  const subsidies = [
    { title: "UAE SME Growth Accelerator Grant", entity: "LSC" as const, jurisdiction: "UAE" as const, source: "Dubai SME (Mohammed Bin Rashid Establishment)", status: "APPROVED" as const, amount: 150000, conditions: "Must maintain UAE headcount of 10+ for 2 years", approval_date: new Date("2026-01-10"), application_date: new Date("2025-09-15") },
    { title: "Sports Tech Innovation Fund", entity: "FSP" as const, jurisdiction: "UAE" as const, source: "Dubai Future Foundation", status: "APPLYING" as const, amount: 500000, application_date: new Date("2026-03-01"), notes: "Application submitted — awaiting review committee" },
    { title: "India Startup India Recognition", entity: "FSP" as const, jurisdiction: "INDIA" as const, source: "DPIIT — Ministry of Commerce", status: "IDENTIFIED" as const, amount: 0, notes: "Tax benefits + funding eligibility — need to apply", website_url: "https://www.startupindia.gov.in" },
    { title: "E1 Championship Host City Subsidy", entity: "TBR" as const, jurisdiction: "UAE" as const, source: "Abu Dhabi Sports Council", status: "DISBURSED" as const, amount: 250000, approval_date: new Date("2025-11-01"), disbursement_date: new Date("2026-01-15"), conditions: "Must host minimum 2 race events in Abu Dhabi" },
  ]
  for (const s of subsidies) { await prisma.subsidy.create({ data: s }) }
  console.log(`Created ${subsidies.length} subsidies`)

  // ─── Clickwrap Acceptances ───────────────────────────────────────────────
  const clickwraps = [
    { person_name: "Saurav Pilot", person_email: "saurav@teambluerising.com", agreement_title: "Arena Master Service Agreement", agreement_version: 2, ip_address: "203.45.67.89", user_agent: "Mozilla/5.0", entity: "TBR" as const },
    { person_name: "JP Deal Partner", person_email: "jp@partner.co", agreement_title: "Arena Master Service Agreement", agreement_version: 2, ip_address: "103.21.44.12", entity: "FSP" as const },
    { person_name: "Red Bull Racing UAE", person_email: "partnerships@redbull.ae", agreement_title: "Sponsorship Terms & Conditions", agreement_version: 1, ip_address: "185.22.33.44", entity: "TBR" as const },
    { person_name: "Anuj Kumar Singh", person_email: "anuj@leaguesports.co", agreement_title: "Arena Ads Platform Terms", agreement_version: 1, ip_address: "86.98.12.34", entity: "FSP" as const },
    { person_name: "Vendor XYZ LLC", person_email: "accounts@vendorxyz.com", agreement_title: "Arena Master Service Agreement", agreement_version: 2, ip_address: "45.67.89.12", entity: "LSC" as const },
  ]
  for (const c of clickwraps) { await prisma.clickwrapAcceptance.create({ data: c }) }
  console.log(`Created ${clickwraps.length} clickwrap acceptances`)

  // ─── Detected Invoices (simulated) ───────────────────────────────────────
  const invoices = [
    { vendor_name: "Al Tamimi & Company", amount: 15000, currency: "AED", invoice_date: new Date("2026-03-25"), entity: "LSC" as const, category: "Legal Fees", verification_status: "verified", math_check_passed: true, routed_to_finance: false },
    { vendor_name: "Monaco Port Authority", amount: 8500, currency: "EUR", invoice_date: new Date("2026-03-20"), entity: "TBR" as const, category: "Venue Costs", verification_status: "verified", math_check_passed: true, routed_to_finance: true },
    { vendor_name: "AWS", amount: 2340, currency: "USD", invoice_date: new Date("2026-03-28"), entity: "FSP" as const, category: "SaaS/Infrastructure", verification_status: "pending", math_check_passed: false, notes: "Line items don't sum to total — needs manual review" },
  ]
  for (const inv of invoices) { await prisma.detectedInvoice.create({ data: inv }) }
  console.log(`Created ${invoices.length} detected invoices`)

  // ─── Audit Report (sample) ──────────────────────────────────────────────
  await prisma.auditReport.create({ data: {
    audit_type: "full_15_day", entity: "LSC", findings: {
      compliance: { total: 4, compliant: 3, at_risk: 1, details: ["Cayman registered agent expired"] },
      kyc: { total: 3, compliant: 3, at_risk: 0 },
      offices: { total: 1, compliant: 1, at_risk: 0 },
      emails: { total: 4, compliant: 4, at_risk: 0 },
      admin_accounts: { total: 5, compliant: 3, at_risk: 2, details: ["GoDaddy — no 2FA", "Vercel — recovery not documented"] },
    },
    summary: "LSC: 2 at-risk items found — Cayman RA expired, GoDaddy lacks 2FA", risk_items: 3, compliant_items: 14, total_items: 17, run_by: "compliance-audit",
  }})
  await prisma.auditReport.create({ data: {
    audit_type: "full_15_day", findings: {
      LSC: { risk: 3, compliant: 14, total: 17 },
      TBR: { risk: 2, compliant: 5, total: 7 },
      FSP: { risk: 4, compliant: 6, total: 10 },
    },
    summary: "Cross-entity audit: 9 total risk items. FSP India compliance not started. TBR E1 portal lacks 2FA.", risk_items: 9, compliant_items: 25, total_items: 34, run_by: "compliance-audit",
  }})
  console.log("Created 2 audit reports")

  // ─── Agent Activity Log (sample) ────────────────────────────────────────
  const agentLogs = [
    { agent_id: "compliance-audit", agent_name: "Compliance Audit Agent", action: "run_started", details: { trigger: "manual" } },
    { agent_id: "compliance-audit", agent_name: "Compliance Audit Agent", action: "entity_scanned", details: { entity: "LSC", items: 17, risk: 3 } },
    { agent_id: "compliance-audit", agent_name: "Compliance Audit Agent", action: "entity_scanned", details: { entity: "TBR", items: 7, risk: 2 } },
    { agent_id: "compliance-audit", agent_name: "Compliance Audit Agent", action: "entity_scanned", details: { entity: "FSP", items: 10, risk: 4 } },
    { agent_id: "compliance-audit", agent_name: "Compliance Audit Agent", action: "run_completed", details: { totalRisk: 9, totalItems: 34 } },
    { agent_id: "compliance", agent_name: "Compliance Agent", action: "run_started", details: {} },
    { agent_id: "compliance", agent_name: "Compliance Agent", action: "record_flagged", details: { entity: "LSC", jurisdiction: "CAYMAN", issue: "Registered agent expired" } },
    { agent_id: "compliance", agent_name: "Compliance Agent", action: "notification_sent", details: { to: "arvind@leaguesports.co", reason: "TBR office renewal in 30 days" } },
    { agent_id: "email-inbox.invoice-detection", agent_name: "Invoice Detection Agent", action: "invoice_detected", details: { vendor: "Al Tamimi & Company", amount: 15000, entity: "LSC" } },
    { agent_id: "email-inbox.invoice-detection", agent_name: "Invoice Detection Agent", action: "invoice_detected", details: { vendor: "Monaco Port Authority", amount: 8500, entity: "TBR", routed_to_finance: true } },
    { agent_id: "agreement-analyzer", agent_name: "Agreement Analyzer Agent", action: "document_analyzed", details: { documentId: "sample", category: "SPONSORSHIP", clauses_extracted: 12 } },
  ]
  for (const log of agentLogs) { await prisma.agentActivityLog.create({ data: log as any }) }
  console.log(`Created ${agentLogs.length} agent activity logs`)

  // ─── Agent Messages (sample flows) ──────────────────────────────────────
  const agentMsgs = [
    { from_agent: "email-inbox.invoice-detection", to_agent: "orchestrator", intent: "invoice_verified", payload: { vendor: "Al Tamimi", amount: 15000, entity: "LSC" }, priority: "NORMAL" as const, responded: true },
    { from_agent: "orchestrator", to_agent: "compliance", intent: "compliance_check", payload: { entity: "LSC", trigger: "new_document" }, priority: "NORMAL" as const, responded: true },
    { from_agent: "compliance", to_agent: "orchestrator", intent: "compliance_result", payload: { status: "ok", findings: 0 }, priority: "NORMAL" as const, responded: true },
    { from_agent: "orchestrator", to_agent: "agreement-analyzer", intent: "analyze_document", payload: { documentId: "sample", title: "Red Bull Sponsorship" }, priority: "HIGH" as const, responded: true },
    { from_agent: "agreement-analyzer", to_agent: "orchestrator", intent: "analysis_result", payload: { category: "SPONSORSHIP", clauses: 12, unusual: 1 }, priority: "NORMAL" as const, responded: true },
    { from_agent: "litigation.finance-liaison", to_agent: "orchestrator", intent: "exposure_update", payload: { caseId: "sample", liability: 350000 }, priority: "HIGH" as const, responded: false },
    { from_agent: "orchestrator", to_agent: "compliance-audit", intent: "run_audit", payload: { type: "full_15_day" }, priority: "NORMAL" as const, responded: true },
    { from_agent: "compliance-audit", to_agent: "orchestrator", intent: "audit_complete", payload: { risk: 9, compliant: 25, total: 34 }, priority: "NORMAL" as const, responded: true },
  ]
  for (const msg of agentMsgs) { await prisma.agentMessage.create({ data: msg as any }) }
  console.log(`Created ${agentMsgs.length} agent messages`)

  // ─── Project Checklist ────────────────────────────────────────────────────
  await prisma.projectChecklist.deleteMany()

  const checklistItems = [
    // Core Pages — all done
    { title: "Command Center Dashboard", done: true, priority: "CRITICAL" as const, category: "Core Pages", sort_order: 1 },
    { title: "Documents Management & Lifecycle", done: true, priority: "CRITICAL" as const, category: "Core Pages", sort_order: 2 },
    { title: "Document Detail View (versions, timeline, signatures)", done: true, priority: "CRITICAL" as const, category: "Core Pages", sort_order: 3 },
    { title: "Signature Kanban Board (drag-to-update)", done: true, priority: "CRITICAL" as const, category: "Core Pages", sort_order: 4 },
    { title: "AI Contract Generator (Gemini 2.5 Pro)", done: true, priority: "HIGH" as const, category: "Core Pages", sort_order: 5 },
    { title: "Contract Templates Library", done: true, priority: "HIGH" as const, category: "Core Pages", sort_order: 6 },
    { title: "Expirations Pipeline (14/30/60/90-day tiers)", done: true, priority: "CRITICAL" as const, category: "Core Pages", sort_order: 7 },
    { title: "Compliance Deadlines (multi-jurisdiction)", done: true, priority: "CRITICAL" as const, category: "Core Pages", sort_order: 8 },
    { title: "ESOP Management (grants, vesting, pools)", done: true, priority: "HIGH" as const, category: "Core Pages", sort_order: 9 },
    { title: "Policy Documents & Acknowledgments", done: true, priority: "MEDIUM" as const, category: "Core Pages", sort_order: 10 },
    { title: "Legal Issues & SLA Tracking", done: true, priority: "HIGH" as const, category: "Core Pages", sort_order: 11 },
    { title: "85-Item Legal Tracker (Kanban + table)", done: true, priority: "CRITICAL" as const, category: "Core Pages", sort_order: 12 },
    { title: "Payment Cycles & Finance Sync", done: true, priority: "HIGH" as const, category: "Core Pages", sort_order: 13 },

    // Extended Modules — all done
    { title: "Agreements Page", done: true, priority: "HIGH" as const, category: "Extended Modules", sort_order: 14 },
    { title: "Litigation Case Management", done: true, priority: "HIGH" as const, category: "Extended Modules", sort_order: 15 },
    { title: "KYC Document Tracking", done: true, priority: "HIGH" as const, category: "Extended Modules", sort_order: 16 },
    { title: "Admin Account Inventory", done: true, priority: "MEDIUM" as const, category: "Extended Modules", sort_order: 17 },
    { title: "Clickwrap Acceptance Tracking", done: true, priority: "MEDIUM" as const, category: "Extended Modules", sort_order: 18 },
    { title: "Subsidies & Grants Management", done: true, priority: "MEDIUM" as const, category: "Extended Modules", sort_order: 19 },
    { title: "Email Intelligence (invoice detection)", done: true, priority: "HIGH" as const, category: "Extended Modules", sort_order: 20 },
    { title: "Compliance Audit Reports", done: true, priority: "HIGH" as const, category: "Extended Modules", sort_order: 21 },
    { title: "Data Protection Records", done: true, priority: "HIGH" as const, category: "Extended Modules", sort_order: 22 },
    { title: "Registered Office Agreements", done: true, priority: "MEDIUM" as const, category: "Extended Modules", sort_order: 23 },
    { title: "Company Email Management", done: true, priority: "LOW" as const, category: "Extended Modules", sort_order: 24 },
    { title: "Document Review Queue", done: true, priority: "HIGH" as const, category: "Extended Modules", sort_order: 25 },

    // Infrastructure — all done
    { title: "Authentication & RBAC (8 roles)", done: true, priority: "CRITICAL" as const, category: "Infrastructure", sort_order: 26 },
    { title: "Dark Mode UI Theme (slate-950)", done: true, priority: "HIGH" as const, category: "Infrastructure", sort_order: 27 },
    { title: "Notification System (bell + polling)", done: true, priority: "HIGH" as const, category: "Infrastructure", sort_order: 28 },
    { title: "Prisma Schema (25+ models)", done: true, priority: "CRITICAL" as const, category: "Infrastructure", sort_order: 29 },
    { title: "Server Actions Architecture", done: true, priority: "CRITICAL" as const, category: "Infrastructure", sort_order: 30 },
    { title: "Agent System (orchestrator + 4 agents)", done: true, priority: "HIGH" as const, category: "Infrastructure", sort_order: 31 },
    { title: "Agent Architecture Visualization", done: true, priority: "LOW" as const, category: "Infrastructure", sort_order: 32 },
    { title: "File Naming Standards Engine", done: true, priority: "MEDIUM" as const, category: "Infrastructure", sort_order: 33 },
    { title: "Table Configuration System", done: true, priority: "MEDIUM" as const, category: "Infrastructure", sort_order: 34 },
    { title: "Recharts Dashboard Visualizations", done: true, priority: "HIGH" as const, category: "Infrastructure", sort_order: 35 },
    { title: "Notes & Comments on Documents", done: true, priority: "MEDIUM" as const, category: "Infrastructure", sort_order: 36 },

    // Integrations — pending
    { title: "HelloSign E-Signature Live Integration", done: false, priority: "CRITICAL" as const, category: "Integrations", sort_order: 37, notes: "API scaffolded, needs live API keys + webhook URL" },
    { title: "S3 File Storage Live Configuration", done: false, priority: "CRITICAL" as const, category: "Integrations", sort_order: 38, notes: "Upload logic built, needs AWS credentials + bucket" },
    { title: "Gmail OAuth & Email Routing", done: false, priority: "HIGH" as const, category: "Integrations", sort_order: 39, notes: "OAuth flow built, needs Google Cloud project + credentials" },
    { title: "Vercel Cron Jobs Deployment", done: false, priority: "HIGH" as const, category: "Integrations", sort_order: 40, dependency_ids: ["deploy-prod"], notes: "Cron routes built — needs vercel.json cron config on deploy" },
    { title: "Finance Module Bi-directional Sync", done: false, priority: "CRITICAL" as const, category: "Integrations", sort_order: 41, notes: "CrossModuleEvent table ready, needs finance module webhook handler" },
    { title: "Cross-Module Event Processing", done: false, priority: "HIGH" as const, category: "Integrations", sort_order: 42, notes: "Event table exists, needs consumer/processor service" },

    // Data & Content — pending
    { title: "Multi-Entity Data Population (all 9 entities)", done: false, priority: "HIGH" as const, category: "Data & Content", sort_order: 43, notes: "Schema supports all entities, needs real compliance records per entity" },
    { title: "Real Compliance Deadlines Import", done: false, priority: "CRITICAL" as const, category: "Data & Content", sort_order: 44, notes: "Seed has demo data — needs real UAE/Delaware/Global deadlines" },
    { title: "Contract Templates Content (legal-reviewed)", done: false, priority: "HIGH" as const, category: "Data & Content", sort_order: 45, notes: "Template system built, needs Arvind to provide reviewed templates" },
    { title: "ESOP Pool Real Data Entry", done: false, priority: "HIGH" as const, category: "Data & Content", sort_order: 46, notes: "Awaiting CF2 ESOP Plan Document completion" },
    { title: "Calendar Integration (Google Calendar)", done: false, priority: "MEDIUM" as const, category: "Data & Content", sort_order: 47 },

    // Deployment & Ops — pending
    { title: "Production Deployment & DNS", done: false, priority: "CRITICAL" as const, category: "Deployment & Ops", sort_order: 48, notes: "Vercel project exists, needs domain + env vars" },
    { title: "Environment Variables Configuration", done: false, priority: "CRITICAL" as const, category: "Deployment & Ops", sort_order: 49, notes: "DATABASE_URL, GEMINI_API_KEY, HELLOSIGN, S3, GMAIL keys needed" },
    { title: "User Acceptance Testing", done: false, priority: "CRITICAL" as const, category: "Deployment & Ops", sort_order: 50, notes: "AK, Arvind, Anuj need to test all flows" },
    { title: "Mobile Responsive Optimization", done: false, priority: "MEDIUM" as const, category: "Deployment & Ops", sort_order: 51 },
    { title: "Performance & Bundle Optimization", done: false, priority: "MEDIUM" as const, category: "Deployment & Ops", sort_order: 52 },
    { title: "Security Audit (OWASP Top 10)", done: false, priority: "HIGH" as const, category: "Deployment & Ops", sort_order: 53 },
    { title: "Export Functionality (CSV/PDF reports)", done: false, priority: "MEDIUM" as const, category: "Deployment & Ops", sort_order: 54 },
    { title: "User Management Admin Panel", done: false, priority: "HIGH" as const, category: "Deployment & Ops", sort_order: 55 },
  ]

  for (const item of checklistItems) {
    await prisma.projectChecklist.create({ data: item as any })
  }
  console.log(`Created ${checklistItems.length} project checklist items`)

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
