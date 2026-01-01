const API_BASE = "https://twilight-tree-42ce.hiattgafnea0.workers.dev";

function $(id) { return document.getElementById(id); }

// --- 1. Helper Functions (Placed at top, accessible everywhere) ---
const triggerConfetti = () => {
  const colors = ['#c5a059', '#1e3a28', '#f2f2f2']; // Gold, Augusta Green, White
  confetti({
    particleCount: 150,
    spread: 70,
    origin: { y: 0.6 },
    colors: colors,
    zIndex: 999
  });
};

function showToast(message, type = "ok") {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.remove("ok", "warn");
  toast.classList.add(type);
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 2500);
}

// --- 2. API Communication ---
async function apiGetSettings() {
  const r = await fetch(`${API_BASE}/settings`);
  return await r.json();
}

async function apiGetSubmittedNames() {
  const r = await fetch(`${API_BASE}/submitted`);
  const data = await r.json().catch(() => ({ ok: false }));
  return data;
}

async function apiSubmitPick({ name, pick }) {
  const r = await fetch(`${API_BASE}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pick }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, message: data?.message || `Error ${r.status}` };
  return data;
}

async function apiGetPicks() {
  const r = await fetch(`${API_BASE}/picks`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, message: data?.message || `Error ${r.status}` };
  return data;
}

async function apiAdmin(action, adminKey) {
  const r = await fetch(`${API_BASE}/admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey || "",
    },
    body: JSON.stringify({ action }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, message: data?.message || `Error ${r.status}` };
  return data;
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || "";
  }
}

// --- 3. Main Application Logic ---
const App = {
  async init() {
    const form = $("pickForm");
    const statusLine = $("statusLine");
    const submitBtn = $("submitBtn");
    const picksBlock = $("picksBlock");
    const picksRows = $("picksRows");
    const submittedList = $("submittedList");

    const adminBlock = $("adminBlock");
    const adminKeyBtn = $("adminKeyBtn");
    const resetBtn = $("resetBtn");
    const revealBtn = $("revealBtn");
    const adminStatus = $("adminStatus");

    const setStatus = (msg, type = "warn") => {
      if (!statusLine) return;
      statusLine.textContent = msg;
      statusLine.classList.remove("ok", "warn");
      statusLine.classList.add(type);
    };

    const setAdminStatus = (msg, type = "warn") => {
      if (!adminStatus) return;
      adminStatus.textContent = msg;
      adminStatus.classList.remove("ok", "warn");
      adminStatus.classList.add(type);
    };

    const loadSubmittedNames = async () => {
      const data = await apiGetSubmittedNames();
      if (data.ok && submittedList) {
        submittedList.innerHTML = data.names.map(name => 
          `<span class="member-pill">${name}</span>`
        ).join("");
      }
    };

    const getSavedAdminKey = () => localStorage.getItem("one_done_admin_key") || "";
    const saveAdminKey = (k) => localStorage.setItem("one_done_admin_key", k);

    const refreshUI = async () => {
      const s = await apiGetSettings();
      await loadSubmittedNames(); // Keep the "Who's In" list updated

      if (s.revealed) {
        setStatus("Picks are revealed.", "ok");
        if (form) form.classList.add("hidden");
        if (picksBlock) picksBlock.classList.remove("hidden");

        const res = await apiGetPicks();
        if (res.ok) {
          const picks = res.picks || [];
          if (picksRows) {
            picksRows.innerHTML = picks.map(p =>
              `<tr><td>${p.name || ""}</td><td>${p.pick || ""}</td><td>${fmtTime(p.ts)}</td></tr>`
            ).join("");
          }
        } else {
          showToast(res.message || "Could not load picks.", "warn");
        }
        return;
      }

      setStatus("Picks are open, picks reveal Wednesday at 9:00 PM ET.", "warn");
      if (form) form.classList.remove("hidden");
      if (picksBlock) picksBlock.classList.add("hidden");

      const locked = !!s.locked;
      if (submitBtn) submitBtn.disabled = locked;
      if (locked) showToast("Picks are locked right now.", "warn");
    };

    // Submit handler
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = ($("name")?.value || "").trim();
        const pick = ($("pick")?.value || "").trim();

        if (!name || !pick) {
          showToast("Enter your name and pick.", "warn");
          return;
        }

        if (submitBtn) submitBtn.disabled = true;
        const res = await apiSubmitPick({ name, pick });

        if (res.ok) {
          showToast(res.message || "Pick submitted.", "ok");
          triggerConfetti();
          if ($("pick")) $("pick").value = "";
          await loadSubmittedNames(); // Instant update of the list
        } else {
          showToast(res.message || "Submit failed.", "warn");
        }

        if (submitBtn) submitBtn.disabled = false;
        await refreshUI();
      });
    }

    // Admin controls
    if (adminBlock) adminBlock.classList.remove("hidden");

    if (adminKeyBtn) {
      adminKeyBtn.addEventListener("click", () => {
        const k = prompt("Enter admin key");
        if (k && k.trim()) {
          saveAdminKey(k.trim());
          setAdminStatus("Admin key saved on this device.", "ok");
        }
      });
    }

    if (revealBtn) {
      revealBtn.addEventListener("click", async () => {
        const k = getSavedAdminKey();
        if (!k) { setAdminStatus("No admin key set.", "warn"); return; }
        if (!confirm("Force reveal now, lock submissions, and show picks?")) return;
        const res = await apiAdmin("reveal", k);
        if (res.ok) {
          showToast("Revealed.", "ok");
          await refreshUI();
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", async () => {
        const k = getSavedAdminKey();
        if (!k) { 
          setAdminStatus("No admin key set.", "warn"); 
          return; 
        }

        if (!confirm("Reset picks, open submissions again?")) return;
        
        const res = await apiAdmin("reset", k);
        if (res.ok) {
          showToast("Reset complete. Form reopened.", "ok");
          setAdminStatus("Reset complete.", "ok");
          
          // FORCE UI REFRESH: This tells the app to re-read settings from Cloudflare
          // and switch back from "Revealed Table" to "Submit Form"
          await refreshUI(); 
        } else {
          showToast(res.message || "Reset failed.", "warn");
          setAdminStatus(res.message || "Reset failed.", "warn");
        }
      });
    }
    
    await refreshUI();
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
