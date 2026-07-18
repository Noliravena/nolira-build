mod agent;
mod domain;
mod store;

use std::sync::Arc;

use agent::AgentManager;
use domain::{
    AgentEventPayload, AppSettings, BootstrapPayload, ConversationTask, Project, RuntimeInfo,
};
use serde::Deserialize;
use serde_json::json;
use store::StateStore;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::process::Command;

#[derive(Clone)]
struct AppState {
    store: Arc<StateStore>,
    agents: Arc<AgentManager>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendPromptInput {
    task_id: String,
    prompt: String,
    model_id: String,
    reasoning_effort: String,
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
async fn delete_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state.agents.remove(&task_id).await;
    state.store.delete_task(&task_id).await
}

#[tauri::command]
async fn delete_project(state: State<'_, AppState>, project_id: String) -> Result<(), String> {
    let task_ids = state.store.tasks_for_project(&project_id).await;
    state.agents.remove_many(&task_ids).await;
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
async fn send_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    input: SendPromptInput,
) -> Result<ConversationTask, String> {
    let prompt = input.prompt.trim();
    if prompt.is_empty() {
        return Err("prompt cannot be empty".into());
    }
    if !["low", "medium", "high", "xhigh"].contains(&input.reasoning_effort.as_str()) {
        return Err("unsupported reasoning effort".into());
    }

    let (task_snapshot, assistant_id) = state
        .store
        .prepare_prompt(
            &input.task_id,
            prompt,
            &input.model_id,
            &input.reasoning_effort,
        )
        .await?;

    let background = state.inner().clone();
    let app_handle = app.clone();
    let task_id = input.task_id.clone();
    let prompt = prompt.to_string();
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
                    &prompt,
                    (!input.model_id.is_empty()).then_some(input.model_id.as_str()),
                    &input.reasoning_effort,
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
async fn git_snapshot(state: State<'_, AppState>, task_id: String) -> Result<String, String> {
    let path = state.store.task_project_path(&task_id).await?;
    let status = run_command("git", &["status", "--short", "--branch"], &path).await;
    let stat = run_command("git", &["diff", "--stat"], &path).await;
    let diff = run_command("git", &["diff", "--", "."], &path).await;
    let result = [status, stat, diff.chars().take(48_000).collect()]
        .into_iter()
        .filter(|section| !section.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    Ok(if result.is_empty() {
        "Working tree clean.".into()
    } else {
        result
    })
}

#[tauri::command]
async fn run_terminal_command(
    state: State<'_, AppState>,
    task_id: String,
    command: String,
) -> Result<String, String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("command cannot be empty".into());
    }
    let path = state.store.task_project_path(&task_id).await?;
    #[cfg(target_os = "windows")]
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", command])
        .current_dir(path)
        .output()
        .await;
    #[cfg(target_os = "macos")]
    let output = Command::new("/bin/zsh")
        .args(["-lc", command])
        .current_dir(path)
        .output()
        .await;
    #[cfg(all(unix, not(target_os = "macos")))]
    let output = Command::new("/bin/sh")
        .args(["-lc", command])
        .current_dir(path)
        .output()
        .await;
    let output = output.map_err(|error| error.to_string())?;
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    if text.is_empty() {
        text = format!(
            "Process exited with code {}",
            output.status.code().unwrap_or(-1)
        );
    }
    Ok(text)
}

async fn run_command(executable: &str, args: &[&str], path: &str) -> String {
    match Command::new(executable)
        .args(args)
        .current_dir(path)
        .output()
        .await
    {
        Ok(output) => {
            let mut text = String::from_utf8_lossy(&output.stdout).to_string();
            text.push_str(&String::from_utf8_lossy(&output.stderr));
            text
        }
        Err(error) => error.to_string(),
    }
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
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            add_project,
            create_task,
            rename_task,
            delete_task,
            delete_project,
            update_settings,
            send_prompt,
            resolve_permission,
            cancel_task,
            git_snapshot,
            run_terminal_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nolira Build");
}
