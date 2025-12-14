use axum::{routing::get, routing::put, Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, sqlite::SqliteConnectOptions};
use uuid::Uuid;
use std::time::{SystemTime, UNIX_EPOCH};
use dirs::data_local_dir;
use std::fs;
use std::str::FromStr;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::http::HeaderValue;
use axum::http::header::{ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_ORIGIN};

#[derive(Serialize, sqlx::FromRow)]
struct Item {
  id: String,
  title: String,
  description: Option<String>,
  picture_url: Option<String>,
  author: Option<String>,
  completed: bool,
  updated_at: i64,
}

#[derive(Deserialize)]
struct CreateItem {
  title: String,
  description: Option<String>,
  picture_url: Option<String>,
  author: Option<String>,
}

#[derive(Deserialize)]
struct UpdateItem {
  completed: Option<bool>,
  description: Option<String>,
  picture_url: Option<String>,
  author: Option<String>,
}

#[tokio::main]
async fn main() {
  let mut path = data_local_dir().unwrap();
  path.push("ListApp");
  fs::create_dir_all(&path).unwrap();
  path.push("main.db");

  let db_url = format!("sqlite://{}", path.to_str().unwrap());
  let options = SqliteConnectOptions::from_str(&db_url)
    .unwrap()
    .create_if_missing(true);
  
  let db = SqlitePool::connect_with(options).await.unwrap();

  sqlx::query(include_str!("../schema.sql"))
    .execute(&db)
    .await
    .unwrap();

  let app = Router::new()
    .route(
      "/items",
      get(get_items).post(create_item).options(options_items),
    )
    .route("/items/:id", put(update_item).options(options_item_by_id))
    .with_state(db);

  let listener = tokio::net::TcpListener::bind("127.0.0.1:4321")
    .await
    .unwrap();
  
  println!("Server running on http://127.0.0.1:4321");
  
  axum::serve(listener, app)
    .await
    .unwrap();
}

async fn get_items(
  db: axum::extract::State<SqlitePool>,
) -> impl axum::response::IntoResponse {
  let items_res = sqlx::query_as::<_, Item>(
    "SELECT id, title, completed, updated_at FROM items"
  )
  .fetch_all(&*db)
  .await;

  match items_res {
    Ok(items) => {
      let mut resp = (StatusCode::OK, axum::Json(items)).into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET,POST,OPTIONS"));
      resp.into_response()
    }
    Err(e) => {
      eprintln!("get_items query error: {}", e);
      let mut resp = (StatusCode::OK, axum::Json(Vec::<Item>::new())).into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET,POST,OPTIONS"));
      resp.into_response()
    }
  }
}

async fn create_item(
  db: axum::extract::State<SqlitePool>,
  Json(payload): Json<CreateItem>,
) -> impl axum::response::IntoResponse {
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap()
    .as_secs() as i64;

  let item = Item {
    id: Uuid::new_v4().to_string(),
    title: payload.title,
    description: payload.description,
    picture_url: payload.picture_url,
    author: payload.author,
    completed: false,
    updated_at: now,
  };

  let res = sqlx::query(
    "INSERT INTO items (id, title, description, picture_url, author, completed, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
  .bind(&item.id)
  .bind(&item.title)
  .bind(&item.description)
  .bind(&item.picture_url)
  .bind(&item.author)
  .bind(item.completed as i32)
  .bind(item.updated_at)
  .execute(&*db)
  .await;

  match res {
    Ok(_) => {
      let mut resp = (StatusCode::CREATED, axum::Json(item)).into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.into_response()
    }
    Err(e) => {
      eprintln!("create_item error: {}", e);
      let mut resp = (StatusCode::INTERNAL_SERVER_ERROR, "").into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.into_response()
    }
  }
}

async fn options_items() -> impl axum::response::IntoResponse {
  let mut resp = StatusCode::NO_CONTENT.into_response();
  resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
  resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET,POST,OPTIONS"));
  resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("Content-Type"));
  resp
}

async fn update_item(
  axum::extract::Path(id): axum::extract::Path<String>,
  db: axum::extract::State<SqlitePool>,
  Json(payload): Json<UpdateItem>,
) -> impl axum::response::IntoResponse {
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap()
    .as_secs() as i64;

  // Build dynamic update query based on provided fields
  let mut query_str = "UPDATE items SET updated_at = ?".to_string();
  let mut bindings: Vec<String> = vec![now.to_string()];

  if payload.completed.is_some() {
    query_str.push_str(", completed = ?");
    bindings.push(format!("{}", payload.completed.unwrap() as i32));
  }
  if payload.description.is_some() {
    query_str.push_str(", description = ?");
    bindings.push(format!("'{}'", payload.description.as_ref().unwrap().replace("'", "''")));
  }
  if payload.picture_url.is_some() {
    query_str.push_str(", picture_url = ?");
    bindings.push(format!("'{}'", payload.picture_url.as_ref().unwrap().replace("'", "''")));
  }
  if payload.author.is_some() {
    query_str.push_str(", author = ?");
    bindings.push(format!("'{}'", payload.author.as_ref().unwrap().replace("'", "''")));
  }
  query_str.push_str(" WHERE id = ?");
  bindings.push(format!("'{}'", id.replace("'", "''")));

  let mut query = sqlx::query(&query_str);
  query = query.bind(now);
  if let Some(c) = payload.completed {
    query = query.bind(c as i32);
  }
  if let Some(d) = payload.description {
    query = query.bind(d);
  }
  if let Some(p) = payload.picture_url {
    query = query.bind(p);
  }
  if let Some(a) = payload.author {
    query = query.bind(a);
  }
  query = query.bind(&id);

  let res = query.execute(&*db).await;

  match res {
    Ok(_) => {
      // Fetch the updated item to return it
      let fetch_res = sqlx::query_as::<_, Item>(
        "SELECT id, title, description, picture_url, author, completed, updated_at FROM items WHERE id = ?"
      )
      .bind(&id)
      .fetch_optional(&*db)
      .await;

      match fetch_res {
        Ok(Some(item)) => {
          let mut resp = (StatusCode::OK, axum::Json(item)).into_response();
          resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
          resp.into_response()
        }
        _ => {
          let mut resp = (StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch updated item").into_response();
          resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
          resp.into_response()
        }
      }
    }
    Err(e) => {
      eprintln!("update_item error: {}", e);
      let mut resp = (StatusCode::INTERNAL_SERVER_ERROR, "").into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.into_response()
    }
  }
}

async fn options_item_by_id() -> impl axum::response::IntoResponse {
  let mut resp = StatusCode::NO_CONTENT.into_response();
  resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
  resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("PUT,OPTIONS"));
  resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("Content-Type"));
  resp
}
