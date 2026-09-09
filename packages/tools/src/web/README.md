# `src/web/`

`createFetchUrlTool`'s implementation — the `fetchUrl` tool, retrieving one URL and reducing its
body to readable text/markdown. See the package [README](../../README.md)'s "src/web/" entry for
the one-paragraph summary and the provider-native table explaining why web _search_ isn't built
here (`fetchUrl` _reads_ a page you already have the address of; it doesn't find pages).

This file is the "why" for the whole module — design decisions, threat model, citations, library
comparisons. Code comments point back here rather than repeating it; keep this file, not the
code, as the place that grows when a decision needs more explaining.

## Files

| File                | Owns                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `address-policy.ts` | The address guard: is this URL's destination safe to connect to?                             |
| `url-pattern.ts`    | The glob/`RegExp` matcher behind `allowedUrls` — pure string matching, no URLs or addresses. |
| `extract.ts`        | Reduces a response body to text/markdown; untrusted-content handling.                        |
| `fetch.ts`          | Transport: manual redirect loop, byte cap, timeout, `http:` IP pinning.                      |
| `tools.ts`          | The `fetchUrl` tool itself — wires the above together, owns the model-facing description.    |
| `provider.ts`       | `createWebToolProvider` — per-call config via `toolProviderContext`, `describeWebEnv`.       |

Tests: `url-pattern.test.ts` and `address-policy.test.ts` are `node:test` (deliberately split —
see "Testing" below); `fetch.test.ts` and `fetch-url.test.ts` are `node:test` too (the former unit
tests `issueViaPinnedAddress` directly, the latter is fixture-server end-to-end); `provider.test.ts`
is `bun:test` (pure config wiring, no network surface).

## The address guard

### Why block non-public addresses by default at all

This is standard practice for an agent-facing fetch tool specifically (not a general-purpose HTTP
client, which typically has no opinion here):

- [OpenClaw's `tools.web.fetch.allowPrivateNetwork`](https://github.com/openclaw/openclaw/issues/39604) —
  default `false`, private-network access opt-in; the shape `allowPrivateNetwork` mirrors here.
- [Wiz's SSRF prevention guide](https://www.wiz.io/academy/application-security/server-side-request-forgery)
- [CrawlForge's write-up on SSRF in MCP servers reaching cloud metadata](https://www.crawlforge.dev/blog/mcp-server-ssrf-cloud-metadata-security) —
  also the source for the redirect-revalidation mitigation cited below.
- [CVE-2026-80347](https://www.sentinelone.com/vulnerability-database/cve-2026-80347/) — a real
  SSRF bypass in a comparable community MCP fetch server (bracketed/IPv4-mapped IPv6 hostnames),
  not a hypothetical. `isPublicAddress`'s bracket-stripping and IPv4-mapped unwrap defend against
  exactly this.
- [`request-filtering-agent`](https://github.com/azu/request-filtering-agent) — evaluated below,
  under "Known limitation".

`assertAllowedUrl` (`address-policy.ts`) runs on the URL the model asked for **and again on every
redirect hop** (`fetch.ts` follows redirects by hand specifically so this can happen before each
one is requested — relying on `fetch`'s own `redirect: "follow"` would fetch a hop before any
policy of ours ever saw it).

**Two checks, different in scope, checked in this order** (after the scheme allowlist, before
either): `allowedUrls` and `allowPrivateNetwork` bypass both.

1. **A literal IP address in the hostname** (`http://127.0.0.1/x`) — no DNS involved — is checked
   **regardless of scheme**. There's no DNS-rebinding question here (nothing was resolved), so
   this is unconditionally sound.
2. **A domain name's resolved address** is checked **regardless of scheme** too. `https:` already
   had a real backstop without this — TLS's own hostname verification: a connection rebound into
   a private address still needs a certificate that validates for the attacker's hostname, and an
   internal service that's actually reachable essentially never has one. This check doesn't
   replace that reasoning or touch what `fetch` connects to (`assertAllowedUrl` only resolves and
   inspects; it hands `fetch` the original hostname either way, so SNI and certificate validation
   proceed exactly as they would without this check at all — substituting the resolved IP into the
   request is a different, much riskier change this isn't, and it would break TLS for any site
   relying on SNI-based virtual hosting). It's added as a second, independent layer: TLS
   verification is only as strong as the runtime's certificate validation actually being enabled
   (weakened by, say, `NODE_TLS_REJECT_UNAUTHORIZED=0` or an installed MITM proxy CA, neither of
   which this module controls), and `allowedUrls`/`allowPrivateNetwork` already bypass this check
   for any internal HTTPS domain a caller explicitly wants reached — so there's no legitimate use
   this closes off, only an unallowlisted internal domain that used to work by relying on TLS
   alone, which house rule 1's fail-closed default says should have needed allowlisting anyway.
   For `http:`, there is no TLS at all — and this is exactly how the highest-value real target is
   served: cloud metadata services (`169.254.169.254`) are plain, unauthenticated HTTP.

Both checks are an **allowlist** against `ipaddr.js`'s `range()` classification — only
globally-routable `unicast` passes; every other range (loopback, private, link-local, CGNAT,
multicast, broadcast, unspecified, reserved, the IPv4-in-IPv6 tunnel forms) is refused, as is
anything that fails to parse, so a range nobody thought of is denied by default. IPv4-mapped IPv6
(`::ffff:127.0.0.1`) is unwrapped and re-classified so it can't smuggle a loopback address past
either check.

### `allowedUrls`

URL-scoped exemption, empty by default — the ordinary way to reach a non-public address on
purpose (a test fixture, a company-internal `http:` service). Matched **per redirect hop** against
`urlMatchCandidate(url)` (`scheme://host:port/path` — no query, fragment, or userinfo), so an
exemption permissive on the first hop still blocks a redirect elsewhere. Path-scoped:
`http://intranet.example:8080/**` allows a whole origin; `http://intranet.example:8080/wiki/*`
scopes it to one directory — precision plain `hostname:port` allowlisting never had.

Each entry is a glob **string** or a `RegExp` (`url-pattern.ts`'s `matchesUrlPattern`) — a small,
deliberately narrow pattern language, not a general glob engine: literal text, `*` (one path
segment), `**` (anything, crossing `/`). No `?`, character classes, or brace expansion — fewer
features to misread while auditing what a pattern permits. A `RegExp` is matched over the _whole_
candidate regardless of its own anchors, so an author who forgets `^`/`$` fails closed instead of
matching a substring.

### `allowPrivateNetwork`

Disables both address checks entirely, default `false`. Not a second enforcement path: checked at
the exact same decision point `allowedUrls` is (`allowedUrls: ["**"]` already has this effect —
this option is a clearer, more discoverable name for that intent, matching the name a comparable
agent framework, OpenClaw, already uses). Host/workflow-only — same trust boundary as `allowedUrls`
and `resolver`, never exposed on `fetchUrl`'s own input schema, so the model can't reach it.
Reported by `describeWebEnv` as its own field, not folded into `allowedUrls`'s reported list.

### IP pinning (`http:` only)

The domain-resolve check above resolves the hostname, checks the answers, then — without
pinning — would hand the _hostname_ (not the resolved address) to the transport, which resolves it
again independently; a resolver answering differently between those two lookups (e.g. a 0-TTL
record timed to flip after the check passes) defeats the check. This is the DNS-rebinding TOCTOU,
and `fetch.ts` closes it **for `http:`**: when `assertAllowedUrl` resolves a domain name over
`http:`, it returns the exact address it validated (`AddressCheckResult.pinnedAddress`), and
`fetch.ts` dials that address directly via `node:http.request` — bypassing whatever a second
resolution would land on — while still sending the original hostname as the `Host` header, so the
request looks identical to the server on the wire.

**Why `node:http` and not `fetch`:** pinning needs "connect to this address, but still speak to
that hostname" — for `http:`, that's nothing more than the `Host` header, since there's no TLS
layer to also convince. Two things ruled out doing this via `fetch` itself, checked directly
rather than assumed: Bun's `fetch` has no connect-target override at all (`BunFetchRequestInit`'s
own type declarations expose only `tls`/`proxy`/`unix`/`s3`/`decompress`/`verbose` — no
`lookup`/`dispatcher`/`family` hook), and Node's `fetch` silently **ignores** a `host` header
passed in `headers`, always sending the URL's own host instead (verified directly against a local
server) — so the "rewrite the URL to the IP, override the `Host` header" trick that works on Bun
would silently break virtual-hosted sites on Node, exactly the "Bun and Node disagree" hazard
`AGENTS.md` warns about. `node:http.request`'s split between the connect target (`host`/`port`)
and the request's own `Host` header behaves identically on both runtimes (verified the same way),
so that's what's used, for the pinned case only — every other hop (an unpinned `http:` origin,
any `https:` hop, a literal IP, a bypassed check) still goes through `fetch` unchanged.

**Why `https:` doesn't pin:** for `https:`, "connect to this address but still speak to that
hostname" additionally means presenting the right SNI in the TLS `ClientHello` — a materially
different, harder problem than a `Host` header, and not one this module needs to solve: TLS's own
certificate verification is already the backstop for `https:` (see above), so pinning would defend
against an attacker who has also somehow defeated certificate validation, at which point pinning
the address is the least of it. Pinning doesn't ever "replace the hostname with the raw IP in the
request" for either scheme — that would break SNI-based virtual hosting for nearly every real
`https:` site, and isn't what closing this gap requires.

### Known limitation: DNS rebinding, `https:` only

`https:` still shares the check-then-reconnect TOCTOU the domain-resolve check alone doesn't
close: the address is validated, then TLS's own connection (and its own internal resolution)
happens independently. This is an accepted gap, not silently assumed away — same class as
`createFileJail`'s symlink TOCTOU note (`src/file/jail.ts`): a userland check, not a kernel- or
transport-enforced boundary, deliberately left to the certificate-verification backstop described
above rather than extended into the same `node:http` pinning `http:` gets (which would need to
also pin TLS's SNI/certificate-hostname matching, a different and unneeded change — see "IP
pinning" above).

Evaluated and set aside for closing this the same way `http:` is closed: `request-filtering-agent`
(the most actively-maintained comparable npm package) checks at actual connection time and
explicitly claims to prevent DNS rebinding, but only works with `http.Agent`-based clients — the
same category of transport this module now uses for `http:` pinning, so adopting it there wouldn't
have saved the rewrite. Its docs don't say whether it handles IPv4-mapped IPv6 literals, so it
isn't obviously safer than this module on that count either.

## Content reduction (`extract.ts`)

`turndown` converts HTML to markdown; other readable text types are decoded as-is; anything else
(binary, or a body with no `Content-Type` at all) is refused by name rather than guessed at.

**Library choice**, weighed on dependency count since this package is meant to be independently
installable:

| Candidate                           | Runtime packages added                    | Verdict                                                                                                        |
| ----------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **`turndown`**                      | **2** (`turndown` + `@mixmark-io/domino`) | **chosen** — MIT, actively released, pure JS, bundles its own DOM so it behaves identically under Bun and Node |
| `node-html-markdown`                | 2                                         | comparable, less widely exercised                                                                              |
| `html-to-text`                      | 6                                         | plain text only, three times the tree                                                                          |
| `@mozilla/readability` + `linkedom` | 7                                         | best extraction quality, but `linkedom`'s jsdom-grade-DOM compatibility is claimed rather than guaranteed      |

**Stated gap:** `turndown` converts markup; it doesn't identify a page's main article, so
nav/footer boilerplate survives. Readability-grade stripping is the 7-package option and isn't
implemented.

**Untrusted content:** nothing here executes, evaluates, or resolves anything from the response —
string-to-string, the same posture `createBashTool` takes toward a command's stdout. Active
elements (`<script>`, `<style>`, `<noscript>`, `<iframe>`, `<object>`, `<embed>`, `<template>`,
`<svg>`) are dropped with their contents before conversion, reducing noise and prompt-injection
surface — not a sandbox; what remains is still untrusted third-party text (`FETCH_URL_DESCRIPTION`
says so to the model).

That posture covers the model; it doesn't cover whatever eventually _renders_ this markdown for a
human. `turndown` copies `<a href>`/`<img src>` into markdown link/image syntax verbatim, so
without this, `<a href="javascript:alert(1)">click</a>` becomes `[click](javascript:alert(1))` in
the output — inert to the model, but a live code-execution link if a chat UI or report ever renders
this markdown clickable. Two custom rules in `extract.ts` (`nonFetchableLink`/`nonFetchableImage`,
added before turndown's own `a`/`img` rules so they see the node first) check the scheme against
`ALLOWED_URL_SCHEMES` — the same `http`/`https` allowlist `fetchUrl` itself fetches under — and
flatten anything else (`javascript:`, `data:`, `vbscript:`, `file:`, ...) to its visible text (an
image's `alt`) instead. A relative reference (no scheme) is left alone; it isn't a
`fetchUrl`-visible mechanism to run code either way.

## Transport (`fetch.ts`)

- **Manual redirects** (`redirect: "manual"`, followed by hand): the only way to run the address
  guard against each `Location` before it's requested, rather than after `fetch` already followed
  it.
- **One `AbortSignal`** spans DNS, every hop, and the body read, composed with the caller's own
  signal — a slow server can't outlast the deadline by staying under a per-hop limit.
- **The byte cap is enforced while reading**, not after: the body is pulled a chunk at a time and
  the stream is cancelled the moment the cap is hit, so an oversized or endless response is never
  buffered past it (`Response.text()`/`arrayBuffer()` would buffer first and only then let the cap
  be checked — the exact failure mode this avoids).
- A non-2xx status is **returned as data**, not thrown — the same posture `createBashTool` takes
  toward a non-zero exit code.

## Testing

`url-pattern.test.ts`, `address-policy.test.ts`, `fetch.test.ts`, and `fetch-url.test.ts` are
`node:test` (wired into `package.json`'s `test:node`, run under both Bun and Node) because this
module rests on `fetch`'s manual-redirect mode, `node:http`'s pinned-connection request, streaming
body reads, and `AbortSignal` composition — exactly the "Bun and Node can disagree" category
`AGENTS.md` describes (the pinning design itself exists _because_ of a concrete instance of that
category — see "IP pinning" above). `provider.test.ts` is `bun:test`: pure per-call config
resolution, no such surface.

**`url-pattern.test.ts` vs. `address-policy.test.ts`:** pattern matching (does a glob or `RegExp`
match) has nothing to do with address classification (is this address public), so they're tested
separately. `url-pattern.test.ts` exercises `matchesUrlPattern` directly against plain strings —
no `URL` objects, no IP addresses, no network. `address-policy.test.ts` keeps only enough
`allowedUrls` coverage to prove `assertAllowedUrl` wires the policy in correctly, not an exhaustive
re-test of the matcher.

**`fetch-url.test.ts`** runs against a local `node:http` fixture on an ephemeral loopback port,
never a real host — a suite reaching the internet is a flaky suite. The fixture's own origin goes
in `allowedUrls` (a `${origin}/**` glob); because that's matched per redirect hop, a fixture
response redirecting to `169.254.169.254` (or loopback on a different port) still lands on a
non-exempt hop and is refused — covering the post-redirect guard end to end without a real host.

**`fetch.test.ts`** exists separately because pinning can't be exercised through that same
fixture-and-`allowedUrls` route: `assertAllowedUrl` only ever returns a `pinnedAddress` for a
domain name it just classified as genuinely public, and no address a local, network-free fixture
binds to (loopback, unspecified, or otherwise) is ever classified that way — there is no local
address that reaches the real gate. So this file unit-tests `issueViaPinnedAddress` directly
against a local fixture, decoupled from whether a real `http:` domain would have been pinned in
the first place (that decision is `address-policy.test.ts`'s job) — proving only what pinning
_does_ once handed an address: dials it instead of the URL's own hostname, sends the URL's
hostname as `Host`, and streams/redirects/aborts the same way `issueViaFetch` does.
