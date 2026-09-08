import { useCallback, useRef, useState } from "react";
import { ToastContext } from "./useToast";
import "./Toast.css";

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const showToast = useCallback((message, type = "success", duration = 3500) => {
    const id = ++idCounter;
    setToasts((current) => [...current, { id, message, type }]);
    timers.current[id] = setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      delete timers.current[id];
    }, duration);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}

      <div className="toast-viewport" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role="status">
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
