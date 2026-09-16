import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hostAllowedByDomainLists,
  matchesDomainPattern,
  matchesDomainPatternWithPort,
} from "./domain-allowlist.ts";

describe("matchesDomainPattern", () => {
  it("treats * as any host", () => {
    assert.equal(matchesDomainPattern("example.com", "*"), true);
    assert.equal(matchesDomainPattern("127.0.0.1", "*"), true);
  });

  it("matches exact hostnames case-insensitively", () => {
    assert.equal(matchesDomainPattern("Example.COM", "example.com"), true);
    assert.equal(matchesDomainPattern("www.example.com", "example.com"), false);
  });

  it("matches *.base as strict subdomains, never the apex or an IP", () => {
    assert.equal(matchesDomainPattern("a.example.com", "*.example.com"), true);
    assert.equal(matchesDomainPattern("example.com", "*.example.com"), false);
    assert.equal(matchesDomainPattern("93.184.216.34", "*.example.com"), false);
  });
});

describe("matchesDomainPatternWithPort", () => {
  it("a pattern without a port matches every port", () => {
    assert.equal(matchesDomainPatternWithPort("example.com", 443, "example.com"), true);
    assert.equal(matchesDomainPatternWithPort("example.com", 80, "example.com"), true);
  });

  it("a :port suffix matches only that destination port", () => {
    assert.equal(matchesDomainPatternWithPort("example.com", 443, "example.com:443"), true);
    assert.equal(matchesDomainPatternWithPort("example.com", 80, "example.com:443"), false);
  });
});

describe("hostAllowedByDomainLists", () => {
  it("allows any host when allowedDomains is omitted", () => {
    assert.equal(hostAllowedByDomainLists("evil.example", 443, {}), true);
  });

  it("denies every host when allowedDomains is empty", () => {
    assert.equal(hostAllowedByDomainLists("example.com", 443, { allowedDomains: [] }), false);
  });

  it("requires a matching allowlist entry", () => {
    assert.equal(
      hostAllowedByDomainLists("example.com", 443, { allowedDomains: ["example.com"] }),
      true,
    );
    assert.equal(
      hostAllowedByDomainLists("example.net", 443, { allowedDomains: ["example.com"] }),
      false,
    );
  });

  it("deniedDomains wins over an allowlist match", () => {
    assert.equal(
      hostAllowedByDomainLists("blocked.example.com", 443, {
        allowedDomains: ["*"],
        deniedDomains: ["*.example.com"],
      }),
      false,
    );
  });
});
