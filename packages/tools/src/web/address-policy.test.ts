import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertAllowedUrl,
  isPublicAddress,
  urlMatchCandidate,
  type HostnameResolver,
} from "./address-policy.ts";

/**
 * `node:test` + `node:assert`, matching this package's own convention for the rest of `src/web/`.
 *
 * `allowedUrls`' pattern-matching mechanics (glob wildcards, `RegExp` full-match semantics,
 * stateful-pattern safety) are tested directly in `url-pattern.test.ts`, against plain strings —
 * not here. Whether a glob or `RegExp` matches has nothing to do with whether an address is
 * public or private, so this file keeps only enough `allowedUrls` coverage to prove
 * `assertAllowedUrl` actually *wires the policy in* — not an exhaustive re-test of the matcher.
 *
 * The resolver is injected rather than mocked globally, and used only for the `http:`
 * domain-name cases below — see `address-policy.ts`'s module doc comment for why domain
 * resolution is checked for `http:` only, never `https:` (TLS's own hostname verification is
 * the backstop there).
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

/** A resolver that throws if ever called — for proving the `https:` path never invokes one. */
const unreachedResolver: HostnameResolver = async () => {
  throw new Error("resolver should never have been called for an https: domain name");
};

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
      await assertAllowedUrl(new URL("http://example.com/a"), {
        resolver: resolverFor({ "example.com": ["93.184.216.34"] }),
      });
      await assertAllowedUrl(new URL("https://example.com/a"));
    });

    it("rejects file:, data:, and gopher:", async () => {
      for (const raw of [
        "file:///etc/passwd",
        "data:text/html,<b>hi</b>",
        "gopher://example.com/1",
      ]) {
        await assert.rejects(assertAllowedUrl(new URL(raw)), /scheme .* is not allowed/, raw);
      }
    });

    it("rejects other non-http schemes", async () => {
      for (const raw of ["ftp://example.com/x", "ws://example.com/x", "blob:https://a/b"]) {
        await assert.rejects(assertAllowedUrl(new URL(raw)), /scheme/, raw);
      }
    });

    it("checks the scheme before doing anything else — no resolver call for a rejected scheme", async () => {
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

  describe("literal IP addresses in the hostname — checked regardless of scheme", () => {
    it("rejects a literal private/loopback/link-local IPv4 address, http or https", async () => {
      for (const raw of [
        "http://127.0.0.1/x",
        "https://127.0.0.1/x",
        "http://169.254.169.254/latest/meta-data/", // the cloud metadata service
        "https://169.254.169.254/latest/meta-data/",
      ]) {
        await assert.rejects(assertAllowedUrl(new URL(raw)), /not a public address/, raw);
      }
    });

    it("allows a literal public IPv4 address, http or https", async () => {
      await assertAllowedUrl(new URL("http://93.184.216.34/x"));
      await assertAllowedUrl(new URL("https://93.184.216.34/x"));
    });

    it("rejects a literal loopback IPv6 address, brackets and all", async () => {
      await assert.rejects(assertAllowedUrl(new URL("http://[::1]/x")), /not a public address/);
    });

    it("rejects loopback smuggled as an IPv4-mapped IPv6 literal", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("http://[::ffff:127.0.0.1]/x")),
        /not a public address/,
      );
    });

    it("names an allowedUrls entry that would permit the address on purpose", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("http://127.0.0.1:8080/")),
        /"http:\/\/127\.0\.0\.1:8080\/\*\*" to the tool's allowedUrls/,
      );
    });
  });

  describe("domain names — resolved and classified for http: only", () => {
    it("allows an http: domain resolving only to public addresses", async () => {
      await assertAllowedUrl(new URL("http://docs.example.com/page"), {
        resolver: resolverFor({ "docs.example.com": ["93.184.216.34", "2606:4700::1111"] }),
      });
    });

    it("rejects an http: domain resolving to the cloud metadata service", async () => {
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

    it("rejects an http: domain with one public and one private answer", async () => {
      // The connection picks an address from the set and this code does not choose which, so a
      // mixed answer is refused rather than gambled on.
      await assert.rejects(
        assertAllowedUrl(new URL("http://split-horizon.example/"), {
          resolver: resolverFor({ "split-horizon.example": ["93.184.216.34", "10.0.0.7"] }),
        }),
        (error: Error) => {
          assert.match(error.message, /10\.0\.0\.7/);
          assert.doesNotMatch(error.message, /93\.184\.216\.34/);
          return true;
        },
      );
    });

    it("rejects an http: domain that resolves to nothing", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("http://empty.example/"), { resolver: async () => [] }),
        /resolved to no addresses/,
      );
    });

    it("rejects when resolution itself fails, rather than proceeding unchecked", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("http://nxdomain.example/"), { resolver: resolverFor({}) }),
        /could not resolve host/,
      );
    });

    it("never resolves or checks an https: domain, no matter what it would resolve to", async () => {
      // TLS's own hostname verification is the backstop for https: — see the module doc comment.
      // The resolver here would reject on sight if it were ever called; it isn't.
      await assertAllowedUrl(new URL("https://metadata.example/latest/meta-data/"), {
        resolver: unreachedResolver,
      });
      await assertAllowedUrl(new URL("https://this-name-does-not-need-to-resolve.example/x"), {
        resolver: unreachedResolver,
      });
    });

    it("names an allowedUrls entry that would permit the http: origin on purpose", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("http://intranet.example:8080/"), {
          resolver: resolverFor({ "intranet.example": ["10.0.0.7"] }),
        }),
        /"http:\/\/intranet\.example:8080\/\*\*" to the tool's allowedUrls/,
      );
    });
  });

  describe("allowedUrls wiring", () => {
    it("a matching glob entry bypasses the literal-IP check", async () => {
      await assertAllowedUrl(new URL("http://127.0.0.1:8080/fixture"), {
        allowedUrls: ["http://127.0.0.1:8080/**"],
      });
    });

    it("a matching entry bypasses the http: domain-resolve check the same way", async () => {
      await assertAllowedUrl(new URL("http://intranet.example:8080/wiki/Home"), {
        allowedUrls: ["http://intranet.example:8080/wiki/*"],
        resolver: unreachedResolver, // never called — allowedUrls is checked first
      });
    });

    it("a matching RegExp entry bypasses the check the same way", async () => {
      await assertAllowedUrl(new URL("http://127.0.0.1:8080/fixture"), {
        allowedUrls: [/^http:\/\/127\.0\.0\.1:8080\/fixture$/],
      });
    });

    it("a non-matching entry does not bypass anything — falls through to the address check", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("http://127.0.0.1:9999/fixture"), {
          allowedUrls: ["http://127.0.0.1:8080/**"],
        }),
        /not a public address/,
      );
    });

    it("is matched against urlMatchCandidate, not the raw URL — query and fragment don't count", async () => {
      await assertAllowedUrl(new URL("http://127.0.0.1/x?trace=1#section"), {
        allowedUrls: ["http://127.0.0.1:80/x"],
      });
    });

    it("does not exempt a host from the scheme check — scheme is checked first, absolutely", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("file:///etc/passwd"), {
          allowedUrls: ["file:///etc/passwd", "**"],
        }),
        /scheme/,
      );
    });

    it("permits a match against any one entry in a mixed glob/RegExp list", async () => {
      const allowedUrls = ["http://10.0.0.1:80/**", /^http:\/\/10\.0\.0\.2:80\/x$/];
      await assertAllowedUrl(new URL("http://10.0.0.1/anything"), { allowedUrls });
      await assertAllowedUrl(new URL("http://10.0.0.2/x"), { allowedUrls });
      await assert.rejects(
        assertAllowedUrl(new URL("http://10.0.0.2/y"), { allowedUrls }),
        /not a public address/,
      );
    });
  });

  describe("allowPrivateNetwork", () => {
    it("is off by default — omitting it is the same as passing false", async () => {
      await assert.rejects(assertAllowedUrl(new URL("http://127.0.0.1/x")), /not a public address/);
      await assert.rejects(
        assertAllowedUrl(new URL("http://127.0.0.1/x"), { allowPrivateNetwork: false }),
        /not a public address/,
      );
    });

    it("disables the literal-IP check when true", async () => {
      await assertAllowedUrl(new URL("http://127.0.0.1/x"), { allowPrivateNetwork: true });
      await assertAllowedUrl(new URL("https://169.254.169.254/latest/meta-data/"), {
        allowPrivateNetwork: true,
      });
    });

    it("disables the http: domain-resolve check when true, without even calling the resolver", async () => {
      await assertAllowedUrl(new URL("http://intranet.example/"), {
        allowPrivateNetwork: true,
        resolver: unreachedResolver,
      });
    });

    it("is checked at the same point allowedUrls is — not a second enforcement path", async () => {
      // Equivalent, today, to writing allowedUrls: ["**"] — proven by producing the identical
      // outcome, not by inspecting internals.
      await assertAllowedUrl(new URL("http://127.0.0.1/x"), { allowedUrls: ["**"] });
      await assertAllowedUrl(new URL("http://127.0.0.1/x"), { allowPrivateNetwork: true });
    });

    it("does not exempt anything from the scheme check", async () => {
      await assert.rejects(
        assertAllowedUrl(new URL("file:///etc/passwd"), { allowPrivateNetwork: true }),
        /scheme/,
      );
    });
  });
});

describe("urlMatchCandidate", () => {
  it("is scheme, host, effective port, and path — no query, fragment, or userinfo", () => {
    assert.equal(
      urlMatchCandidate(new URL("https://user:pass@docs.internal/a/b?x=1#frag")),
      "https://docs.internal:443/a/b",
    );
  });

  it("fills in the scheme's default port", () => {
    assert.equal(urlMatchCandidate(new URL("http://docs.internal/x")), "http://docs.internal:80/x");
    assert.equal(
      urlMatchCandidate(new URL("https://docs.internal/x")),
      "https://docs.internal:443/x",
    );
  });

  it("lowercases and IDN-normalizes the host the same way URL itself does", () => {
    assert.equal(
      urlMatchCandidate(new URL("https://DOCS.Internal/Path")),
      "https://docs.internal:443/Path",
    );
  });
});
