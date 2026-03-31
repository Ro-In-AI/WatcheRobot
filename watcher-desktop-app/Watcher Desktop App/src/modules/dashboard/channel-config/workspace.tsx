import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  GripVertical,
  PencilLine,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import Panel from "@/shared/ui/Panel";
import { modelConfigApi } from "@/modules/openclaw/model_config/api";
import { openclawProviderPresets } from "@/modules/openclaw/shared/providerPresets";
import type { OpenClawDefaultModel, OpenClawProviderConfig } from "@/modules/openclaw/shared/types";

interface ProviderForm {
  presetId: string;
  providerId: string;
  api: string;
  baseUrl: string;
  apiKey: string;
  models: ProviderModelDraft[];
}

interface ProviderModelDraft {
  id: string;
  name: string;
}

interface ProviderEditForm {
  providerId: string;
  api: string;
  baseUrl: string;
  apiKey: string;
  models: ProviderModelDraft[];
}

interface DragPreviewState {
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
  width: number;
}

const DEFAULT_API_TYPE = "openai-completions";
const CUSTOM_PRESET_ID = "custom";

const emptyCreateForm = (): ProviderForm => ({
  presetId: CUSTOM_PRESET_ID,
  providerId: "",
  api: DEFAULT_API_TYPE,
  baseUrl: "",
  apiKey: "",
  models: [{ id: "", name: "" }],
});

const emptyEditForm = (): ProviderEditForm => ({
  providerId: "",
  api: DEFAULT_API_TYPE,
  baseUrl: "",
  apiKey: "",
  models: [{ id: "", name: "" }],
});

function normalizeProviderForm(config: OpenClawProviderConfig): ProviderEditForm {
  const normalizedModels =
    (config.models ?? [])
      .map((model) => ({
        id: String(model.id ?? "").trim(),
        name: String(model.name ?? model.id ?? "").trim(),
      }))
      .filter((model) => model.id) || [];

  return {
    providerId: "",
    api: config.api ?? DEFAULT_API_TYPE,
    baseUrl: config.baseUrl ?? config.base_url ?? "",
    apiKey: config.apiKey ?? config.api_key ?? "",
    models: normalizedModels.length > 0 ? normalizedModels : [{ id: "", name: "" }],
  };
}

function normalizeModels(models: ProviderModelDraft[]) {
  return models
    .map((model) => ({
      id: model.id.trim(),
      name: model.name.trim() || model.id.trim(),
    }))
    .filter((model) => model.id.length > 0);
}

function normalizePresetModels(
  models: OpenClawProviderConfig["models"] | undefined,
): ProviderModelDraft[] {
  const normalized = (models ?? [])
    .map((model) => ({
      id: String(model.id ?? "").trim(),
      name: String(model.name ?? model.id ?? "").trim(),
    }))
    .filter((model) => model.id.length > 0);

  return normalized.length > 0 ? normalized : [{ id: "", name: "" }];
}

