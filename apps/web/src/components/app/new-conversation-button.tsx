import { useState, type ComponentProps } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

import { createAgentSession } from "#/lib/inspector/inspector-server";
import { Button } from "@/components/ui/button";

export function NewConversationButton({
  agentId,
  children,
  ...props
}: {
  agentId: string;
} & Omit<ComponentProps<typeof Button>, "onClick">) {
  const navigate = useNavigate();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    try {
      const { memoryScope } = await createAgentSession({ data: agentId });
      await router.invalidate();
      void navigate({
        to: "/agent/$agentId/run/$runId",
        params: { agentId, runId: memoryScope },
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button
      {...props}
      type="button"
      disabled={props.disabled || submitting}
      onClick={() => void handleClick()}
    >
      {children}
    </Button>
  );
}
