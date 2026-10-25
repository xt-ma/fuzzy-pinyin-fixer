import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";

/* PWA Service Worker 注册（vite-plugin-pwa 生成；仅 http(s) 环境生效） */
import { registerSW } from "virtual:pwa-register";
registerSW({ immediate: false });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
