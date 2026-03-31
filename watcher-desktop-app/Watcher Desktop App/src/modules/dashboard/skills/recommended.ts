export interface RecommendedSkillDefinition {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export const RECOMMENDED_SKILLS: RecommendedSkillDefinition[] = [
  {
    id: "obsidian",
    slug: "obsidian",
    name: "Obsidian",
    description: "Work with Obsidian vaults (plain Markdown notes) and automate via obsidian-cli.",
  },
];
