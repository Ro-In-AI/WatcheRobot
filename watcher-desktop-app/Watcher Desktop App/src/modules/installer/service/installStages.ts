export interface InstallStageItem {
  text: string;
  status: "pending" | "loading" | "success" | "error";
}

export interface InstallStage {
  id: number;
  name: string;
  status: "pending" | "active" | "completed";
  items: InstallStageItem[];
}

const STAGE_TITLES: Record<number, string> = {
  1: "Preparing environment",
  2: "Installing OpenClaw",
  3: "Finalizing package",
  4: "Initializing configuration",
};

const SUCCESS_PREFIX = /^(?:[\u221A\u2713\u2714]\s*|done\b[:\s-]*|success\b[:\s-]*)/i;
const LOADING_PREFIX =
  /^(?:[-*\u2022\u00b7]\s*|working\b[:\s-]*|running\b[:\s-]*|installing\b[:\s-]*)/i;

export function cleanAnsi(input: string) {
  return input.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").trim();
}

function looksLikeConfigUpdate(line: string) {
  return (
    line.includes("OpenClaw onboarding") ||
    line.includes("Updated ~/.openclaw") ||
    /(?:^|[\\/])\.openclaw(?:[\\/]|$)/i.test(line) ||
    line.includes("Workspace OK") ||
    line.includes("Installed LaunchAgent") ||
    line.includes("Installed service") ||
    line.includes("Startup shortcut") ||
    line.includes("Task Scheduler") ||
    line.includes("Configuration initialized") ||
    line.includes("Initializing configuration completed")
  );
}

export function parseInstallStages(logs: string[]) {
  const cleanLogs = logs.map(cleanAnsi).filter(Boolean);
  const stages = new Map<number, InstallStage>();

  for (let index = 1; index <= 4; index += 1) {
    stages.set(index, {
      id: index,
      name: STAGE_TITLES[index],
      status: "pending",
      items: [],
    });
  }

  let currentStageId = 1;
  let version = "";
  let completed = false;

  for (const line of cleanLogs) {
    const stageMatch = line.match(/^\[(\d)\/4\]\s+(.+)$/);
    if (stageMatch) {
      currentStageId = Number(stageMatch[1]);
      stages.get(currentStageId)!.name = stageMatch[2];
      continue;
    }

    const currentStage = stages.get(currentStageId)!;

    if (SUCCESS_PREFIX.test(line)) {
      currentStage.items.push({
        text: line.replace(SUCCESS_PREFIX, "").trim(),
        status: "success",
      });
      continue;
    }

    if (LOADING_PREFIX.test(line)) {
      currentStage.items.push({
        text: line.replace(LOADING_PREFIX, "").trim(),
        status: "loading",
      });
      continue;
    }

    if (line.toLowerCase().includes("installed successfully")) {
      currentStageId = Math.max(currentStageId, 3);
      const matchedVersion = line.match(/OpenClaw\s+(v?[\d.]+(?:\s+\([a-f0-9]+\))?)/i);
      if (matchedVersion) {
        version = matchedVersion[1];
      }
      continue;
    }

    if (looksLikeConfigUpdate(line)) {
      currentStageId = 4;
      completed = true;
    }
  }

  const list = Array.from(stages.values()).map((stage) => {
    if (completed || stage.id < currentStageId) {
      return {
        ...stage,
        status: "completed" as const,
      };
    }

    if (stage.id === currentStageId) {
      return {
        ...stage,
        status: "active" as const,
      };
    }

    return stage;
  });

  return {
    stages: list,
    version,
    completed,
  };
}
