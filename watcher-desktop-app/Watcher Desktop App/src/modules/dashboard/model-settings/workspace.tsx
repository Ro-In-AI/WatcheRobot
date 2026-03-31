import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import StatusBadge from "@/shared/ui/StatusBadge";
import { useWatcherConfigSession } from "@/hooks/useWatcherConfigSession";
import type { OnboardingServerModule } from "@/shared/types/runtime";
import { cn } from "@/shared/lib/cn";

type ModelSection = "asr" | "tts" | "llm";
type AsrProvider = "aliyun" | "deepgram";
type TtsProvider = "huoshan" | "deepgram";
type DialogueMode = "llm" | "openclaw";
type ConfigRecord = Record<string, unknown>;

interface ModelSettingsWorkspaceProps {
  wsUrl?: string;
}

interface AsrFormState {
  provider: AsrProvider;
  aliyunAppKey: string;
  aliyunAkId: string;
  aliyunAkSecret: string;
  deepgramApiKey: string;
}

interface TtsFormState {
  provider: TtsProvider;
  huoshanApiKey: string;
  huoshanAccessKey: string;
  huoshanVoiceType: string;
  deepgramApiKey: string;
}

interface LlmFormState {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface FieldDefinition {
  key: string;
  label: string;
  value: string;
  placeholder: string;
  secret?: boolean;
  onChange: (value: string) => void;
}

interface OverviewCardDefinition {
  section: ModelSection;
  title: string;
  selection: string;
  ready: boolean;
}

const DEFAULT_ASR: ConfigRecord = {
  provider: "aliyun",
  common: { basic: {}, advanced: {} },
  providers: {
    aliyun: { label: "Aliyun", basic: { appkey: "", ak_id: "", ak_secret: "", token: "" }, advanced: {} },
    deepgram: { label: "Deepgram", basic: { api_key: "" }, advanced: {} },
  },
};

const DEFAULT_TTS: ConfigRecord = {
  provider: "huoshan",
  common: { basic: {}, advanced: {} },
  providers: {
    huoshan: { label: "Huoshan", basic: { app_key: "", access_key: "", voice_type: "" }, advanced: {} },
    deepgram: { label: "Deepgram", basic: { api_key: "" }, advanced: {} },
  },
};

const DEFAULT_LLM: ConfigRecord = {
  provider: "ark",
  common: { basic: {}, advanced: {} },
  providers: {
    ark: { label: "Ark", basic: { api_key: "", model: "" }, advanced: { base_url: "" } },
  },
};

const DEFAULT_DIALOGUE: ConfigRecord = {
  provider: "llm",
  common: { basic: {}, advanced: {} },
  providers: {
    openclaw: { label: "OpenClaw", basic: { backend: "tmux" }, advanced: {} },
  },
};

function cloneConfig<T extends ConfigRecord>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is ConfigRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPath(root: ConfigRecord, path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function readString(root: ConfigRecord, path: string[], fallback = ""): string {
  const value = readPath(root, path);
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return fallback;
}

function setPath(root: ConfigRecord, path: string[], value: unknown) {
  let cursor: ConfigRecord = root;
  path.forEach((key, index) => {
    const isLast = index === path.length - 1;
    if (isLast) {
      cursor[key] = value;
      return;
    }

    const next = cursor[key];
    if (!isRecord(next)) {
      const branch: ConfigRecord = {};
      cursor[key] = branch;
      cursor = branch;
      return;
    }

    cursor = next;
  });
}

function toAsrProvider(value: string): AsrProvider {
  return value === "deepgram" ? "deepgram" : "aliyun";
}

function toTtsProvider(value: string): TtsProvider {
  return value === "deepgram" ? "deepgram" : "huoshan";
}

function toDialogueMode(value: string): DialogueMode {
  return value === "openclaw" ? "openclaw" : "llm";
}

function formatAsrProviderLabel(provider: AsrProvider) {
  return provider === "deepgram" ? "Deepgram" : "Aliyun";
}

function formatTtsProviderLabel(provider: TtsProvider) {
  return provider === "deepgram" ? "Deepgram" : "Huoshan";
}

function formatDialogueModeLabel(mode: DialogueMode) {
  return mode === "openclaw" ? "OpenClaw" : "LLM";
}

function isAsrReady(form: AsrFormState) {
  if (form.provider === "deepgram") {
    return form.deepgramApiKey.trim().length > 0;
  }

  return (
    form.aliyunAppKey.trim().length > 0 &&
    form.aliyunAkId.trim().length > 0 &&
    form.aliyunAkSecret.trim().length > 0
  );
}

function isTtsReady(form: TtsFormState) {
  if (form.provider === "deepgram") {
    return form.deepgramApiKey.trim().length > 0;
  }

  return (
    form.huoshanApiKey.trim().length > 0 &&
    form.huoshanAccessKey.trim().length > 0 &&
    form.huoshanVoiceType.trim().length > 0
  );
}

function isLlmReady(mode: DialogueMode, form: LlmFormState) {
  if (mode === "openclaw") {
    return true;
  }

  return form.baseUrl.trim().length > 0 && form.apiKey.trim().length > 0 && form.model.trim().length > 0;
}

function createAsrForm(config: ConfigRecord): AsrFormState {
  return {
    provider: toAsrProvider(readString(config, ["provider"], "aliyun")),
    aliyunAppKey: readString(config, ["providers", "aliyun", "basic", "appkey"]),
    aliyunAkId: readString(config, ["providers", "aliyun", "basic", "ak_id"]),
    aliyunAkSecret: readString(config, ["providers", "aliyun", "basic", "ak_secret"]),
    deepgramApiKey: readString(config, ["providers", "deepgram", "basic", "api_key"]),
  };
}

function createTtsForm(config: ConfigRecord): TtsFormState {
  return {
    provider: toTtsProvider(readString(config, ["provider"], "huoshan")),
    huoshanApiKey: readString(config, ["providers", "huoshan", "basic", "app_key"]),
    huoshanAccessKey: readString(config, ["providers", "huoshan", "basic", "access_key"]),
    huoshanVoiceType: readString(config, ["providers", "huoshan", "basic", "voice_type"]),
    deepgramApiKey: readString(config, ["providers", "deepgram", "basic", "api_key"]),
  };
}

function createLlmForm(config: ConfigRecord): LlmFormState {
  const provider = readString(config, ["provider"], "ark") || "ark";

  return {
    provider,
    baseUrl:
      readString(config, ["providers", provider, "advanced", "base_url"]) ||
      readString(config, ["providers", provider, "basic", "base_url"]),
    apiKey: readString(config, ["providers", provider, "basic", "api_key"]),
    model: readString(config, ["providers", provider, "basic", "model"]),
  };
}

function segmentedLabel(active: boolean) {
  return cn("model-settings-segmented__item", active && "is-active");
}

function getSocketTone(state: string): "success" | "warning" | "danger" | "neutral" {
  if (state === "connected") {
    return "success";
  }
  if (state === "connecting") {
    return "warning";
  }
  if (state === "error") {
    return "danger";
  }
  return "neutral";
}

function getSocketLabel(state: string) {
  if (state === "connected") {
    return "Connected";
  }
  if (state === "connecting") {
    return "Connecting";
  }
  if (state === "error") {
    return "Error";
  }
  return "Idle";
}

function SettingsField({ field, disabled }: { field: FieldDefinition; disabled: boolean }) {
  return (
    <label className="model-settings-field">
      <span>{field.label}</span>
      <input
        type={field.secret ? "password" : "text"}
        value={field.value}
        placeholder={field.placeholder}
        onChange={(event) => field.onChange(event.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

function OverviewCard({
  item,
  active,
  onSelect,
}: {
  item: OverviewCardDefinition;
  active: boolean;
  onSelect: (section: ModelSection) => void;
}) {
  return (
    <button
      type="button"
      className={cn("model-settings-overview-card", active && "is-active")}
      onClick={() => onSelect(item.section)}
    >
      <span className="model-settings-overview-card__label">{item.title}</span>
      <strong>{item.selection}</strong>
      <div className="model-settings-overview-card__meta">
        <StatusBadge tone={item.ready ? "success" : "warning"}>
          {item.ready ? "Ready" : "Pending"}
        </StatusBadge>
        {active ? <span className="model-settings-overview-card__active">Editing</span> : null}
      </div>
    </button>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
  disabled,
  className,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("model-settings-segmented", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={segmentedLabel(option.value === value)}
          onClick={() => onChange(option.value)}
          disabled={disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function ModelSettingsWorkspace({ wsUrl }: ModelSettingsWorkspaceProps) {
  const { socketState, snapshot, isRefreshing, refreshAll, saveModule } = useWatcherConfigSession(wsUrl);
  const [activeSection, setActiveSection] = useState<ModelSection>("asr");
  const [asrForm, setAsrForm] = useState<AsrFormState>(() => createAsrForm(DEFAULT_ASR));
  const [ttsForm, setTtsForm] = useState<TtsFormState>(() => createTtsForm(DEFAULT_TTS));
  const [llmForm, setLlmForm] = useState<LlmFormState>(() => createLlmForm(DEFAULT_LLM));
  const [dialogueMode, setDialogueMode] = useState<DialogueMode>("llm");
  const [savingSection, setSavingSection] = useState<ModelSection | null>(null);
  const dirtyRef = useRef<Record<OnboardingServerModule, boolean>>({
    asr: false,
    tts: false,
    llm: false,
    dialogue: false,
  });

  useEffect(() => {
    if (socketState !== "connected") {
      return;
    }

    let cancelled = false;
    void refreshAll().catch((error) => {
      if (cancelled) {
        return;
      }
      toast.error("读取模型配置失败", {
        description: String(error),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [refreshAll, socketState]);

  useEffect(() => {
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
      setDialogueMode(toDialogueMode(readString(snapshot.dialogue.config, ["provider"], "llm")));
    }
  }, [snapshot]);

  const busy = isRefreshing || savingSection !== null;
  const canMutate = socketState === "connected" && !busy;
  const asrReady = useMemo(() => isAsrReady(asrForm), [asrForm]);
  const ttsReady = useMemo(() => isTtsReady(ttsForm), [ttsForm]);
  const llmReady = useMemo(() => isLlmReady(dialogueMode, llmForm), [dialogueMode, llmForm]);

  const reloadAll = useCallback(async () => {
    Object.keys(dirtyRef.current).forEach((key) => {
      dirtyRef.current[key as OnboardingServerModule] = false;
    });

    try {
      await refreshAll();
      toast.success("模型配置已刷新");
    } catch (error) {
      toast.error("刷新模型配置失败", {
        description: String(error),
      });
    }
  }, [refreshAll]);

  const saveDialogueMode = useCallback(
    async (provider: DialogueMode) => {
      const nextDialogue = cloneConfig((snapshot.dialogue?.config as ConfigRecord | undefined) ?? DEFAULT_DIALOGUE);
      setPath(nextDialogue, ["provider"], provider);
      const report = await saveModule("dialogue", nextDialogue);
      dirtyRef.current.dialogue = false;
      setDialogueMode(toDialogueMode(readString(report.config, ["provider"], provider)));
      return report.config;
    },
    [saveModule, snapshot.dialogue],
  );

  const saveAsr = useCallback(async () => {
    if (asrForm.provider === "aliyun") {
      if (!asrForm.aliyunAppKey.trim() || !asrForm.aliyunAkId.trim() || !asrForm.aliyunAkSecret.trim()) {
        toast.error("请填写完整的阿里云 ASR 信息");
        return;
      }
    } else if (!asrForm.deepgramApiKey.trim()) {
      toast.error("请填写 Deepgram ASR API Key");
      return;
    }

    const next = cloneConfig((snapshot.asr?.config as ConfigRecord | undefined) ?? DEFAULT_ASR);
    setPath(next, ["provider"], asrForm.provider);
    if (asrForm.provider === "aliyun") {
      setPath(next, ["providers", "aliyun", "basic", "appkey"], asrForm.aliyunAppKey.trim());
      setPath(next, ["providers", "aliyun", "basic", "ak_id"], asrForm.aliyunAkId.trim());
      setPath(next, ["providers", "aliyun", "basic", "ak_secret"], asrForm.aliyunAkSecret.trim());
    } else {
      setPath(next, ["providers", "deepgram", "basic", "api_key"], asrForm.deepgramApiKey.trim());
    }

    await saveModule("asr", next);
    dirtyRef.current.asr = false;
    toast.success("ASR 配置已保存");
  }, [asrForm, saveModule, snapshot.asr]);

  const saveTts = useCallback(async () => {
    if (ttsForm.provider === "huoshan") {
      if (!ttsForm.huoshanApiKey.trim() || !ttsForm.huoshanAccessKey.trim() || !ttsForm.huoshanVoiceType.trim()) {
        toast.error("请填写完整的火山引擎 TTS 信息");
        return;
      }
    } else if (!ttsForm.deepgramApiKey.trim()) {
      toast.error("请填写 Deepgram TTS API Key");
      return;
    }

    const next = cloneConfig((snapshot.tts?.config as ConfigRecord | undefined) ?? DEFAULT_TTS);
    setPath(next, ["provider"], ttsForm.provider);
    if (ttsForm.provider === "huoshan") {
      setPath(next, ["providers", "huoshan", "basic", "app_key"], ttsForm.huoshanApiKey.trim());
      setPath(next, ["providers", "huoshan", "basic", "access_key"], ttsForm.huoshanAccessKey.trim());
      setPath(next, ["providers", "huoshan", "basic", "voice_type"], ttsForm.huoshanVoiceType.trim());
    } else {
      setPath(next, ["providers", "deepgram", "basic", "api_key"], ttsForm.deepgramApiKey.trim());
    }

    await saveModule("tts", next);
    dirtyRef.current.tts = false;
    toast.success("TTS 配置已保存");
  }, [saveModule, snapshot.tts, ttsForm]);

  const saveLlm = useCallback(async () => {
    if (dialogueMode === "openclaw") {
      await saveDialogueMode("openclaw");
      toast.success("已切换到 OpenClaw 模式");
      return;
    }

    if (!llmForm.baseUrl.trim() || !llmForm.apiKey.trim() || !llmForm.model.trim()) {
      toast.error("请填写完整的 LLM 信息");
      return;
    }

    const provider = llmForm.provider.trim() || readString((snapshot.llm?.config as ConfigRecord | undefined) ?? DEFAULT_LLM, ["provider"], "ark") || "ark";
    const next = cloneConfig((snapshot.llm?.config as ConfigRecord | undefined) ?? DEFAULT_LLM);

    setPath(next, ["provider"], provider);
    setPath(next, ["providers", provider, "basic", "api_key"], llmForm.apiKey.trim());
    setPath(next, ["providers", provider, "basic", "model"], llmForm.model.trim());
    setPath(next, ["providers", provider, "advanced", "base_url"], llmForm.baseUrl.trim());

    await saveModule("llm", next);
    dirtyRef.current.llm = false;
    await saveDialogueMode("llm");
    toast.success("LLM 配置已保存");
  }, [dialogueMode, llmForm, saveDialogueMode, saveModule, snapshot.llm]);

  const handleSave = useCallback(async () => {
    setSavingSection(activeSection);
    try {
      if (activeSection === "asr") {
        await saveAsr();
        return;
      }
      if (activeSection === "tts") {
        await saveTts();
        return;
      }
      await saveLlm();
    } catch (error) {
      toast.error("保存模型配置失败", {
        description: String(error),
      });
    } finally {
      setSavingSection(null);
    }
  }, [activeSection, saveAsr, saveLlm, saveTts]);

  const asrFields = useMemo<FieldDefinition[]>(() => {
    if (asrForm.provider === "aliyun") {
      return [
        {
          key: "appkey",
          label: "APP Key",
          value: asrForm.aliyunAppKey,
          placeholder: "Enter aliyun app key",
          onChange: (value) => {
            dirtyRef.current.asr = true;
            setAsrForm((current) => ({ ...current, aliyunAppKey: value }));
          },
        },
        {
          key: "akid",
          label: "AK ID",
          value: asrForm.aliyunAkId,
          placeholder: "Enter aliyun ak id",
          onChange: (value) => {
            dirtyRef.current.asr = true;
            setAsrForm((current) => ({ ...current, aliyunAkId: value }));
          },
        },
        {
          key: "aksecret",
          label: "AK Secret",
          value: asrForm.aliyunAkSecret,
          placeholder: "Enter aliyun ak secret",
          secret: true,
          onChange: (value) => {
            dirtyRef.current.asr = true;
            setAsrForm((current) => ({ ...current, aliyunAkSecret: value }));
          },
        },
      ];
    }

    return [
      {
        key: "apikey",
        label: "API Key",
        value: asrForm.deepgramApiKey,
        placeholder: "Enter deepgram api key",
        secret: true,
        onChange: (value) => {
          dirtyRef.current.asr = true;
          setAsrForm((current) => ({ ...current, deepgramApiKey: value }));
        },
      },
    ];
  }, [asrForm]);

  const ttsFields = useMemo<FieldDefinition[]>(() => {
    if (ttsForm.provider === "huoshan") {
      return [
        {
          key: "apikey",
          label: "API Key",
          value: ttsForm.huoshanApiKey,
          placeholder: "Enter volcengine api key",
          onChange: (value) => {
            dirtyRef.current.tts = true;
            setTtsForm((current) => ({ ...current, huoshanApiKey: value }));
          },
        },
        {
          key: "accesskey",
          label: "Access Key",
          value: ttsForm.huoshanAccessKey,
          placeholder: "Enter volcengine access key",
          secret: true,
          onChange: (value) => {
            dirtyRef.current.tts = true;
            setTtsForm((current) => ({ ...current, huoshanAccessKey: value }));
          },
        },
        {
          key: "voicetype",
          label: "Voice Type",
          value: ttsForm.huoshanVoiceType,
          placeholder: "Select voice type",
          onChange: (value) => {
            dirtyRef.current.tts = true;
            setTtsForm((current) => ({ ...current, huoshanVoiceType: value }));
          },
        },
      ];
    }

    return [
      {
        key: "apikey",
        label: "API Key",
        value: ttsForm.deepgramApiKey,
        placeholder: "Enter deepgram api key",
        secret: true,
        onChange: (value) => {
          dirtyRef.current.tts = true;
          setTtsForm((current) => ({ ...current, deepgramApiKey: value }));
        },
      },
    ];
  }, [ttsForm]);

  const llmFields = useMemo<FieldDefinition[]>(() => {
    if (dialogueMode === "openclaw") {
      return [];
    }

    return [
      {
        key: "url",
        label: "URL",
        value: llmForm.baseUrl,
        placeholder: "Enter base url",
        onChange: (value) => {
          dirtyRef.current.llm = true;
          setLlmForm((current) => ({ ...current, baseUrl: value }));
        },
      },
      {
        key: "apikey",
        label: "API Key",
        value: llmForm.apiKey,
        placeholder: "Enter llm api key",
        secret: true,
        onChange: (value) => {
          dirtyRef.current.llm = true;
          setLlmForm((current) => ({ ...current, apiKey: value }));
        },
      },
      {
        key: "model",
        label: "Model",
        value: llmForm.model,
        placeholder: "Enter model name",
        onChange: (value) => {
          dirtyRef.current.llm = true;
          setLlmForm((current) => ({ ...current, model: value }));
        },
      },
    ];
  }, [dialogueMode, llmForm]);

  const overviewCards = useMemo<OverviewCardDefinition[]>(
    () => [
      {
        section: "asr",
        title: "ASR",
        selection: formatAsrProviderLabel(asrForm.provider),
        ready: asrReady,
      },
      {
        section: "tts",
        title: "TTS",
        selection: formatTtsProviderLabel(ttsForm.provider),
        ready: ttsReady,
      },
      {
        section: "llm",
        title: "LLM",
        selection: formatDialogueModeLabel(dialogueMode),
        ready: llmReady,
      },
    ],
    [asrForm.provider, asrReady, dialogueMode, llmReady, ttsForm.provider, ttsReady],
  );

  const sectionMeta = useMemo(() => {
    if (activeSection === "asr") {
      return {
        title: "ASR Configuration",
        sectionLabel: "ASR",
        selection: formatAsrProviderLabel(asrForm.provider),
        ready: asrReady,
      };
    }

    if (activeSection === "tts") {
      return {
        title: "TTS Configuration",
        sectionLabel: "TTS",
        selection: formatTtsProviderLabel(ttsForm.provider),
        ready: ttsReady,
      };
    }

    return {
      title: "LLM Configuration",
      sectionLabel: "LLM",
      selection: formatDialogueModeLabel(dialogueMode),
      ready: llmReady,
    };
  }, [activeSection, asrForm.provider, asrReady, dialogueMode, llmReady, ttsForm.provider, ttsReady]);

  return (
    <div className="control-hub-settings-page model-settings-page">
      <div className="model-settings-shell">
        <div className="model-settings-header">
          <div className="model-settings-header__copy">
            <span className="workspace-section-label">CONTROL HUB</span>
            <h2>Model Settings</h2>
            <p>ASR / TTS / LLM</p>
          </div>

          <div className="panel-actions-inline">
            <StatusBadge tone={getSocketTone(socketState)}>{getSocketLabel(socketState)}</StatusBadge>
            <button type="button" className="ghost-button" onClick={() => void reloadAll()} disabled={!canMutate}>
              <RefreshCw size={16} />
              Reload
            </button>
            <button type="button" className="primary-button" onClick={() => void handleSave()} disabled={!canMutate}>
              <Save size={16} />
              {savingSection === activeSection ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div className="model-settings-overview">
          {overviewCards.map((item) => (
            <OverviewCard
              key={item.section}
              item={item}
              active={item.section === activeSection}
              onSelect={setActiveSection}
            />
          ))}
        </div>

        <section className="model-settings-card">
          <div className="model-settings-card__header">
            <div className="model-settings-card__topline">
              <div className="model-settings-card__title">
                <span className="model-settings-card__eyebrow">{sectionMeta.sectionLabel}</span>
                <strong>{sectionMeta.title}</strong>
              </div>

              <div className="model-settings-card__indicators">
                <span className="model-settings-selection-pill">{sectionMeta.selection}</span>
                <StatusBadge tone={sectionMeta.ready ? "success" : "warning"}>
                  {sectionMeta.ready ? "Ready" : "Pending"}
                </StatusBadge>
              </div>
            </div>

            <div className="model-settings-card__switcher">
              {activeSection === "asr" ? (
                <SegmentedControl
                  options={[
                    { value: "aliyun", label: "Aliyun" },
                    { value: "deepgram", label: "Deepgram" },
                  ]}
                  value={asrForm.provider}
                  onChange={(next) => {
                    dirtyRef.current.asr = true;
                    setAsrForm((current) => ({ ...current, provider: next as AsrProvider }));
                  }}
                  disabled={busy}
                />
              ) : null}

              {activeSection === "tts" ? (
                <SegmentedControl
                  options={[
                    { value: "huoshan", label: "Huoshan" },
                    { value: "deepgram", label: "Deepgram" },
                  ]}
                  value={ttsForm.provider}
                  onChange={(next) => {
                    dirtyRef.current.tts = true;
                    setTtsForm((current) => ({ ...current, provider: next as TtsProvider }));
                  }}
                  disabled={busy}
                />
              ) : null}

              {activeSection === "llm" ? (
                <SegmentedControl
                  options={[
                    { value: "llm", label: "LLM" },
                    { value: "openclaw", label: "OpenClaw" },
                  ]}
                  value={dialogueMode}
                  onChange={(next) => {
                    dirtyRef.current.dialogue = true;
                    setDialogueMode(next as DialogueMode);
                  }}
                  disabled={busy}
                />
              ) : null}
            </div>
          </div>

          {activeSection === "llm" && dialogueMode === "openclaw" ? (
            <div className="model-settings-empty">
              <span>Desktop Config</span>
              <strong>No fields required</strong>
            </div>
          ) : (
            <div className="model-settings-fields">
              {(activeSection === "asr" ? asrFields : activeSection === "tts" ? ttsFields : llmFields).map((field) => (
                <SettingsField key={field.key} field={field} disabled={busy} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
