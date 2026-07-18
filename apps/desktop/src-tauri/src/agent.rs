use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex, RwLock};
use uuid::Uuid;

use crate::domain::{
    AgentEventPayload, AppSettings, ConversationTask, ModelOption, Project, PromptAttachment,
    ProviderDescriptor, RuntimeInfo, ToolActivity, ToolStatus, TurnResult,
};

const RPC_TIMEOUT: Duration = Duration::from_secs(120);
const PROMPT_TIMEOUT: Duration = Duration::from_secs(6 * 60 * 60);

pub trait ProviderAdapter: Send + Sync {
    fn descriptor(&self) -> ProviderDescriptor;
    fn resolve_executable(&self, custom_path: Option<&str>) -> Result<PathBuf, String>;
    fn command(
        &self,
        executable: &Path,
        cwd: &Path,
        model_id: Option<&str>,
        approval_mode: &str,
    ) -> Command;
}

#[derive(Default)]
pub struct GrokProvider;

impl ProviderAdapter for GrokProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        crate::domain::provider_catalog().remove(0)
    }

    fn resolve_executable(&self, custom_path: Option<&str>) -> Result<PathBuf, String> {
        if let Some(path) = custom_path.filter(|path| !path.trim().is_empty()) {
            let candidate = PathBuf::from(path);
            if candidate.is_file() {
                return Ok(candidate);
            }
            return Err(format!("configured Grok executable does not exist: {path}"));
        }

        if let Some(path) = std::env::var_os("NOLIRA_GROK_PATH").map(PathBuf::from) {
            if path.is_file() {
                return Ok(path);
            }
        }

        if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
            let candidate = home.join(".grok/bin/grok");
            if candidate.is_file() {
                return Ok(candidate);
            }
        }

        for candidate in ["/opt/homebrew/bin/grok", "/usr/local/bin/grok"] {
            let path = PathBuf::from(candidate);
            if path.is_file() {
                return Ok(path);
            }
        }

        which::which("grok").map_err(|_| {
            "Grok CLI not found. Install Grok or select its executable in Settings.".into()
        })
    }

    fn command(
        &self,
        executable: &Path,
        cwd: &Path,
        model_id: Option<&str>,
        approval_mode: &str,
    ) -> Command {
        let mut command = Command::new(executable);
        command.arg("agent");
        if let Some(model_id) = model_id.filter(|model| !model.is_empty()) {
            command.args(["--model", model_id]);
        }
        if approval_mode == "full_access" {
            command.arg("--always-approve");
        }
        command
            .arg("stdio")
            .current_dir(cwd)
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command
    }
}

pub struct AgentManager {
    provider: Arc<dyn ProviderAdapter>,
    connections: Mutex<HashMap<String, Arc<AcpConnection>>>,
}

impl AgentManager {
    pub fn new() -> Self {
        Self {
            provider: Arc::new(GrokProvider),
            connections: Mutex::new(HashMap::new()),
        }
    }

    pub fn runtime_info(&self, settings: &AppSettings) -> RuntimeInfo {
        let custom = settings.custom_engine_path.as_deref();
        match self.provider.resolve_executable(custom) {
            Ok(path) => {
                let version = std::process::Command::new(&path)
                    .arg("--version")
                    .output()
                    .ok()
                    .and_then(|output| String::from_utf8(output.stdout).ok())
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty());
                RuntimeInfo {
                    status: "ready".into(),
                    path: Some(path.to_string_lossy().to_string()),
                    version,
                }
            }
            Err(error) => RuntimeInfo {
                status: error,
                path: None,
                version: None,
            },
        }
    }

    pub fn providers(&self) -> Vec<ProviderDescriptor> {
        let mut providers = vec![self.provider.descriptor()];
        if let Some(future) = crate::domain::provider_catalog().into_iter().nth(1) {
            providers.push(future);
        }
        providers
    }

    pub async fn connection(
        &self,
        app: AppHandle,
        task: &ConversationTask,
        project: &Project,
        settings: &AppSettings,
    ) -> Result<Arc<AcpConnection>, String> {
        if let Some(connection) = self.connections.lock().await.get(&task.id).cloned() {
            if connection.is_alive() {
                return Ok(connection);
            }
        }

        let executable = self
            .provider
            .resolve_executable(settings.custom_engine_path.as_deref())?;
        let command = self.provider.command(
            &executable,
            Path::new(&project.path),
            (!task.model_id.is_empty()).then_some(task.model_id.as_str()),
            &task.approval_mode,
        );
        let connection = AcpConnection::spawn(
            app,
            task.id.clone(),
            command,
            &project.path,
            task.engine_session_id.as_deref(),
        )
        .await?;
        self.connections
            .lock()
            .await
            .insert(task.id.clone(), Arc::clone(&connection));
        Ok(connection)
    }

    pub async fn for_task(&self, task_id: &str) -> Option<Arc<AcpConnection>> {
        self.connections.lock().await.get(task_id).cloned()
    }

    pub async fn remove(&self, task_id: &str) {
        if let Some(connection) = self.connections.lock().await.remove(task_id) {
            connection.shutdown().await;
        }
    }

    pub async fn remove_many(&self, task_ids: &[String]) {
        for task_id in task_ids {
            self.remove(task_id).await;
        }
    }
}

