use axum::{routing::get, routing::put, routing::delete, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json;
use sqlx::{SqlitePool, sqlite::SqliteConnectOptions, Row};
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
  genres: Option<String>,
  collection: Option<String>,
  completed: bool,
  updated_at: i64,
}

#[derive(Deserialize)]
struct CreateItem {
  title: String,
  description: Option<String>,
  picture_url: Option<String>,
  author: Option<String>,
  genres: Option<Vec<String>>,
  collection: Option<String>,
}

#[derive(Deserialize)]
struct UpdateItem {
  completed: Option<bool>,
  description: Option<String>,
  picture_url: Option<String>,
  author: Option<String>,
  genres: Option<Vec<String>>,
  collection: Option<String>,
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

  // Ensure 'collection' column exists (migrate older DBs)
  let pragma_rows = sqlx::query("PRAGMA table_info(items)")
    .fetch_all(&db)
    .await
    .unwrap_or_default();

  let mut has_collection = false;
  let mut has_genres = false;
  for r in &pragma_rows {
    if let Ok(name) = r.try_get::<String, &str>("name") {
      if name == "collection" {
        has_collection = true;
      }
      if name == "genres" {
        has_genres = true;
      }
    }
  }

  if !has_collection {
    let _ = sqlx::query("ALTER TABLE items ADD COLUMN collection TEXT DEFAULT 'Default'")
      .execute(&db)
      .await;
  }

  if !has_genres {
    let _ = sqlx::query("ALTER TABLE items ADD COLUMN genres TEXT")
      .execute(&db)
      .await;
  }

  let app = Router::new()
    .route(
      "/items",
      get(get_items).post(create_item).options(options_items),
    )
    .route(
      "/wishlist",
      get(get_wishlist).options(options_items),
    )
    .route(
      "/collections",
      get(get_collections).post(create_collection).options(options_collections),
    )
    .route(
      "/collections/:name",
      delete(delete_collection).options(options_collections),
    )
    .route(
      "/items/:id",
      put(update_item).delete(delete_item).options(options_item_by_id),
    )
    .with_state(db);

  // CORS handled per-route via OPTIONS handlers
  // no global CORS layer; per-route OPTIONS handlers provide CORS response

  let listener = tokio::net::TcpListener::bind("127.0.0.1:4321")
    .await
    .unwrap();
  
  println!("Server running on http://127.0.0.1:4321");
  
  axum::serve(listener, app)
    .await
    .unwrap();
}

async fn get_collections(db: axum::extract::State<SqlitePool>) -> impl axum::response::IntoResponse {
  let res = sqlx::query("SELECT name, created_at FROM collections ORDER BY name")
    .fetch_all(&*db)
    .await;

  match res {
    Ok(rows) => {
      let mut cols: Vec<(String, i64)> = Vec::new();
      for r in rows.into_iter() {
        let name: String = match r.try_get("name") {
          Ok(n) => n,
          Err(_) => continue,
        };
        let created_at: i64 = match r.try_get("created_at") {
          Ok(ts) => ts,
          Err(_) => 0,
        };
        cols.push((name, created_at));
      }
      let mut resp = (StatusCode::OK, axum::Json(cols)).into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.into_response()
    }
    Err(e) => {
      eprintln!("get_collections error: {}", e);
      let mut resp = (StatusCode::OK, axum::Json(Vec::<(String,i64)>::new())).into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.into_response()
    }
  }
}

#[derive(Deserialize)]
struct CreateCollection { name: String }

async fn create_collection(
  db: axum::extract::State<SqlitePool>,
  Json(payload): Json<CreateCollection>,
) -> impl axum::response::IntoResponse {
  let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
  let res = sqlx::query("INSERT OR IGNORE INTO collections (name, created_at) VALUES (?, ?)")
    .bind(&payload.name)
    .bind(now)
    .execute(&*db)
    .await;

  match res {
    Ok(_) => {
      let mut resp = (StatusCode::CREATED, "").into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.into_response()
    }
    Err(e) => {
      eprintln!("create_collection error: {}", e);
      let mut resp = (StatusCode::INTERNAL_SERVER_ERROR, "").into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.into_response()
    }
  }
}

