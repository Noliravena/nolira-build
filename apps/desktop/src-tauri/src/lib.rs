mod agent;
mod domain;
mod store;
mod terminal;

use std::collections::BTreeMap;
use std::path::{Component, Path};
use std::sync::Arc;

use agent::AgentManager;
use base64::Engine;
use domain::{
    AgentEventPayload, AppSettings, BootstrapPayload, ChatMessage, ConversationTask, GitFileChange,
    GitSnapshot, MessageRole, Project, PromptAttachment, RuntimeInfo,
};
use serde::Deserialize;
use serde_json::json;
use store::StateStore;
use tauri::{AppHandle, Emitter, Manager, State};
use terminal::TerminalManager;
use tokio::process::Command;
use uuid::Uuid;

const MAX_ATTACHMENT_BYTES: u64 = 25 * 1024 * 1024;
const MAX_ARTIFACT_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone)]
struct AppState {
    store: Arc<StateStore>,
    agents: Arc<AgentManager>,
    terminals: Arc<TerminalManager>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendPromptInput {
    task_id: String,
    prompt: String,
    model_id: String,
    reasoning_effort: String,
    mode: String,
    approval_mode: String,
    #[serde(default)]
    attachments: Vec<PromptAttachment>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PastedAttachmentInput {
    name: String,
    mime: String,
    data_base64: String,
}

#[tauri::command]
async fn bootstrap(state: State<'_, AppState>) -> Result<BootstrapPayload, String> {
    let snapshot = state.store.snapshot().await;
    let runtime = state.agents.runtime_info(&snapshot.settings);
    Ok(BootstrapPayload {
        projects: snapshot.projects,
        tasks: snapshot.tasks,
        settings: snapshot.settings,
        providers: state.agents.providers(),
        runtime,
    })
}

#[tauri::command]
async fn add_project(state: State<'_, AppState>, path: String) -> Result<Project, String> {
    state.store.add_project(&path).await
}

#[tauri::command]
async fn update_project_context(
    state: State<'_, AppState>,
    project_id: String,
    instructions: String,
    memory: String,
) -> Result<Project, String> {
    state
        .store
        .update_project_context(&project_id, &instructions, &memory)
        .await
}

#[tauri::command]
async fn create_task(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<ConversationTask, String> {
    state.store.create_task(&project_id).await
}

#[tauri::command]
async fn rename_task(
    state: State<'_, AppState>,
    task_id: String,
    title: String,
) -> Result<(), String> {
    state.store.rename_task(&task_id, &title).await
}

#[tauri::command]
async fn update_task_preferences(
    state: State<'_, AppState>,
    task_id: String,
    model_id: String,
    reasoning_effort: String,
    mode: String,
    approval_mode: String,
) -> Result<ConversationTask, String> {
    validate_preferences(&reasoning_effort, &mode, &approval_mode)?;
    let (before, _, _) = state.store.task_context(&task_id).await?;
    let task = state
        .store
        .update_task_preferences(
            &task_id,
            &model_id,
            &reasoning_effort,
            &mode,
            &approval_mode,
        )
        .await?;
    if before.approval_mode != task.approval_mode {
        state.agents.remove(&task_id).await;
    }
    Ok(task)
}

#[tauri::command]
async fn fork_task(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<ConversationTask, String> {
    let (task, project, _) = state.store.task_context(&task_id).await?;
    let Some(connection) = state.agents.for_task(&task_id).await else {
        return state.store.fork_task(&task_id, String::new()).await;
    };
    if !connection.is_alive() {
        return state.store.fork_task(&task_id, String::new()).await;
    }
    if let Some(session_id) = connection.engine_session_id().await {
        state
            .store
            .save_engine_session(&task_id, session_id)
            .await?;
    }
    let session_id = match connection
        .fork_session(
            &project.path,
            (!task.model_id.is_empty()).then_some(task.model_id.as_str()),
        )
        .await
    {
        Ok(session_id) => session_id,
        Err(error) if is_method_not_found(&error) => String::new(),
        Err(error) => return Err(error),
    };
    state.store.fork_task(&task_id, session_id).await
}

#[tauri::command]
async fn delete_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state.agents.remove(&task_id).await;
    state.terminals.stop(&task_id);
    state.store.delete_task(&task_id).await
}

#[tauri::command]
async fn delete_project(state: State<'_, AppState>, project_id: String) -> Result<(), String> {
    let task_ids = state.store.tasks_for_project(&project_id).await;
    state.agents.remove_many(&task_ids).await;
    state.terminals.stop_many(&task_ids);
    state.store.delete_project(&project_id).await
}

#[tauri::command]
async fn update_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<RuntimeInfo, String> {
    state.store.update_settings(settings.clone()).await?;
    Ok(state.agents.runtime_info(&settings))
}

#[tauri::command]
async fn describe_attachments(paths: Vec<String>) -> Result<Vec<PromptAttachment>, String> {
    paths
        .iter()
        .map(|path| describe_attachment(Path::new(path)))
        .collect()
}

#[tauri::command]
async fn save_pasted_attachment(input: PastedAttachmentInput) -> Result<PromptAttachment, String> {
    let data = base64::engine::general_purpose::STANDARD
        .decode(input.data_base64)
        .map_err(|error| format!("invalid clipboard attachment: {error}"))?;
    if data.len() as u64 > MAX_ATTACHMENT_BYTES {
        return Err("clipboard attachment exceeds the 25 MB limit".into());
    }
    let safe_name = sanitize_file_name(&input.name);
    let directory = std::env::temp_dir().join("nolira-build-attachments");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("{}-{safe_name}", Uuid::new_v4()));
    std::fs::write(&path, data).map_err(|error| error.to_string())?;
    let mut attachment = describe_attachment(&path)?;
    attachment.name = safe_name;
    attachment.mime = Some(input.mime);
    Ok(attachment)
}

#[tauri::command]
async fn search_project_files(
    state: State<'_, AppState>,
    task_id: String,
    query: String,
) -> Result<Vec<PromptAttachment>, String> {
    let root = state.store.task_project_path(&task_id).await?;
    let mut command = Command::new("git");
    command
        .args(["ls-files", "--cached", "--others", "--exclude-standard"])
        .current_dir(&root);
    let output = command.output().await;
    let text = match output {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).to_string()
        }
        _ => {
            let output = Command::new("rg")
                .args(["--files", "--hidden", "-g", "!.git"])
                .current_dir(&root)
                .output()
                .await
                .map_err(|error| format!("cannot list project files: {error}"))?;
            String::from_utf8_lossy(&output.stdout).to_string()
        }
    };
    let needle = query.trim().to_lowercase();
    let mut matches = text
        .lines()
        .filter(|path| needle.is_empty() || path.to_lowercase().contains(&needle))
        .filter_map(|relative| {
            let path = Path::new(&root).join(relative);
            describe_attachment(&path).ok()
        })
        .take(80)
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(matches)
}

