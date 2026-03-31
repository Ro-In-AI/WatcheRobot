use super::*;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawInstalledSkill {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub path: String,
    pub skill_file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawAgentSkillsInventory {
    pub agent_id: String,
    pub workspace: String,
    pub skills_dir: String,
    pub skills: Vec<OpenClawInstalledSkill>,
}

fn clean_command_output(input: &str) -> String {
    let mut result = String::new();
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            if let Some(&'[') = chars.peek() {
                chars.next();
                while let Some(next) = chars.peek() {
                    if next.is_ascii_alphabetic() {
                        chars.next();
                        break;
                    }
                    if next.is_ascii_digit() || *next == ';' || *next == '?' || *next == ' ' {
                        chars.next();
                        continue;
                    }
                    break;
                }
                continue;
            }
        }

        if ch.is_control() && ch != '\n' && ch != '\r' && ch != '\t' {
            continue;
        }

        result.push(ch);
    }

    result.trim().to_string()
}

fn openclaw_command_candidates() -> &'static [&'static str] {
    if cfg!(target_os = "windows") {
        &["openclaw", "openclaw.cmd", "openclaw.exe", "openclaw.bat"]
    } else {
        &[
            "openclaw",
            "/opt/homebrew/bin/openclaw",
            "/usr/local/bin/openclaw",
        ]
    }
}

fn resolve_command_candidate(candidates: &[&str]) -> Option<String> {
    let locator = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };

    for candidate in candidates {
        let output = Command::new(locator).arg(candidate).output().ok()?;
        if !output.status.success() {
            continue;
        }

        if let Some(path) = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
        {
            return Some(path.to_string());
        }
    }

    None
}

fn resolve_openclaw_command() -> Option<String> {
    resolve_command_candidate(openclaw_command_candidates()).or_else(|| {
        openclaw_command_candidates()
            .first()
            .map(|command| (*command).to_string())
    })
}

fn strip_wrapping_quotes(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string()
}

fn normalize_skill_id(value: &str) -> String {
    let mut normalized = String::new();
    let mut last_was_dash = false;

    for ch in value.chars() {
        let next = if ch.is_ascii_alphanumeric() {
            Some(ch.to_ascii_lowercase())
        } else if ch == '_' || ch == '-' || ch.is_ascii_whitespace() {
            Some('-')
        } else {
            None
        };

        match next {
            Some('-') if !normalized.is_empty() && !last_was_dash => {
                normalized.push('-');
                last_was_dash = true;
            }
            Some(next_ch) => {
                normalized.push(next_ch);
                last_was_dash = false;
            }
            None => {}
        }
    }

    normalized.trim_matches('-').to_string()
}

fn first_heading(content: &str) -> Option<String> {
    content.lines().find_map(|line| {
        let trimmed = line.trim();
        trimmed
            .strip_prefix('#')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    })
}

fn labeled_description(content: &str) -> Option<String> {
    const LABELS: &[&str] = &[
        "description:",
        "description：",
        "**description**:",
        "**description**：",
        "描述:",
        "描述：",
        "**描述**:",
        "**描述**：",
    ];

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let lower = trimmed.to_lowercase();
        if let Some(label) = LABELS.iter().find(|label| lower.starts_with(**label)) {
            let raw = trimmed[label.len()..].trim();
            if !raw.is_empty() {
                return Some(strip_wrapping_quotes(raw));
            }
        }
    }

    None
}

fn first_paragraph(content: &str) -> Option<String> {
    let mut in_code_block = false;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }

        if in_code_block
            || trimmed.is_empty()
            || trimmed == "---"
            || trimmed.starts_with('#')
            || trimmed.starts_with("- ")
            || trimmed.starts_with("* ")
            || trimmed.starts_with("```")
        {
            continue;
        }

        if trimmed.starts_with("**版本")
            || trimmed.starts_with("**作者")
            || trimmed.starts_with("version:")
            || trimmed.starts_with("author:")
        {
            continue;
        }

        return Some(trimmed.to_string());
    }

    None
}

