use std::{
  env,
  process::{Child, Command, Stdio},
  sync::{Mutex, OnceLock},
};

use tauri::{path::BaseDirectory, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      start_backend(app)?;

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .on_window_event(|_, event| {
      if let WindowEvent::CloseRequested { .. } = event {
        stop_backend();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn start_backend(app: &tauri::App) -> tauri::Result<()> {
  static START: OnceLock<()> = OnceLock::new();

  let handle = app.handle();
  START.get_or_init(|| {
    let app_handle = handle.clone();
    tauri::async_runtime::spawn(async move {
      if let Err(_err) = spawn_backend_process(&app_handle) {
        #[cfg(debug_assertions)]
        eprintln!("failed to start backend: {_err}");
      }
    });
  });

  Ok(())
}

fn spawn_backend_process(app: &tauri::AppHandle) -> tauri::Result<()> {
  let mut cmd = if cfg!(debug_assertions) {
    let mut command = Command::new("cargo");
    command
      .arg("run")
      .arg("--release")
      .current_dir(workspace_relative("../local-server"));
    command
  } else {
    let backend_path = app
      .path()
      .resolve("bin/local-server.exe", BaseDirectory::Resource)?;
    let command = Command::new(backend_path);
    command
  };

  cmd.stdout(Stdio::null()).stderr(Stdio::null());

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  let child = cmd.spawn()?;
  store_child(child);
  Ok(())
}

fn workspace_relative(rel: &str) -> std::path::PathBuf {
  // Resolve paths relative to the app binary for dev builds; in prod we rely on bundled resources.
  if let Ok(cwd) = env::current_dir() {
    return cwd.join(rel);
  }
  std::path::PathBuf::from(rel)
}

fn store_child(child: Child) {
  static CHILD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
  let slot = CHILD.get_or_init(|| Mutex::new(None));
  if let Ok(mut guard) = slot.lock() {
    *guard = Some(child);
  }
}

fn stop_backend() {
  static CHILD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
  if let Some(slot) = CHILD.get() {
    if let Ok(mut guard) = slot.lock() {
      if let Some(mut child) = guard.take() {
        let _ = child.kill();
      }
    }
  }
}
