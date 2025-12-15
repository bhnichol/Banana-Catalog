const BASE = "http://127.0.0.1:4321";

const parseGenres = (g: any): string[] => {
  if (!g || g === '') return [];
  try {
    if (Array.isArray(g)) return g as string[];
    const parsed = typeof g === "string" ? JSON.parse(g) : g;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
};

export async function fetchItems() {
  try {
    const res = await fetch(`${BASE}/items`);
    if (!res.ok) throw new Error(`fetchItems failed: ${res.status} ${res.statusText}`);
    const body = await res.json();
    const normalized = Array.isArray(body)
      ? body.map((item) => ({ ...item, genres: parseGenres((item as any).genres) }))
      : body;
    console.debug("fetchItems response:", normalized);
    return normalized;
  } catch (err) {
    console.error("fetchItems error:", err);
    throw err;
  }
}

export async function createItem(
  title: string,
  description?: string,
  pictureUrl?: string,
  author?: string,
  collection?: string,
  genres?: string[]
) {
  try {
    const res = await fetch(`${BASE}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || null,
        picture_url: pictureUrl || null,
        author: author || null,
        collection: collection || null,
        genres: genres && genres.length ? genres : null,
      }),
    });
    if (!res.ok) throw new Error(`createItem failed: ${res.status} ${res.statusText}`);
    const body = await res.json();
    const normalized = { ...body, genres: parseGenres((body as any).genres) };
    console.debug("createItem response:", normalized);
    return normalized;
  } catch (err) {
    console.error("createItem error:", err);
    throw err;
  }
}
export async function updateItem(
  id: string,
  completed?: boolean,
  description?: string,
  pictureUrl?: string,
  author?: string,
  collection?: string,
  genres?: string[]
) {
  try {
    const payload: Record<string, unknown> = {};
    if (completed !== undefined) payload.completed = completed;
    if (description !== undefined) payload.description = description || null;
    if (pictureUrl !== undefined) payload.picture_url = pictureUrl || null;
    if (author !== undefined) payload.author = author || null;
    if (collection !== undefined) payload.collection = collection || null;
    if (genres !== undefined) payload.genres = genres && genres.length ? genres : [];

    const res = await fetch(`${BASE}/items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`updateItem failed: ${res.status} ${res.statusText}`);
    const body = await res.json();
    const normalized = { ...body, genres: parseGenres((body as any).genres) };
    console.debug("updateItem response:", normalized);
    return normalized;
  } catch (err) {
    console.error("updateItem error:", err);
    throw err;
  }
}

export async function deleteItem(id: string) {
  try {
    const res = await fetch(`${BASE}/items/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`deleteItem failed: ${res.status} ${res.statusText}`);
    return true;
  } catch (err) {
    console.error("deleteItem error:", err);
    throw err;
  }
}

export async function fetchCollections() {
  try {
    const res = await fetch(`${BASE}/collections`);
    if (!res.ok) throw new Error(`fetchCollections failed: ${res.status} ${res.statusText}`);
    const body = await res.json();
    // returns array of [name, created_at]
    return body as Array<[string, number]>;
  } catch (err) {
    console.error("fetchCollections error:", err);
    throw err;
  }
}

export async function createCollection(name: string) {
  try {
    const res = await fetch(`${BASE}/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`createCollection failed: ${res.status} ${res.statusText}`);
    return true;
  } catch (err) {
    console.error("createCollection error:", err);
    throw err;
  }
}

export async function deleteCollection(name: string) {
  try {
    const res = await fetch(`${BASE}/collections/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`deleteCollection failed: ${res.status} ${res.statusText}`);
    return true;
  } catch (err) {
    console.error("deleteCollection error:", err);
    throw err;
  }
}