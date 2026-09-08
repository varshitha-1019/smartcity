import { createContext, useContext } from "react";

// Split out of ToastContext.jsx: Fast Refresh (react-refresh/only-export-components)
// requires files that export a component to export *only* components, so the
// context object and the useToast hook - both non-component exports - live
// here instead, alongside ToastProvider's file.
export const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