#[tauri::command]
async fn send_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    input: SendPromptInput,
) -> Result<ConversationTask, String> {
    let prompt = input.prompt.trim();
    if prompt.is_empty() && input.attachments.is_empty() {
        return Err("prompt or attachment is required".into());
    }
    validate_preferences(&input.reasoning_effort, &input.mode, &input.approval_mode)?;
    for attachment in &input.attachments {
        describe_attachment(Path::new(&attachment.path))?;
    }

    // Grok versions without x.ai/session/fork create a fresh local task. Seed the
    // first turn of that task with its cloned transcript so the branch still has
    // conversational context while remaining isolated from the source session.
    let (task_before_prompt, _, _) = state.store.task_context(&input.task_id).await?;
    let prompt_for_agent = if task_before_prompt.engine_session_id.is_none()
        && !task_before_prompt.messages.is_empty()
    {
        local_fork_prompt(&task_before_prompt.messages, prompt)
    } else {
        prompt.to_string()
    };

    let (task_snapshot, assistant_id) = state
        .store
        .prepare_prompt(
            &input.task_id,
            prompt,
            &input.model_id,
            &input.reasoning_effort,
            &input.mode,
            &input.approval_mode,
            input.attachments.clone(),
        )
        .await?;

    let background = state.inner().clone();
    let app_handle = app.clone();
    let task_id = input.task_id.clone();
    tauri::async_runtime::spawn(async move {
        emit_agent(
            &app_handle,
            "status",
            &task_id,
            json!({ "status": "connecting" }),
        );
        let result = async {
            let (task, project, settings) = background.store.task_context(&task_id).await?;
            let connection = background
                .agents
                .connection(app_handle.clone(), &task, &project, &settings)
                .await?;
            if let Some(session_id) = connection.engine_session_id().await {
                background
                    .store
                    .save_engine_session(&task_id, session_id)
                    .await?;
            }
            emit_agent(
                &app_handle,
                "status",
                &task_id,
                json!({ "status": "streaming" }),
            );
            connection
                .prompt(
                    &prompt_for_agent,
                    &input.attachments,
                    &project,
                    (!input.model_id.is_empty()).then_some(input.model_id.as_str()),
                    &input.reasoning_effort,
                    &input.mode,
                )
                .await
        }
        .await;

        match result {
            Ok(turn) => {
                let _ = background
                    .store
                    .finish_turn(&task_id, &assistant_id, turn)
                    .await;
            }
            Err(error) => {
                let _ = background
                    .store
                    .fail_turn(&task_id, &assistant_id, &error)
                    .await;
                emit_agent(&app_handle, "error", &task_id, json!({ "message": error }));
            }
        }
    });

    Ok(task_snapshot)
}

