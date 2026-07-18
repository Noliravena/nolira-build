use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};

use crate::domain::TerminalEventPayload;

struct TerminalSession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
}

impl TerminalSession {
    fn stop(&self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        if let Ok(child) = self.child.get_mut() {
            let _ = child.kill();
        }
    }
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: Mutex<HashMap<String, Arc<TerminalSession>>>,
}

impl TerminalManager {
    pub fn start(
        &self,
        app: AppHandle,
        task_id: &str,
        cwd: &str,
        rows: u16,
        cols: u16,
    ) -> Result<(), String> {
        let existing = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| "terminal state unavailable")?;
            sessions.get(task_id).cloned()
        };
        if let Some(session) = existing {
            let is_running = session
                .child
                .lock()
                .map_err(|_| "terminal process unavailable")?
                .try_wait()
                .map_err(|error| error.to_string())?
                .is_none();
            if is_running {
                session
                    .master
                    .lock()
                    .map_err(|_| "terminal resize unavailable")?
                    .resize(pty_size(rows, cols))
                    .map_err(|error| error.to_string())?;
                return Ok(());
            }
            self.sessions
                .lock()
                .map_err(|_| "terminal state unavailable")?
                .remove(task_id);
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(pty_size(rows, cols))
            .map_err(|error| format!("cannot open terminal: {error}"))?;

        let shell = default_shell();
        let mut command = CommandBuilder::new(&shell);
        command.cwd(Path::new(cwd));
        command.env("TERM", "dumb");
        command.env("NO_COLOR", "1");
        command.env("PS1", "❯ ");
        command.env("PROMPT", "❯ ");
        command.env("RPROMPT", "");
        #[cfg(not(target_os = "windows"))]
        if shell.ends_with("zsh") {
            command.args(["-f", "+o", "PROMPT_SP"]);
        } else {
            command.arg("-i");
        }
        #[cfg(target_os = "windows")]
        command.args(["-NoLogo", "-NoProfile"]);

        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| format!("cannot start {shell}: {error}"))?;
        drop(pair.slave);
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| error.to_string())?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| error.to_string())?;

        let session = Arc::new(TerminalSession {
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            child: Mutex::new(child),
        });
        self.sessions
            .lock()
            .map_err(|_| "terminal state unavailable")?
            .insert(task_id.to_string(), session);

        let event_task_id = task_id.to_string();
        std::thread::Builder::new()
            .name(format!("nolira-terminal-{task_id}"))
            .spawn(move || {
                let mut buffer = [0_u8; 8192];
                loop {
                    match reader.read(&mut buffer) {
                        Ok(0) => break,
                        Ok(count) => {
                            let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                            let _ = app.emit(
                                "terminal-event",
                                TerminalEventPayload {
                                    task_id: event_task_id.clone(),
                                    kind: "output".into(),
                                    data,
                                },
                            );
                        }
                        Err(error) => {
                            let _ = app.emit(
                                "terminal-event",
                                TerminalEventPayload {
                                    task_id: event_task_id.clone(),
                                    kind: "error".into(),
                                    data: error.to_string(),
                                },
                            );
                            break;
                        }
                    }
                }
                let _ = app.emit(
                    "terminal-event",
                    TerminalEventPayload {
                        task_id: event_task_id,
                        kind: "exit".into(),
                        data: String::new(),
                    },
                );
            })
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn write(&self, task_id: &str, input: &str) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| "terminal state unavailable")?
            .get(task_id)
            .cloned()
            .ok_or("terminal is not running")?;
        let mut writer = session
            .writer
            .lock()
            .map_err(|_| "terminal input unavailable")?;
        writer
            .write_all(input.as_bytes())
            .and_then(|_| writer.flush())
            .map_err(|error| error.to_string())
    }

    pub fn resize(&self, task_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| "terminal state unavailable")?
            .get(task_id)
            .cloned()
            .ok_or("terminal is not running")?;
        let result = session
            .master
            .lock()
            .map_err(|_| "terminal resize unavailable")?
            .resize(pty_size(rows, cols))
            .map_err(|error| error.to_string());
        result
    }

    pub fn stop(&self, task_id: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.remove(task_id) {
                session.stop();
            }
        }
    }

    pub fn stop_many(&self, task_ids: &[String]) {
        for task_id in task_ids {
            self.stop(task_id);
        }
    }
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        if let Ok(sessions) = self.sessions.get_mut() {
            for session in sessions.values() {
                session.stop();
            }
            sessions.clear();
        }
    }
}

fn pty_size(rows: u16, cols: u16) -> PtySize {
    PtySize {
        rows: rows.max(2),
        cols: cols.max(20),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn default_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        "powershell.exe".into()
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| {
                if cfg!(target_os = "macos") {
                    "/bin/zsh".into()
                } else {
                    "/bin/sh".into()
                }
            })
    }
}