fn parse_skill_markdown(content: &str) -> (Option<String>, Option<String>) {
    let trimmed = content.trim_start();
    let mut body = trimmed;
    let mut frontmatter_name = None;
    let mut frontmatter_description = None;

    if let Some(after_open) = trimmed.strip_prefix("---") {
        if let Some((frontmatter, remainder)) = after_open.split_once("\n---") {
            for line in frontmatter.lines() {
                let trimmed_line = line.trim();
                let Some((key, value)) = trimmed_line.split_once(':') else {
                    continue;
                };

                let normalized_key = key.trim().to_ascii_lowercase();
                let parsed_value = strip_wrapping_quotes(value);
                if parsed_value.is_empty() {
                    continue;
                }

                match normalized_key.as_str() {
                    "name" => frontmatter_name = Some(parsed_value),
                    "description" => frontmatter_description = Some(parsed_value),
                    _ => {}
                }
            }

            body = remainder.trim_start_matches('\n').trim_start();
        }
    }

    let name = frontmatter_name.or_else(|| first_heading(body));
    let description = frontmatter_description
        .or_else(|| labeled_description(body))
        .or_else(|| first_paragraph(body));

    (name, description)
}

fn resolve_skill_file_path(skill_dir: &Path) -> Option<PathBuf> {
    ["SKILL.md", "skill.md"]
        .iter()
        .map(|file_name| skill_dir.join(file_name))
        .find(|path| path.exists())
}

fn derive_skill_id(skill_dir: &Path, name: &str) -> String {
    let dir_name = skill_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("skill");

    if dir_name != "skills" {
        let normalized_dir_name = normalize_skill_id(dir_name);
        if !normalized_dir_name.is_empty() {
            return normalized_dir_name;
        }
    }

    for separator in [" - ", " — ", " – ", ": ", "："] {
        if let Some((prefix, _)) = name.split_once(separator) {
            let normalized_prefix = normalize_skill_id(prefix);
            if !normalized_prefix.is_empty() {
                return normalized_prefix;
            }
        }
    }

    let normalized_name = normalize_skill_id(name);
    if !normalized_name.is_empty() {
        return normalized_name;
    }

    "skill".to_string()
}

fn read_skill_entry(skill_dir: &Path) -> Result<Option<OpenClawInstalledSkill>, String> {
    let Some(skill_file_path) = resolve_skill_file_path(skill_dir) else {
        return Ok(None);
    };

    let content = fs::read_to_string(&skill_file_path)
        .map_err(|e| format!("Failed to read {}: {}", skill_file_path.display(), e))?;
    let (parsed_name, parsed_description) = parse_skill_markdown(&content);

    let fallback_name = skill_dir
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| *value != "skills")
        .map(str::to_string)
        .unwrap_or_else(|| "Skill".to_string());
    let name = parsed_name.unwrap_or(fallback_name);

    Ok(Some(OpenClawInstalledSkill {
        id: derive_skill_id(skill_dir, &name),
        name,
        description: parsed_description.filter(|value| !value.trim().is_empty()),
        path: skill_dir.display().to_string(),
        skill_file_path: skill_file_path.display().to_string(),
    }))
}

fn resolve_agent_value(config: &Value, agent_id: &str) -> Value {
    config
        .get("agents")
        .and_then(|value| value.get("list"))
        .and_then(Value::as_array)
        .and_then(|agents| {
            agents.iter().find(|entry| {
                entry
                    .get("id")
                    .and_then(Value::as_str)
                    .map(|value| value == agent_id)
                    .unwrap_or(false)
            })
        })
        .cloned()
        .unwrap_or_else(|| json!({ "id": agent_id }))
}

pub fn get_agents_defaults() -> Result<Option<OpenClawAgentsDefaults>, String> {
    let config = read_openclaw_config()?;

    let Some(defaults_value) = config.get("agents").and_then(|a| a.get("defaults")) else {
        return Ok(None);
    };

    serde_json::from_value(defaults_value.clone())
        .map_err(|e| format!("Failed to parse agents.defaults: {}", e))
        .map(Some)
}

