import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BarChart3,
  BadgeHelp,
  Bot,
  BrainCircuit,
  Check,
  Cloud,
  Flame,
  LoaderCircle,
  Mic2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import startLogo from "@/assets/figma/orulink-logo-2026.png";
import { checkEnvironment, startInstallation } from "@/modules/installer/service/api";
import { parseInstallStages } from "@/modules/installer/service/installStages";
import { useWatcherConfigSession } from "@/modules/onboarding/hooks/useWatcherConfigSession";
import { modelConfigApi } from "@/modules/openclaw/model_config/api";
import { openclawProviderPresets } from "@/modules/openclaw/shared/providerPresets";
import type { OpenClawProviderConfig } from "@/modules/openclaw/shared/types";
import { debugLog, startDebugTimer } from "@/shared/lib/debugLog";
import type { EnvironmentStatus, InstallState, OnboardingServerModule } from "@/shared/types/runtime";

interface InitializationPageProps {
  wsUrl?: string;
  onComplete: () => void;
}

type CardId =
  | "openclaw-gate"
  | "setup-home"
  | "asr-init"
  | "asr-manual"
  | "tts-init"
  | "tts-manual"
  | "brain-select"
  | "openclaw-manual"
  | "llm-manual"
  | "success";

type SetupMode = "automatic" | "manual";
type FormTab = "basic" | "advanced";
type AsrProvider = "deepgram" | "aliyun";
type TtsProvider = "huoshan" | "deepgram";
type ProviderBadgeKind = "aliyun" | "deepgram" | "huoshan" | "openclaw" | "llm" | "generic";
type OpenClawGateReturnTo = "setup-home" | "dialogue";
type OpenClawProgressStatus = "pending" | "active" | "completed";

interface OpenClawProgressStep {
  id: "download" | "install" | "initialize";
  label: string;
  rowLabel: string;
  status: OpenClawProgressStatus;
}

interface AsrForm {
  provider: AsrProvider;
  deepgramApiKey: string;
  deepgramModel: string;
  deepgramListenUrl: string;
  deepgramLiveUrl: string;
  aliyunAppKey: string;
  aliyunAkId: string;
  aliyunAkSecret: string;
  aliyunToken: string;
  aliyunUrl: string;
}

interface TtsForm {
  provider: TtsProvider;
  deepgramApiKey: string;
  deepgramModel: string;
  deepgramSpeakUrl: string;
  huoshanAppKey: string;
  huoshanAccessKey: string;
  huoshanVoiceType: string;
  huoshanApiUrl: string;
}

interface LlmForm {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: string;
}

interface OpenClawForm {
  providerId: string;
  api: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  backend: string;
  agent: string;
  pollInterval: string;
  logPollInterval: string;
}

interface OptionRow {
  id: string;
  label: string;
  description: string;
  badge: ProviderBadgeKind;
  trailing?: "metric" | "none";
  onClick: () => void;
}

interface FieldConfig {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  secret?: boolean;
}

const DEFAULT_ASR = {
  provider: "deepgram",
  common: {
    basic: {
      sample_rate: 16000,
      channels: 1,
    },
    advanced: {},
  },
  providers: {
    aliyun: {
      label: "阿里云 ASR",
      basic: {
        appkey: "",
        ak_id: "",
        ak_secret: "",
        token: "",
      },
      advanced: {
        url: "wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1",
      },
    },
    deepgram: {
      label: "Deepgram ASR",
      basic: {
        api_key: "",
      },
      advanced: {
        listen_url: "https://api.deepgram.com/v1/listen",
        live_url: "wss://api.deepgram.com/v1/listen",
        model: "nova-2",
      },
    },
  },
};

const DEFAULT_TTS = {
  provider: "huoshan",
  common: {
    basic: {
      sample_rate: 24000,
    },
    advanced: {},
  },
  providers: {
    huoshan: {
      label: "火山引擎 TTS",
      basic: {
        app_key: "",
        access_key: "",
        voice_type: "ICL_zh_male_nuanxintitie_tob",
      },
      advanced: {
        api_url: "wss://openspeech.bytedance.com/api/v1/tts/ws_binary",
      },
    },
    deepgram: {
      label: "Deepgram TTS",
      basic: {
        api_key: "",
        model: "aura-2-thalia-en",
      },
      advanced: {
        speak_url: "https://api.deepgram.com/v1/speak",
      },
    },
  },
};

const DEFAULT_LLM = {
  provider: "ark",
  common: {
    basic: {
      temperature: 0.7,
      max_tokens: 2048,
    },
    advanced: {
      top_p: 0.9,
      stream: false,
    },
  },
  providers: {
    ark: {
      label: "火山 Ark LLM",
      basic: {
        api_key: "",
        model: "deepseek-v3-2-251201",
      },
      advanced: {
        base_url: "https://ark.cn-beijing.volces.com/api/v3",
      },
    },
  },
};

const DEFAULT_DIALOGUE = {
  provider: "openclaw",
  common: {
    basic: {
      history_enabled: true,
    },
    advanced: {
      max_turns: 6,
    },
  },
  providers: {
    openclaw: {
      label: "OpenClaw",
      basic: {
        backend: "tmux",
        agent: "main",
      },
      advanced: {
        poll_interval: 3,
        log_poll_interval: 1,
      },
    },
    llm: {
      label: "LLM",
      basic: {},
      advanced: {},
    },
  },
};

const DEFAULT_OPENCLAW_PROVIDER_ID = "openrouter";
const DEFAULT_OPENCLAW_API = "openai-completions";
const DEFAULT_OPENCLAW_MODEL = "openai/gpt-4.1";

const ASR_COPY: Record<AsrProvider, { label: string; description: string }> = {
  aliyun: {
    label: "阿里云",
    description: "nls-gateway-cn-shanghai.aliyuncs.com",
  },
  deepgram: {
    label: "Deepgram",
    description: "api.deepgram.com",
  },
};

const TTS_COPY: Record<TtsProvider, { label: string; description: string }> = {
  deepgram: {
    label: "Deepgram",
    description: "api.deepgram.com",
  },
  huoshan: {
    label: "Volcengine",
    description: "openspeech.bytedance.com",
  },
};