#[tauri::command]
async fn resolve_permission(
    state: State<'_, AppState>,
    task_id: String,
    request_id: String,
    decision: String,
) -> Result<(), String> {
    let connection = state
        .agents
        .for_task(&task_id)
        .await
        .ok_or_else(|| "task agent is not running".to_string())?;
    connection.resolve_permission(&request_id, &decision).await
}

#[tauri::command]
async fn cancel_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    if let Some(connection) = state.agents.for_task(&task_id).await {
        connection.cancel().await?;
    }
    Ok(())
}

#[tauri::command]
async fn git_snapshot(state: State<'_, AppState>, task_id: String) -> Result<GitSnapshot, String> {
    let root = state.store.task_project_path(&task_id).await?;
    let branch = git_text(&root, &["branch", "--show-current"])
        .await
        .unwrap_or_default()
        .trim()
        .to_string();
    let branch = if branch.is_empty() {
        git_text(&root, &["rev-parse", "--short", "HEAD"])
            .await
            .unwrap_or_else(|_| "not a git repository".into())
            .trim()
            .to_string()
    } else {
        branch
    };
    let status = git_text(
        &root,
        &["status", "--porcelain=v1", "--untracked-files=all"],
    )
    .await?;
    let mut files = BTreeMap::<String, (String, bool, bool)>::new();
    for line in status.lines().filter(|line| line.len() >= 3) {
        let bytes = line.as_bytes();
        let x = bytes[0] as char;
        let y = bytes[1] as char;
        let raw_path = line[3..].trim_matches('"');
        let path = raw_path
            .rsplit(" -> ")
            .next()
            .unwrap_or(raw_path)
            .to_string();
        let staged = x != ' ' && x != '?';
        let unstaged = y != ' ' || x == '?';
        let label = if x == '?' {
            "?".into()
        } else {
            format!("{x}{y}").trim().into()
        };
        files.insert(path, (label, staged, unstaged));
    }

    let mut changes = Vec::with_capacity(files.len());
    for (path, (status, staged, unstaged)) in files {
        let mut sections = Vec::new();
        if staged {
            let patch = git_text(&root, &["diff", "--cached", "--no-ext-diff", "--", &path])
                .await
                .unwrap_or_default();
            if !patch.is_empty() {
                sections.push(format!("Staged\n{patch}"));
            }
        }
        if unstaged && status != "?" {
            let patch = git_text(&root, &["diff", "--no-ext-diff", "--", &path])
                .await
                .unwrap_or_default();
            if !patch.is_empty() {
                sections.push(format!("Unstaged\n{patch}"));
            }
        }
        if status == "?" {
            if let Ok(content) = std::fs::read_to_string(Path::new(&root).join(&path)) {
                let preview = content
                    .lines()
                    .take(1200)
                    .map(|line| format!("+{line}"))
                    .collect::<Vec<_>>()
                    .join("\n");
                sections.push(format!("Untracked\n--- /dev/null\n+++ b/{path}\n{preview}"));
            }
        }
        let patch = sections.join("\n\n");
        let (additions, deletions) = count_patch_lines(&patch);
        changes.push(GitFileChange {
            path,
            status,
            staged,
            unstaged,
            additions,
            deletions,
            patch: patch.chars().take(80_000).collect(),
        });
    }
    Ok(GitSnapshot {
        branch,
        clean: changes.is_empty(),
        files: changes,
    })
}

