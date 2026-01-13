const API_BASE = "https://twilight-tree-42ce.hiattgafnea0.workers.dev";
const $ = (id) => document.getElementById(id);

// --- 1. Helper Functions ---
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
  toast.classList.remove("ok", "warn", "hidden");
  toast.classList.add(type);
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { 
    toast.classList.add("hidden");
    toast.hidden = true; 
  }, 2500);
}

const getSavedAdminKey = () => localStorage.getItem("one_done_admin_key") || "";

// --- 2. Main Application Logic ---
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

    const refreshUI = async () => {
      const s = await (await fetch(`${API_BASE}/settings`)).json();
      const namesRes = await (await fetch(`${API_BASE}/submitted`)).json();
      
      if (namesRes.ok) {
        submittedList.innerHTML = namesRes.names.map(n => `<span class="member-pill">${n}</span>`).join("");
      }

      if (s.revealed) {
        statusLine.textContent = "Picks are revealed.";
        statusLine.className = "status-pill ok";
        form.classList.add("hidden");
        picksBlock.classList.remove("hidden");
        
        const res = await (await fetch(`${API_BASE}/picks`)).json();
        if (res.ok) {
          picksRows.innerHTML = res.picks.map(p => 
            `<tr><td>${p.name}</td><td>${p.pick}</td><td>${new Date(p.ts).toLocaleString()}</td></tr>`
          ).join("");
        }
      } else {
        statusLine.textContent = "Picks are open, reveal Wed at 9:00 PM ET.";
        statusLine.className = "status-pill warn";
        form.classList.remove("hidden");
        picksBlock.classList.add("hidden");
        submitBtn.disabled = !!s.locked;
      }
    };

    // --- Submit Logic ---
    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = $("name").value.trim();
      const pick = $("pick").value.trim();

      if (!name || !pick) {
        showToast("Enter name and pick.", "warn");
        return;
      }

      submitBtn.disabled = true;
      const res = await fetch(`${API_BASE}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pick }),
      }).then(r => r.json());

      if (res.ok) {
        showToast("Pick submitted!", "ok");
        triggerConfetti();
        $("pick").value = "";
        await refreshUI();
      } else {
        showToast(res.message, "warn");
      }
      submitBtn.disabled = false;
    };

    // --- Admin Controls ---
    adminBlock.classList.remove("hidden");

    adminKeyBtn.onclick = () => {
      const k = prompt("Enter admin key");
      if (k) {
        localStorage.setItem("one_done_admin_key", k.trim());
        showToast("Key saved.", "ok");
      }
    };

    revealBtn.onclick = async () => {
      const k = getSavedAdminKey();
      if (!k) return showToast("No key saved.", "warn");
      
      const res = await fetch(`${API_BASE}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": k },
        body: JSON.stringify({ action: "reveal" }),
      }).then(r => r.json());

      if (res.ok) {
        showToast("Revealed!", "ok");
        await refreshUI();
      } else {
        showToast(res.message, "warn");
      }
    };

    resetBtn.onclick = async () => {
      const k = getSavedAdminKey();
      if (!k) return showToast("No key saved.", "warn");
      if (!confirm("Reset everything for next week?")) return;

      const res = await fetch(`${API_BASE}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": k },
        body: JSON.stringify({ action: "reset" }),
      }).then(r => r.json());

      if (res.ok) {
        showToast("Reset complete.", "ok");
        await refreshUI();
      } else {
        showToast(res.message, "warn");
      }
    };

    await refreshUI();
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
