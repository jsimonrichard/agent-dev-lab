import { createContext, useContext, type ReactNode } from "react";

export type InspectorServerShutdownReason = "graceful" | "forced";

export type InspectorConnectionState = {
  /** True after the serve process announced shutdown (or the UI treated it as gone). */
  offline: boolean;
  reason: InspectorServerShutdownReason | null;
};

const InspectorConnectionContext = createContext<InspectorConnectionState>({
  offline: false,
  reason: null,
});

export function InspectorConnectionProvider({
  value,
  children,
}: {
  value: InspectorConnectionState;
  children: ReactNode;
}) {
  return (
    <InspectorConnectionContext.Provider value={value}>
      {children}
    </InspectorConnectionContext.Provider>
  );
}

export function useInspectorConnection(): InspectorConnectionState {
  return useContext(InspectorConnectionContext);
}