#[tauri::command]
async fn git_stage(
    state: State<'_, AppState>,
    task_id: String,
    paths: Vec<String>,
) -> Result<(), String> {
    let root = state.store.task_project_path(&task_id).await?;
    validate_git_paths(&paths)?;
    let mut args = vec!["add", "--"];
    args.extend(paths.iter().map(String::as_str));
    git_text(&root, &args).await.map(|_| ())
}

#[tauri::command]
async fn git_unstage(
    state: State<'_, AppState>,
    task_id: String,
    paths: Vec<String>,
) -> Result<(), String> {
    let root = state.store.task_project_path(&task_id).await?;
    validate_git_paths(&paths)?;
    let mut args = vec!["restore", "--staged", "--"];
    args.extend(paths.iter().map(String::as_str));
    if git_text(&root, &args).await.is_err() {
        let mut fallback = vec!["reset", "--"];
        fallback.extend(paths.iter().map(String::as_str));
        git_text(&root, &fallback).await?;
    }
    Ok(())
}

#[tauri::command]
async fn terminal_start(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let root = state.store.task_project_path(&task_id).await?;
    state.terminals.start(app, &task_id, &root, rows, cols)
}

#[tauri::command]
fn terminal_write(
    state: State<'_, AppState>,
    task_id: String,
    input: String,
) -> Result<(), String> {
    state.terminals.write(&task_id, &input)
}

#[tauri::command]
fn terminal_resize(
    state: State<'_, AppState>,
    task_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    state.terminals.resize(&task_id, rows, cols)
}

#[tauri::command]
fn terminal_stop(state: State<'_, AppState>, task_id: String) {
    state.terminals.stop(&task_id);
}

#[tauri::command]
fn write_artifact(path: String, content: String) -> Result<(), String> {
    if content.len() > MAX_ARTIFACT_BYTES {
        return Err("artifact exceeds the 4 MB limit".into());
    }
    let path = Path::new(&path);
    if path.as_os_str().is_empty() || path.is_dir() {
        return Err("choose a file path for the artifact".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(path, content).map_err(|error| error.to_string())
}

async fn git_text(root: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .await
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
    let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if message.is_empty() {
        format!("git exited with {}", output.status.code().unwrap_or(-1))
    } else {
        message
    })
}

fn describe_attachment(path: &Path) -> Result<PromptAttachment, String> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("cannot open attachment {}: {error}", path.display()))?;
    if !canonical.is_file() {
        return Err(format!("attachment is not a file: {}", path.display()));
    }
    let metadata = canonical.metadata().map_err(|error| error.to_string())?;
    if metadata.len() > MAX_ATTACHMENT_BYTES {
        return Err(format!(
            "attachment {} exceeds the 25 MB limit",
            canonical.display()
        ));
    }
    Ok(PromptAttachment {
        path: canonical.to_string_lossy().to_string(),
        name: canonical
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("attachment")
            .to_string(),
        mime: mime_guess::from_path(&canonical)
            .first_raw()
            .map(str::to_string),
        size: Some(metadata.len()),
    })
}

fn validate_preferences(effort: &str, mode: &str, approval_mode: &str) -> Result<(), String> {
    if !["low", "medium", "high", "xhigh"].contains(&effort) {
        return Err("unsupported reasoning effort".into());
    }
    if !["default", "plan"].contains(&mode) {
        return Err("unsupported task mode".into());
    }
    if !["ask", "full_access"].contains(&approval_mode) {
        return Err("unsupported approval mode".into());
    }
    Ok(())
}

