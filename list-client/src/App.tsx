import { useEffect, useState } from "react";
import { fetchItems, createItem, updateItem, deleteItem, fetchCollections, createCollection, deleteCollection } from "./api";

type Item = {
  id: string;
  title: string;
  description: string | null;
  picture_url: string | null;
  author: string | null;
  genres?: string[];
  completed: boolean;
  updated_at?: number;
  collection?: string | null;
};

type FormState = {
  title: string;
  description: string;
  pictureUrl: string;
  author: string;
};

type ExpandedItem = string | null;

type Book = {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  subject?: string[];
  synopsis?: string;
  description?: string;
};
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
  const [bookQuery, setBookQuery] = useState<string>("");
  const [bookResults, setBookResults] = useState<Book[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>("All");
  const [collectionsList, setCollectionsList] = useState<string[]>([]);
  const [newCollectionName, setNewCollectionName] = useState<string>("");
  const [creatingCollection, setCreatingCollection] = useState<boolean>(false);
  const [readFilter, setReadFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [coverFilter, setCoverFilter] = useState<'all' | 'has' | 'none'>('all');
  const [synopsisFilter, setSynopsisFilter] = useState<'all' | 'none' | 'has'>('all');
  const [sortBy, setSortBy] = useState<'title' | 'author' | 'newest'>('title');  const [genreFilter, setGenreFilter] = useState<string>('');  const [previewBook, setPreviewBook] = useState<Book | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkCollectionSelect, setBulkCollectionSelect] = useState<string>('');
  const [showManualAdd, setShowManualAdd] = useState<boolean>(false);

  useEffect(() => {
    fetchItems().then(setItems);
    // Also refresh collections on mount to ensure we have all of them (including empty ones)
    fetchCollections()
      .then((rows) => {
        const names = rows.map((r) => r[0]);
        setCollectionsList(Array.from(new Set([...names, "Default"])));
      })
      .catch((err) => console.debug("fetchCollections failed:", err));
  }, []);

  // Get unique authors for filter dropdown
  const uniqueAuthors = Array.from(
    new Set(items.filter((i): i is Item & { author: string } => Boolean(i.author)).map((i) => i.author))
  ).sort();

  // Get unique genres for filter dropdown
  const uniqueGenres = Array.from(
    new Set(items.flatMap((i) => i.genres || []))
  ).sort();

  // Collections: use server list + any unique collections from items
  const uniqueCollections = Array.from(new Set(items.map((i) => i.collection || "Default")));
  const collections = [
    "All",
    ...Array.from(new Set([...collectionsList, ...uniqueCollections, "Wishlist", "Default"])),
  ];

  // Smart search and filter logic
  let filteredItems = items.filter((item) => {
    // Collection filter (tabs)
    if (selectedCollection !== 'All' && (item.collection || 'Default') !== selectedCollection) return false;
    // Author filter
    if (authorFilter && item.author !== authorFilter) {
      return false;
    }
    // Genre filter
    if (genreFilter && (!item.genres || !item.genres.includes(genreFilter))) {
      return false;
    }

    // Read status filter
    if (readFilter === 'read' && !item.completed) return false;
    if (readFilter === 'unread' && item.completed) return false;

    // Cover filter
    if (coverFilter === 'has' && !item.picture_url) return false;
    if (coverFilter === 'none' && item.picture_url) return false;

    // Synopsis/description filter
    if (synopsisFilter === 'has' && !item.description) return false;
    if (synopsisFilter === 'none' && item.description) return false;

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

  // Sorting
  filteredItems = filteredItems.sort((a, b) => {
    if (sortBy === 'title') return a.title.localeCompare(b.title);
    if (sortBy === 'author') return (a.author || '').localeCompare(b.author || '');
    if (sortBy === 'newest') return (b.updated_at || 0) - (a.updated_at || 0);
    return 0;
  });

  // Book search using Open Library
  async function searchBooks(query: string) {
    if (!query.trim()) {
      setBookResults([]);
      return;
    }
    try {
      const res = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=12`
      );
      if (!res.ok) throw new Error(`searchBooks failed: ${res.status}`);
      const body = await res.json();
      const docs: Book[] = (body.docs || []).map((d: any) => {
        const synopsis = d.first_sentence || d.subtitle || (d.description && (typeof d.description === 'string' ? d.description : d.description.value)) || undefined;
        const description = synopsis;
        return {
          key: d.key || d.cover_edition_key || d.edition_key?.[0] || d.title,
          title: d.title,
          author_name: d.author_name,
          cover_i: d.cover_i,
          subject: d.subject,
          synopsis,
          description,
        } as Book;
      });
      setBookResults(docs);
    } catch (err) {
      console.error("searchBooks error:", err);
      setBookResults([]);
    }
  }

  async function openPreview(book: Book) {
    setPreviewBook(book);
    // Try to enrich with work details
    if (book.key && book.key.startsWith("/works/")) {
      try {
        const detailRes = await fetch(`https://openlibrary.org${book.key}.json`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          const moreSynopsis = detail.description
            ? typeof detail.description === "string"
              ? detail.description
              : detail.description.value
            : detail.first_sentence
              ? (typeof detail.first_sentence === "string" ? detail.first_sentence : detail.first_sentence.value)
              : undefined;
          const moreSubjects: string[] | undefined = Array.isArray(detail.subjects)
            ? detail.subjects
            : Array.isArray(detail.subject)
              ? detail.subject
              : undefined;
          setPreviewBook((prev) => prev ? {
            ...prev,
            synopsis: prev.synopsis || moreSynopsis,
            description: prev.description || moreSynopsis,
            subject: prev.subject && prev.subject.length ? prev.subject : filterEnglishGenres(moreSubjects),
          } : prev);
        }
      } catch (err) {
        console.debug("failed to fetch work details for preview:", err);
      }
    }
  }

  function filterEnglishGenres(subjects?: string[]): string[] | undefined {
    if (!Array.isArray(subjects)) return undefined;
    
    // Common non-English genre keywords to exclude
    const nonEnglishKeywords = [
      'joven adulto', 'ficciones', 'ficción', 'novela', 'cuento',
      'poesía', 'drama', 'comedia', 'tragedia', 'sátira',
      'fantasía', 'ciencia ficción', 'romance', 'misterio',
      'aventura', 'historia', 'biografía', 'ensayo',
      'infantil', 'juvenil', 'adultos', 'niños',
      'français', 'deutsch', 'español', 'português',
      'italian', 'русский', '中文', '日本語',
    ];
    
    const english = subjects.filter((s) => {
      const lower = s.toLowerCase();
      // Exclude if contains non-English keywords
      if (nonEnglishKeywords.some((kw) => lower.includes(kw))) return false;
      // Exclude if contains non-Latin characters (accents, non-Roman scripts)
      if (!/^[a-zA-Z\s\-\.,&()']*$/.test(s)) return false;
      return true;
    });
    
    return english.length > 0 ? english.slice(0, 8) : undefined;
  }

  async function addBookToCatalog(b: Book, collectionOverride?: string) {
    const title = b.title;
    const author = b.author_name?.[0] ?? undefined;
    const pictureUrl = b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg` : undefined;
    const genres = filterEnglishGenres(b.subject);
    console.debug("addBookToCatalog - genres filtered:", genres);
    // If we don't have a synopsis from the search results, try fetching the work details
    let description = b.synopsis || (b.subject ? b.subject.slice(0, 6).join(", ") : undefined);
    if (!description && b.key && b.key.startsWith("/works/")) {
      try {
        const detailRes = await fetch(`https://openlibrary.org${b.key}.json`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          if (detail.description) {
            description = typeof detail.description === "string" ? detail.description : detail.description.value;
          } else if (detail.first_sentence) {
            description = typeof detail.first_sentence === "string" ? detail.first_sentence : detail.first_sentence.value;
          }
        }
      } catch (err) {
        console.debug("failed to fetch work details:", err);
      }
    }

    const targetCollection = collectionOverride ?? (selectedCollection === 'All' ? 'Default' : selectedCollection);

    // Ensure Wishlist collection exists on backend when adding there
    if (targetCollection === 'Wishlist') {
      try {
        await createCollection('Wishlist');
        setCollectionsList((prev) => Array.from(new Set([...prev, 'Wishlist'])));
      } catch (err) {
        console.debug('create Wishlist collection failed:', err);
      }
    }

    try {
      const item = await createItem(title, description, pictureUrl, author, targetCollection, genres);
      setItems((prev) => [...prev, item]);
    } catch (err) {
      console.error("addBookToCatalog failed:", err);
    }
  }

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
        form.author || undefined,
        selectedCollection === 'All' ? 'Default' : selectedCollection
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

  function toggleSelectItem(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function deleteSelectedItems() {
    if (selectedItemIds.size === 0) return;
    const count = selectedItemIds.size;
    if (!confirm(`Delete ${count} book${count > 1 ? 's' : ''}?`)) return;
    try {
      await Promise.all(Array.from(selectedItemIds).map((id) => deleteItem(id)));
      setItems((prev) => prev.filter((i) => !selectedItemIds.has(i.id)));
      setSelectedItemIds(new Set());
    } catch (err) {
      console.error("deleteSelectedItems failed:", err);
      alert("Failed to delete some items");
    }
  }

  async function markSelectedAsRead() {
    if (selectedItemIds.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedItemIds).map((id) => updateItem(id, true))
      );
      setItems((prev) =>
        prev.map((i) => (selectedItemIds.has(i.id) ? { ...i, completed: true } : i))
      );
      setSelectedItemIds(new Set());
    } catch (err) {
      console.error("markSelectedAsRead failed:", err);
    }
  }

  async function changeSelectedCollection() {
    if (selectedItemIds.size === 0 || !bulkCollectionSelect) return;
    try {
      await Promise.all(
        Array.from(selectedItemIds).map((id) => updateItem(id, undefined, undefined, undefined, undefined, bulkCollectionSelect))
      );
      setItems((prev) =>
        prev.map((i) => (selectedItemIds.has(i.id) ? { ...i, collection: bulkCollectionSelect } : i))
      );
      setSelectedItemIds(new Set());
      setBulkCollectionSelect('');
    } catch (err) {
      console.error("changeSelectedCollection failed:", err);
    }
  }

  async function createNewCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    // optimistic UI update
    setCollectionsList((prev) => Array.from(new Set([...prev, name])));
    setNewCollectionName("");
    setSelectedCollection(name);
    try {
      await createCollection(name);
      // refresh authoritative list from server so empty collections are persisted
      try {
        const rows = await fetchCollections();
        const names = rows.map((r) => r[0]);
        setCollectionsList(Array.from(new Set([...names, "Default"])));
      } catch (err) {
        console.debug("refresh collections after create failed:", err);
      }
    } catch (err: any) {
      console.error("createNewCollection failed:", err);
      // Collection was added optimistically; if backend fails, user can refresh to sync
    } finally {
      setCreatingCollection(false);
    }
  }

  return (
    <div style={{ padding: 20, width: "100%", minHeight: "100vh", backgroundColor: "#FFF9E6", display: "flex", flexDirection: "column", boxSizing: "border-box", fontFamily: "'Comic Sans MS', 'Quicksand', 'Rounded Mplus', cursive, sans-serif" }}>
      <h1 style={{ textAlign: "center", color: "#E6B800", fontWeight: 700, fontSize: 48, textShadow: "2px 2px 4px rgba(230, 184, 0, 0.2)", letterSpacing: 1 }}>Banana Book Catalog</h1>

      {/* Book Search (Open Library) */}
      <div
        style={{
          border: "3px dashed #FFE699",
          padding: 16,
          borderRadius: 16,
          marginBottom: 20,
          backgroundColor: "#FFFEF8",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            placeholder="Search books by title, author, ISBN..."
            value={bookQuery}
            onChange={(e) => setBookQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchBooks(bookQuery)}
            style={{
              flex: 1,
              padding: 10,
              border: "2px solid #FFE699",
              borderRadius: 12,
              backgroundColor: "#FFFEF5",
              color: "#333",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => searchBooks(bookQuery)}
            style={{ padding: "10px 16px", backgroundColor: "#FFD93D", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: "bold", fontFamily: "inherit", color: "#6B4423" }}
          >
            Search Books
          </button>
          {bookResults.length > 0 && (
            <button
              onClick={() => setBookResults([])}
              style={{ padding: "10px 12px", backgroundColor: "#FFFEF5", border: "2px solid #FFE699", borderRadius: 12, cursor: "pointer", color: "#333", fontWeight: "bold", fontFamily: "inherit" }}
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setShowManualAdd(!showManualAdd)}
            style={{ padding: "10px 16px", backgroundColor: showManualAdd ? "#FFE699" : "#FFFEF5", border: "2px solid #FFE699", borderRadius: 12, cursor: "pointer", fontWeight: "bold", fontFamily: "inherit", color: "#6B4423" }}
          >
            {showManualAdd ? "Hide Manual Add" : "Add Manually"}
          </button>
        </div>

        {/* Manual Add Form - Collapsible */}
        {showManualAdd && (
          <div style={{ marginTop: 12, padding: 16, backgroundColor: "#FFFEF5", border: "2px solid #FFE699", borderRadius: 12 }}>
            <h3 style={{ marginTop: 0, color: "#E6B800", fontWeight: 700 }}>Add Book Manually</h3>
            <input
              placeholder="Book title *"
              value={form.title}
              onChange={(e) => handleFormChange("title", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              style={{
                width: "100%",
                padding: 10,
                fontSize: 16,
                marginBottom: 10,
                boxSizing: "border-box",
                border: "2px solid #FFE699",
                borderRadius: 12,
                backgroundColor: "#FFFEF5",
                fontFamily: "inherit",
              }}
            />
            <textarea
              placeholder="Synopsis"
              value={form.description}
              onChange={(e) => handleFormChange("description", e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                fontSize: 14,
                marginBottom: 10,
                boxSizing: "border-box",
                minHeight: 80,
                border: "2px solid #FFE699",
                borderRadius: 12,
                backgroundColor: "#FFFEF5",
                fontFamily: "inherit",
              }}
            />
            <input
              placeholder="Cover URL"
              value={form.pictureUrl}
              onChange={(e) => handleFormChange("pictureUrl", e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                fontSize: 14,
                marginBottom: 10,
                boxSizing: "border-box",
                border: "2px solid #FFE699",
                borderRadius: 12,
                backgroundColor: "#FFFEF5",
                fontFamily: "inherit",
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
                  border: "2px solid #FFE699",
                  borderRadius: 12,
                  backgroundColor: "#FFFEF5",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <button
              onClick={addItem}
              style={{
                padding: "12px 24px",
                fontSize: 16,
                cursor: "pointer",
                backgroundColor: "#FFD93D",
                color: "#6B4423",
                border: "none",
                borderRadius: 20,
                fontWeight: "bold",
                boxShadow: "0 4px 12px rgba(255, 217, 61, 0.4)",
                transition: "all 0.2s",
                fontFamily: "inherit",
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
            >
              Add Book
            </button>
          </div>
        )}

        {bookResults.length > 0 && (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {bookResults.map((b) => (
              <div
                key={b.key}
                style={{
                  border: "1px solid #FFE082",
                  padding: 8,
                  borderRadius: 6,
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 220,
                }}
              >
                <div style={{ display: "flex", gap: 8, flex: 1 }}>
                  <div style={{ width: 64, height: 96, flexShrink: 0, background: "#f3f3f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {b.cover_i ? (
                      <img src={`https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`} alt={b.title} style={{ maxWidth: "100%", maxHeight: "100%" }} />
                    ) : (
                      <span style={{ fontSize: 12, color: "#999" }}>No cover</span>
                    )}
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontWeight: "bold", color: "#222" }}>{b.title}</div>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>{b.author_name?.join(", ")}</div>
                    {b.synopsis && (
                      <div style={{ fontSize: 12, color: "#555", marginBottom: 8, maxHeight: 48, overflow: "hidden" }}>{b.synopsis}</div>
                    )}
                    <div style={{ marginTop: "auto", display: "flex", gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start' }}>
                      <button
                        onClick={() => addBookToCatalog(b)}
                        style={{ padding: "6px 10px", minWidth: 110, textAlign: 'center', backgroundColor: "#FFD700", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: "bold", whiteSpace: 'nowrap' }}
                      >
                        Add to Catalog
                      </button>
                      <button
                        onClick={() => addBookToCatalog(b, 'Wishlist')}
                        style={{ padding: "6px 10px", minWidth: 110, textAlign: 'center', backgroundColor: "#90CAF9", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: "bold", color: '#033E6B', whiteSpace: 'nowrap' }}
                        title="Add this book to your Wishlist"
                      >
                        Add to Wishlist
                      </button>
                      <button
                        onClick={() => openPreview(b)}
                        style={{ padding: "6px 10px", minWidth: 80, textAlign: 'center', backgroundColor: "#FFFAF0", border: "1px solid #FFE082", borderRadius: 6, color: "#333", whiteSpace: 'nowrap', cursor: 'pointer', fontWeight: 'bold' }}
                        title="View details"
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
            placeholder="🔍 Search catalog by title, synopsis, or author..."
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
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
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
            <option value="">All Genres</option>
            {uniqueGenres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
          <select
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value as any)}
            style={{ padding: 12, fontSize: 14, border: "2px solid #FFE082", borderRadius: 6, backgroundColor: "#FFFAF0", cursor: "pointer", minWidth: 140 }}
          >
            <option value="all">All</option>
            <option value="read">Read</option>
            <option value="unread">Unread</option>
          </select>
          <select
            value={coverFilter}
            onChange={(e) => setCoverFilter(e.target.value as any)}
            style={{ padding: 12, fontSize: 14, border: "2px solid #FFE082", borderRadius: 6, backgroundColor: "#FFFAF0", cursor: "pointer", minWidth: 140 }}
          >
            <option value="all">Any cover</option>
            <option value="has">Has cover</option>
            <option value="none">No cover</option>
          </select>
          <select
            value={synopsisFilter}
            onChange={(e) => setSynopsisFilter(e.target.value as any)}
            style={{ padding: 12, fontSize: 14, border: "2px solid #FFE082", borderRadius: 6, backgroundColor: "#FFFAF0", cursor: "pointer", minWidth: 140 }}
          >
            <option value="all">Any synopsis</option>
            <option value="has">Has synopsis</option>
            <option value="none">No synopsis</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ padding: 12, fontSize: 14, border: "2px solid #FFE082", borderRadius: 6, backgroundColor: "#FFFAF0", cursor: "pointer", minWidth: 140 }}
          >
            <option value="title">Sort: Title</option>
            <option value="author">Sort: Author</option>
            <option value="newest">Sort: Newest</option>
          </select>
          {(searchQuery || authorFilter || readFilter !== 'all' || coverFilter !== 'all' || synopsisFilter !== 'all' || genreFilter) && (
            <button
              onClick={() => {
                setSearchQuery("");
                setAuthorFilter("");
                setGenreFilter("");
                setReadFilter('all');
                setCoverFilter('all');
                setSynopsisFilter('all');
                setSortBy('title');
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

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          {collections.map((col) => {
            const count = items.filter((it) => (col === 'All' ? true : (it.collection || 'Default') === col)).length;
            const active = selectedCollection === col;
            return (
              <button
                key={col}
                onClick={() => setSelectedCollection(col)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: active ? '2px solid #FFD700' : '1px solid #FFE082',
                  background: active ? '#FFD700' : '#FFFAF0',
                  color: '#333',
                  fontWeight: active ? 'bold' : 'normal',
                  cursor: 'pointer'
                }}
              >
                {col} ({count})
              </button>
            );
          })}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexDirection: 'row' }}>
            {selectedItemIds.size > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#FFFAF0', padding: '8px 12px', borderRadius: 6, border: '1px solid #FFE082' }}>
                <span style={{ fontWeight: 'bold', color: '#333' }}>{selectedItemIds.size} selected</span>
                <button
                  onClick={markSelectedAsRead}
                  style={{ padding: '6px 10px', backgroundColor: '#DFF0D8', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', color: '#2E7D32' }}
                >
                  Mark as Read
                </button>
                <select
                  value={bulkCollectionSelect}
                  onChange={(e) => setBulkCollectionSelect(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid #FFE082', borderRadius: 6, background: '#fff' }}
                >
                  <option value="">Change Collection</option>
                  {collections.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {bulkCollectionSelect && (
                  <button
                    onClick={changeSelectedCollection}
                    style={{ padding: '6px 10px', backgroundColor: '#FFD700', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Apply
                  </button>
                )}
                <button
                  onClick={deleteSelectedItems}
                  style={{ padding: '6px 10px', backgroundColor: '#FF6B6B', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', color: '#fff' }}
                >
                  Delete
                </button>
              </div>
            )}
            {selectedCollection !== 'All' && selectedCollection !== 'Default' && (
              <button
                onClick={async () => {
                  if (!confirm(`Delete collection '${selectedCollection}' and move its books to Default?`)) return;
                  try {
                    await deleteCollection(selectedCollection);
                    const rows = await fetchCollections();
                    setCollectionsList(rows.map((r) => r[0]));
                    const fresh = await fetchItems();
                    setItems(fresh);
                    setSelectedCollection('All');
                  } catch (err) {
                    console.error('delete selected collection failed:', err);
                    alert('Failed to delete collection');
                  }
                }}
                style={{ padding: '8px 12px', borderRadius: 6, background: '#FF6B6B', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}
                title={`Delete collection ${selectedCollection}`}
              >
                Delete Selected Collection
              </button>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                placeholder="New collection"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createNewCollection()}
                disabled={creatingCollection}
                style={{ padding: 8, borderRadius: 6, border: '1px solid #FFE082', background: '#FFFAF0' }}
              />
              <button
                onClick={createNewCollection}
                disabled={creatingCollection}
                style={{ padding: '8px 12px', borderRadius: 6, background: '#FFD700', border: 'none', cursor: creatingCollection ? 'default' : 'pointer', fontWeight: 'bold', opacity: creatingCollection ? 0.6 : 1 }}
              >
                {creatingCollection ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
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
                  checked={selectedItemIds.has(item.id)}
                  title="Select for bulk operations"
                  onChange={() => toggleSelectItem(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: 20,
                    height: 20,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
                {item.picture_url && (
                  <img
                    src={item.picture_url}
                    alt={item.title}
                    style={{ width: 40, height: 60, objectFit: "cover", borderRadius: 4, marginLeft: 8 }}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <div style={{ flex: 1, marginLeft: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h3 style={{ margin: 0, color: '#000' }}>{item.title}</h3>
                    {(item.collection || 'Default') !== 'Default' && (
                      <span style={{ 
                        padding: '2px 8px', 
                        background: (item.collection || 'Default') === 'Wishlist' ? '#F3E5F5' : '#E3F2FD', 
                        color: (item.collection || 'Default') === 'Wishlist' ? '#8E24AA' : '#1976D2', 
                        borderRadius: 8, 
                        fontSize: 12, 
                        fontWeight: 700 
                      }}>
                        {item.collection}
                      </span>
                    )}
                    {item.completed && (
                      <span style={{ padding: '2px 8px', background: '#DFF0D8', color: '#2E7D32', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>Read</span>
                    )}
                  </div>
                  {item.author && (
                    <div style={{ fontSize: 12, color: "#666" }}>{item.author}</div>
                  )}
                  {item.genres && item.genres.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {item.genres.slice(0, 6).map((g) => (
                        <span key={g} style={{ padding: '3px 8px', background: '#FFFAF0', border: '1px solid #FFE082', borderRadius: 999, fontSize: 11, color: '#555' }}>{g}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleComplete(item.id, item.completed);
                    }}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: item.completed ? "1px solid #2E7D32" : "1px solid #FFE082",
                      backgroundColor: item.completed ? "#DFF0D8" : "#FFFAF0",
                      cursor: "pointer",
                      color: item.completed ? "#2E7D32" : "#333",
                      fontWeight: "bold",
                      fontSize: 12
                    }}
                    title={item.completed ? "Mark as unread" : "Mark as read"}
                  >
                    {item.completed ? "✓ Read" : "Mark Read"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!confirm("Remove this book from the catalog?")) return;
                      // optimistic remove
                      deleteItem(item.id)
                        .then(() => setItems((prev) => prev.filter((i) => i.id !== item.id)))
                        .catch((err) => console.error("delete failed:", err));
                    }}
                    style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #FFE082", background: "#FFFAF0", cursor: "pointer", color: "#333", fontWeight: "bold" }}
                  >
                    Remove
                  </button>
                  <span style={{ fontSize: 12, color: "#999" }}>{expandedId === item.id ? "▼" : "▶"}</span>
                </div>
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
                  <p style={{ margin: "0 0 8px 0", color: "#555", fontSize: 14 }}>
                    <strong>Collection:</strong>
                    <select
                      value={item.collection || 'Default'}
                      onChange={async (e) => {
                        const newCol = e.target.value;
                        try {
                          const updated = await updateItem(item.id, undefined, undefined, undefined, undefined, newCol);
                          setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
                        } catch (err) {
                          console.error('change collection failed:', err);
                        }
                      }}
                      style={{ marginLeft: 8, padding: 6, borderRadius: 6, border: '1px solid #FFE082', background: '#FFFAF0' }}
                    >
                      {collections.filter((c) => c !== 'All').map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {previewBook && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setPreviewBook(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: 20,
              maxWidth: 520,
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
              position: 'relative',
            }}
          >
            <button
              onClick={() => setPreviewBook(null)}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                border: '1px solid #FFD700',
                background: '#FFD700',
                color: '#333',
                borderRadius: 6,
                padding: '6px 8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
              }}
              aria-label="Close"
            >
              ✕
            </button>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 120, minHeight: 180, background: '#f5f5f5', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {previewBook.cover_i ? (
                  <img
                    src={`https://covers.openlibrary.org/b/id/${previewBook.cover_i}-L.jpg`}
                    alt={previewBook.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: 12, color: '#888' }}>No cover</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: '0 0 6px 0' }}>{previewBook.title}</h2>
                {previewBook.author_name && (
                  <div style={{ color: '#555', marginBottom: 8 }}>By {previewBook.author_name.join(', ')}</div>
                )}
                {(previewBook.synopsis || previewBook.description || (previewBook.subject && previewBook.subject.length)) && (
                  <div style={{ fontSize: 14, color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {previewBook.synopsis || previewBook.description || previewBook.subject?.slice(0, 8).join(', ')}
                  </div>
                )}
              </div>
            </div>

            {previewBook.subject && previewBook.subject.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Genres</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {previewBook.subject.slice(0, 12).map((s) => (
                    <span key={s} style={{ padding: '4px 8px', background: '#FFFAF0', border: '1px solid #FFE082', borderRadius: 999, fontSize: 12, color: '#555' }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <button
                onClick={() => addBookToCatalog(previewBook)}
                style={{ padding: '10px 12px', backgroundColor: '#FFD700', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Add to Catalog
              </button>
              <button
                onClick={() => addBookToCatalog(previewBook, 'Wishlist')}
                style={{ padding: '10px 12px', backgroundColor: '#90CAF9', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#033E6B' }}
              >
                Add to Wishlist
              </button>
              <a
                href={`https://openlibrary.org${previewBook.key}`}
                target="_blank"
                rel="noreferrer"
                style={{ padding: '10px 12px', backgroundColor: '#FFFAF0', border: '1px solid #FFE082', borderRadius: 6, textDecoration: 'none', color: '#333' }}
              >
                View on Open Library
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
