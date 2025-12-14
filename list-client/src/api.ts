const BASE = "http://127.0.0.1:4321";

export async function fetchItems() {
  try {
    const res = await fetch(`${BASE}/items`);
    if (!res.ok) throw new Error(`fetchItems failed: ${res.status} ${res.statusText}`);
    const body = await res.json();
    console.debug("fetchItems response:", body);
    return body;
  } catch (err) {
    console.error("fetchItems error:", err);
    throw err;
  }
}

export async function createItem(
  title: string,
  description?: string,
  pictureUrl?: string,
  author?: string
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
      }),
    });
    if (!res.ok) throw new Error(`createItem failed: ${res.status} ${res.statusText}`);
    const body = await res.json();
    console.debug("createItem response:", body);
    return body;
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
  author?: string
) {
  try {
    const payload: Record<string, unknown> = {};
    if (completed !== undefined) payload.completed = completed;
    if (description !== undefined) payload.description = description || null;
    if (pictureUrl !== undefined) payload.picture_url = pictureUrl || null;
    if (author !== undefined) payload.author = author || null;

    const res = await fetch(`${BASE}/items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`updateItem failed: ${res.status} ${res.statusText}`);
    const body = await res.json();
    console.debug("updateItem response:", body);
    return body;
  } catch (err) {
    console.error("updateItem error:", err);
    throw err;
  }
}