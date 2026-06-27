import { createContext, useContext } from "react";

type InspectorShellContextValue = {
  toggleContextSidebar: () => void;
};

const InspectorShellContext = createContext<InspectorShellContextValue | null>(null);

export function InspectorShellProvider({
  toggleContextSidebar,
  children,
}: {
  toggleContextSidebar: () => void;
  children: React.ReactNode;
}) {
  return (
    <InspectorShellContext.Provider value={{ toggleContextSidebar }}>
      {children}
    </InspectorShellContext.Provider>
  );
}

export function useInspectorShell(): InspectorShellContextValue | null {
  return useContext(InspectorShellContext);
}
