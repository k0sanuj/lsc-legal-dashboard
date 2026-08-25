// Mailgun preflight. Run this the moment the account credentials land.
//
//   node scripts/check-mail-setup.mjs
//   node scripts/check-mail-setup.mjs --send you@futureofsports.io
//
// Checks, in order: env present, credentials accepted, domain verified, the DNS
// records Mailgun expects, and the local DNS view of SPF and DMARC. With --send
// it delivers a real test message and prints the queued message id so the event
// can be matched in the Mailgun log and in WebhookEventLog.
import { config } from "dotenv"
import { promises as dns } from "node:dns"

config({ path: ".env" })
config({ path: ".env.local", override: true })

const sendToIndex = process.argv.indexOf("--send")
const sendTo = sendToIndex > -1 ? process.argv[sendToIndex + 1] : null

const problems = []
const warnings = []

function env(name) {
  return process.env[name]?.trim() ?? ""
}

function apiHost() {
  return env("MAILGUN_REGION").toLowerCase() === "eu"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net"
}

function authHeader() {
  return `Basic ${Buffer.from(`api:${env("MAILGUN_API_KEY")}`).toString("base64")}`
}

function line(status, text) {
  const mark = status === "ok" ? "  ok  " : status === "warn" ? " warn " : " FAIL "
  console.log(`[${mark}] ${text}`)
}

