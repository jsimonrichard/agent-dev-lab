import { memo, useMemo } from "react";

import { highlightJson, JSON_TOKEN_CLASS } from "@/lib/highlight-json";

export const JsonTokens = memo(function JsonTokens({ text }: { text: string }) {
  const tokens = useMemo(() => highlightJson(text), [text]);

  return (
    <>
      {tokens.map((token, index) => (
        <span key={index} className={JSON_TOKEN_CLASS[token.type] || undefined}>
          {token.value}
        </span>
      ))}
    </>
  );
});