pub fn get_agents() -> Result<Value, String> {
    let config = read_openclaw_config()?;
    let agents = config
        .get("agents")
        .and_then(|value| value.get("list"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let details = agents
        .into_iter()
        .filter(|agent| agent.get("id").and_then(Value::as_str).is_some())
        .map(|agent| {
            let auth_profiles_path = get_agent_auth_profiles_path(&agent);
            json!({
                "agent": agent,
                "authProfilesPath": auth_profiles_path.display().to_string(),
                "authProfilesExists": auth_profiles_path.exists(),
            })
        })
        .collect::<Vec<_>>();

    Ok(Value::Array(details))
}

pub fn get_agent_skills(agent_id: &str) -> Result<OpenClawAgentSkillsInventory, String> {
    let config = read_openclaw_config()?;
    let agent = resolve_agent_value(&config, agent_id);

    let workspace = get_agent_workspace_path(&agent);
    let skills_dir = workspace.join("skills");
    let mut skills = Vec::new();

    if skills_dir.exists() && skills_dir.is_dir() {
        if let Some(root_skill) = read_skill_entry(&skills_dir)? {
            skills.push(root_skill);
        }

        let mut entries = fs::read_dir(&skills_dir)
            .map_err(|e| format!("Failed to read {}: {}", skills_dir.display(), e))?
            .filter_map(|entry| entry.ok())
            .collect::<Vec<_>>();

        entries.sort_by_key(|entry| entry.file_name());

        for entry in entries {
            let entry_path = entry.path();
            let file_name = entry.file_name();
            let Some(file_name) = file_name.to_str() else {
                continue;
            };

            if file_name.starts_with('.') || !entry_path.is_dir() {
                continue;
            }

            if let Some(skill) = read_skill_entry(&entry_path)? {
                skills.push(skill);
            }
        }
    }

    skills.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    skills.dedup_by(|left, right| left.id == right.id);

    Ok(OpenClawAgentSkillsInventory {
        agent_id: agent_id.to_string(),
        workspace: workspace.display().to_string(),
        skills_dir: skills_dir.display().to_string(),
        skills,
    })
}

pub fn install_agent_skill(
    agent_id: &str,
    skill_slug: &str,
) -> Result<OpenClawAgentSkillsInventory, String> {
    let trimmed_slug = skill_slug.trim();
    if trimmed_slug.is_empty() {
        return Err("Skill slug is required".to_string());
    }

    let config = read_openclaw_config()?;
    let agent = resolve_agent_value(&config, agent_id);
    let workspace = get_agent_workspace_path(&agent);
    fs::create_dir_all(&workspace)
        .map_err(|error| format!("Failed to create {}: {}", workspace.display(), error))?;

    let openclaw_command = resolve_openclaw_command()
        .ok_or_else(|| "Unable to find the openclaw executable on this machine".to_string())?;

    let output = Command::new(&openclaw_command)
        .arg("skills")
        .arg("install")
        .arg(trimmed_slug)
        .current_dir(&workspace)
        .output()
        .map_err(|error| {
            format!(
                "Failed to run `openclaw skills install {}` in {}: {}",
                trimmed_slug,
                workspace.display(),
                error
            )
        })?;

    let stdout = clean_command_output(String::from_utf8_lossy(&output.stdout).as_ref());
    let stderr = clean_command_output(String::from_utf8_lossy(&output.stderr).as_ref());

    if !output.status.success() {
        let details = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("Process exited with code {:?}", output.status.code())
        };

        return Err(format!(
            "Failed to install skill `{}` for agent `{}` in {}: {}",
            trimmed_slug,
            agent_id,
            workspace.display(),
            details
        ));
    }

    get_agent_skills(agent_id)
}

pub fn get_agent_workspace_docs(agent_id: &str) -> Result<Value, String> {
    let config = read_openclaw_config()?;
    let agent = resolve_agent_value(&config, agent_id);

    let workspace = get_agent_workspace_path(&agent);
    let agent_name = resolve_agent_display_name(&agent);
    let file_names = ["SOUL.md", "IDENTITY.md", "AGENTS.md", "TOOLS.md", "USER.md"];
    let mut docs = Map::new();

    fs::create_dir_all(&workspace).map_err(|e| {
        format!(
            "Failed to create workspace '{}': {}",
            workspace.display(),
            e
        )
    })?;

    for file_name in file_names {
        let path = workspace.join(file_name);
        let mut content = if path.exists() {
            fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?
        } else {
            String::new()
        };

        if is_uninitialized_workspace_doc(file_name, &content) {
            if let Some(next_content) = default_workspace_doc_content(file_name, &agent_name) {
                fs::write(&path, &next_content)
                    .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
                content = next_content;
            }
        }
        docs.insert(file_name.to_string(), Value::String(content));
    }

    Ok(json!({
        "workspace": workspace.display().to_string(),
        "docs": docs,
    }))
}

pub fn set_agent_workspace_doc(
    agent_id: &str,
    file_name: &str,
    content: &str,
) -> Result<(), String> {
    if !allowed_workspace_doc(file_name) {
        return Err(format!("Unsupported workspace doc '{}'.", file_name));
    }

    let config = read_openclaw_config()?;
    let agent = config
        .get("agents")
        .and_then(|value| value.get("list"))
        .and_then(Value::as_array)
        .and_then(|agents| {
            agents.iter().find(|entry| {
                entry
                    .get("id")
                    .and_then(Value::as_str)
                    .map(|value| value == agent_id)
                    .unwrap_or(false)
            })
        })
        .cloned()
        .unwrap_or_else(|| json!({ "id": agent_id }));

    let workspace = get_agent_workspace_path(&agent);
    fs::create_dir_all(&workspace).map_err(|e| {
        format!(
            "Failed to create workspace '{}': {}",
            workspace.display(),
            e
        )
    })?;
    let file_path = workspace.join(file_name);
    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write {}: {}", file_path.display(), e))?;
    Ok(())
}

pub fn get_session_bindings_overview() -> Result<OpenClawSessionBindingsOverview, String> {
    let config = read_openclaw_config()?;
    let bindings = read_session_bindings(&config);
    let binding_map: HashMap<String, String> = bindings
        .iter()
        .map(|binding| {
            (
                binding_match_key(&binding.match_rule),
                binding.agent_id.clone(),
            )
        })
        .collect();

    let agent_ids = config
        .get("agents")
        .and_then(|value| value.get("list"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|agent| agent.get("id").and_then(Value::as_str).map(str::to_string))
        .collect::<Vec<_>>();

    let mut sessions = Vec::new();

    for agent_id in agent_ids {
        let sessions_path = get_agent_sessions_path(&agent_id);
        if !sessions_path.exists() {
            continue;
        }

        let content = fs::read_to_string(&sessions_path)
            .map_err(|e| format!("Failed to read {}: {}", sessions_path.display(), e))?;
        let sessions_value: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse {}: {}", sessions_path.display(), e))?;
        let Some(sessions_obj) = sessions_value.as_object() else {
            continue;
        };

        for (key, session_value) in sessions_obj {
            let binding_match = infer_session_binding_match(key, session_value);
            let bound_agent_id = binding_match.as_ref().and_then(|binding_match| {
                binding_map.get(&binding_match_key(binding_match)).cloned()
            });
            let (title, subtitle) = describe_session(session_value, binding_match.as_ref());

            sessions.push(OpenClawSessionSummary {
                key: key.clone(),
                owner_agent_id: agent_id.clone(),
                session_id: session_value
                    .get("sessionId")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                updated_at: session_value.get("updatedAt").and_then(Value::as_i64),
                display_name: session_value
                    .get("displayName")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                chat_type: session_value
                    .get("chatType")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                channel: binding_match.as_ref().map(|entry| entry.channel.clone()),
                peer_kind: binding_match.as_ref().map(|entry| entry.peer.kind.clone()),
                peer_id: binding_match.as_ref().map(|entry| entry.peer.id.clone()),
                title,
                subtitle,
                bindable: binding_match.is_some(),
                r#match: binding_match,
                bound_agent_id,
            });
        }
    }

    sessions.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.title.cmp(&right.title))
            .then_with(|| left.owner_agent_id.cmp(&right.owner_agent_id))
    });

    Ok(OpenClawSessionBindingsOverview { bindings, sessions })
}

