import { expect, test, type Page } from "@playwright/test";

import {
  ECHO_REPLY,
  FAIL_AGENT_MESSAGE,
  TOOL_LOOP_DONE,
  TOOL_LOOP_TOOL_NAME,
} from "./fixture/src/replies";

test.beforeEach(({ page }) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[browser] ${msg.text()}`);
    }
  });
});

async function startConversation(page: Page, agentId: string): Promise<void> {
  await page.goto(`/agent/${agentId}`);
  await expect(page.getByRole("heading", { name: agentId })).toBeVisible();
  const newChat = page.getByRole("main").getByRole("button", { name: "New Conversation" });
  // SSR markup is clickable before React hydrates; retry until the session route lands.
  await expect(async () => {
    if (new URL(page.url()).pathname.includes("/run/")) {
      return;
    }
    await newChat.click();
    await expect(page).toHaveURL(new RegExp(`/agent/${agentId}/run/`), { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByTestId("chat-composer")).toBeVisible();
}

async function sendChat(page: Page, text: string): Promise<void> {
  await page.getByTestId("chat-composer").fill(text);
  await page.getByTestId("chat-send").click();
}

test.describe("inspection UI agent chat streaming", () => {
  test("echo: optimistic user, in-flight stream, settled reply survives reload", async ({
    page,
  }) => {
    await startConversation(page, "echo-agent");
    await sendChat(page, "ping-one");

    await expect(page.getByText("ping-one")).toBeVisible();
    await expect(page.getByLabel("Generating")).toBeVisible();
    await expect(page.getByText("ECHO_PARTIAL")).toBeVisible();
    await expect(page.getByText("ECHO_DONE")).toBeVisible();
    await expect(page.getByText(ECHO_REPLY)).toBeVisible();
    await expect(page.getByLabel("Generating")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("chat-composer")).toBeVisible();
    await expect(page.getByText("ping-one")).toBeVisible();
    await expect(page.getByText(ECHO_REPLY)).toBeVisible();
  });

  test("tool-loop: tool row then final assistant text without reload", async ({ page }) => {
    await startConversation(page, "tool-loop-agent");
    await sendChat(page, "run-tools");

    await expect(page.getByLabel(`Tool call ${TOOL_LOOP_TOOL_NAME}`)).toBeVisible();
    await expect(page.getByLabel(`Tool result ${TOOL_LOOP_TOOL_NAME}`)).toBeVisible();
    await expect(page.getByText(TOOL_LOOP_DONE)).toBeVisible();
    await expect(page.getByLabel("Generating")).toHaveCount(0);
  });

  test("second echo turn: optimistic follow-up without wiping the first transcript", async ({
    page,
  }) => {
    await startConversation(page, "echo-agent");
    await sendChat(page, "ping-one");
    await expect(page.getByText(ECHO_REPLY)).toBeVisible();
    await expect(page.getByLabel("Generating")).toHaveCount(0);
    await expect(page.getByTestId("chat-composer")).toBeEnabled();

    await sendChat(page, "ping-two");
    await expect(page.getByText("ping-two")).toBeVisible();
    await expect(page.getByText("ping-one")).toBeVisible();
    await expect(page.getByText(ECHO_REPLY)).toHaveCount(2);
  });

  test("fail-agent: mid-turn model error surfaces in the chat UI without reload", async ({
    page,
  }) => {
    await startConversation(page, "fail-agent");
    await sendChat(page, "please-fail");

    await expect(page.getByText("please-fail")).toBeVisible();
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(FAIL_AGENT_MESSAGE);

    await page.reload();
    await expect(page.getByTestId("chat-composer")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(FAIL_AGENT_MESSAGE);
  });
});
