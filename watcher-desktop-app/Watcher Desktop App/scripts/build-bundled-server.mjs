import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(desktopRoot, "..");
const serverRoot = path.resolve(workspaceRoot, "Watcher Server");
const buildRoot = path.resolve(serverRoot, "build", "pyinstaller");
const distRoot = path.resolve(buildRoot, "dist");
const workRoot = path.resolve(buildRoot, "work");
const specRoot = path.resolve(buildRoot, "spec");
const venvRoot = path.resolve(serverRoot, ".venv-build");
const resourceRoot = path.resolve(desktopRoot, "src-tauri", "resources", "server");
const isWindows = process.platform === "win32";
const binaryName = isWindows
  ? "watcher-server-backend.exe"
  : "watcher-server-backend";
const minPythonVersion = [3, 10];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? desktopRoot,
    stdio: "inherit",
    env: { ...process.env, ...(options.env ?? {}) },
  });

  if (result.status !== 0) {
    const rendered = [command, ...args].join(" ");
    throw new Error(`Command failed (${result.status ?? "unknown"}): ${rendered}`);
  }
}

function commandExists(command, args = []) {
  const result = spawnSync(command, [...args, "--version"], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function readPythonVersion(command, args = []) {
  const result = spawnSync(
    command,
    [
      ...args,
      "-c",
      "import sys; print('.'.join(str(part) for part in sys.version_info[:3]))",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function versionAtLeast(rawVersion, minimum) {
  const parsed = rawVersion
    .split(".")
    .slice(0, minimum.length)
    .map((value) => Number.parseInt(value, 10));
  for (let index = 0; index < minimum.length; index += 1) {
    const actual = parsed[index] ?? 0;
    const expected = minimum[index];
    if (actual > expected) {
      return true;
    }
    if (actual < expected) {
      return false;
    }
  }
  return true;
}

function resolveBasePython() {
  const configured = process.env.WATCHER_SERVER_BUILD_PYTHON_BIN;
  const candidates = [];

  if (configured) {
    candidates.push({ command: configured, args: [] });
  }
  candidates.push({
    command: "/opt/miniconda3/envs/watcher-server/bin/python",
    args: [],
  });
  if (isWindows) {
    candidates.push({ command: "py", args: ["-3"] });
  }
  candidates.push({ command: "python3", args: [] });
  candidates.push({ command: "python", args: [] });

  const attempted = [];
  for (const candidate of candidates) {
    if (commandExists(candidate.command, candidate.args)) {
      const version = readPythonVersion(candidate.command, candidate.args);
      attempted.push(`${candidate.command}=${version ?? "unknown"}`);
      if (version && versionAtLeast(version, minPythonVersion)) {
        return candidate;
      }
    }
  }

  throw new Error(
    `Unable to find a Python ${minPythonVersion.join(".")}+ interpreter. Tried: ${attempted.join(", ") || "none"}. Set WATCHER_SERVER_BUILD_PYTHON_BIN to continue.`,
  );
}

function resolveVenvPython() {
  return isWindows
    ? path.resolve(venvRoot, "Scripts", "python.exe")
    : path.resolve(venvRoot, "bin", "python");
}

function ensureBuildVenv(basePython) {
  const venvPython = resolveVenvPython();
  if (existsSync(venvPython)) {
    const venvVersion = readPythonVersion(venvPython);
    if (!venvVersion || !versionAtLeast(venvVersion, minPythonVersion)) {
      rmSync(venvRoot, { recursive: true, force: true });
    }
  }

  if (!existsSync(venvPython)) {
    mkdirSync(path.dirname(venvRoot), { recursive: true });
    run(basePython.command, [...basePython.args, "-m", "venv", venvRoot], {
      cwd: serverRoot,
    });
  }

  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"], {
    cwd: serverRoot,
  });
  run(venvPython, ["-m", "pip", "install", "-r", "requirements.txt", "pyinstaller"], {
    cwd: serverRoot,
  });

  return venvPython;
}

function buildBackendBinary(pythonBin) {
  rmSync(distRoot, { recursive: true, force: true });
  rmSync(workRoot, { recursive: true, force: true });
  rmSync(specRoot, { recursive: true, force: true });
  mkdirSync(distRoot, { recursive: true });
  mkdirSync(workRoot, { recursive: true });
  mkdirSync(specRoot, { recursive: true });

  const args = [
    "-m",
    "PyInstaller",
    "--clean",
    "--noconfirm",
    "--onefile",
    "--name",
    "watcher-server-backend",
    "--distpath",
    distRoot,
    "--workpath",
    workRoot,
    "--specpath",
    specRoot,
    "--paths",
    serverRoot,
    "--collect-submodules",
    "src.modules.asr.providers",
    "--collect-submodules",
    "src.modules.llm.providers",
    "--collect-submodules",
    "src.modules.tts.providers",
    "--collect-submodules",
    "src.modules.openclaw",
    "main.py",
  ];

  run(pythonBin, args, { cwd: serverRoot });

  const outputBinary = path.resolve(distRoot, binaryName);
  if (!existsSync(outputBinary)) {
    throw new Error(`Expected backend binary not found at ${outputBinary}`);
  }
  return outputBinary;
}

function stageBundledServer(binaryPath) {
  rmSync(resourceRoot, { recursive: true, force: true });
  mkdirSync(resourceRoot, { recursive: true });

  const targetBinary = path.resolve(resourceRoot, binaryName);
  copyFileSync(binaryPath, targetBinary);
  if (!isWindows) {
    chmodSync(targetBinary, 0o755);
  }

  cpSync(path.resolve(serverRoot, "config"), path.resolve(resourceRoot, "config"), {
    recursive: true,
  });
}

function main() {
  if (!existsSync(path.resolve(serverRoot, "main.py"))) {
    throw new Error(`Watcher Server root not found at ${serverRoot}`);
  }

  const basePython = resolveBasePython();
  const venvPython = ensureBuildVenv(basePython);
  const binaryPath = buildBackendBinary(venvPython);
  stageBundledServer(binaryPath);

  console.log(`[watcher-server] bundled backend ready at ${resourceRoot}`);
}

main();