function cloneConfig<T extends Record<string, unknown>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPath(root: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function readString(root: Record<string, unknown>, path: string[], fallback = ""): string {
  const value = readPath(root, path);
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return fallback;
}

function readNumber(root: Record<string, unknown>, path: string[], fallback: number): number {
  const value = readPath(root, path);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function setPath(root: Record<string, unknown>, path: string[], value: unknown) {
  let cursor: Record<string, unknown> = root;
  path.forEach((key, index) => {
    const isLast = index === path.length - 1;
    if (isLast) {
      cursor[key] = value;
      return;
    }

    const next = cursor[key];
    if (!isRecord(next)) {
      const branch: Record<string, unknown> = {};
      cursor[key] = branch;
      cursor = branch;
      return;
    }

    cursor = next;
  });
}

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toAsrProvider(value: string): AsrProvider {
  return value === "aliyun" ? "aliyun" : "deepgram";
}

function toTtsProvider(value: string): TtsProvider {
  return value === "deepgram" ? "deepgram" : "huoshan";
}

function getProviderKeys(config: Record<string, unknown>, fallback: string[]): string[] {
  const providers = readPath(config, ["providers"]);
  if (!isRecord(providers)) {
    return fallback;
  }
  const keys = Object.keys(providers);
  return keys.length > 0 ? keys : fallback;
}

function createAsrForm(config: Record<string, unknown>): AsrForm {
  const provider = toAsrProvider(readString(config, ["provider"], "deepgram"));
  return {
    provider,
    deepgramApiKey: readString(config, ["providers", "deepgram", "basic", "api_key"]),
    deepgramModel: readString(config, ["providers", "deepgram", "advanced", "model"], "nova-2"),
    deepgramListenUrl: readString(
      config,
      ["providers", "deepgram", "advanced", "listen_url"],
      "https://api.deepgram.com/v1/listen",
    ),
    deepgramLiveUrl: readString(
      config,
      ["providers", "deepgram", "advanced", "live_url"],
      "wss://api.deepgram.com/v1/listen",
    ),
    aliyunAppKey: readString(config, ["providers", "aliyun", "basic", "appkey"]),
    aliyunAkId: readString(config, ["providers", "aliyun", "basic", "ak_id"]),
    aliyunAkSecret: readString(config, ["providers", "aliyun", "basic", "ak_secret"]),
    aliyunToken: readString(config, ["providers", "aliyun", "basic", "token"]),
    aliyunUrl: readString(
      config,
      ["providers", "aliyun", "advanced", "url"],
      "wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1",
    ),
  };
}

function createTtsForm(config: Record<string, unknown>): TtsForm {
  const provider = toTtsProvider(readString(config, ["provider"], "huoshan"));
  return {
    provider,
    deepgramApiKey: readString(config, ["providers", "deepgram", "basic", "api_key"]),
    deepgramModel: readString(config, ["providers", "deepgram", "basic", "model"], "aura-2-thalia-en"),
    deepgramSpeakUrl: readString(
      config,
      ["providers", "deepgram", "advanced", "speak_url"],
      "https://api.deepgram.com/v1/speak",
    ),
    huoshanAppKey: readString(config, ["providers", "huoshan", "basic", "app_key"]),
    huoshanAccessKey: readString(config, ["providers", "huoshan", "basic", "access_key"]),
    huoshanVoiceType: readString(
      config,
      ["providers", "huoshan", "basic", "voice_type"],
      "ICL_zh_male_nuanxintitie_tob",
    ),
    huoshanApiUrl: readString(
      config,
      ["providers", "huoshan", "advanced", "api_url"],
      "wss://openspeech.bytedance.com/api/v1/tts/ws_binary",
    ),
  };
}

function createLlmForm(config: Record<string, unknown>): LlmForm {
  const provider = readString(config, ["provider"], "ark");
  return {
    provider,
    apiKey: readString(config, ["providers", provider, "basic", "api_key"]),
    model: readString(config, ["providers", provider, "basic", "model"]),
    baseUrl: readString(config, ["providers", provider, "advanced", "base_url"]),
    temperature: String(readNumber(config, ["common", "basic", "temperature"], 0.7)),
  };
}

function normalizeOpenClawProvider(config: OpenClawProviderConfig | null | undefined) {
  const models = Array.isArray(config?.models) ? config.models : [];
  const firstModel = models.find((model) => typeof model.id === "string" && model.id.trim().length > 0);

  return {
    api: config?.api ?? DEFAULT_OPENCLAW_API,
    baseUrl: config?.baseUrl ?? config?.base_url ?? "",
    apiKey: config?.apiKey ?? config?.api_key ?? "",
    modelId: firstModel?.id?.trim() ?? "",
  };
}

function parsePrimaryModel(primary: string | undefined) {
  if (!primary) {
    return { providerId: "", modelId: "" };
  }
  const [providerId, ...rest] = primary.split("/");
  return {
    providerId: providerId ?? "",
    modelId: rest.join("/"),
  };
}

function getCardStep(card: CardId): 0 | 1 | 2 | null {
  if (card === "openclaw-gate" || card === "setup-home") {
    return null;
  }
  if (card.startsWith("asr")) {
    return 0;
  }
  if (card.startsWith("tts")) {
    return 1;
  }
  return 2;
}

function getSetupModeLabel(mode: SetupMode | null) {
  if (mode === "automatic") {
    return "Automatic configuration";
  }
  if (mode === "manual") {
    return "Manual configuration";
  }
  return "";
}

function prettifyProvider(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Custom";
  }
  if (trimmed.toLowerCase() === "ark") {
    return "ARK";
  }
  return trimmed;
}

function getOpenClawProviderDisplayName(providerId: string) {
  const preset = openclawProviderPresets.find((item) => item.providerId === providerId);
  if (preset?.name) {
    return preset.name;
  }
  return providerId.trim() || "OpenClaw";
}

function hasReusableOpenClawConfig(
  defaultModelPrimary: string,
  providers: Record<string, OpenClawProviderConfig>,
) {
  const primary = parsePrimaryModel(defaultModelPrimary);
  const providerId = primary.providerId.trim();
  const modelId = primary.modelId.trim();
  if (!providerId || !modelId) {
    return false;
  }

  const presetConfig =
    openclawProviderPresets.find((preset) => preset.providerId === providerId)?.settingsConfig ?? null;
  const providerConfig = providers[providerId] ?? presetConfig;
  if (!providerConfig) {
    return false;
  }

  const normalized = normalizeOpenClawProvider(providerConfig);
  const models = Array.isArray(providerConfig.models) ? providerConfig.models : [];
  const hasMatchingModel =
    models.some((model) => String(model.id ?? "").trim() === modelId) ||
    normalized.modelId.trim() === modelId;

  return Boolean(hasMatchingModel && (normalized.baseUrl.trim() || normalized.api.trim()));
}

function getOpenClawDefaultPrimary(value: { primary?: string } | null | undefined) {
  return typeof value?.primary === "string" ? value.primary : "";
}

function toOpenClawProgressStatus(
  value: "pending" | "active" | "completed" | undefined,
): OpenClawProgressStatus {
  if (value === "active" || value === "completed") {
    return value;
  }
  return "pending";
}

function getOpenClawProgressStatusText(status: OpenClawProgressStatus) {
  if (status === "completed") {
    return "Done";
  }
  if (status === "active") {
    return "Running";
  }
  return "Waiting";
}

function getOpenClawProgressSteps(logs: string[]): OpenClawProgressStep[] {
  const { stages } = parseInstallStages(logs);
  const prepareStatus = toOpenClawProgressStatus(stages[0]?.status);
  const finalizeStatus = toOpenClawProgressStatus(stages[2]?.status);
  const initStatus = toOpenClawProgressStatus(stages[3]?.status);

  let installStatus: OpenClawProgressStatus = "pending";
  if (initStatus === "active" || initStatus === "completed" || finalizeStatus === "completed") {
    installStatus = "completed";
  } else if (
    toOpenClawProgressStatus(stages[1]?.status) === "active" ||
    finalizeStatus === "active"
  ) {
    installStatus = "active";
  } else if (toOpenClawProgressStatus(stages[1]?.status) === "completed") {
    installStatus = "completed";
  }

  return [
    {
      id: "download",
      label: "Download",
      rowLabel: "01  Download script",
      status: prepareStatus,
    },
    {
      id: "install",
      label: "Install",
      rowLabel: "02  Install CLI",
      status: installStatus,
    },
    {
      id: "initialize",
      label: "Initialize",
      rowLabel: "03  Initialize config",
      status: initStatus,
    },
  ];
}

function ProviderBadge({ kind }: { kind: ProviderBadgeKind }) {
  const icon = (() => {
    switch (kind) {
      case "aliyun":
        return <Cloud size={28} />;
      case "deepgram":
        return <AudioLines size={24} />;
      case "huoshan":
        return <Flame size={28} />;
      case "openclaw":
        return <Bot size={26} />;
      case "llm":
        return <BrainCircuit size={26} />;
      default:
        return <Mic2 size={24} />;
    }
  })();

  return <span className={`init-flow__badge init-flow__badge--${kind}`}>{icon}</span>;
}

function Field({ field }: { field: FieldConfig }) {
  return (
    <label className="init-flow__field">
      <span>{field.label}</span>
      {field.options ? (
        <select value={field.value} onChange={(event) => field.onChange(event.target.value)}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.secret ? "password" : "text"}
          value={field.value}
          placeholder={field.placeholder}
          onChange={(event) => field.onChange(event.target.value)}
        />
      )}
    </label>
  );
}

