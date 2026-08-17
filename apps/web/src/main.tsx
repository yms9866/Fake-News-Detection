import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { applyTheme, getInitialTheme } from "./hooks/use-theme";
import App from "./App";
import "./theme.css";
import "./styles.css";

applyTheme(getInitialTheme());

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
