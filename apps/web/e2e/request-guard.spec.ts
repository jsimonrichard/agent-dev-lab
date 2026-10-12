import { expect, test } from "@playwright/test";

test("refuses a cross-origin POST", async ({ request }) => {
  const response = await request.post("/api/runs", {
    data: { workflowId: "slow-steps", input: {} },
    headers: { Origin: "http://attacker.example", "Sec-Fetch-Site": "cross-site" },
  });
  expect(response.status()).toBe(403);
});

test("refuses a request whose Host is not loopback", async ({ request }) => {
  const response = await request.get("/", {
    headers: { Host: "attacker.example" },
  });
  expect(response.status()).toBe(403);
});

test("accepts a same-origin POST", async ({ request, baseURL }) => {
  const response = await request.post("/api/runs", {
    data: { workflowId: "slow-steps", input: {} },
    headers: { Origin: baseURL!, "Sec-Fetch-Site": "same-origin" },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
});
