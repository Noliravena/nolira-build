use std::path::PathBuf;

use tokio::sync::Mutex;
use uuid::Uuid;

use crate::domain::{
    now_millis, suggested_title, AppSettings, ChatMessage, ConversationTask, MessageRole,
    PersistedState, Project, TurnResult,
};

pub struct StateStore {
    path: PathBuf,
    inner: Mutex<PersistedState>,
}

impl StateStore {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        let inner = if path.is_file() {
            let data = std::fs::read(&path).map_err(|error| error.to_string())?;
            serde_json::from_slice(&data).unwrap_or_default()
        } else {
            PersistedState::default()
        };
        Ok(Self {
            path,
            inner: Mutex::new(inner),
        })
    }

    pub async fn snapshot(&self) -> PersistedState {
        self.inner.lock().await.clone()
    }

    pub async fn add_project(&self, input_path: &str) -> Result<Project, String> {
        let canonical = std::fs::canonicalize(input_path)
            .map_err(|error| format!("cannot open project: {error}"))?;
        if !canonical.is_dir() {
            return Err("project path must be a directory".into());
        }
        let path = canonical.to_string_lossy().to_string();
        let mut state = self.inner.lock().await;
        if let Some(project) = state.projects.iter().find(|project| project.path == path) {
            return Ok(project.clone());
        }
        let project = Project {
            id: Uuid::new_v4().to_string(),
            name: canonical
                .file_name()
                .and_then(|value| value.to_str())
                .filter(|value| !value.is_empty())
                .unwrap_or(&path)
                .to_string(),
            path,
            created_at: now_millis(),
        };
        state.projects.push(project.clone());
        self.save(&state)?;
        Ok(project)
    }

    pub async fn create_task(&self, project_id: &str) -> Result<ConversationTask, String> {
        let mut state = self.inner.lock().await;
        if !state
            .projects
            .iter()
            .any(|project| project.id == project_id)
        {
            return Err("project not found".into());
        }
        let now = now_millis();
        let task = ConversationTask {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.to_string(),
            title: "New task".into(),
            provider_id: "grok".into(),
            model_id: String::new(),
            reasoning_effort: "medium".into(),
            engine_session_id: None,
            messages: vec![],
            tools: vec![],
            created_at: now,
            updated_at: now,
        };
        state.tasks.push(task.clone());
        self.save(&state)?;
        Ok(task)
    }

    pub async fn rename_task(&self, task_id: &str, title: &str) -> Result<(), String> {
        let clean = title.trim();
        if clean.is_empty() {
            return Err("task title cannot be empty".into());
        }
        let mut state = self.inner.lock().await;
        let task = state
            .tasks
            .iter_mut()
            .find(|task| task.id == task_id)
            .ok_or("task not found")?;
        task.title = clean.to_string();
        task.updated_at = now_millis();
        self.save(&state)
    }

    pub async fn delete_task(&self, task_id: &str) -> Result<(), String> {
        let mut state = self.inner.lock().await;
        let original = state.tasks.len();
        state.tasks.retain(|task| task.id != task_id);
        if state.tasks.len() == original {
            return Err("task not found".into());
        }
        self.save(&state)
    }

    pub async fn delete_project(&self, project_id: &str) -> Result<(), String> {
        let mut state = self.inner.lock().await;
        let original = state.projects.len();
        state.projects.retain(|project| project.id != project_id);
        if state.projects.len() == original {
            return Err("project not found".into());
        }
        state.tasks.retain(|task| task.project_id != project_id);
        self.save(&state)
    }

    pub async fn update_settings(&self, settings: AppSettings) -> Result<(), String> {
        let mut state = self.inner.lock().await;
        state.settings = settings;
        self.save(&state)
    }

    pub async fn prepare_prompt(
        &self,
        task_id: &str,
        prompt: &str,
        model_id: &str,
        effort: &str,
    ) -> Result<(ConversationTask, String), String> {
        let mut state = self.inner.lock().await;
        let task = state
            .tasks
            .iter_mut()
            .find(|task| task.id == task_id)
            .ok_or("task not found")?;
        if task.title == "New task" {
            task.title = suggested_title(prompt);
        }
        task.model_id = model_id.to_string();
        task.reasoning_effort = effort.to_string();
        task.updated_at = now_millis();
        task.messages.push(ChatMessage {
            id: Uuid::new_v4().to_string(),
            role: MessageRole::User,
            text: prompt.to_string(),
            thought: String::new(),
            created_at: now_millis(),
        });
        let assistant_id = Uuid::new_v4().to_string();
        task.messages.push(ChatMessage {
            id: assistant_id.clone(),
            role: MessageRole::Assistant,
            text: String::new(),
            thought: String::new(),
            created_at: now_millis(),
        });
        let snapshot = task.clone();
        self.save(&state)?;
        Ok((snapshot, assistant_id))
    }

    pub async fn task_context(
        &self,
        task_id: &str,
    ) -> Result<(ConversationTask, Project, AppSettings), String> {
        let state = self.inner.lock().await;
        let task = state
            .tasks
            .iter()
            .find(|task| task.id == task_id)
            .cloned()
            .ok_or("task not found")?;
        let project = state
            .projects
            .iter()
            .find(|project| project.id == task.project_id)
            .cloned()
            .ok_or("project not found")?;
        Ok((task, project, state.settings.clone()))
    }

    pub async fn save_engine_session(
        &self,
        task_id: &str,
        session_id: String,
    ) -> Result<(), String> {
        let mut state = self.inner.lock().await;
        let task = state
            .tasks
            .iter_mut()
            .find(|task| task.id == task_id)
            .ok_or("task not found")?;
        task.engine_session_id = Some(session_id);
        self.save(&state)
    }

    pub async fn finish_turn(
        &self,
        task_id: &str,
        assistant_id: &str,
        result: TurnResult,
    ) -> Result<(), String> {
        let mut state = self.inner.lock().await;
        let task = state
            .tasks
            .iter_mut()
            .find(|task| task.id == task_id)
            .ok_or("task not found")?;
        if let Some(message) = task
            .messages
            .iter_mut()
            .find(|message| message.id == assistant_id)
        {
            message.text = result.text;
            message.thought = result.thought;
        }
        task.tools = result.tools;
        task.updated_at = now_millis();
        self.save(&state)
    }

    pub async fn fail_turn(
        &self,
        task_id: &str,
        assistant_id: &str,
        message: &str,
    ) -> Result<(), String> {
        let mut state = self.inner.lock().await;
        let task = state
            .tasks
            .iter_mut()
            .find(|task| task.id == task_id)
            .ok_or("task not found")?;
        if let Some(reply) = task
            .messages
            .iter_mut()
            .find(|item| item.id == assistant_id)
        {
            if reply.text.is_empty() {
                reply.text = format!("Unable to complete the turn: {message}");
            }
        }
        task.updated_at = now_millis();
        self.save(&state)
    }

    pub async fn task_project_path(&self, task_id: &str) -> Result<String, String> {
        let (_, project, _) = self.task_context(task_id).await?;
        Ok(project.path)
    }

    pub async fn tasks_for_project(&self, project_id: &str) -> Vec<String> {
        self.inner
            .lock()
            .await
            .tasks
            .iter()
            .filter(|task| task.project_id == project_id)
            .map(|task| task.id.clone())
            .collect()
    }

    fn save(&self, state: &PersistedState) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let data = serde_json::to_vec_pretty(state).map_err(|error| error.to_string())?;
        let temp = self.path.with_extension("json.tmp");
        std::fs::write(&temp, data).map_err(|error| error.to_string())?;
        if self.path.exists() {
            std::fs::remove_file(&self.path).map_err(|error| error.to_string())?;
        }
        std::fs::rename(temp, &self.path).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn creates_project_task_and_prompt_snapshot() {
        let temp = tempfile::tempdir().unwrap();
        let store = StateStore::open(temp.path().join("state.json")).unwrap();
        let project = store
            .add_project(temp.path().to_str().unwrap())
            .await
            .unwrap();
        let task = store.create_task(&project.id).await.unwrap();
        let (updated, assistant_id) = store
            .prepare_prompt(&task.id, "Inspect this repo", "", "medium")
            .await
            .unwrap();
        assert_eq!(updated.messages.len(), 2);
        assert_eq!(updated.messages[1].id, assistant_id);
        assert_eq!(updated.title, "Inspect this repo");
    }
}