export default function ChannelConfigWorkspace() {
  const [providers, setProviders] = useState<Record<string, OpenClawProviderConfig>>({});
  const [defaultModel, setDefaultModel] = useState<OpenClawDefaultModel | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [providerOrder, setProviderOrder] = useState<string[]>([]);
  const [draggingProviderId, setDraggingProviderId] = useState<string | null>(null);
  const [dragOverProviderId, setDragOverProviderId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);
  const draggingProviderIdRef = useRef<string | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const providerNodeMapRef = useRef<Record<string, HTMLElement | null>>({});
  const providerPositionMapRef = useRef<Record<string, number>>({});
  const [form, setForm] = useState<ProviderForm>(emptyCreateForm);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProviderEditForm>(emptyEditForm);

  const selectedPreset = useMemo(
    () => openclawProviderPresets.find((preset) => preset.id === form.presetId) ?? null,
    [form.presetId],
  );

  const refresh = async () => {
    const [providerMap, modelDefault] = await Promise.all([
      modelConfigApi.getModels(),
      modelConfigApi.getDefaultModel(),
    ]);

    setProviders(providerMap);
    setDefaultModel(modelDefault);
    setProviderOrder((previous) => {
      const nextIds = Object.keys(providerMap);
      const kept = previous.filter((id) => nextIds.includes(id));
      const appended = nextIds.filter((id) => !kept.includes(id));
      return [...kept, ...appended];
    });
  };

  useEffect(() => {
    void refresh().catch((reason) => {
      toast.error("读取 OpenClaw 配置失败", {
        description: String(reason),
      });
    });
  }, []);

  const applyCreatePreset = (presetId: string) => {
    const preset = openclawProviderPresets.find((entry) => entry.id === presetId);

    setForm((previous) => {
      if (!preset) {
        return {
          ...previous,
          presetId: "",
        };
      }

      return {
        ...previous,
        presetId,
        providerId: preset.providerId,
        api: preset.settingsConfig.api ?? DEFAULT_API_TYPE,
        baseUrl: preset.settingsConfig.baseUrl ?? preset.settingsConfig.base_url ?? "",
        models: normalizePresetModels(preset.settingsConfig.models ?? [{ id: "", name: "" }]),
      };
    });
  };

  const saveProvider = async () => {
    const modelDrafts = normalizeModels(form.models);
    if (!form.providerId || !form.baseUrl || !form.apiKey || modelDrafts.length === 0) {
      toast.error("请先填写供应商 ID、Base URL、API Key，并至少配置一个模型");
      return;
    }

    await modelConfigApi.setProvider(form.providerId, {
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      api: form.api,
      models: modelDrafts,
    });

    toast.success("供应商模型已保存");
    setForm(emptyCreateForm());
    setShowCreateForm(false);
    await refresh();
  };

  const startEditProvider = (providerId: string, config: OpenClawProviderConfig) => {
    const normalized = normalizeProviderForm(config);
    setEditingProviderId(providerId);
    setEditForm({
      ...normalized,
      providerId,
    });
  };

  const cancelEditProvider = () => {
    setEditingProviderId(null);
    setEditForm(emptyEditForm());
  };

  const saveEditedProvider = async () => {
    if (!editingProviderId) {
      return;
    }

    const modelDrafts = normalizeModels(editForm.models);
    if (!editForm.baseUrl || !editForm.apiKey || modelDrafts.length === 0) {
      toast.error("请填写 Base URL、API Key，并至少配置一个有效模型");
      return;
    }

    await modelConfigApi.setProvider(editingProviderId, {
      baseUrl: editForm.baseUrl,
      apiKey: editForm.apiKey,
      api: editForm.api,
      models: modelDrafts,
    });

    toast.success(`已更新模型 ${editingProviderId}`);
    cancelEditProvider();
    await refresh();
  };

  const removeProvider = async (providerId: string) => {
    await modelConfigApi.removeProvider(providerId);
    toast.success(`已删除 ${providerId}`);
    if (editingProviderId === providerId) {
      cancelEditProvider();
    }
    await refresh();
  };

  const saveDefaultModel = async (providerId: string, modelId: string) => {
    await modelConfigApi.setDefaultModel({
      primary: `${providerId}/${modelId}`,
      fallbacks: [],
    });
    toast.success("默认模型已更新");
    await refresh();
  };

  const orderedProviderEntries = useMemo(
    () =>
      providerOrder
        .map((providerId) => [providerId, providers[providerId]] as const)
        .filter((entry): entry is readonly [string, OpenClawProviderConfig] => Boolean(entry[1])),
    [providerOrder, providers],
  );

  useLayoutEffect(() => {
    const nextPositions: Record<string, number> = {};

    orderedProviderEntries.forEach(([providerId]) => {
      const node = providerNodeMapRef.current[providerId];
      if (!node) {
        return;
      }

      const nextTop = node.getBoundingClientRect().top;
      nextPositions[providerId] = nextTop;

      const previousTop = providerPositionMapRef.current[providerId];
      if (previousTop === undefined || providerId === draggingProviderIdRef.current) {
        return;
      }

      const deltaY = previousTop - nextTop;
      if (Math.abs(deltaY) < 1) {
        return;
      }

      node.animate(
        [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
        {
          duration: 240,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    });

    providerPositionMapRef.current = nextPositions;
  }, [orderedProviderEntries]);

  const moveProvider = (fromId: string, toId: string) => {
    if (fromId === toId) {
      return;
    }

    setProviderOrder((previous) => {
      const next = [...previous];
      const fromIndex = next.indexOf(fromId);
      const toIndex = next.indexOf(toId);
      if (fromIndex === -1 || toIndex === -1) {
        return previous;
      }

      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleProviderPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    providerId: string,
    isEditing: boolean,
  ) => {
    if (isEditing) {
      return;
    }

    event.preventDefault();
    const providerCard = event.currentTarget.closest<HTMLElement>("[data-provider-id]");
    if (!providerCard) {
      return;
    }

    const rect = providerCard.getBoundingClientRect();
    draggingProviderIdRef.current = providerId;
    dragPointerIdRef.current = event.pointerId;
    setDragPreview({
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
    });
    setDraggingProviderId(providerId);
    setDragOverProviderId(providerId);
  };

  useEffect(() => {
    if (!draggingProviderId) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (dragPointerIdRef.current !== null && event.pointerId !== dragPointerIdRef.current) {
        return;
      }

      const target = document.elementFromPoint(event.clientX, event.clientY);
      const providerCard = target?.closest<HTMLElement>("[data-provider-id]");
      const overProviderId = providerCard?.dataset.providerId;
      const activeId = draggingProviderIdRef.current;

      setDragPreview((previous) =>
        previous
          ? {
              ...previous,
              pointerX: event.clientX,
              pointerY: event.clientY,
            }
          : previous,
      );

      if (!activeId || !overProviderId) {
        return;
      }

      setDragOverProviderId(overProviderId);
      if (activeId !== overProviderId && providerCard) {
        const activeIndex = providerOrder.indexOf(activeId);
        const overIndex = providerOrder.indexOf(overProviderId);
        if (activeIndex === -1 || overIndex === -1) {
          return;
        }

        const rect = providerCard.getBoundingClientRect();
        const pointerY = event.clientY - rect.top;
        const midpoint = rect.height / 2;
        const deadZone = Math.min(18, rect.height * 0.18);
        const movingDown = activeIndex < overIndex;
        const movingUp = activeIndex > overIndex;
        const crossedDown = movingDown && pointerY > midpoint + deadZone;
        const crossedUp = movingUp && pointerY < midpoint - deadZone;

        if (crossedDown || crossedUp) {
          moveProvider(activeId, overProviderId);
        }
      }
    };

    const stopDragging = () => {
      draggingProviderIdRef.current = null;
      dragPointerIdRef.current = null;
      setDraggingProviderId(null);
      setDragOverProviderId(null);
      setDragPreview(null);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (dragPointerIdRef.current !== null && event.pointerId !== dragPointerIdRef.current) {
        return;
      }
      stopDragging();
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [draggingProviderId, providerOrder]);

  return (
    <div className="control-hub-settings-page">
      <div className="content-grid">
        <Panel
          title="模型"
          className="span-two"
          actions={
            <div className="channel-provider-toolbar">
              <button
                type="button"
                className="primary-button"
                onClick={() => setShowCreateForm((previous) => !previous)}
              >
                <Plus size={16} />
                {showCreateForm ? "收起新增模型" : "新增模型"}
              </button>
              <button type="button" className="ghost-button" onClick={() => void refresh()}>
                <RefreshCw size={16} />
                刷新配置
              </button>
            </div>
          }
        >
          {showCreateForm ? (
            <div className="channel-create-panel">
              <div className="channel-create-panel__head">
                <strong>新增模型</strong>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowCreateForm(false)}
                >
                  <X size={15} />
                  收起
                </button>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>预设供应商</span>
                  <select value={form.presetId} onChange={(event) => applyCreatePreset(event.target.value)}>
                    <option value="">自定义</option>
                    {openclawProviderPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </label>
                <LabeledField
                  label="供应商 ID"
                  value={form.providerId}
                  onChange={(value) => setForm((previous) => ({ ...previous, providerId: value }))}
                  placeholder="例如 anthropic"
                />
                <label className="field">
                  <span>API 类型</span>
                  <select
                    value={form.api}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, api: event.target.value }))
                    }
                  >
                    <option value="openai-completions">OpenAI Completions</option>
                    <option value="openai-chat">OpenAI Chat</option>
                    <option value="anthropic-messages">Anthropic Messages</option>
                  </select>
                </label>
                <LabeledField
                  label="Base URL"
                  value={form.baseUrl}
                  onChange={(value) => setForm((previous) => ({ ...previous, baseUrl: value }))}
                  placeholder="https://api.example.com"
                />
                <LabeledField
                  label="API Key"
                  value={form.apiKey}
                  onChange={(value) => setForm((previous) => ({ ...previous, apiKey: value }))}
                  placeholder="sk-..."
                  type="password"
                />
              </div>

              {selectedPreset?.websiteUrl ? (
                <p className="channel-create-panel__hint">
                  已按预设填入地址与模型列表，官网：
                  <a href={selectedPreset.websiteUrl} target="_blank" rel="noreferrer">
                    {selectedPreset.websiteUrl}
                  </a>
                </p>
              ) : null}

              <div className="channel-editor__models">
                <div className="channel-editor__models-head">
                  <strong>模型列表</strong>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      setForm((previous) => ({
                        ...previous,
                        models: [...previous.models, { id: "", name: "" }],
                      }))
                    }
                  >
                    <Plus size={14} />
                    添加模型
                  </button>
                </div>
                <ProviderModelsEditor
                  providerId={form.providerId || "create"}
                  models={form.models}
                  onChange={(models) => setForm((previous) => ({ ...previous, models }))}
                />
              </div>

              <div className="channel-create-panel__actions">
                <button type="button" className="primary-button" onClick={() => void saveProvider()}>
                  <Plus size={16} />
                  保存供应商
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setForm(emptyCreateForm());
                    setShowCreateForm(false);
                  }}
                >
                  <X size={15} />
                  取消
                </button>
              </div>
            </div>
          ) : null}

          {orderedProviderEntries.length === 0 ? (
            <div className="empty-state">
              <span>还没有模型，先点右上角新增模型。</span>
            </div>
          ) : (
            <div className="channel-provider-grid">
              {orderedProviderEntries.map(([providerId, config]) => {
                const currentModels = config.models ?? [];
                const isEditing = editingProviderId === providerId;
                const isDragging = draggingProviderId === providerId;
                const isDragOver = dragOverProviderId === providerId && !isDragging;

                return (
                  <article
                    key={providerId}
                    data-provider-id={providerId}
                    ref={(node) => {
                      providerNodeMapRef.current[providerId] = node;
                    }}
                    className={`channel-provider-card${isDragging ? " is-dragging" : ""}${isDragOver ? " is-drag-over" : ""}`}
                  >
                    <div className="channel-provider-card__header">
                      <div className="channel-provider-card__title">
                        <span
                          className="channel-drag-handle"
                          title="拖动排序"
                          onPointerDown={(event) =>
                            handleProviderPointerDown(event, providerId, isEditing)
                          }
                        >
                          <GripVertical size={16} />
                        </span>
                        <strong>{providerId}</strong>
                      </div>

                      <div className="channel-provider-card__actions">
                        {isEditing ? (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => cancelEditProvider()}
                          >
                            <X size={15} />
                            取消
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => startEditProvider(providerId, config)}
                          >
                            <PencilLine size={15} />
                            编辑
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => void removeProvider(providerId)}
                          title={`删除 ${providerId}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="channel-editor">
                        <div className="channel-editor__grid">
                          <LabeledField
                            label="供应商 ID"
                            value={editForm.providerId}
                            onChange={() => undefined}
                            disabled
                          />
                          <label className="field">
                            <span>API 类型</span>
                            <select
                              value={editForm.api}
                              onChange={(event) =>
                                setEditForm((previous) => ({
                                  ...previous,
                                  api: event.target.value,
                                }))
                              }
                            >
                              <option value="openai-completions">OpenAI Completions</option>
                              <option value="openai-chat">OpenAI Chat</option>
                              <option value="anthropic-messages">Anthropic Messages</option>
                            </select>
                          </label>
                          <LabeledField
                            label="Base URL"
                            value={editForm.baseUrl}
                            onChange={(value) =>
                              setEditForm((previous) => ({ ...previous, baseUrl: value }))
                            }
                            placeholder="https://api.example.com"
                          />
                          <LabeledField
                            label="API Key"
                            value={editForm.apiKey}
                            onChange={(value) =>
                              setEditForm((previous) => ({ ...previous, apiKey: value }))
                            }
                            placeholder="sk-..."
                            type="password"
                          />
                        </div>

                        <div className="channel-editor__models">
                          <div className="channel-editor__models-head">
                            <strong>模型列表</strong>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() =>
                                setEditForm((previous) => ({
                                  ...previous,
                                  models: [...previous.models, { id: "", name: "" }],
                                }))
                              }
                            >
                              <Plus size={14} />
                              添加模型
                            </button>
                          </div>
                          <ProviderModelsEditor
                            providerId={providerId}
                            models={editForm.models}
                            onChange={(models) =>
                              setEditForm((previous) => ({
                                ...previous,
                                models,
                              }))
                            }
                          />
                        </div>

                        <div className="channel-editor__actions">
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => void saveEditedProvider()}
                          >
                            <Save size={15} />
                            保存修改
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => cancelEditProvider()}
                          >
                            <X size={15} />
                            放弃修改
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="provider-models provider-models--grid">
                        {currentModels.length === 0 ? (
                          <div className="empty-state">
                            <span>暂无模型，点击新增模型补充配置。</span>
                          </div>
                        ) : (
                          currentModels.map((model) => {
                            const isDefault = defaultModel?.primary === `${providerId}/${model.id}`;

                            return (
                              <button
                                key={`${providerId}-${model.id}`}
                                type="button"
                                className={`model-chip channel-model-tile${isDefault ? " is-active" : ""}`}
                                onClick={() => void saveDefaultModel(providerId, model.id)}
                              >
                                <strong className="channel-model-tile__name">
                                  {model.name ?? model.id}
                                </strong>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

        {draggingProviderId && dragPreview && providers[draggingProviderId] ? (
          <article
            className="channel-provider-card channel-provider-card--drag-preview"
            style={{
              width: dragPreview.width,
              left: dragPreview.pointerX - dragPreview.offsetX,
              top: dragPreview.pointerY - dragPreview.offsetY,
            }}
          >
            <div className="channel-provider-card__header">
              <div className="channel-provider-card__title">
                <span className="channel-drag-handle">
                  <GripVertical size={16} />
                </span>
                <strong>{draggingProviderId}</strong>
              </div>
            </div>
          </article>
        ) : null}
      </div>
    </div>
  );
}

function ProviderModelsEditor({
  providerId,
  models,
  onChange,
}: {
  providerId: string;
  models: ProviderModelDraft[];
  onChange: (models: ProviderModelDraft[]) => void;
}) {
  return (
    <div className="channel-editor__models-list">
      {models.map((model, index) => (
        <div key={`${providerId}-model-${index}`} className="channel-model-row">
          <input
            value={model.id}
            placeholder="模型 ID"
            onChange={(event) =>
              onChange(
                models.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, id: event.target.value } : item,
                ),
              )
            }
          />
          <input
            value={model.name}
            placeholder="显示名称（可选）"
            onChange={(event) =>
              onChange(
                models.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, name: event.target.value } : item,
                ),
              )
            }
          />
          <button
            type="button"
            className="icon-button"
            disabled={models.length === 1}
            onClick={() => onChange(models.filter((_, itemIndex) => itemIndex !== index))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function LabeledField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
