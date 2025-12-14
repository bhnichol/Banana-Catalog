import { useEffect, useState } from "react";
import { fetchItems, createItem, updateItem } from "./api";

type Item = {
  id: string;
  title: string;
  description: string | null;
  picture_url: string | null;
  author: string | null;
  completed: boolean;
};

type FormState = {
  title: string;
  description: string;
  pictureUrl: string;
  author: string;
};

type ExpandedItem = string | null;

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    pictureUrl: "",
    author: "",
  });
  const [expandedId, setExpandedId] = useState<ExpandedItem>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [authorFilter, setAuthorFilter] = useState<string>("");

  useEffect(() => {
    fetchItems().then(setItems);
  }, []);

  // Get unique authors for filter dropdown
  const uniqueAuthors = Array.from(
    new Set(items.filter((i) => i.author).map((i) => i.author))
  ).sort();

  // Smart search and filter logic
  const filteredItems = items.filter((item) => {
    // Author filter
    if (authorFilter && item.author !== authorFilter) {
      return false;
    }

    // Smart search - match title, description, or author
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query)) ||
        (item.author && item.author.toLowerCase().includes(query))
      );
    }

    return true;
  });

  function handleFormChange(
    field: keyof FormState,
    value: string
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function addItem() {
    if (!form.title.trim()) {
      console.warn("addItem: empty title, skipping");
      return;
    }
    try {
      const item = await createItem(
        form.title,
        form.description || undefined,
        form.pictureUrl || undefined,
        form.author || undefined
      );
      setItems((prev) => [...prev, item]);
      setForm({ title: "", description: "", pictureUrl: "", author: "" });
    } catch (err) {
      console.error("addItem failed:", err);
    }
  }

  async function toggleComplete(id: string, currentStatus: boolean) {
    try {
      const updatedItem = await updateItem(id, !currentStatus);
      setItems((prev) =>
        prev.map((i) => (i.id === id ? updatedItem : i))
      );
    } catch (err) {
      console.error("toggleComplete failed:", err);
    }
  }

  return (
    <div style={{ padding: 20, width: "100%", minHeight: "100vh", backgroundColor: "#FFFEF0", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <h1 style={{ textAlign: "center", color: "#D4AF37" }}>Task Manager</h1>

      {/* Form */}
      <div
        style={{
          border: "2px solid #FFE082",
          padding: 20,
          borderRadius: 8,
          marginBottom: 20,
          backgroundColor: "#FFFEF0",
          boxShadow: "0 2px 8px rgba(255, 224, 130, 0.2)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Add New Task</h2>
        <input
          placeholder="Task title *"
          value={form.title}
          onChange={(e) => handleFormChange("title", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          style={{
            width: "100%",
            padding: 10,
            fontSize: 16,
            marginBottom: 10,
            boxSizing: "border-box",
            border: "1px solid #FFE082",
            borderRadius: 4,
            backgroundColor: "#FFFAF0",
          }}
        />
        <textarea
          placeholder="Description"
          value={form.description}
          onChange={(e) => handleFormChange("description", e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            fontSize: 14,
            marginBottom: 10,
            boxSizing: "border-box",
            minHeight: 80,
            border: "1px solid #FFE082",
            borderRadius: 4,
            backgroundColor: "#FFFAF0",
          }}
        />
        <input
          placeholder="Picture URL"
          value={form.pictureUrl}
          onChange={(e) => handleFormChange("pictureUrl", e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            fontSize: 14,
            marginBottom: 10,
            boxSizing: "border-box",
            border: "1px solid #FFE082",
            borderRadius: 4,
            backgroundColor: "#FFFAF0",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <input
            placeholder="Author"
            value={form.author}
            onChange={(e) => handleFormChange("author", e.target.value)}
            style={{
              flex: 1,
              padding: 10,
              fontSize: 14,
              boxSizing: "border-box",
              border: "1px solid #FFE082",
              borderRadius: 4,
              backgroundColor: "#FFFAF0",
            }}
          />
        </div>
        <button
          onClick={addItem}
          style={{
            padding: "10px 20px",
            fontSize: 16,
            cursor: "pointer",
            backgroundColor: "#FFD700",
            color: "#333",
            border: "none",
            borderRadius: 4,
            fontWeight: "bold",
            boxShadow: "0 2px 6px rgba(255, 215, 0, 0.3)",
            transition: "background-color 0.2s",
          }}
        >
          Add Task
        </button>
      </div>

      {/* Task List */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Search and Filter Bar */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 20,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            placeholder="🔍 Search tasks by title, description, or author..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: 250,
              padding: 12,
              fontSize: 14,
              border: "2px solid #FFE082",
              borderRadius: 6,
              backgroundColor: "#FFFAF0",
              boxSizing: "border-box",
            }}
          />
          <select
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value)}
            style={{
              padding: 12,
              fontSize: 14,
              border: "2px solid #FFE082",
              borderRadius: 6,
              backgroundColor: "#FFFAF0",
              cursor: "pointer",
              minWidth: 180,
            }}
          >
            <option value="">All Authors</option>
            {uniqueAuthors.map((author) => (
              <option key={author} value={author}>
                {author}
              </option>
            ))}
          </select>
          {(searchQuery || authorFilter) && (
            <button
              onClick={() => {
                setSearchQuery("");
                setAuthorFilter("");
              }}
              style={{
                padding: "10px 16px",
                fontSize: 13,
                border: "1px solid #FFE082",
                backgroundColor: "#FFFAF0",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: "bold",
                color: "#333",
              }}
            >
              Clear Filters
            </button>
          )}
        </div>

        <h2 style={{ marginTop: 0 }}>Tasks ({filteredItems.length})</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1, overflow: "auto" }}>
          {filteredItems.map((item) => (
            <li
              key={item.id}
              style={{
                border: "2px solid #FFE082",
                borderRadius: 6,
                marginBottom: 12,
                overflow: "hidden",
                backgroundColor: item.completed ? "#F5F5F5" : "#FFFEF0",
                boxShadow: "0 2px 6px rgba(255, 224, 130, 0.15)",
              }}
            >
              {/* Task Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: 12,
                  gap: 12,
                  cursor: "pointer",
                  backgroundColor: item.completed ? "#F9F9F9" : "#FFFEF0",
                  borderBottom: expandedId === item.id ? "1px solid #FFE082" : "none",
                }}
                onClick={() =>
                  setExpandedId(expandedId === item.id ? null : item.id)
                }
              >
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => toggleComplete(item.id, item.completed)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: 20,
                    height: 20,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <h3
                    style={{
                      margin: "0 0 4px 0",
                      textDecoration: item.completed ? "line-through" : "none",
                      color: item.completed ? "#999" : "#000",
                    }}
                  >
                    {item.title}
                  </h3>
                </div>
                <span style={{ fontSize: 12, color: "#999" }}>
                  {expandedId === item.id ? "▼" : "▶"}
                </span>
              </div>

              {/* Expanded Details */}
              {expandedId === item.id && (
                <div style={{ padding: 12, borderTop: "1px solid #FFE082", backgroundColor: "#FFFAF0" }}>
                  {item.picture_url && (
                    <div style={{ marginBottom: 12 }}>
                      <img
                        src={item.picture_url}
                        alt="Task"
                        style={{
                          maxWidth: "100%",
                          maxHeight: 200,
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  )}
                  {item.description && (
                    <p style={{ margin: "0 0 12px 0", color: "#555" }}>
                      <strong>Description:</strong> {item.description}
                    </p>
                  )}
                  {item.author && (
                    <p style={{ margin: "0 0 8px 0", color: "#555", fontSize: 14 }}>
                      <strong>Author:</strong> {item.author}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
