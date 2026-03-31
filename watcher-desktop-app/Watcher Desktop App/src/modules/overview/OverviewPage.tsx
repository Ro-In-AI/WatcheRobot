import { useEffect, useState } from "react";
import { Radio, Server, ShieldCheck } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import Panel from "@/components/Panel";
import StatusBadge from "@/components/StatusBadge";
import { checkEnvironment } from "@/modules/installer/service/api";
import { modelConfigApi } from "@/modules/openclaw/model_config/api";
import {
  getServerRuntimeMode,
  getServerStatus,
  type ServerRuntimeMode,
} from "@/modules/server/service/api";
import type {
  EnvironmentStatus,
  IntegrationPaths,
  OpenClawDefaultModel,
  OpenClawProviderConfig,
} from "@/types";

interface OverviewPageProps {
  paths: IntegrationPaths | null;
}

export default function OverviewPage({ paths }: OverviewPageProps) {
  const [environment, setEnvironment] = useState<EnvironmentStatus | null>(null);
  const [models, setModels] = useState<Record<string, OpenClawProviderConfig>>({});
  const [defaultModel, setDefaultModel] = useState<OpenClawDefaultModel | null>(null);
  const [serverRunning, setServerRunning] = useState(false);
  const [serverMode, setServerMode] = useState<ServerRuntimeMode>("unknown");

  const refresh = async () => {
    const [env, modelMap, modelDefault, running, mode] = await Promise.all([
      checkEnvironment(),
      modelConfigApi.getModels(),
      modelConfigApi.getDefaultModel(),
      getServerStatus(),
      getServerRuntimeMode(),
    ]);

    setEnvironment(env);
    setModels(modelMap);
    setDefaultModel(modelDefault);
    setServerRunning(running);
    setServerMode(mode);
  };

  useEffect(() => {
    void refresh().catch(console.error);
  }, []);

  const providerCount = Object.keys(models).length;

  return (
    <>
      <section className="metric-grid">
        <MetricCard
          label="OpenClaw"
          value={environment?.openclaw.installed ? "已安装" : "未安装"}
          caption={
            environment?.openclaw.version
              ? `版本 ${environment.openclaw.version}`
              : "等待检测结果"
          }
          accent="green"
          icon={<ShieldCheck size={18} />}
        />
        <MetricCard
          label="Channel Providers"
          value={String(providerCount)}
          caption={defaultModel?.primary ?? "尚未设置默认模型"}
          accent="blue"
          icon={<Radio size={18} />}
        />
        <MetricCard
          label="Backend Runtime"
          value={serverRunning ? "运行中" : "已停止"}
          caption={`当前模式 ${serverMode}`}
          accent="gold"
          icon={<Server size={18} />}
        />
      </section>

      <div className="content-grid">
        <Panel title="模块结构">
          <div className="overview-list">
            <div>
              <strong>安装与初始化</strong>
            </div>
            <div>
              <strong>Channel 配置</strong>
            </div>
            <div>
              <strong>服务控制台</strong>
            </div>
          </div>
        </Panel>

        <Panel title="连接信息">
          <div className="path-summary">
            <div className="path-row">
              <span>App Root</span>
              <code>{paths?.appRoot ?? "加载中..."}</code>
            </div>
            <div className="path-row">
              <span>Installer Module</span>
              <code>{paths?.installerRoot ?? "加载中..."}</code>
            </div>
            <div className="path-row">
              <span>Channel Module</span>
              <code>{paths?.assistantRoot ?? "加载中..."}</code>
            </div>
            <div className="path-row">
              <span>Server Resource</span>
              <code>{paths?.serverRoot ?? "加载中..."}</code>
            </div>
            <div className="path-row">
              <span>WS URL</span>
              <code>{paths?.wsUrl ?? "加载中..."}</code>
            </div>
          </div>
        </Panel>

        <Panel
          title="运行态摘要"
          className="span-two"
          actions={
            <button type="button" className="ghost-button" onClick={() => void refresh()}>
              刷新总览
            </button>
          }
        >
          <div className="summary-pills">
            <StatusBadge
              tone={environment?.nodejs.installed ? "success" : "danger"}
            >
              {environment?.nodejs.installed
                ? `Node.js ${environment.nodejs.version ?? "已安装"}`
                : "Node.js 缺失"}
            </StatusBadge>
            <StatusBadge
              tone={environment?.tools.curl && environment.tools.tar ? "success" : "warning"}
            >
              {environment?.tools.curl && environment.tools.tar
                ? "安装工具齐备"
                : "缺少基础工具"}
            </StatusBadge>
            <StatusBadge tone={providerCount > 0 ? "info" : "neutral"}>
              {providerCount > 0 ? `${providerCount} 个 Provider` : "未配置 Provider"}
            </StatusBadge>
            <StatusBadge tone={serverRunning ? "success" : "neutral"}>
              {serverRunning ? "服务已启动" : "服务未运行"}
            </StatusBadge>
          </div>
        </Panel>
      </div>
    </>
  );
}