pub struct AcpConnection {
    app: AppHandle,
    task_id: String,
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    next_id: AtomicU64,
    pending_permissions: Mutex<HashMap<String, Value>>,
    session_id: RwLock<Option<String>>,
    models: RwLock<Vec<ModelOption>>,
    accumulator: Mutex<TurnResult>,
    alive: AtomicBool,
    shutting_down: AtomicBool,
}

impl AcpConnection {
    async fn spawn(
        app: AppHandle,
        task_id: String,
        mut command: Command,
        cwd: &str,
        existing_session_id: Option<&str>,
    ) -> Result<Arc<Self>, String> {
        let mut child = command
            .spawn()
            .map_err(|error| format!("failed to start Grok: {error}"))?;
        let stdin = child.stdin.take().ok_or("Grok stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("Grok stdout unavailable")?;
        let stderr = child.stderr.take().ok_or("Grok stderr unavailable")?;

        let connection = Arc::new(Self {
            app,
            task_id,
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            pending_permissions: Mutex::new(HashMap::new()),
            session_id: RwLock::new(None),
            models: RwLock::new(vec![]),
            accumulator: Mutex::new(TurnResult::default()),
            alive: AtomicBool::new(true),
            shutting_down: AtomicBool::new(false),
        });

        let reader = Arc::clone(&connection);
        tauri::async_runtime::spawn(async move {
            reader.read_loop(stdout).await;
        });
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(_line)) = lines.next_line().await {}
        });

        if let Err(error) = connection.handshake(cwd, existing_session_id).await {
            connection.shutdown().await;
            return Err(error);
        }
        Ok(connection)
    }

    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed)
    }

    pub async fn engine_session_id(&self) -> Option<String> {
        self.session_id.read().await.clone()
    }

    async fn handshake(&self, cwd: &str, existing_session_id: Option<&str>) -> Result<(), String> {
        self.request(
            "initialize",
            json!({
                "protocolVersion": 1,
                "clientInfo": { "name": "Nolira Build", "version": "0.1.0" },
                "clientCapabilities": {
                    "fs": { "readTextFile": false, "writeTextFile": false },
                    "terminal": false
                }
            }),
            RPC_TIMEOUT,
        )
        .await?;

        let result = if let Some(existing) = existing_session_id.filter(|value| !value.is_empty()) {
            match self
                .request(
                    "session/load",
                    json!({ "sessionId": existing, "cwd": cwd, "mcpServers": [] }),
                    RPC_TIMEOUT,
                )
                .await
            {
                Ok(result) => result,
                Err(_) => {
                    self.request(
                        "session/new",
                        json!({ "cwd": cwd, "mcpServers": [] }),
                        RPC_TIMEOUT,
                    )
                    .await?
                }
            }
        } else {
            self.request(
                "session/new",
                json!({ "cwd": cwd, "mcpServers": [] }),
                RPC_TIMEOUT,
            )
            .await?
        };

        let session_id = result
            .get("sessionId")
            .or_else(|| result.get("session_id"))
            .and_then(Value::as_str)
            .map(str::to_owned)
            .or_else(|| existing_session_id.map(str::to_owned))
            .ok_or_else(|| "Grok session did not return an id".to_string())?;
        let models = extract_models(&result);
        *self.session_id.write().await = Some(session_id.clone());
        *self.models.write().await = models.clone();
        self.emit(
            "ready",
            json!({ "sessionId": session_id, "models": models }),
        );
        Ok(())
    }

    pub async fn prompt(
        &self,
        prompt: &str,
        attachments: &[PromptAttachment],
        project: &Project,
        model_id: Option<&str>,
        effort: &str,
        mode: &str,
    ) -> Result<TurnResult, String> {
        let session_id = self
            .engine_session_id()
            .await
            .ok_or_else(|| "Grok session is not ready".to_string())?;
        *self.accumulator.lock().await = TurnResult::default();

        if let Some(model_id) = model_id.filter(|value| !value.is_empty()) {
            let _ = self
                .request(
                    "session/set_model",
                    json!({ "sessionId": session_id, "modelId": model_id }),
                    RPC_TIMEOUT,
                )
                .await;
        }

        let mut metadata = json!({
            "reasoningEffort": effort,
            "x.ai/effort": effort,
            "mode": mode,
        });
        if let Some(model_id) = model_id.filter(|value| !value.is_empty()) {
            metadata["modelId"] = json!(model_id);
        }

        let prompt_blocks = build_prompt_blocks(prompt, attachments, project)?;
        self.request(
            "session/prompt",
            json!({
                "sessionId": session_id,
                "prompt": prompt_blocks,
                "_meta": metadata,
            }),
            PROMPT_TIMEOUT,
        )
        .await?;

        let result = self.accumulator.lock().await.clone();
        self.emit("completed", json!({}));
        Ok(result)
    }

    pub async fn fork_session(&self, cwd: &str, model_id: Option<&str>) -> Result<String, String> {
        let source_session_id = self
            .engine_session_id()
            .await
            .ok_or_else(|| "Grok session is not ready".to_string())?;
        let mut params = json!({
            "sourceSessionId": source_session_id,
            "sourceCwd": cwd,
            "newCwd": cwd,
            "sessionKind": "fork",
        });
        if let Some(model_id) = model_id.filter(|value| !value.is_empty()) {
            params["newModelId"] = json!(model_id);
        }
        let result = self
            .request("x.ai/session/fork", params, RPC_TIMEOUT)
            .await?;
        result
            .get("newSessionId")
            .or_else(|| result.pointer("/result/newSessionId"))
            .and_then(Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| "Grok did not return a forked session id".to_string())
    }

    pub async fn resolve_permission(&self, request_id: &str, decision: &str) -> Result<(), String> {
        let rpc_id = self
            .pending_permissions
            .lock()
            .await
            .remove(request_id)
            .ok_or_else(|| "permission request is no longer pending".to_string())?;
        let option_id = match decision {
            "allow_once" => "allow-once",
            "allow_session" => "allow-always",
            "deny" => "reject-once",
            _ => return Err("unknown permission decision".into()),
        };
        self.write(json!({
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "outcome": { "outcome": "selected", "optionId": option_id }
            }
        }))
        .await
    }

    pub async fn cancel(&self) -> Result<(), String> {
        if let Some(session_id) = self.engine_session_id().await {
            let _ = self
                .request(
                    "session/cancel",
                    json!({ "sessionId": session_id }),
                    RPC_TIMEOUT,
                )
                .await;
        } else {
            self.shutdown().await;
        }
        self.emit("cancelled", json!({}));
        Ok(())
    }

    pub async fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::Relaxed);
        self.alive.store(false, Ordering::Relaxed);
        let _ = self.child.lock().await.kill().await;
        self.fail_pending("agent stopped").await;
    }

    async fn request(&self, method: &str, params: Value, wait: Duration) -> Result<Value, String> {
        if !self.is_alive() {
            return Err("Grok agent is not running".into());
        }
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(id, sender);
        if let Err(error) = self
            .write(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(error);
        }

        match tokio::time::timeout(wait, receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Grok agent disconnected".into()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err(format!("ACP request timed out: {method}"))
            }
        }
    }

    async fn write(&self, value: Value) -> Result<(), String> {
        let mut bytes = serde_json::to_vec(&value).map_err(|error| error.to_string())?;
        bytes.push(b'\n');
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(&bytes)
            .await
            .map_err(|error| error.to_string())?;
        stdin.flush().await.map_err(|error| error.to_string())
    }

    async fn read_loop(self: Arc<Self>, stdout: tokio::process::ChildStdout) {
        let mut lines = BufReader::new(stdout).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) if !line.trim().is_empty() => {
                    if let Ok(value) = serde_json::from_str::<Value>(&line) {
                        self.handle_incoming(value).await;
                    }
                }
                Ok(Some(_)) => continue,
                Ok(None) | Err(_) => break,
            }
        }
        self.alive.store(false, Ordering::Relaxed);
        self.fail_pending("Grok agent disconnected").await;
        if !self.shutting_down.load(Ordering::Relaxed) {
            self.emit("error", json!({ "message": "Grok agent disconnected" }));
        }
    }

    async fn handle_incoming(&self, value: Value) {
        let method = value.get("method").and_then(Value::as_str);
        if method.is_none() && value.get("id").is_some() {
            if let Some(id) = parse_numeric_id(value.get("id")) {
                if let Some(sender) = self.pending.lock().await.remove(&id) {
                    let result = if let Some(error) = value.get("error") {
                        let code = error.get("code").and_then(Value::as_i64).unwrap_or(-1);
                        let message = error
                            .get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("unknown ACP error");
                        Err(format!("Grok ACP error {code}: {message}"))
                    } else {
                        Ok(value.get("result").cloned().unwrap_or(Value::Null))
                    };
                    let _ = sender.send(result);
                }
            }
            return;
        }

        let Some(method) = method else { return };
        let method = method.trim_start_matches('_');
        let params = value.get("params").cloned().unwrap_or_else(|| json!({}));
        match method {
            "session/update" | "x.ai/session/update" => {
                let update = params.get("update").cloned().unwrap_or(params.clone());
                self.map_update(&update, &params).await;
            }
            "session/request_permission" | "request_permission" => {
                let Some(rpc_id) = value.get("id").cloned() else {
                    return;
                };
                let request_id = Uuid::new_v4().to_string();
                self.pending_permissions
                    .lock()
                    .await
                    .insert(request_id.clone(), rpc_id);
                let tool_call = params.get("toolCall").cloned().unwrap_or_else(|| json!({}));
                let tool_name = tool_call
                    .get("title")
                    .or_else(|| tool_call.get("kind"))
                    .or_else(|| params.get("toolName"))
                    .and_then(Value::as_str)
                    .unwrap_or("Tool");
                let summary = tool_call
                    .get("title")
                    .or_else(|| params.get("summary"))
                    .and_then(Value::as_str)
                    .unwrap_or("Grok requests permission");
                let detail = tool_call
                    .get("rawInput")
                    .or_else(|| params.get("description"))
                    .map(value_string);
                self.emit(
                    "permission",
                    json!({
                        "requestId": request_id,
                        "toolName": tool_name,
                        "summary": summary,
                        "detail": detail,
                    }),
                );
            }
            _ => {
                if let Some(id) = value.get("id").cloned() {
                    let _ = self
                        .write(json!({ "jsonrpc": "2.0", "id": id, "result": {} }))
                        .await;
                }
            }
        }
    }

    async fn map_update(&self, update: &Value, params: &Value) {
        let kind = update
            .get("sessionUpdate")
            .or_else(|| update.get("session_update"))
            .and_then(Value::as_str)
            .unwrap_or("");
        match kind {
            "agent_message_chunk" => {
                if let Some(text) = extract_text(update).filter(|text| !text.is_empty()) {
                    self.accumulator.lock().await.text.push_str(&text);
                    self.emit("message_delta", json!({ "text": text }));
                }
            }
            "agent_thought_chunk" => {
                if let Some(text) = extract_text(update).filter(|text| !text.is_empty()) {
                    self.accumulator.lock().await.thought.push_str(&text);
                    self.emit("thought_delta", json!({ "text": text }));
                }
            }
            "tool_call" | "tool_call_update" => {
                let tool = tool_activity(update, kind == "tool_call_update");
                let mut accumulator = self.accumulator.lock().await;
                if let Some(index) = accumulator.tools.iter().position(|item| item.id == tool.id) {
                    accumulator.tools[index] = tool.clone();
                } else {
                    accumulator.tools.push(tool.clone());
                }
                drop(accumulator);
                self.emit(
                    if kind == "tool_call" {
                        "tool_started"
                    } else {
                        "tool_updated"
                    },
                    json!({ "tool": tool }),
                );
            }
            "plan" => {
                let steps = update
                    .get("entries")
                    .and_then(Value::as_array)
                    .map(|entries| {
                        entries
                            .iter()
                            .filter_map(|entry| {
                                entry
                                    .get("content")
                                    .or_else(|| entry.get("title"))
                                    .and_then(Value::as_str)
                                    .map(str::to_owned)
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                self.emit("plan", json!({ "steps": steps }));
            }
            _ => {}
        }

        if let Some(tokens) = update
            .get("_meta")
            .or_else(|| params.get("_meta"))
            .and_then(|meta| meta.get("totalTokens").or_else(|| meta.get("total_tokens")))
            .and_then(Value::as_u64)
        {
            self.emit("context_usage", json!({ "tokens": tokens }));
        }
    }

    async fn fail_pending(&self, message: &str) {
        let pending = std::mem::take(&mut *self.pending.lock().await);
        for (_, sender) in pending {
            let _ = sender.send(Err(message.to_string()));
        }
    }

    fn emit(&self, kind: &str, data: Value) {
        let _ = self.app.emit(
            "agent-event",
            AgentEventPayload {
                kind: kind.to_string(),
                task_id: self.task_id.clone(),
                data,
            },
        );
    }
}

fn extract_models(result: &Value) -> Vec<ModelOption> {
    let raw = result
        .pointer("/models/availableModels")
        .or_else(|| result.get("availableModels"))
        .and_then(Value::as_array);
    let models = raw
        .into_iter()
        .flatten()
        .filter_map(|model| {
            let id = model
                .get("modelId")
                .or_else(|| model.get("id"))
                .and_then(Value::as_str)?;
            if id.is_empty() {
                return None;
            }
            Some(ModelOption {
                id: id.to_string(),
                name: model
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or(id)
                    .to_string(),
            })
        })
        .collect::<Vec<_>>();
    if !models.is_empty() {
        return models;
    }
    vec![
        ModelOption {
            id: String::new(),
            name: "Grok default".into(),
        },
        ModelOption {
            id: "grok-code".into(),
            name: "Grok Code".into(),
        },
        ModelOption {
            id: "grok-build".into(),
            name: "Grok Build".into(),
        },
    ]
}

fn parse_numeric_id(value: Option<&Value>) -> Option<u64> {
    let value = value?;
    value
        .as_u64()
        .or_else(|| value.as_i64().map(|number| number as u64))
        .or_else(|| value.as_str().and_then(|value| value.parse().ok()))
}

fn extract_text(update: &Value) -> Option<String> {
    update
        .get("content")
        .and_then(|content| {
            content.as_str().map(str::to_owned).or_else(|| {
                content
                    .get("text")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
        })
        .or_else(|| {
            update
                .get("text")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
}

fn tool_activity(update: &Value, is_update: bool) -> ToolActivity {
    let status = update.get("status").and_then(Value::as_str);
    let status = match status {
        Some("pending") => ToolStatus::Pending,
        Some("completed" | "success") => ToolStatus::Completed,
        Some("failed" | "error") => ToolStatus::Failed,
        Some("cancelled" | "canceled") => ToolStatus::Cancelled,
        _ => ToolStatus::Running,
    };
    ToolActivity {
        id: update
            .get("toolCallId")
            .or_else(|| update.get("tool_call_id"))
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        title: update
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Tool")
            .to_string(),
        kind: update
            .get("kind")
            .and_then(Value::as_str)
            .unwrap_or("other")
            .to_string(),
        status: if is_update {
            status
        } else {
            ToolStatus::Running
        },
        input: update
            .get("rawInput")
            .or_else(|| update.get("input"))
            .map(value_string),
        output: extract_tool_output(update),
    }
}

fn extract_tool_output(update: &Value) -> Option<String> {
    update.get("rawOutput").map(value_string).or_else(|| {
        update
            .get("content")
            .and_then(Value::as_array)
            .and_then(|content| content.first())
            .and_then(|item| {
                item.pointer("/content/text")
                    .or_else(|| item.get("text"))
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
    })
}

fn value_string(value: &Value) -> String {
    value.as_str().map(str::to_owned).unwrap_or_else(|| {
        serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
    })
}

fn build_prompt_blocks(
    prompt: &str,
    attachments: &[PromptAttachment],
    project: &Project,
) -> Result<Vec<Value>, String> {
    let mut blocks = Vec::new();
    let mut context = Vec::new();
    if !project.instructions.trim().is_empty() {
        context.push(format!(
            "<project_instructions>\n{}\n</project_instructions>",
            project.instructions.trim()
        ));
    }
    if !project.memory.trim().is_empty() {
        context.push(format!(
            "<project_memory>\n{}\n</project_memory>",
            project.memory.trim()
        ));
    }
    if !context.is_empty() {
        blocks.push(json!({ "type": "text", "text": context.join("\n\n") }));
    }
    if !prompt.trim().is_empty() {
        blocks.push(json!({ "type": "text", "text": prompt.trim() }));
    }

    let mut binary_notes = Vec::new();
    for attachment in attachments {
        let path = Path::new(&attachment.path);
        if !path.is_file() {
            return Err(format!("attachment not found: {}", attachment.path));
        }
        let mime = attachment
            .mime
            .clone()
            .or_else(|| {
                mime_guess::from_path(path)
                    .first()
                    .map(|mime| mime.essence_str().to_string())
            })
            .unwrap_or_else(|| "application/octet-stream".into());

        if mime.starts_with("image/") {
            let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
            if bytes.len() > 8 * 1024 * 1024 {
                return Err(format!("image too large (max 8MB): {}", attachment.name));
            }
            blocks.push(json!({
                "type": "image",
                "mimeType": mime,
                "data": base64::engine::general_purpose::STANDARD.encode(bytes),
            }));
        } else if is_text_attachment(path, &mime) {
            let content = std::fs::read_to_string(path)
                .map_err(|error| format!("cannot read {}: {error}", attachment.name))?;
            let clipped = clip_utf8(&content, 200_000);
            let suffix = (content.len() > clipped.len())
                .then(|| format!("\n\n… [truncated, {} bytes total]", content.len()))
                .unwrap_or_default();
            blocks.push(json!({
                "type": "text",
                "text": format!(
                    "Attached file `{}`:\n```\n{}{}\n```",
                    attachment.name, clipped, suffix
                )
            }));
        } else {
            binary_notes.push(format!("{} ({mime})", attachment.path));
        }
    }

    if !binary_notes.is_empty() {
        blocks.push(json!({
            "type": "text",
            "text": format!(
                "Attached files available on disk:\n{}",
                binary_notes
                    .iter()
                    .map(|path| format!("- `{path}`"))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        }));
    }
    if blocks.is_empty() {
        return Err("prompt and attachments cannot both be empty".into());
    }
    Ok(blocks)
}

fn is_text_attachment(path: &Path, mime: &str) -> bool {
    mime.starts_with("text/")
        || matches!(
            path.extension()
                .and_then(|value| value.to_str())
                .unwrap_or(""),
            "md" | "json"
                | "toml"
                | "yaml"
                | "yml"
                | "rs"
                | "swift"
                | "ts"
                | "tsx"
                | "js"
                | "jsx"
                | "py"
                | "go"
                | "java"
                | "c"
                | "cpp"
                | "h"
                | "css"
                | "html"
                | "txt"
                | "csv"
                | "sh"
                | "sql"
                | "xml"
        )
}

fn clip_utf8(input: &str, max_bytes: usize) -> &str {
    if input.len() <= max_bytes {
        return input;
    }
    let mut end = max_bytes;
    while !input.is_char_boundary(end) {
        end -= 1;
    }
    &input[..end]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_models_and_message_chunks() {
        let models = extract_models(&json!({
            "models": { "availableModels": [{ "modelId": "grok-build", "name": "Build" }] }
        }));
        assert_eq!(models[0].id, "grok-build");
        assert_eq!(
            extract_text(&json!({ "content": { "text": "hello" } })).as_deref(),
            Some("hello")
        );
    }

    #[test]
    fn maps_permission_outcomes() {
        assert_eq!(parse_numeric_id(Some(&json!(42))), Some(42));
        assert_eq!(parse_numeric_id(Some(&json!("7"))), Some(7));
    }

    #[test]
    fn clips_utf8_without_splitting_characters() {
        let input = "a你b";
        assert_eq!(clip_utf8(input, 2), "a");
        assert_eq!(clip_utf8(input, 4), "a你");
    }
}
