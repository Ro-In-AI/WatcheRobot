import { Component, lazy, Suspense, type ReactNode } from "react";
import Panel from "@/shared/ui/Panel";

const RobotModelViewer = lazy(() => import("@/modules/installer/components/RobotModelViewer"));

interface ViewerErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ViewerErrorBoundaryState {
  hasError: boolean;
}

class ViewerErrorBoundary extends Component<
  ViewerErrorBoundaryProps,
  ViewerErrorBoundaryState
> {
  state: ViewerErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("3D 预览加载失败", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

function RobotPreviewFallback() {
  return (
    <div className="robot-preview">
      <div className="robot-preview__viewer-shell robot-preview__viewer-shell--fallback">
        <div className="robot-preview__fallback">
          <strong>3D 预览不可用</strong>
          <span>当前设备暂时无法创建 WebGL 上下文，但安装流程仍可继续。</span>
        </div>
      </div>
    </div>
  );
}

export default function RobotPreviewPanel() {
  return (
    <Panel title="3D 预览" className="span-two">
      <ViewerErrorBoundary fallback={<RobotPreviewFallback />}>
        <div className="robot-preview">
          <div className="robot-preview__viewer-shell">
            <Suspense
              fallback={<div className="robot-preview__fallback">加载中...</div>}
            >
              <RobotModelViewer />
            </Suspense>
          </div>
        </div>
      </ViewerErrorBoundary>
    </Panel>
  );
}
