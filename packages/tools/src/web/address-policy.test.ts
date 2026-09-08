import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertAllowedUrl, isPublicAddress, type HostnameResolver } from "./address-policy.ts";

/**
 * `node:test` + `node:assert`, not `bun:test` — this module and `fetch.ts` sit on `fetch`, DNS
 * and `AbortSignal`, which is the same "Bun and Node can disagree" category `AGENTS.md` puts
 * process/spawn code in, so both runtimes run these (`bun test` and `bun run test:node`).
 *
 * The resolver is injected rather than mocked globally: `assertAllowedUrl` takes one, so a test
 * can describe a DNS answer without touching the policy being tested. Nothing here needs the
 * network — IP literals resolve locally, and every hostname case uses a stub.
 */

/** A resolver over a fixed hostname → addresses table; an unlisted host is NXDOMAIN. */
function resolverFor(table: Record<string, string[]>): HostnameResolver {
  return async (hostname) => {
    const addresses = table[hostname];
    if (!addresses) {
      throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    }
    return addresses;
  };
}

/** Resolves every hostname to one public address. */
const publicResolver: HostnameResolver = async () => ["93.184.216.34"];

describe("isPublicAddress", () => {
  it("accepts globally-routable unicast addresses", () => {
    for (const address of ["8.8.8.8", "93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"]) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });

  it("rejects every non-public IPv4 class", () => {
    for (const address of [
      "127.0.0.1", // loopback
      "127.1.2.3", // the rest of 127/8, not just .0.1
      "10.1.2.3", // private
      "172.16.0.1", // private
      "192.168.1.1", // private
      "169.254.169.254", // link-local: AWS/GCP/Azure instance metadata
      "169.254.1.1", // the rest of the link-local range
      "100.64.0.1", // carrier-grade NAT
      "0.0.0.0", // unspecified
      "255.255.255.255", // broadcast
      "224.0.0.1", // multicast
      "240.0.0.1", // reserved
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it("rejects every non-public IPv6 class", () => {
    for (const address of [
      "::1", // loopback
      "::", // unspecified
      "fe80::1", // link-local
      "fc00::1", // unique-local
      "fd00::1", // unique-local
      "ff02::1", // multicast
      "2001:db8::1", // documentation
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it("rejects loopback smuggled inside an IPv6 form", () => {
    // Each of these embeds 127.0.0.1. The mapped form is unwrapped and re-classified; the
    // transition-mechanism forms are refused outright as non-unicast.
    assert.equal(isPublicAddress("::ffff:127.0.0.1"), false); // IPv4-mapped
    assert.equal(isPublicAddress("::ffff:7f00:1"), false); // same, hex notation
    assert.equal(isPublicAddress("64:ff9b::7f00:1"), false); // NAT64
    assert.equal(isPublicAddress("2002:7f00:1::"), false); // 6to4
  });

  it("rejects an address it cannot parse rather than defaulting to allowed", () => {
    for (const address of ["", "not-an-ip", "999.999.999.999", "127.0.0.1:80", "::ffff:zz"]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });
});

describe("assertAllowedUrl", () => {
  describe("scheme allowlist", () => {
    it("allows http and https", async () => {
      await assertAllowedUrl(new URL("http://example.com/a"), { resolver: publicResolver });
      await assertAllowedUrl(new URL("https://example.com/a"), { resolver: publicResolver });
    });

    it("rejects file:, data:, and gopher:", async () => {
      for (const raw of [
        "file:///etc/passwd",
        "data:text/html,<b>hi</b>",
        "gopher://example.com/1",
      ]) {
        await assert.rejects(
          assertAllowedUrl(new URL(raw), { resolver: publicResolver }),
          (error: Error) => {
            assert.match(error.message, /scheme .* is not allowed/);
            return true;
          },
          raw,
        );
      }
    });

    it("rejects other non-http schemes", async () => {
      for (const raw of ["ftp://example.com/x", "ws://example.com/x", "blob:https://a/b"]) {
        await assert.rejects(
          assertAllowedUrl(new URL(raw), { resolver: publicResolver }),
          /scheme/,
          raw,
        );
      }
    });

    it("checks the scheme before resolving anything", async () => {
      let called = false;
      await assert.rejects(
        assertAllowedUrl(new URL("file:///etc/passwd"), {
          resolver: async () => {
            called = true;
            return ["93.184.216.34"];
          },
        }),
        /scheme/,
      );
      assert.equal(called, false);
    });
  });

  describe("address classification", () => {
    it("allows a host resolving only to public addresses", async () => {
      await assertAllowedUrl(new URL("https://docs.example.com/page"), {
        resolver: resolverFor({ "docs.example.com": ["93.184.216.34", "2606:4700::1111"] }),
      });
    });

    it("rejects a host resolving to the cloud metadata service", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("http://metadata.example/latest/meta-data/"), {
          resolver: resolverFor({ "metadata.example": ["169.254.169.254"] }),
        }),
        (error: Error) => {
          assert.match(error.message, /169\.254\.169\.254/);
          assert.match(error.message, /not a public address/);
          return true;
        },
      );
    });

    it("rejects an IP-literal URL through the same path as a resolved name", async () => {
      // `dns.lookup` echoes a literal back, so no branch on "is this already an IP" is needed.
      for (const host of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "[::1]"]) {
        await assert.rejects(
          assertAllowedUrl(new URL(`http://${host}/`), {
            resolver: async (hostname) => [hostname.replace(/^\[|\]$/g, "")],
          }),
          /not a public address/,
          host,
        );
      }
    });

    it("rejects a host with one public and one private answer", async () => {
      // The connection picks an address from the set and this code does not choose which, so a
      // mixed answer is refused rather than gambled on.
      await assert.rejects(
        assertAllowedUrl(new URL("https://split-horizon.example/"), {
          resolver: resolverFor({ "split-horizon.example": ["93.184.216.34", "10.0.0.7"] }),
        }),
        (error: Error) => {
          assert.match(error.message, /10\.0\.0\.7/);
          assert.doesNotMatch(error.message, /93\.184\.216\.34/);
          return true;
        },
      );
    });

    it("rejects a host that resolves to nothing", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("https://empty.example/"), { resolver: async () => [] }),
        /resolved to no addresses/,
      );
    });

    it("rejects when resolution itself fails, rather than proceeding unchecked", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("https://nxdomain.example/"), { resolver: resolverFor({}) }),
        /could not resolve host/,
      );
    });

    it("names the allowedHosts entry that would permit the host on purpose", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("http://intranet.example:8080/"), {
          resolver: resolverFor({ "intranet.example": ["10.0.0.7"] }),
        }),
        /"intranet\.example:8080" to the tool's allowedHosts/,
      );
    });
  });

  describe("allowedHosts", () => {
    it("permits an exempt origin that would otherwise be blocked", async () => {
      await assertAllowedUrl(new URL("http://127.0.0.1:8080/fixture"), {
        allowedHosts: ["127.0.0.1:8080"],
        resolver: resolverFor({ "127.0.0.1": ["127.0.0.1"] }),
      });
    });

    it("matches host and port exactly — a different port is still blocked", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("http://127.0.0.1:9999/fixture"), {
          allowedHosts: ["127.0.0.1:8080"],
          resolver: resolverFor({ "127.0.0.1": ["127.0.0.1"] }),
        }),
        /not a public address/,
      );
    });

    it("fills in the scheme's default port when the URL omits it", async () => {
      await assertAllowedUrl(new URL("https://docs.internal/x"), {
        allowedHosts: ["docs.internal:443"],
        resolver: resolverFor({ "docs.internal": ["10.0.0.7"] }),
      });
      // Same host and same entry, but http's default port is 80, so this is not a match.
      await assert.rejects(
        assertAllowedUrl(new URL("http://docs.internal/x"), {
          allowedHosts: ["docs.internal:443"],
          resolver: resolverFor({ "docs.internal": ["10.0.0.7"] }),
        }),
        /not a public address/,
      );
    });

    it("does not exempt a host from the scheme check", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("file:///etc/passwd"), { allowedHosts: [":80", ""] }),
        /scheme/,
      );
    });

    it("is empty by default, so nothing bypasses the address check", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("http://127.0.0.1:8080/"), {
          resolver: resolverFor({ "127.0.0.1": ["127.0.0.1"] }),
        }),
        /not a public address/,
      );
    });
  });
});