async fn get_items(
  db: axum::extract::State<SqlitePool>,
) -> impl axum::response::IntoResponse {
  let items_res = sqlx::query_as::<_, Item>(
    "SELECT id, title, description, picture_url, author, genres, collection, completed, updated_at FROM items"
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

async fn get_wishlist(
  db: axum::extract::State<SqlitePool>,
) -> impl axum::response::IntoResponse {
  let items_res = sqlx::query_as::<_, Item>(
    "SELECT id, title, description, picture_url, author, genres, collection, completed, updated_at FROM items WHERE collection = 'Wishlist'"
  )
  .fetch_all(&*db)
  .await;

  match items_res {
    Ok(items) => {
      let mut resp = (StatusCode::OK, axum::Json(items)).into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET,OPTIONS"));
      resp.into_response()
    }
    Err(e) => {
      eprintln!("get_wishlist query error: {}", e);
      let mut resp = (StatusCode::OK, axum::Json(Vec::<Item>::new())).into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET,OPTIONS"));
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

  let genres_json = payload
    .genres
    .as_ref()
    .map(|g| serde_json::to_string(g).unwrap_or_else(|_| "[]".to_string()));

  let item = Item {
    id: Uuid::new_v4().to_string(),
    title: payload.title,
    description: payload.description,
    picture_url: payload.picture_url,
    author: payload.author,
    genres: genres_json.clone(),
    collection: payload.collection.or(Some("Default".to_string())),
    completed: false,
    updated_at: now,
  };

  let res = sqlx::query(
    "INSERT INTO items (id, title, description, picture_url, author, genres, collection, completed, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
  .bind(&item.id)
  .bind(&item.title)
  .bind(&item.description)
  .bind(&item.picture_url)
  .bind(&item.author)
  .bind(&item.genres)
  .bind(&item.collection)
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

async fn options_collections() -> impl axum::response::IntoResponse {
  let mut resp = StatusCode::NO_CONTENT.into_response();
  resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
  resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET,POST,DELETE,OPTIONS"));
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
  if payload.genres.is_some() {
    query_str.push_str(", genres = ?");
  }
  if payload.collection.is_some() {
    query_str.push_str(", collection = ?");
    bindings.push(format!("'{}'", payload.collection.as_ref().unwrap().replace("'", "''")));
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
  if let Some(g) = payload.genres {
    let json = serde_json::to_string(&g).unwrap_or_else(|_| "[]".to_string());
    query = query.bind(json);
  }
  if let Some(c) = payload.collection {
    query = query.bind(c);
  }
  query = query.bind(&id);

  let res = query.execute(&*db).await;

  match res {
    Ok(_) => {
      // Fetch the updated item to return it
      let fetch_res = sqlx::query_as::<_, Item>(
        "SELECT id, title, description, picture_url, author, genres, collection, completed, updated_at FROM items WHERE id = ?"
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

async fn delete_item(
  axum::extract::Path(id): axum::extract::Path<String>,
  db: axum::extract::State<SqlitePool>,
) -> impl axum::response::IntoResponse {
  let res = sqlx::query("DELETE FROM items WHERE id = ?")
    .bind(&id)
    .execute(&*db)
    .await;

  match res {
    Ok(_) => {
      let mut resp = (StatusCode::NO_CONTENT, "").into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.into_response()
    }
    Err(e) => {
      eprintln!("delete_item error: {}", e);
      let mut resp = (StatusCode::INTERNAL_SERVER_ERROR, "").into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.into_response()
    }
  }
}

async fn delete_collection(
  axum::extract::Path(name): axum::extract::Path<String>,
  db: axum::extract::State<SqlitePool>,
) -> impl axum::response::IntoResponse {
  // When deleting a collection, move items to 'Default' collection first
  let tx_res = sqlx::query("UPDATE items SET collection = 'Default' WHERE collection = ?")
    .bind(&name)
    .execute(&*db)
    .await;

  if let Err(e) = tx_res {
    eprintln!("delete_collection update items error: {}", e);
    let mut resp = (StatusCode::INTERNAL_SERVER_ERROR, "").into_response();
    resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    return resp;
  }

  let res = sqlx::query("DELETE FROM collections WHERE name = ?")
    .bind(&name)
    .execute(&*db)
    .await;

  match res {
    Ok(_) => {
      let mut resp = (StatusCode::NO_CONTENT, "").into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET,POST,DELETE,OPTIONS"));
      resp.into_response()
    }
    Err(e) => {
      eprintln!("delete_collection error: {}", e);
      let mut resp = (StatusCode::INTERNAL_SERVER_ERROR, "").into_response();
      resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
      resp.into_response()
    }
  }
}

async fn options_item_by_id() -> impl axum::response::IntoResponse {
  let mut resp = StatusCode::NO_CONTENT.into_response();
  resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
  resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("PUT,DELETE,OPTIONS"));
  resp.headers_mut().insert(ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("Content-Type"));
  resp
}
