import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { COMPANY } from "./config";

const faviconLink = document.querySelector('link[rel="icon"]');
if (faviconLink && COMPANY.logo) {
  faviconLink.href = COMPANY.logo;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