async function main() {
  console.log("Mailgun preflight\n")

  // 1. Env
  const required = ["MAILGUN_DOMAIN", "MAILGUN_API_KEY", "MAILGUN_SENDER"]
  const missing = required.filter((name) => !env(name))
  if (missing.length > 0) {
    line("fail", `missing env: ${missing.join(", ")}`)
    problems.push("env")
    console.log("\nNothing else can be checked without credentials. Stopping.")
    return
  }
  const domain = env("MAILGUN_DOMAIN")
  line("ok", `env present for domain ${domain} (${env("MAILGUN_REGION") || "us"} region)`)

  if (!env("MAILGUN_WEBHOOK_SIGNING_KEY")) {
    line("warn", "MAILGUN_WEBHOOK_SIGNING_KEY unset, so delivery events will be rejected")
    warnings.push("webhook signing key")
  } else {
    line("ok", "webhook signing key present")
  }

  const sender = env("MAILGUN_SENDER")
  const senderDomain = sender.includes("@") ? sender.split("@").pop().replace(/>.*$/, "").trim() : ""
  if (senderDomain && senderDomain !== env("MAILGUN_DOMAIN")) {
    line(
      "warn",
      `MAILGUN_SENDER is on ${senderDomain} but the sending domain is ${env("MAILGUN_DOMAIN")}; alignment failures land in spam`
    )
    warnings.push("sender alignment")
  }

  // 2. Credentials + domain state
  let domainState = null
  let sendingRecords = []
  let receivingRecords = []
  try {
    const res = await fetch(
      `${apiHost()}/v4/domains/${encodeURIComponent(env("MAILGUN_DOMAIN"))}`,
      { headers: { Authorization: authHeader() }, signal: AbortSignal.timeout(15000) }
    )
    const raw = await res.text()

    if (res.status === 401) {
      line("fail", "credentials rejected (401). Wrong API key, or an EU account without MAILGUN_REGION=eu")
      problems.push("auth")
    } else if (res.status === 404) {
      line("fail", `domain ${env("MAILGUN_DOMAIN")} does not exist in this Mailgun account`)
      problems.push("domain")
    } else if (!res.ok) {
      line("fail", `Mailgun HTTP ${res.status}: ${raw.slice(0, 200)}`)
      problems.push("api")
    } else {
      const parsed = JSON.parse(raw)
      domainState = parsed.domain?.state ?? "unknown"
      sendingRecords = parsed.sending_dns_records ?? []
      receivingRecords = parsed.receiving_dns_records ?? []
      if (domainState === "active") {
        line("ok", "domain state: active")
      } else {
        line("fail", `domain state: ${domainState}. Mailgun will not deliver until this is active`)
        problems.push("domain state")
      }
    }
  } catch (error) {
    line("fail", `could not reach Mailgun: ${error.message}`)
    problems.push("network")
  }

  // 3. Mailgun's own view of the DNS records.
  //
  // Only the SENDING records gate delivery, and only SPF and DKIM within them.
  // The tracking CNAME affects open and click stats, nothing else.
  //
  // The RECEIVING (MX) records are never required to send, and on a domain whose
  // mail is hosted elsewhere they must never be added: pointing MX at Mailgun on
  // a Google Workspace domain would divert and break all company email. So they
  // are reported as information, with a warning if anything suggests adding them.
  if (sendingRecords.length > 0) {
    console.log("\nSending DNS records (these gate delivery):")
    for (const record of sendingRecords) {
      const valid = (record.valid ?? "unknown").toLowerCase()
      const type = (record.record_type ?? "").toUpperCase()
      const label = `${type} ${record.name || "(root)"}`
      const isTracking = type === "CNAME"

      if (valid === "valid") {
        line("ok", label)
      } else if (isTracking) {
        line("warn", `${label} is ${valid}. Open and click tracking only, delivery is unaffected`)
        warnings.push("tracking cname")
      } else {
        line("fail", `${label} is ${valid}`)
        problems.push(`dns:${type}`)
        console.log(`         value: ${(record.value ?? "").slice(0, 120)}`)
      }
    }
  }

  if (receivingRecords.length > 0) {
    const mxHosts = await dns.resolveMx(domain).catch(() => [])
    const usesMailgunMx = mxHosts.some((mx) => /mailgun\.org$/i.test(mx.exchange))
    const mailHost = mxHosts.some((mx) => /google\.com$/i.test(mx.exchange))
      ? "Google Workspace"
      : mxHosts.length > 0
        ? mxHosts[0].exchange
        : "an external host"

    console.log("\nReceiving DNS records (inbound mail, not needed to send):")
    if (usesMailgunMx) {
      line("ok", "MX already points at Mailgun, inbound routing is active")
    } else {
      line(
        "ok",
        `not configured, which is correct here: MX points at ${mailHost}`
      )
      console.log("         Do NOT add Mailgun's MX records to this domain.")
      console.log("         Doing so would divert inbound mail away from the mailboxes.")
    }
  }

  // 4. Local DNS view, which catches records that exist but resolve wrong
  console.log("\nLocal DNS view:")
  try {
    const txt = (await dns.resolveTxt(domain)).map((chunks) => chunks.join(""))
    const spf = txt.find((value) => value.toLowerCase().startsWith("v=spf1"))
    if (!spf) {
      line("fail", `no SPF record on ${domain}`)
      problems.push("spf")
    } else if (!spf.includes("mailgun.org")) {
      line("fail", `SPF on ${domain} does not include mailgun.org: ${spf}`)
      problems.push("spf")
    } else {
      line("ok", `SPF includes mailgun.org`)
    }
  } catch {
    line("fail", `no TXT records resolve for ${domain}`)
    problems.push("spf")
  }

  // DMARC is checked on the organisational domain, which is where it belongs.
  const orgDomain = domain.split(".").slice(-2).join(".")
  for (const target of new Set([domain, orgDomain])) {
    try {
      const dmarc = (await dns.resolveTxt(`_dmarc.${target}`))
        .map((chunks) => chunks.join(""))
        .find((value) => value.toLowerCase().startsWith("v=dmarc1"))
      if (dmarc) {
        const policy = /p=(\w+)/.exec(dmarc)?.[1] ?? "unknown"
        line("ok", `DMARC on ${target}: p=${policy}`)
      } else {
        line("warn", `no DMARC record on ${target}`)
        warnings.push(`dmarc:${target}`)
      }
    } catch {
      line("warn", `no DMARC record on ${target}`)
      warnings.push(`dmarc:${target}`)
    }
  }

  // 5. Optional real send
  if (sendTo) {
    console.log(`\nSending a test message to ${sendTo} ...`)
    const body = new URLSearchParams({
      from: sender,
      to: sendTo,
      subject: "LSC Legal mail preflight",
      text: [
        "This is the Mailgun preflight test from the LSC Legal platform.",
        "",
        "If this landed in the inbox rather than spam, outbound mail is ready for",
        "magic-link login and for OpenSign signature requests.",
      ].join("\n"),
      "o:tag": "preflight",
    })

    try {
      const res = await fetch(
        `${apiHost()}/v3/${encodeURIComponent(domain)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
          signal: AbortSignal.timeout(15000),
        }
      )
      const raw = await res.text()
      if (!res.ok) {
        line("fail", `send failed, HTTP ${res.status}: ${raw.slice(0, 200)}`)
        problems.push("send")
      } else {
        let id = "(no id returned)"
        try {
          id = JSON.parse(raw).id ?? id
        } catch {}
        line("ok", `queued: ${id}`)
        console.log("         Check the inbox, and check it is not in spam.")
      }
    } catch (error) {
      line("fail", `send failed: ${error.message}`)
      problems.push("send")
    }
  } else {
    console.log("\nPass --send <address> to deliver a real test message.")
  }

  // Summary
  console.log("")
  if (problems.length > 0) {
    console.log(`Preflight FAILED: ${problems.length} blocking issue(s), ${warnings.length} warning(s).`)
    process.exitCode = 1
  } else if (warnings.length > 0) {
    console.log(`Preflight passed with ${warnings.length} warning(s).`)
  } else {
    console.log("Preflight passed. Outbound mail is ready.")
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
