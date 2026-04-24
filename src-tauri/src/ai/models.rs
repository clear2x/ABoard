use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

/// Maximum model file size: 5GB to prevent disk exhaustion (T-04-06 mitigation).
const MAX_MODEL_FILE_SIZE: u64 = 5 * 1024 * 1024 * 1024;

/// Model metadata persisted in SQLite.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelMetadata {
    pub id: String,
    pub name: String,
    pub filename: String,
    pub file_path: String,
    pub file_size: u64,
    pub status: String, // "available" | "downloading" | "error"
    pub downloaded_at: i64,
    pub context_length: u32,
    pub description: Option<String>,
}

/// Model info returned to the frontend for display.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub filename: String,
    pub file_size: u64,
    pub status: String,
    pub downloaded_at: i64,
    pub is_active: bool,
    pub context_length: u32,
    pub description: Option<String>,
}

/// Manages model CRUD operations and directory scanning.
pub struct ModelManager;

impl ModelManager {
    /// List all registered models from the database, marking which is currently active.
    pub fn list_models(
        conn: &Mutex<rusqlite::Connection>,
        active_model_path: Option<&str>,
    ) -> Result<Vec<ModelInfo>, String> {
        let conn = conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, filename, file_path, file_size, status, downloaded_at,
                        context_length, description
                 FROM model_metadata
                 ORDER BY downloaded_at DESC",
            )
            .map_err(|e| format!("Prepare error: {}", e))?;

        let active_path = active_model_path.unwrap_or("");
        let models = stmt
            .query_map([], |row| {
                let file_path: String = row.get(3)?;
                Ok(ModelInfo {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    filename: row.get(2)?,
                    file_size: row.get(4)?,
                    status: row.get(5)?,
                    downloaded_at: row.get(6)?,
                    is_active: file_path == active_path,
                    context_length: row.get(7)?,
                    description: row.get(8)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(models)
    }

    /// Scan the models directory for .gguf files and cross-validate with the database.
    /// Registers any new files found on disk and marks database entries as "error"
    /// if their files are missing.
    pub fn scan_models_dir(
        conn: &Mutex<rusqlite::Connection>,
        models_dir: &Path,
        active_model_path: Option<&str>,
    ) -> Result<Vec<ModelInfo>, String> {
        if !models_dir.exists() {
            std::fs::create_dir_all(models_dir)
                .map_err(|e| format!("Failed to create models dir: {}", e))?;
            return Ok(vec![]);
        }

        // Get existing DB entries as a set of filenames
        let db_filenames: std::collections::HashSet<String> = {
            let conn_lock = conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
            let mut stmt = conn_lock
                .prepare("SELECT filename FROM model_metadata")
                .map_err(|e| format!("Prepare error: {}", e))?;
            let filenames: std::collections::HashSet<String> = stmt
                .query_map([], |row| row.get(0))
                .map_err(|e| format!("Query error: {}", e))?
                .filter_map(|r| r.ok())
                .collect();
            // Explicitly drop stmt before conn_lock goes out of scope
            drop(stmt);
            filenames
        };

        // Scan for .gguf files not yet in the database
        let entries = std::fs::read_dir(models_dir)
            .map_err(|e| format!("Failed to read models dir: {}", e))?;

        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                if ext == "gguf" {
                    let filename = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    if !db_filenames.contains(&filename) {
                        // Auto-register this model
                        let _ = Self::register_model_from_path(conn, &path);
                    }
                }
            }
        }

        // Mark models whose files no longer exist as "error"
        {
            let conn_lock = conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
            let mut stmt = conn_lock
                .prepare("SELECT id, file_path FROM model_metadata")
                .map_err(|e| format!("Prepare error: {}", e))?;
            let rows: Vec<(String, String)> = stmt
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|e| format!("Query error: {}", e))?
                .filter_map(|r| r.ok())
                .collect();

            for (id, file_path) in rows {
                if !Path::new(&file_path).exists() {
                    let _ = conn_lock.execute(
                        "UPDATE model_metadata SET status = 'error' WHERE id = ?1",
                        params![id],
                    );
                }
            }
        }

        // Return the full list
        Self::list_models(conn, active_model_path)
    }

    /// Register a model file already present on disk into the database.
    fn register_model_from_path(
        conn: &Mutex<rusqlite::Connection>,
        path: &Path,
    ) -> Result<ModelMetadata, String> {
        let metadata = std::fs::metadata(path)
            .map_err(|e| format!("Failed to read file metadata: {}", e))?;
        let file_size = metadata.len();

        if file_size > MAX_MODEL_FILE_SIZE {
            return Err(format!(
                "Model file too large (max {} bytes)",
                MAX_MODEL_FILE_SIZE
            ));
        }

        let filename = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let file_path = path.to_string_lossy().to_string();
        let id = uuid::Uuid::new_v4().to_string();
        let name = filename.trim_end_matches(".gguf").to_string();
        let downloaded_at = chrono::Utc::now().timestamp_millis();

        let conn_lock = conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
        conn_lock
            .execute(
                "INSERT INTO model_metadata (id, name, filename, file_path, file_size, status, downloaded_at, context_length, description)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'available', ?6, 2048, NULL)",
                params![id, name, filename, file_path, file_size, downloaded_at],
            )
            .map_err(|e| format!("Insert error: {}", e))?;

        Ok(ModelMetadata {
            id,
            name,
            filename,
            file_path,
            file_size,
            status: "available".to_string(),
            downloaded_at,
            context_length: 2048,
            description: None,
        })
    }

    /// Register a newly downloaded model into the database.
    pub fn register_model(
        conn: &Mutex<rusqlite::Connection>,
        filename: &str,
        file_size: u64,
        file_path: &str,
    ) -> Result<ModelMetadata, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let name = filename.trim_end_matches(".gguf").to_string();
        let downloaded_at = chrono::Utc::now().timestamp_millis();

        let conn_lock = conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
        conn_lock
            .execute(
                "INSERT INTO model_metadata (id, name, filename, file_path, file_size, status, downloaded_at, context_length, description)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'available', ?6, 2048, NULL)",
                params![id, name, filename, file_path, file_size, downloaded_at],
            )
            .map_err(|e| format!("Insert error: {}", e))?;

        Ok(ModelMetadata {
            id,
            name,
            filename: filename.to_string(),
            file_path: file_path.to_string(),
            file_size,
            status: "available".to_string(),
            downloaded_at,
            context_length: 2048,
            description: None,
        })
    }

    /// Delete a model by ID: removes the database record and the file from disk.
    pub fn delete_model(
        conn: &Mutex<rusqlite::Connection>,
        model_id: &str,
    ) -> Result<(), String> {
        // Validate ID format
        if model_id.len() > 64 || !model_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(format!("Invalid model ID format: {}", model_id));
        }

        let file_path: Option<String> = {
            let conn_lock = conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
            let path = conn_lock
                .query_row(
                    "SELECT file_path FROM model_metadata WHERE id = ?1",
                    params![model_id],
                    |row| row.get(0),
                )
                .ok();
            // Delete from database while holding the lock
            conn_lock
                .execute(
                    "DELETE FROM model_metadata WHERE id = ?1",
                    params![model_id],
                )
                .map_err(|e| format!("Delete error: {}", e))?;
            path
        };

        // Delete file from disk (outside the lock)
        if let Some(ref path) = file_path {
            let p = Path::new(path);
            if p.exists() {
                std::fs::remove_file(p)
                    .map_err(|e| format!("Failed to delete model file: {}", e))?;
            }
        }

        Ok(())
    }

}