pub fn set_agent(agent_id: &str, agent_config: Value) -> Result<OpenClawWriteOutcome, String> {
    if agent_id.trim().is_empty() {
        return Err("Agent id cannot be empty.".to_string());
    }

    let mut config = read_openclaw_config()?;
    let normalized_agent = {
        let root = ensure_object(&mut config);
        let agents = root
            .entry("agents".to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        let list = ensure_object(agents)
            .entry("list".to_string())
            .or_insert_with(|| Value::Array(Vec::new()));

        if !list.is_array() {
            *list = Value::Array(Vec::new());
        }

        let list_arr = list.as_array_mut().expect("agents.list should be array");
        let existing_index = list_arr.iter().position(|entry| {
            entry
                .get("id")
                .and_then(Value::as_str)
                .map(|value| value == agent_id)
                .unwrap_or(false)
        });
        let existing_entry = existing_index
            .and_then(|index| list_arr.get(index))
            .cloned();
        let normalized_agent =
            normalize_agent_config(agent_id, existing_entry.as_ref(), &agent_config);

        if let Some(index) = existing_index {
            list_arr[index] = normalized_agent.clone();
        } else {
            list_arr.push(normalized_agent.clone());
        }

        normalized_agent
    };

    let outcome = write_full_config_value(&config)?;
    ensure_agent_support_files(&normalized_agent)?;
    Ok(outcome)
}

pub fn remove_agent(agent_id: &str) -> Result<OpenClawWriteOutcome, String> {
    let mut config = read_openclaw_config()?;
    let mut removed = false;

    if let Some(entries) = config
        .get_mut("agents")
        .and_then(|agents| agents.get_mut("list"))
        .and_then(Value::as_array_mut)
    {
        let previous_len = entries.len();
        entries.retain(|entry| {
            entry
                .get("id")
                .and_then(Value::as_str)
                .map(|value| value != agent_id)
                .unwrap_or(true)
        });
        removed = entries.len() != previous_len;
    }

    if !removed {
        return Ok(OpenClawWriteOutcome::default());
    }

    write_full_config_value(&config)
}

pub fn set_session_binding(
    agent_id: Option<&str>,
    binding_match: &OpenClawSessionBindingMatch,
) -> Result<OpenClawWriteOutcome, String> {
    if binding_match.channel.trim().is_empty()
        || binding_match.peer.kind.trim().is_empty()
        || binding_match.peer.id.trim().is_empty()
    {
        return Err("Session match is incomplete.".to_string());
    }

    let mut config = read_openclaw_config()?;

    if let Some(agent_id) = agent_id {
        let agent_exists = config
            .get("agents")
            .and_then(|value| value.get("list"))
            .and_then(Value::as_array)
            .map(|agents| {
                agents.iter().any(|agent| {
                    agent
                        .get("id")
                        .and_then(Value::as_str)
                        .map(|value| value == agent_id)
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);

        if !agent_exists {
            return Err(format!("Agent '{}' does not exist.", agent_id));
        }
    }

    let root = ensure_object(&mut config);
    let bindings_value = root
        .entry("bindings".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));

    if !bindings_value.is_array() {
        *bindings_value = Value::Array(Vec::new());
    }

    let bindings = bindings_value
        .as_array_mut()
        .expect("bindings should be array");

    bindings.retain(|entry| {
        parse_session_binding_match_from_value(entry.get("match").unwrap_or(&Value::Null))
            .map(|current_match| {
                binding_match_key(&current_match) != binding_match_key(binding_match)
            })
            .unwrap_or(true)
    });

    if let Some(agent_id) = agent_id.filter(|value| !value.trim().is_empty()) {
        let next_entry = serde_json::to_value(OpenClawSessionBinding {
            agent_id: agent_id.to_string(),
            match_rule: binding_match.clone(),
        })
        .map_err(|e| format!("Failed to serialize binding: {}", e))?;
        bindings.push(next_entry);
    }

    write_full_config_value(&config)
}

pub fn set_agents_defaults(
    defaults: &OpenClawAgentsDefaults,
) -> Result<OpenClawWriteOutcome, String> {
    let mut config = read_openclaw_config()?;
    let root = ensure_object(&mut config);
    let agents = root
        .entry("agents".to_string())
        .or_insert_with(|| Value::Object(Map::new()));

    let defaults_value = serde_json::to_value(defaults)
        .map_err(|e| format!("Failed to serialize defaults: {}", e))?;
    ensure_object(agents).insert("defaults".to_string(), defaults_value);

    let agents_value = root
        .get("agents")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));
    write_root_section("agents", &agents_value)
}