fn validate_git_paths(paths: &[String]) -> Result<(), String> {
    if paths.is_empty() {
        return Err("select at least one changed file".into());
    }
    for raw in paths {
        let path = Path::new(raw);
        if path.is_absolute()
            || path.components().any(|component| {
                matches!(
                    component,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err(format!("invalid repository path: {raw}"));
        }
    }
    Ok(())
}

fn count_patch_lines(patch: &str) -> (usize, usize) {
    let additions = patch
        .lines()
        .filter(|line| line.starts_with('+') && !line.starts_with("+++"))
        .count();
    let deletions = patch
        .lines()
        .filter(|line| line.starts_with('-') && !line.starts_with("---"))
        .count();
    (additions, deletions)
}

fn sanitize_file_name(name: &str) -> String {
    let value = Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("clipboard-attachment");
    let clean = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    if clean.is_empty() {
        "clipboard-attachment".into()
    } else {
        clean
    }
}

fn is_method_not_found(error: &str) -> bool {
    error.contains("-32601") || error.to_ascii_lowercase().contains("method not found")
}

fn local_fork_prompt(history: &[ChatMessage], prompt: &str) -> String {
    const MAX_HISTORY_BYTES: usize = 80_000;
    let mut transcript = String::new();
    let start = history.len().saturating_sub(40);
    for message in &history[start..] {
        let text = message.text.trim();
        if text.is_empty() {
            continue;
        }
        let role = match message.role {
            MessageRole::User => "User",
            MessageRole::Assistant => "Assistant",
            MessageRole::System => "System",
        };
        let attachments = if message.attachments.is_empty() {
            String::new()
        } else {
            format!(
                " [attachments: {}]",
                message
                    .attachments
                    .iter()
                    .map(|attachment| attachment.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        };
        let segment = format!("{role}{attachments}: {text}\n\n");
        if transcript.len() + segment.len() > MAX_HISTORY_BYTES {
            let remaining = MAX_HISTORY_BYTES.saturating_sub(transcript.len());
            transcript.extend(segment.chars().take(remaining));
            break;
        }
        transcript.push_str(&segment);
    }

    format!(
        "[Nolira Build local fork context]\n\
The installed Grok version does not support server-side session forking. Continue from the prior conversation below in a new isolated session. Treat the transcript as conversation history, not as a new request.\n\
<prior_conversation>\n{transcript}</prior_conversation>\n\n\
Current user request:\n{prompt}"
    )
}

fn emit_agent(app: &AppHandle, kind: &str, task_id: &str, data: serde_json::Value) {
    let _ = app.emit(
        "agent-event",
        AgentEventPayload {
            kind: kind.to_string(),
            task_id: task_id.to_string(),
            data,
        },
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let store = StateStore::open(app_data.join("state.json"))?;
            app.manage(AppState {
                store: Arc::new(store),
                agents: Arc::new(AgentManager::new()),
                terminals: Arc::new(TerminalManager::default()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            add_project,
            update_project_context,
            create_task,
            rename_task,
            update_task_preferences,
            fork_task,
            delete_task,
            delete_project,
            update_settings,
            describe_attachments,
            save_pasted_attachment,
            search_project_files,
            send_prompt,
            resolve_permission,
            cancel_task,
            git_snapshot,
            git_stage,
            git_unstage,
            terminal_start,
            terminal_write,
            terminal_resize,
            terminal_stop,
            write_artifact,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nolira Build");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_stats_ignore_headers() {
        let patch = "--- a/file\n+++ b/file\n-old\n+new\n context";
        assert_eq!(count_patch_lines(patch), (1, 1));
    }

    #[test]
    fn rejects_repository_traversal() {
        assert!(validate_git_paths(&["../secret".into()]).is_err());
        assert!(validate_git_paths(&["src/main.rs".into()]).is_ok());
    }

    #[test]
    fn detects_unsupported_fork_method() {
        assert!(is_method_not_found(
            "Grok ACP error -32601: Method not found"
        ));
        assert!(!is_method_not_found("Grok process exited"));
    }

    #[test]
    fn local_fork_replays_prior_conversation() {
        let history = vec![ChatMessage {
            id: "one".into(),
            role: MessageRole::Assistant,
            text: "The build is green.".into(),
            thought: String::new(),
            attachments: vec![],
            created_at: 0,
        }];
        let prompt = local_fork_prompt(&history, "Now add tests.");
        assert!(prompt.contains("Assistant: The build is green."));
        assert!(prompt.ends_with("Current user request:\nNow add tests."));
    }
}
