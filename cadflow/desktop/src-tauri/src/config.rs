use std::env;

/// Base URL for the CADFlow cloud API (e.g. FastAPI on Render).
/// Can be overridden via CADFLOW_API_URL environment variable.
pub fn api_base_url() -> String {
    env::var("CADFLOW_API_URL").unwrap_or_else(|_| "https://cadflow-api.onrender.com".to_string())
}

/// Admin/Service API key for CADFlow backend.
/// Can be overridden via CADFLOW_API_KEY environment variable.
pub fn api_key() -> String {
    env::var("CADFLOW_API_KEY").unwrap_or_else(|_| "dev-cadflow-secret-key-123".to_string())
}

/// Central host IP or domain for Revit Server 2025.
/// Can be overridden via REVIT_SERVER_HOST environment variable.
pub fn revit_server_host() -> String {
    env::var("REVIT_SERVER_HOST").unwrap_or_else(|_| "212.86.105.232".to_string())
}
