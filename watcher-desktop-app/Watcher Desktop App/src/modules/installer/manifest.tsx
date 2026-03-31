import { Download } from "lucide-react";
import type { AppModuleDefinition } from "@/app/module-definition";
import InstallerPage from "@/modules/installer/page";

export const installerModule: AppModuleDefinition = {
  id: "installer",
  label: "安装",
  title: "安装与初始化",
  group: "core",
  icon: Download,
  render: () => <InstallerPage />,
};