export default function InitializationPage({
  wsUrl,
  onComplete,
}: InitializationPageProps) {
  const { socketState, snapshot, isRefreshing, refreshAll, saveModule } = useWatcherConfigSession(wsUrl);
  const [activeCard, setActiveCard] = useState<CardId>("openclaw-gate");
  const [setupMode, setSetupMode] = useState<SetupMode | null>(null);
  const [activeFormTab, setActiveFormTab] = useState<FormTab>("basic");
  const [savingKey, setSavingKey] = useState<OnboardingServerModule | "openclaw" | null>(null);
  const [moduleDrafts, setModuleDrafts] = useState<Record<OnboardingServerModule, Record<string, unknown>>>({
    asr: cloneConfig(DEFAULT_ASR),
    tts: cloneConfig(DEFAULT_TTS),
    llm: cloneConfig(DEFAULT_LLM),
    dialogue: cloneConfig(DEFAULT_DIALOGUE),
  });
  const [asrForm, setAsrForm] = useState<AsrForm>(() => createAsrForm(DEFAULT_ASR));
  const [ttsForm, setTtsForm] = useState<TtsForm>(() => createTtsForm(DEFAULT_TTS));
  const [llmForm, setLlmForm] = useState<LlmForm>(() => createLlmForm(DEFAULT_LLM));
  const [openclawProviders, setOpenclawProviders] = useState<Record<string, OpenClawProviderConfig>>({});
  const [openclawDefaultPrimary, setOpenclawDefaultPrimary] = useState("");
  const [loadingOpenClaw, setLoadingOpenClaw] = useState(false);
  const [environment, setEnvironment] = useState<EnvironmentStatus | null>(null);
  const [openclawInstallState, setOpenclawInstallState] = useState<InstallState>("checking");
  const [openclawInstallError, setOpenclawInstallError] = useState("");
  const [openclawLogs, setOpenclawLogs] = useState<string[]>([]);
  const [showOpenclawLogs, setShowOpenclawLogs] = useState(false);
  const [openclawGateReturnTo, setOpenclawGateReturnTo] =
    useState<OpenClawGateReturnTo>("setup-home");
  const [openclawForm, setOpenclawForm] = useState<OpenClawForm>({
    providerId: DEFAULT_OPENCLAW_PROVIDER_ID,
    api: DEFAULT_OPENCLAW_API,
    baseUrl: "",
    apiKey: "",
    modelId: DEFAULT_OPENCLAW_MODEL,
    backend: "tmux",
    agent: "main",
    pollInterval: "3",
    logPollInterval: "1",
  });
  const dirtyRef = useRef<Record<OnboardingServerModule | "openclawProvider", boolean>>({
    asr: false,
    tts: false,
    llm: false,
    dialogue: false,
    openclawProvider: false,
  });

  const cardStep = getCardStep(activeCard);
  const busy = savingKey !== null || isRefreshing;
  const modeLabel = getSetupModeLabel(setupMode);
  const hasInstalledOpenClaw = Boolean(environment?.openclaw.installed);

  const refreshOpenClawEnvironment = async () => {
    setOpenclawInstallState("checking");
    setOpenclawInstallError("");
    const result = await checkEnvironment();
    setEnvironment(result);
    if (result.openclaw.installed) {
      setShowOpenclawLogs(false);
    }
    setOpenclawInstallState(result.openclaw.installed ? "installed" : "ready");
    return result;
  };

  useEffect(() => {
    debugLog("InitializationPage", "state snapshot updated", {
      activeCard,
      setupMode,
      socketState,
      busy,
      savingKey,
      isRefreshing,
      loadingOpenClaw,
      hasWsUrl: Boolean(wsUrl),
    });
  }, [activeCard, busy, isRefreshing, loadingOpenClaw, savingKey, setupMode, socketState, wsUrl]);

  useEffect(() => {
    void refreshOpenClawEnvironment().catch((error) => {
      setOpenclawInstallState("error");
      setOpenclawInstallError(String(error));
    });
  }, []);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    Promise.all([
      listen<string>("installation-log", ({ payload }) => {
        setOpenclawLogs((previous) => [...previous, payload]);
      }),
      listen("installation-complete", () => {
        setOpenclawInstallState("installed");
        setShowOpenclawLogs(false);
        toast.success("OpenClaw 初始化完成");
        void refreshOpenClawEnvironment().catch((error) => {
          setOpenclawInstallState("error");
          setOpenclawInstallError(String(error));
        });
      }),
      listen<string>("installation-error", ({ payload }) => {
        setOpenclawInstallState("error");
        setOpenclawInstallError(payload);
        toast.error("安装流程失败", {
          description: payload,
        });
      }),
    ]).then((disposers) => {
      disposers.forEach((dispose) => unlisteners.push(dispose));
    });

    return () => {
      unlisteners.forEach((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    if (socketState !== "connected") {
      debugLog("InitializationPage", "refreshAll skipped because socket is not connected", { socketState });
      return;
    }

    let cancelled = false;
    const timer = startDebugTimer("InitializationPage", "initial refreshAll after websocket connect", { socketState });

    void refreshAll()
      .then(() => {
        timer.success("initial refreshAll completed");
      })
      .catch((error) => {
        if (!cancelled) {
          timer.fail(error, "initial refreshAll failed");
          toast.error("读取服务器配置失败", {
            description: String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshAll, socketState]);

  useEffect(() => {
    setModuleDrafts((previous) => {
      let changed = false;
      const next = { ...previous };
      (["asr", "tts", "llm", "dialogue"] as const).forEach((module) => {
        if (dirtyRef.current[module]) {
          return;
        }
        const report = snapshot[module];
        if (!report) {
          return;
        }
        next[module] = cloneConfig(report.config);
        changed = true;
      });
      return changed ? next : previous;
    });

    if (snapshot.asr && !dirtyRef.current.asr) {
      setAsrForm(createAsrForm(snapshot.asr.config));
    }

    if (snapshot.tts && !dirtyRef.current.tts) {
      setTtsForm(createTtsForm(snapshot.tts.config));
    }

    if (snapshot.llm && !dirtyRef.current.llm) {
      setLlmForm(createLlmForm(snapshot.llm.config));
    }

    if (snapshot.dialogue && !dirtyRef.current.dialogue) {
      const config = snapshot.dialogue.config;
      setOpenclawForm((previous) => ({
        ...previous,
        backend: readString(config, ["providers", "openclaw", "basic", "backend"], previous.backend || "tmux"),
        agent: readString(config, ["providers", "openclaw", "basic", "agent"], previous.agent || "main"),
        pollInterval: String(
          readNumber(config, ["providers", "openclaw", "advanced", "poll_interval"], 3),
        ),
        logPollInterval: String(
          readNumber(config, ["providers", "openclaw", "advanced", "log_poll_interval"], 1),
        ),
      }));
    }
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;

    const loadOpenClaw = async () => {
      const timer = startDebugTimer("InitializationPage", "load OpenClaw configuration");
      setLoadingOpenClaw(true);
      try {
        const [providerMap, modelDefault] = await Promise.all([
          modelConfigApi.getModels(),
          modelConfigApi.getDefaultModel(),
        ]);
        if (cancelled) {
          return;
        }

        setOpenclawProviders(providerMap);
        setOpenclawDefaultPrimary(getOpenClawDefaultPrimary(modelDefault));
        timer.success("load OpenClaw configuration completed", {
          providerIds: Object.keys(providerMap),
          defaultModel: modelDefault?.primary ?? null,
        });

        if (!dirtyRef.current.openclawProvider) {
          const primary = parsePrimaryModel(modelDefault?.primary);
          const providerIdFromPrimary = primary.providerId.trim();
          const providerIds = Object.keys(providerMap);
          const fallbackProvider =
            providerIds[0] ??
            openclawProviderPresets.find((preset) => preset.providerId)?.providerId ??
            DEFAULT_OPENCLAW_PROVIDER_ID;
          const providerId = providerIdFromPrimary || fallbackProvider;
          const sourceConfig =
            providerMap[providerId] ??
            openclawProviderPresets.find((preset) => preset.providerId === providerId)?.settingsConfig ??
            null;
          const normalized = normalizeOpenClawProvider(sourceConfig);

          setOpenclawForm((previous) => ({
            ...previous,
            providerId,
            api: normalized.api,
            baseUrl: normalized.baseUrl,
            apiKey: normalized.apiKey,
            modelId: primary.modelId || normalized.modelId || DEFAULT_OPENCLAW_MODEL,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          timer.fail(error, "load OpenClaw configuration failed");
          toast.error("读取 OpenClaw 配置失败", {
            description: String(error),
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingOpenClaw(false);
        }
      }
    };

    void loadOpenClaw();

    return () => {
      cancelled = true;
    };
  }, []);

  const asrProviderOptions = useMemo(
    () => getProviderKeys(moduleDrafts.asr, ["deepgram", "aliyun"]),
    [moduleDrafts.asr],
  );
  const ttsProviderOptions = useMemo(
    () => getProviderKeys(moduleDrafts.tts, ["huoshan", "deepgram"]),
    [moduleDrafts.tts],
  );
  const llmProviderOptions = useMemo(
    () => getProviderKeys(moduleDrafts.llm, ["ark"]),
    [moduleDrafts.llm],
  );
  const openclawProviderOptions = useMemo(() => {
    const options = new Set<string>();
    Object.keys(openclawProviders).forEach((id) => options.add(id));
    openclawProviderPresets.forEach((preset) => {
      options.add(preset.providerId);
    });
    if (openclawForm.providerId.trim()) {
      options.add(openclawForm.providerId.trim());
    }
    return Array.from(options);
  }, [openclawForm.providerId, openclawProviders]);
  const canSkipOpenClawSetup = useMemo(
    () => hasInstalledOpenClaw && hasReusableOpenClawConfig(openclawDefaultPrimary, openclawProviders),
    [hasInstalledOpenClaw, openclawDefaultPrimary, openclawProviders],
  );
  const openclawProgressSteps = useMemo(
    () => getOpenClawProgressSteps(openclawLogs),
    [openclawLogs],
  );

  const syncModuleDraft = (module: OnboardingServerModule, config: Record<string, unknown>) => {
    setModuleDrafts((previous) => ({
      ...previous,
      [module]: cloneConfig(config),
    }));
  };

  const saveDialogueMode = async (provider: "llm" | "openclaw") => {
    const nextDialogue = cloneConfig(moduleDrafts.dialogue);
    setPath(nextDialogue, ["provider"], provider);
    if (provider === "openclaw") {
      setPath(nextDialogue, ["providers", "openclaw", "basic", "backend"], openclawForm.backend.trim() || "tmux");
      setPath(nextDialogue, ["providers", "openclaw", "basic", "agent"], openclawForm.agent.trim() || "main");
      setPath(nextDialogue, ["providers", "openclaw", "advanced", "poll_interval"], toNumber(openclawForm.pollInterval, 3));
      setPath(
        nextDialogue,
        ["providers", "openclaw", "advanced", "log_poll_interval"],
        toNumber(openclawForm.logPollInterval, 1),
      );
    }

    const report = await saveModule("dialogue", nextDialogue);
    syncModuleDraft("dialogue", report.config);
    dirtyRef.current.dialogue = false;
    return report.config;
  };

  const buildAsrConfig = () => {
    const next = cloneConfig(moduleDrafts.asr);
    setPath(next, ["provider"], asrForm.provider);
    if (asrForm.provider === "deepgram") {
      setPath(next, ["providers", "deepgram", "basic", "api_key"], asrForm.deepgramApiKey.trim());
      setPath(next, ["providers", "deepgram", "advanced", "model"], asrForm.deepgramModel.trim() || "nova-2");
      setPath(
        next,
        ["providers", "deepgram", "advanced", "listen_url"],
        asrForm.deepgramListenUrl.trim() || "https://api.deepgram.com/v1/listen",
      );
      setPath(
        next,
        ["providers", "deepgram", "advanced", "live_url"],
        asrForm.deepgramLiveUrl.trim() || "wss://api.deepgram.com/v1/listen",
      );
    } else {
      setPath(next, ["providers", "aliyun", "basic", "appkey"], asrForm.aliyunAppKey.trim());
      setPath(next, ["providers", "aliyun", "basic", "ak_id"], asrForm.aliyunAkId.trim());
      setPath(next, ["providers", "aliyun", "basic", "ak_secret"], asrForm.aliyunAkSecret.trim());
      setPath(next, ["providers", "aliyun", "basic", "token"], asrForm.aliyunToken.trim());
      setPath(
        next,
        ["providers", "aliyun", "advanced", "url"],
        asrForm.aliyunUrl.trim() || "wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1",
      );
    }
    return next;
  };

  const buildTtsConfig = () => {
    const next = cloneConfig(moduleDrafts.tts);
    setPath(next, ["provider"], ttsForm.provider);
    if (ttsForm.provider === "deepgram") {
      setPath(next, ["providers", "deepgram", "basic", "api_key"], ttsForm.deepgramApiKey.trim());
      setPath(
        next,
        ["providers", "deepgram", "basic", "model"],
        ttsForm.deepgramModel.trim() || "aura-2-thalia-en",
      );
      setPath(
        next,
        ["providers", "deepgram", "advanced", "speak_url"],
        ttsForm.deepgramSpeakUrl.trim() || "https://api.deepgram.com/v1/speak",
      );
    } else {
      setPath(next, ["providers", "huoshan", "basic", "app_key"], ttsForm.huoshanAppKey.trim());
      setPath(next, ["providers", "huoshan", "basic", "access_key"], ttsForm.huoshanAccessKey.trim());
      setPath(
        next,
        ["providers", "huoshan", "basic", "voice_type"],
        ttsForm.huoshanVoiceType.trim() || "ICL_zh_male_nuanxintitie_tob",
      );
      setPath(
        next,
        ["providers", "huoshan", "advanced", "api_url"],
        ttsForm.huoshanApiUrl.trim() || "wss://openspeech.bytedance.com/api/v1/tts/ws_binary",
      );
    }
    return next;
  };

  const buildLlmConfig = () => {
    const provider = llmForm.provider.trim() || "ark";
    const next = cloneConfig(moduleDrafts.llm);
    setPath(next, ["provider"], provider);
    setPath(next, ["providers", provider, "basic", "api_key"], llmForm.apiKey.trim());
    setPath(next, ["providers", provider, "basic", "model"], llmForm.model.trim());
    setPath(next, ["providers", provider, "advanced", "base_url"], llmForm.baseUrl.trim());
    setPath(next, ["common", "basic", "temperature"], toNumber(llmForm.temperature, 0.7));
    return next;
  };

  const enterMode = (mode: SetupMode) => {
    setSetupMode(mode);
    setActiveFormTab("basic");
    setActiveCard("asr-init");
  };

  const handleJumpStep = (step: 0 | 1 | 2) => {
    if (busy || cardStep === null || step > cardStep) {
      return;
    }
    if (step === 0) {
      setActiveCard("asr-init");
      return;
    }
    if (step === 1) {
      setActiveCard("tts-init");
      return;
    }
    setActiveCard("brain-select");
  };

  const openAsrProvider = (provider: string) => {
    dirtyRef.current.asr = true;
    setAsrForm((previous) => ({
      ...previous,
      provider: toAsrProvider(provider),
    }));
    setActiveFormTab("basic");
    setActiveCard("asr-manual");
  };

  const openTtsProvider = (provider: string) => {
    dirtyRef.current.tts = true;
    setTtsForm((previous) => ({
      ...previous,
      provider: toTtsProvider(provider),
    }));
    setActiveFormTab("basic");
    setActiveCard("tts-manual");
  };

  const openLlmForm = () => {
    setActiveFormTab("basic");
    setActiveCard("llm-manual");
  };

  const runOpenClawInstallation = async () => {
    setOpenclawLogs([]);
    setShowOpenclawLogs(false);
    setOpenclawInstallError("");
    setOpenclawInstallState("installing");

    try {
      await startInstallation();
      toast.info("安装流程已启动");
    } catch (error) {
      setOpenclawInstallState("error");
      setOpenclawInstallError(String(error));
      toast.error("无法启动安装流程", {
        description: String(error),
      });
    }
  };

  const skipOpenClawGate = () => {
    if (openclawGateReturnTo === "dialogue") {
      setActiveCard("brain-select");
      return;
    }
    setOpenclawGateReturnTo("setup-home");
    setActiveCard("setup-home");
  };

  const proceedToOpenClawForm = async () => {
    if (canSkipOpenClawSetup) {
      setSavingKey("openclaw");
      const timer = startDebugTimer("InitializationPage", "skip OpenClaw manual configuration", {
        providerId: openclawForm.providerId.trim(),
        socketState,
      });
      try {
        await saveDialogueMode("openclaw");
        timer.success("skip OpenClaw manual configuration completed");
        toast.success("检测到 OpenClaw 大模型已配置，已跳过手动输入");
        setActiveCard("success");
      } catch (error) {
        timer.fail(error, "skip OpenClaw manual configuration failed");
        toast.error("切换到 OpenClaw 失败", {
          description: String(error),
        });
      } finally {
        setSavingKey(null);
      }
      return;
    }

    setActiveFormTab("basic");
    setActiveCard("openclaw-manual");
  };

  const continueOpenClawGate = async () => {
    if (openclawGateReturnTo === "dialogue") {
      await proceedToOpenClawForm();
      return;
    }
    setOpenclawGateReturnTo("setup-home");
    setActiveCard("setup-home");
  };

  const openOpenClawForm = async () => {
    if (!hasInstalledOpenClaw) {
      setOpenclawGateReturnTo("dialogue");
      setActiveCard("openclaw-gate");
      toast.info("请先完成 OpenClaw 安装，或返回选择其他对话方式");
      return;
    }

    await proceedToOpenClawForm();
  };

  const saveAsrManual = async () => {
    setSavingKey("asr");
    const config = buildAsrConfig();
    const timer = startDebugTimer("InitializationPage", "confirm ASR configuration", {
      provider: asrForm.provider,
      socketState,
      configKeys: Object.keys(config),
    });
    try {
      const report = await saveModule("asr", config);
      syncModuleDraft("asr", report.config);
      dirtyRef.current.asr = false;
      timer.success("confirm ASR configuration completed");
      toast.success("ASR 配置已保存");
      setActiveCard("tts-init");
      setActiveFormTab("basic");
    } catch (error) {
      timer.fail(error, "confirm ASR configuration failed");
      toast.error("保存 ASR 失败", {
        description: String(error),
      });
    } finally {
      setSavingKey(null);
    }
  };

  const saveTtsManual = async () => {
    setSavingKey("tts");
    const config = buildTtsConfig();
    const timer = startDebugTimer("InitializationPage", "confirm TTS configuration", {
      provider: ttsForm.provider,
      socketState,
      configKeys: Object.keys(config),
    });
    try {
      const report = await saveModule("tts", config);
      syncModuleDraft("tts", report.config);
      dirtyRef.current.tts = false;
      timer.success("confirm TTS configuration completed");
      toast.success("TTS 配置已保存");
      setActiveCard("brain-select");
      setActiveFormTab("basic");
    } catch (error) {
      timer.fail(error, "confirm TTS configuration failed");
      toast.error("保存 TTS 失败", {
        description: String(error),
      });
    } finally {
      setSavingKey(null);
    }
  };

  const saveLlmManual = async () => {
    setSavingKey("llm");
    const config = buildLlmConfig();
    const timer = startDebugTimer("InitializationPage", "confirm LLM configuration", {
      provider: llmForm.provider,
      socketState,
      configKeys: Object.keys(config),
    });
    try {
      const llmReport = await saveModule("llm", config);
      syncModuleDraft("llm", llmReport.config);
      dirtyRef.current.llm = false;
      await saveDialogueMode("llm");
      timer.success("confirm LLM configuration completed");
      toast.success("LLM 配置已完成");
      setActiveCard("success");
    } catch (error) {
      timer.fail(error, "confirm LLM configuration failed");
      toast.error("保存 LLM 失败", {
        description: String(error),
      });
    } finally {
      setSavingKey(null);
    }
  };

  const saveOpenClawManual = async () => {
    const providerId = openclawForm.providerId.trim();
    const baseUrl = openclawForm.baseUrl.trim();
    const apiKey = openclawForm.apiKey.trim();
    const modelId = openclawForm.modelId.trim();

    if (!providerId || !baseUrl || !apiKey || !modelId) {
      toast.error("请完整填写 OpenClaw 配置");
      return;
    }

    setSavingKey("openclaw");
    const timer = startDebugTimer("InitializationPage", "confirm OpenClaw configuration", {
      providerId,
      socketState,
      backend: openclawForm.backend,
      agent: openclawForm.agent,
    });
    try {
      const providerConfig: OpenClawProviderConfig = {
        api: openclawForm.api.trim() || DEFAULT_OPENCLAW_API,
        baseUrl,
        apiKey,
        models: [{ id: modelId, name: modelId }],
      };
      await modelConfigApi.setProvider(providerId, providerConfig);
      await modelConfigApi.setDefaultModel({
        primary: `${providerId}/${modelId}`,
        fallbacks: [],
      });
      setOpenclawDefaultPrimary(`${providerId}/${modelId}`);
      await saveDialogueMode("openclaw");
      setOpenclawProviders((previous) => ({
        ...previous,
        [providerId]: providerConfig,
      }));
      dirtyRef.current.openclawProvider = false;
      timer.success("confirm OpenClaw configuration completed");
      toast.success("OpenClaw 配置已完成");
      setActiveCard("success");
    } catch (error) {
      timer.fail(error, "confirm OpenClaw configuration failed");
      toast.error("保存 OpenClaw 失败", {
        description: String(error),
      });
    } finally {
      setSavingKey(null);
    }
  };

  const chooseOpenClawProvider = (providerId: string) => {
    const presetConfig =
      openclawProviderPresets.find((preset) => preset.providerId === providerId)?.settingsConfig ?? null;
    const providerConfig = openclawProviders[providerId] ?? presetConfig;
    const normalized = normalizeOpenClawProvider(providerConfig);
    dirtyRef.current.openclawProvider = true;
    setOpenclawForm((previous) => ({
      ...previous,
      providerId,
      api: normalized.api,
      baseUrl: normalized.baseUrl,
      apiKey: normalized.apiKey,
      modelId: normalized.modelId || previous.modelId || DEFAULT_OPENCLAW_MODEL,
    }));
  };

  const asrRows = asrProviderOptions.map<OptionRow>((provider) => {
    const normalized = toAsrProvider(provider);
    const copy = ASR_COPY[normalized];
    return {
      id: provider,
      label: copy.label,
      description: copy.description,
      badge: normalized === "aliyun" ? "aliyun" : "deepgram",
      trailing: "metric",
      onClick: () => openAsrProvider(provider),
    };
  });

  const ttsRows = ttsProviderOptions.map<OptionRow>((provider) => {
    const normalized = toTtsProvider(provider);
    const copy = TTS_COPY[normalized];
    return {
      id: provider,
      label: copy.label,
      description: copy.description,
      badge: normalized === "huoshan" ? "huoshan" : "deepgram",
      trailing: "metric",
      onClick: () => openTtsProvider(provider),
    };
  });

  const dialogueRows: OptionRow[] = [
    {
      id: "openclaw",
      label: "Claw",
      description: getOpenClawProviderDisplayName(openclawForm.providerId),
      badge: "openclaw",
      trailing: "none",
      onClick: () => void openOpenClawForm(),
    },
    {
      id: "llm",
      label: "LLM",
      description: prettifyProvider(llmForm.provider),
      badge: "llm",
      trailing: "none",
      onClick: openLlmForm,
    },
  ];

  const asrBasicFields: FieldConfig[] = [
    {
      label: "Provider",
      value: asrForm.provider,
      options: asrProviderOptions.map((provider) => ({
        label: ASR_COPY[toAsrProvider(provider)].label,
        value: provider,
      })),
      onChange: (value) => {
        dirtyRef.current.asr = true;
        setAsrForm((previous) => ({
          ...previous,
          provider: toAsrProvider(value),
        }));
      },
    },
    ...(asrForm.provider === "deepgram"
      ? [
          {
            label: "API Key",
            value: asrForm.deepgramApiKey,
            secret: true,
            onChange: (value: string) => {
              dirtyRef.current.asr = true;
              setAsrForm((previous) => ({ ...previous, deepgramApiKey: value }));
            },
          },
        ]
      : [
          {
            label: "App Key",
            value: asrForm.aliyunAppKey,
            onChange: (value: string) => {
              dirtyRef.current.asr = true;
              setAsrForm((previous) => ({ ...previous, aliyunAppKey: value }));
            },
          },
          {
            label: "AK ID",
            value: asrForm.aliyunAkId,
            onChange: (value: string) => {
              dirtyRef.current.asr = true;
              setAsrForm((previous) => ({ ...previous, aliyunAkId: value }));
            },
          },
          {
            label: "AK Secret",
            value: asrForm.aliyunAkSecret,
            secret: true,
            onChange: (value: string) => {
              dirtyRef.current.asr = true;
              setAsrForm((previous) => ({ ...previous, aliyunAkSecret: value }));
            },
          },
          {
            label: "Token",
            value: asrForm.aliyunToken,
            onChange: (value: string) => {
              dirtyRef.current.asr = true;
              setAsrForm((previous) => ({ ...previous, aliyunToken: value }));
            },
          },
        ]),
  ];

  const asrAdvancedFields: FieldConfig[] =
    asrForm.provider === "deepgram"
      ? [
          {
            label: "Model",
            value: asrForm.deepgramModel,
            onChange: (value) => {
              dirtyRef.current.asr = true;
              setAsrForm((previous) => ({ ...previous, deepgramModel: value }));
            },
          },
          {
            label: "Listen URL",
            value: asrForm.deepgramListenUrl,
            onChange: (value) => {
              dirtyRef.current.asr = true;
              setAsrForm((previous) => ({ ...previous, deepgramListenUrl: value }));
            },
          },
          {
            label: "Live URL",
            value: asrForm.deepgramLiveUrl,
            onChange: (value) => {
              dirtyRef.current.asr = true;
              setAsrForm((previous) => ({ ...previous, deepgramLiveUrl: value }));
            },
          },
        ]
      : [
          {
            label: "ASR URL",
            value: asrForm.aliyunUrl,
            onChange: (value) => {
              dirtyRef.current.asr = true;
              setAsrForm((previous) => ({ ...previous, aliyunUrl: value }));
            },
          },
        ];

  const ttsBasicFields: FieldConfig[] = [
    {
      label: "Provider",
      value: ttsForm.provider,
      options: ttsProviderOptions.map((provider) => ({
        label: TTS_COPY[toTtsProvider(provider)].label,
        value: provider,
      })),
      onChange: (value) => {
        dirtyRef.current.tts = true;
        setTtsForm((previous) => ({
          ...previous,
          provider: toTtsProvider(value),
        }));
      },
    },
    ...(ttsForm.provider === "deepgram"
      ? [
          {
            label: "API Key",
            value: ttsForm.deepgramApiKey,
            secret: true,
            onChange: (value: string) => {
              dirtyRef.current.tts = true;
              setTtsForm((previous) => ({ ...previous, deepgramApiKey: value }));
            },
          },
          {
            label: "Model",
            value: ttsForm.deepgramModel,
            onChange: (value: string) => {
              dirtyRef.current.tts = true;
              setTtsForm((previous) => ({ ...previous, deepgramModel: value }));
            },
          },
        ]
      : [
          {
            label: "App Key",
            value: ttsForm.huoshanAppKey,
            onChange: (value: string) => {
              dirtyRef.current.tts = true;
              setTtsForm((previous) => ({ ...previous, huoshanAppKey: value }));
            },
          },
          {
            label: "Access Key",
            value: ttsForm.huoshanAccessKey,
            secret: true,
            onChange: (value: string) => {
              dirtyRef.current.tts = true;
              setTtsForm((previous) => ({ ...previous, huoshanAccessKey: value }));
            },
          },
          {
            label: "Voice Type",
            value: ttsForm.huoshanVoiceType,
            onChange: (value: string) => {
              dirtyRef.current.tts = true;
              setTtsForm((previous) => ({ ...previous, huoshanVoiceType: value }));
            },
          },
        ]),
  ];

  const ttsAdvancedFields: FieldConfig[] =
    ttsForm.provider === "deepgram"
      ? [
          {
            label: "Speak URL",
            value: ttsForm.deepgramSpeakUrl,
            onChange: (value) => {
              dirtyRef.current.tts = true;
              setTtsForm((previous) => ({ ...previous, deepgramSpeakUrl: value }));
            },
          },
        ]
      : [
          {
            label: "API URL",
            value: ttsForm.huoshanApiUrl,
            onChange: (value) => {
              dirtyRef.current.tts = true;
              setTtsForm((previous) => ({ ...previous, huoshanApiUrl: value }));
            },
          },
        ];

  const llmBasicFields: FieldConfig[] = [
    {
      label: "Provider",
      value: llmForm.provider,
      options: llmProviderOptions.map((provider) => ({
        label: prettifyProvider(provider),
        value: provider,
      })),
      onChange: (value) => {
        dirtyRef.current.llm = true;
        setLlmForm((previous) => ({ ...previous, provider: value }));
      },
    },
    {
      label: "API Key",
      value: llmForm.apiKey,
      secret: true,
      onChange: (value) => {
        dirtyRef.current.llm = true;
        setLlmForm((previous) => ({ ...previous, apiKey: value }));
      },
    },
    {
      label: "Model",
      value: llmForm.model,
      onChange: (value) => {
        dirtyRef.current.llm = true;
        setLlmForm((previous) => ({ ...previous, model: value }));
      },
    },
  ];

  const llmAdvancedFields: FieldConfig[] = [
    {
      label: "Base URL",
      value: llmForm.baseUrl,
      onChange: (value) => {
        dirtyRef.current.llm = true;
        setLlmForm((previous) => ({ ...previous, baseUrl: value }));
      },
    },
    {
      label: "Temperature",
      value: llmForm.temperature,
      onChange: (value) => {
        dirtyRef.current.llm = true;
        setLlmForm((previous) => ({ ...previous, temperature: value }));
      },
    },
  ];

  const openclawBasicFields: FieldConfig[] = [
    {
      label: "Provider",
      value: openclawForm.providerId,
      options: openclawProviderOptions.map((providerId) => ({
        label: getOpenClawProviderDisplayName(providerId),
        value: providerId,
      })),
      onChange: chooseOpenClawProvider,
    },
    {
      label: "Provider ID",
      value: openclawForm.providerId,
      onChange: (value) => {
        dirtyRef.current.openclawProvider = true;
        setOpenclawForm((previous) => ({ ...previous, providerId: value }));
      },
    },
    {
      label: "API Type",
      value: openclawForm.api,
      onChange: (value) => {
        dirtyRef.current.openclawProvider = true;
        setOpenclawForm((previous) => ({ ...previous, api: value }));
      },
    },
    {
      label: "Model ID",
      value: openclawForm.modelId,
      onChange: (value) => {
        dirtyRef.current.openclawProvider = true;
        setOpenclawForm((previous) => ({ ...previous, modelId: value }));
      },
    },
  ];

  const openclawAdvancedFields: FieldConfig[] = [
    {
      label: "Base URL",
      value: openclawForm.baseUrl,
      onChange: (value) => {
        dirtyRef.current.openclawProvider = true;
        setOpenclawForm((previous) => ({ ...previous, baseUrl: value }));
      },
    },
    {
      label: "API Key",
      value: openclawForm.apiKey,
      secret: true,
      onChange: (value) => {
        dirtyRef.current.openclawProvider = true;
        setOpenclawForm((previous) => ({ ...previous, apiKey: value }));
      },
    },
    {
      label: "Backend",
      value: openclawForm.backend,
      onChange: (value) => {
        dirtyRef.current.dialogue = true;
        setOpenclawForm((previous) => ({ ...previous, backend: value }));
      },
    },
    {
      label: "Agent",
      value: openclawForm.agent,
      onChange: (value) => {
        dirtyRef.current.dialogue = true;
        setOpenclawForm((previous) => ({ ...previous, agent: value }));
      },
    },
    {
      label: "Poll Interval",
      value: openclawForm.pollInterval,
      onChange: (value) => {
        dirtyRef.current.dialogue = true;
        setOpenclawForm((previous) => ({ ...previous, pollInterval: value }));
      },
    },
    {
      label: "Log Poll Interval",
      value: openclawForm.logPollInterval,
      onChange: (value) => {
        dirtyRef.current.dialogue = true;
        setOpenclawForm((previous) => ({ ...previous, logPollInterval: value }));
      },
    },
  ];

  const renderStepper = () => {
    const items = [
      { id: "asr", label: "ASR", step: 0 as const },
      { id: "tts", label: "TTS", step: 1 as const },
      { id: "brain", label: "LLM/OpenClaw", step: 2 as const },
    ];

    return (
      <div className="init-flow__steps" role="navigation" aria-label="初始化阶段">
        {items.map((item, index) => {
          const done = cardStep !== null && cardStep > item.step;
          const active = cardStep === item.step;
          const disabled = busy || cardStep === null || item.step > cardStep;

          return (
            <div key={item.id} className="init-flow__steps-item">
              <button
                type="button"
                className={`init-flow__steps-label${active ? " is-active" : ""}${done ? " is-done" : ""}`}
                disabled={disabled}
                onClick={() => handleJumpStep(item.step)}
              >
                {item.label}
              </button>
              {index < items.length - 1 ? (
                <span className={`init-flow__steps-line${done ? " is-done" : ""}`} />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const renderStageHeader = () => (
    <div className="init-flow__stage-header">
      {renderStepper()}
    </div>
  );

  const renderPanelHead = (label: string, onBack: () => void) => (
    <div className="init-flow__panel-head">
      <div className="init-flow__panel-head-copy">
        <button type="button" className="init-flow__panel-back" disabled={busy} onClick={onBack}>
          <ArrowLeft size={12} />
          Back
        </button>
        <span className="init-flow__panel-head-divider" aria-hidden="true" />
        <span className="init-flow__panel-head-label">{label}</span>
      </div>
      <div className="init-flow__mode">{modeLabel}</div>
    </div>
  );

  const renderOptionList = (
    title: string,
    subtitle: string,
    options: OptionRow[],
    panelHead?: {
      label: string;
      onBack: () => void;
    },
  ) => (
    <div className="init-flow__panel init-flow__panel--list">
      {panelHead ? renderPanelHead(panelHead.label, panelHead.onBack) : null}

      <div className={`init-flow__panel-body init-flow__panel-body--list${panelHead ? " has-head" : ""}`}>
        {!panelHead ? <div className="init-flow__mode init-flow__mode--floating">{modeLabel}</div> : null}

        <div className="init-flow__hero">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <div className="init-flow__option-list">
          {options.map((option) => (
            <button key={option.id} type="button" className="init-flow__option" disabled={busy} onClick={option.onClick}>
              <span className="init-flow__option-main">
                <ProviderBadge kind={option.badge} />
                <span className="init-flow__option-copy">
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </span>
              </span>
              <span className="init-flow__option-meta" aria-hidden="true">
                {option.trailing === "metric" ? <BarChart3 size={18} /> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderFormPanel = (
    providerLabel: string,
    fields: FieldConfig[],
    onBack: () => void,
    onSave: () => void,
    saveLabel: string,
    busyKey: OnboardingServerModule | "openclaw",
  ) => (
    <div className="init-flow__panel init-flow__panel--form">
      {renderPanelHead(providerLabel, onBack)}

      <div className="init-flow__panel-body init-flow__panel-body--form">
        <div className="init-flow__tabs">
          <button
            type="button"
            className={`init-flow__tab${activeFormTab === "basic" ? " is-active" : ""}`}
            onClick={() => setActiveFormTab("basic")}
          >
            Basic settings
          </button>
          <button
            type="button"
            className={`init-flow__tab${activeFormTab === "advanced" ? " is-active" : ""}`}
            onClick={() => setActiveFormTab("advanced")}
          >
            Advanced settings
          </button>
        </div>

        <div className="init-flow__form-grid">
          {fields.map((field) => (
            <Field key={`${providerLabel}-${field.label}`} field={field} />
          ))}
        </div>

        <div className="init-flow__form-actions">
          <button
            type="button"
            className="init-flow__confirm"
            disabled={busy || (busyKey === "openclaw" && loadingOpenClaw)}
            onClick={onSave}
          >
            {savingKey === busyKey ? <LoaderCircle size={14} className="spin" /> : null}
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );

  const renderOpenClawGate = () => {
    const isChecking = openclawInstallState === "checking";
    const isInstalling = openclawInstallState === "installing";
    const isReady = hasInstalledOpenClaw;
    const showLogs = showOpenclawLogs || Boolean(openclawInstallError);

    const refreshLabel =
      openclawInstallState === "error"
        ? "重新检测"
        : isInstalling
          ? "安装中"
          : isChecking
            ? "检测中"
            : "重新检测";

    return (
      <div className="init-flow__openclaw">
        <div className="init-flow__home-copy">
          <h1>OpenClaw</h1>
        </div>

        <div className="init-flow__openclaw-card">
          <div className="init-flow__openclaw-card-head">
            <div className="init-flow__openclaw-copy">
              <span className="init-flow__openclaw-eyebrow">
                {isInstalling
                  ? "Installation progress"
                  : isReady
                    ? "Environment check"
                    : isChecking
                      ? "Checking environment"
                      : "Environment check"}
              </span>
              <h2>
                {isInstalling
                  ? "Installing OpenClaw"
                  : isReady
                    ? "OpenClaw ready"
                    : isChecking
                      ? "Checking OpenClaw"
                      : "OpenClaw 未安装"}
              </h2>
            </div>

            <button
              type="button"
              className="init-flow__openclaw-refresh"
              aria-label={refreshLabel}
              title={refreshLabel}
              disabled={isInstalling}
              onClick={() => void refreshOpenClawEnvironment().catch((error) => {
                setOpenclawInstallState("error");
                setOpenclawInstallError(String(error));
              })}
            >
              {isChecking ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
            </button>
          </div>

          {isInstalling ? (
            <>
              <div className="init-flow__openclaw-progress" role="list" aria-label="安装进度">
                {openclawProgressSteps.map((step, index) => (
                  <div key={step.id} className="init-flow__openclaw-progress-item" role="listitem">
                    <div className="init-flow__openclaw-progress-step">
                      <span
                        className={`init-flow__openclaw-progress-dot${step.status === "active" ? " is-active" : ""}${step.status === "completed" ? " is-completed" : ""}`}
                      >
                        {index + 1}
                      </span>
                      <span className="init-flow__openclaw-progress-label">{step.label}</span>
                    </div>
                    {index < openclawProgressSteps.length - 1 ? (
                      <span
                        className={`init-flow__openclaw-progress-line${step.status === "completed" ? " is-completed" : ""}`}
                      />
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="init-flow__openclaw-status-list" role="list">
                {openclawProgressSteps.map((step) => (
                  <div key={`${step.id}-row`} className="init-flow__openclaw-status-row" role="listitem">
                    <span className="init-flow__openclaw-status-label">{step.rowLabel}</span>
                    <span
                      className={`init-flow__openclaw-status-value${step.status === "active" ? " is-active" : ""}${step.status === "completed" ? " is-completed" : ""}`}
                    >
                      {getOpenClawProgressStatusText(step.status)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="init-flow__openclaw-actions">
                <button type="button" className="init-flow__confirm init-flow__confirm--dark" disabled>
                  Installing
                </button>
                <button
                  type="button"
                  className="init-flow__openclaw-secondary"
                  onClick={() => setShowOpenclawLogs((previous) => !previous)}
                >
                  {showLogs ? "Hide logs" : "Logs"}
                </button>
              </div>
            </>
          ) : (
            <div className="init-flow__openclaw-actions">
              {isReady ? (
                <button
                  type="button"
                  className="init-flow__confirm"
                  disabled={busy || loadingOpenClaw}
                  onClick={() => void continueOpenClawGate()}
                >
                  Continue
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="init-flow__confirm"
                    disabled={isChecking}
                    onClick={() => void runOpenClawInstallation()}
                  >
                    Install OpenClaw
                  </button>
                  <button
                    type="button"
                    className="init-flow__openclaw-secondary"
                    disabled={isChecking}
                    onClick={skipOpenClawGate}
                  >
                    Skip for now
                  </button>
                </>
              )}
            </div>
          )}

          {openclawInstallError ? (
            <p className="init-flow__openclaw-note init-flow__openclaw-note--error">
              {openclawInstallError}
            </p>
          ) : null}

          {showLogs ? (
            <div className="init-flow__openclaw-log">
              {openclawLogs.length === 0 ? (
                <span>等待安装日志...</span>
              ) : (
                openclawLogs.map((line, index) => <code key={`${index}-${line}`}>{line}</code>)
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderHome = () => (
    <div className="init-flow__home">
      <div className="init-flow__home-copy">
        <h1>Setup</h1>
      </div>

      <div className="init-flow__home-grid">
        <button type="button" className="init-flow__home-card" onClick={() => enterMode("automatic")}>
          <span className="init-flow__home-arrow">
            <ArrowRight size={24} />
          </span>
          <span className="init-flow__home-card-copy">
            <strong>Automatic configuration</strong>
            <p>Log in to your account, and we will provide some free credits to help you get started quickly.</p>
          </span>
        </button>

        <button type="button" className="init-flow__home-card" onClick={() => enterMode("manual")}>
          <span className="init-flow__home-arrow">
            <ArrowRight size={24} />
          </span>
          <span className="init-flow__home-card-copy">
            <strong>Manual configuration</strong>
            <p>We support you in choosing service providers according to your own preferences.</p>
          </span>
        </button>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="init-flow__panel init-flow__panel--success">
      <div className="init-flow__success-figure" aria-hidden="true">
        <span className="init-flow__success-ring" />
        <span className="init-flow__success-core">
          <Check size={44} />
        </span>
        <span className="init-flow__success-dot init-flow__success-dot--one" />
        <span className="init-flow__success-dot init-flow__success-dot--two" />
        <span className="init-flow__success-dot init-flow__success-dot--three" />
      </div>

      <h1>Configuration successful</h1>

      <button type="button" className="init-flow__confirm init-flow__confirm--wide" onClick={onComplete}>
        Start using
      </button>
    </div>
  );

  const renderBody = () => {
    switch (activeCard) {
      case "openclaw-gate":
        return renderOpenClawGate();
      case "setup-home":
        return renderHome();
      case "asr-init":
        return renderOptionList("ASR", "Speech-to-text model", asrRows);
      case "asr-manual":
        return renderFormPanel(
          ASR_COPY[asrForm.provider].label,
          activeFormTab === "basic" ? asrBasicFields : asrAdvancedFields,
          () => setActiveCard("asr-init"),
          () => void saveAsrManual(),
          "Confirm",
          "asr",
        );
      case "tts-init":
        return renderOptionList("TTS", "Text-to-speech model", ttsRows, {
          label: ASR_COPY[asrForm.provider].label,
          onBack: () => setActiveCard("asr-init"),
        });
      case "tts-manual":
        return renderFormPanel(
          TTS_COPY[ttsForm.provider].label,
          activeFormTab === "basic" ? ttsBasicFields : ttsAdvancedFields,
          () => setActiveCard("tts-init"),
          () => void saveTtsManual(),
          "Confirm",
          "tts",
        );
      case "brain-select":
        return renderOptionList("Dialogue", "Select Model Service", dialogueRows, {
          label: TTS_COPY[ttsForm.provider].label,
          onBack: () => setActiveCard("tts-init"),
        });
      case "llm-manual":
        return renderFormPanel(
          prettifyProvider(llmForm.provider),
          activeFormTab === "basic" ? llmBasicFields : llmAdvancedFields,
          () => setActiveCard("brain-select"),
          () => void saveLlmManual(),
          "Confirm",
          "llm",
        );
      case "openclaw-manual":
        return renderFormPanel(
          getOpenClawProviderDisplayName(openclawForm.providerId),
          activeFormTab === "basic" ? openclawBasicFields : openclawAdvancedFields,
          () => setActiveCard("brain-select"),
          () => void saveOpenClawManual(),
          loadingOpenClaw ? "Loading..." : "Confirm",
          "openclaw",
        );
      case "success":
        return renderSuccess();
      default:
        return null;
    }
  };

  const isStandaloneCard = activeCard === "openclaw-gate" || activeCard === "setup-home";

  return (
    <div className="onboarding-page onboarding-page--setup">
      <section className="init-flow">
        <header className="init-flow__topbar">
          <img className="init-flow__logo" src={startLogo} alt="ORULINK" />
          <button type="button" className="init-flow__topbar-button" aria-label="帮助">
            <BadgeHelp size={14} />
          </button>
        </header>

        {isStandaloneCard ? (
          renderBody()
        ) : (
          <div className="init-flow__stage">
            {renderStageHeader()}
            {renderBody()}
          </div>
        )}
      </section>
    </div>
  );
}
