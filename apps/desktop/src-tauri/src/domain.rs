use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub role: MessageRole,
    pub text: String,
    pub thought: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolActivity {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub status: ToolStatus,
    pub input: Option<String>,
    pub output: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationTask {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub provider_id: String,
    pub model_id: String,
    pub reasoning_effort: String,
    pub engine_session_id: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<ToolActivity>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub custom_engine_path: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedState {
    pub projects: Vec<Project>,
    pub tasks: Vec<ConversationTask>,
    pub settings: AppSettings,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDescriptor {
    pub id: String,
    pub name: String,
    pub detail: String,
    pub transport: String,
    pub capabilities: Vec<String>,
    pub is_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub status: String,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub projects: Vec<Project>,
    pub tasks: Vec<ConversationTask>,
    pub settings: AppSettings,
    pub providers: Vec<ProviderDescriptor>,
    pub runtime: RuntimeInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEventPayload {
    pub kind: String,
    pub task_id: String,
    pub data: Value,
}

#[derive(Debug, Clone, Default)]
pub struct TurnResult {
    pub text: String,
    pub thought: String,
    pub tools: Vec<ToolActivity>,
}

pub fn now_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn suggested_title(prompt: &str) -> String {
    let compact = prompt.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.is_empty() {
        return "New task".into();
    }
    let mut chars = compact.chars();
    let prefix = chars.by_ref().take(42).collect::<String>();
    if chars.next().is_some() {
        format!("{prefix}…")
    } else {
        prefix
    }
}

pub fn provider_catalog() -> Vec<ProviderDescriptor> {
    vec![
        ProviderDescriptor {
            id: "grok".into(),
            name: "Grok Build".into(),
            detail: "Local Grok CLI with structured coding-agent events".into(),
            transport: "ACP · stdio".into(),
            capabilities: vec![
                "streaming".into(),
                "tools".into(),
                "permissions".into(),
                "resume".into(),
                "models".into(),
            ],
            is_available: true,
        },
        ProviderDescriptor {
            id: "acp-custom".into(),
            name: "Custom ACP provider".into(),
            detail: "Reserved for another ACP-compatible coding agent".into(),
            transport: "ACP · configurable".into(),
            capabilities: vec!["streaming".into(), "tools".into(), "permissions".into()],
            is_available: false,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_are_compact_and_bounded() {
        assert_eq!(suggested_title("  fix   login  "), "fix login");
        let title = suggested_title(&"a".repeat(80));
        assert_eq!(title.chars().count(), 43);
        assert!(title.ends_with('…'));
    }

    #[test]
    fn provider_catalog_starts_with_grok() {
        let providers = provider_catalog();
        assert_eq!(providers[0].id, "grok");
        assert!(providers[0]
            .capabilities
            .contains(&"permissions".to_string()));
        assert!(!providers[1].is_available);
    }
}
