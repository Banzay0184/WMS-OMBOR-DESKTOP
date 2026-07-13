import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { COMPANY } from "./config";
import ErrorBoundary from "./components/ErrorBoundary";
import { installGlobalErrorHandlers } from "./utils/errorReporting";

const faviconLink = document.querySelector('link[rel="icon"]');
if (faviconLink && COMPANY.logo) {
  faviconLink.href = COMPANY.logo;
}

installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
