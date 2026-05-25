//! Integration tests for `/v1/.../usage` and `/context-breakdown` routes.

use squad_db::SessionUsageDelta;
use squad_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

struct Spawned {
    addr: SocketAddr,
    token: String,
    state: Arc<ServerState>,
    _home: tempfile::TempDir,
    _docs: tempfile::TempDir,
}

async fn spawn() -> Spawned {
    let token = "usage-test".to_string();
    let home = tempfile::TempDir::new().unwrap();
    let docs = tempfile::TempDir::new().unwrap();
    let cfg = ServerConfig {
        bind: "127.0.0.1:0".parse().unwrap(),
        token: token.clone(),
        home_dir: home.path().to_path_buf(),
        docs_dir: docs.path().to_path_buf(),
        app_system_prompt: String::new(),
        app_onboarding_prompt: String::new(),
        tunnel_url: "http://test.invalid".into(),
    };
    let listener = TcpListener::bind(cfg.bind).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let state = Arc::new(ServerState::new_in_memory(cfg).await.unwrap());
    let app = build_router(state.clone());
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    Spawned {
        addr,
        token,
        state,
        _home: home,
        _docs: docs,
    }
}

#[tokio::test]
async fn workspace_usage_unknown_workspace_returns_404() {
    let s = spawn().await;
    let c = reqwest::Client::new();
    let res = c
        .get(format!(
            "http://{}/v1/workspaces/does-not-exist/usage",
            s.addr
        ))
        .bearer_auth(&s.token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 404);
}

#[tokio::test]
async fn workspace_usage_aggregates_per_agent_and_totals() {
    let s = spawn().await;
    let c = reqwest::Client::new();

    // Create a workspace + two agents.
    let ws: serde_json::Value = c
        .post(format!("http://{}/v1/workspaces", s.addr))
        .bearer_auth(&s.token)
        .json(&serde_json::json!({ "name": "ws1" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let ws_id = ws["id"].as_str().unwrap().to_string();

    let agent_a = format!("{}/ws1/maya", s.state.engine.paths.docs().display());
    let agent_b = format!("{}/ws1/diego", s.state.engine.paths.docs().display());

    // Seed two sessions for maya, one for diego.
    let delta = |session: &str, agent: &str, input: u64, output: u64, cost: f64| {
        let session = session.to_string();
        let agent = agent.to_string();
        let ws = ws_id.clone();
        let db = s.state.engine.db.clone();
        async move {
            db.upsert_session_usage(SessionUsageDelta {
                session_key: &session,
                provider: "anthropic",
                agent_path: &agent,
                workspace_id: &ws,
                input_tokens: input,
                output_tokens: output,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                cost_usd: cost,
                model: Some("claude-opus-4-7"),
            })
            .await
            .unwrap();
        }
    };
    delta("s-maya-1", &agent_a, 100, 50, 0.10).await;
    delta("s-maya-2", &agent_a, 200, 80, 0.20).await;
    delta("s-diego-1", &agent_b, 80, 40, 0.05).await;

    let body: serde_json::Value = c
        .get(format!("http://{}/v1/workspaces/{}/usage", s.addr, ws_id))
        .bearer_auth(&s.token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    assert_eq!(body["totals"]["sessions"], 3);
    assert_eq!(body["totals"]["inputTokens"], 380);
    assert_eq!(body["totals"]["outputTokens"], 170);
    let agents = body["agents"].as_array().unwrap();
    assert_eq!(agents.len(), 2);
    // Highest spender first — maya.
    assert_eq!(agents[0]["agentPath"], agent_a);
    assert_eq!(agents[0]["sessions"], 2);
    assert_eq!(agents[1]["agentPath"], agent_b);
    let sessions = body["sessions"].as_array().unwrap();
    assert_eq!(sessions.len(), 3);
    // Context window is populated from the model id.
    assert_eq!(sessions[0]["contextWindow"], 200_000);
}

#[tokio::test]
async fn session_usage_returns_null_for_unknown_session() {
    let s = spawn().await;
    let c = reqwest::Client::new();
    let body: serde_json::Value = c
        .get(format!(
            "http://{}/v1/agents/{}/sessions/nope/usage",
            s.addr,
            urlencoding::encode("any/path")
        ))
        .bearer_auth(&s.token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(body.is_null());
}

#[tokio::test]
async fn context_breakdown_lists_files_present_in_agent_dir() {
    let s = spawn().await;
    let c = reqwest::Client::new();

    // Set up an agent dir with a CLAUDE.md and one skill.
    let agent_dir = s.state.engine.paths.docs().join("ws1").join("alex");
    std::fs::create_dir_all(agent_dir.join(".agents/skills/test")).unwrap();
    std::fs::write(agent_dir.join("CLAUDE.md"), "# Hello\n".repeat(20)).unwrap();
    std::fs::write(
        agent_dir.join(".agents/skills/test/SKILL.md"),
        "skill body".repeat(10),
    )
    .unwrap();

    let agent_dir_str = agent_dir.to_string_lossy().to_string();
    let agent_path_param = urlencoding::encode(&agent_dir_str);
    let body: serde_json::Value = c
        .get(format!(
            "http://{}/v1/agents/{}/sessions/any/context-breakdown",
            s.addr, agent_path_param
        ))
        .bearer_auth(&s.token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let blocks = body["blocks"].as_array().unwrap();
    let sources: Vec<&str> = blocks
        .iter()
        .map(|b| b["source"].as_str().unwrap())
        .collect();
    assert!(sources.contains(&"claude_md"));
    assert!(sources.contains(&"skills_index"));
    assert!(body["totalChars"].as_u64().unwrap() > 0);
    // No turn has fired yet — live window fields are null.
    assert!(body["lastWindowTokens"].is_null());
}
