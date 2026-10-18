import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./components/Toast";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
