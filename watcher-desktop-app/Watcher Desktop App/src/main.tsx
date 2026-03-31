import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import App from "@/app/App";
import "@/shared/styles/theme.css";
import "@/shared/styles/app.css";
import "@/shared/styles/channel.css";
import "@/shared/styles/onboarding.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <>
    <App />
    <Toaster
      richColors
      closeButton
      position="top-right"
      toastOptions={{
        className: "toast-shell",
      }}
    />
  </>,
);
