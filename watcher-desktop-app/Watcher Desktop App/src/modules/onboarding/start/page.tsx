import startHero from "@/assets/figma/start-hero-box.png";
import startLogo from "@/assets/figma/orulink-logo-2026.png";

interface StartPageProps {
  onStart: () => void;
  isStarting?: boolean;
}

export default function StartPage({ onStart, isStarting = false }: StartPageProps) {
  return (
    <div className="onboarding-page onboarding-page--start">
      <section className="figma-start-screen">
        <img className="figma-start-screen__logo" src={startLogo} alt="Watcher Robot" />

        <div className="figma-start-screen__hero">
          <img src={startHero} alt="" />
        </div>

        <div className="figma-start-screen__status">
          <span className="figma-start-screen__status-dot" />
          <span>Offline</span>
        </div>

        <button
          type="button"
          className="figma-start-screen__button"
          disabled={isStarting}
          onClick={onStart}
        >
          {isStarting ? "启动中..." : "Start"}
        </button>
      </section>
    </div>
  );
}
