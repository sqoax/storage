export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Admin-Key",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });

    // --- NEW: Added Root & Health Routes ---
    if (path === "/" || path === "") {
      return json({ 
        ok: true, 
        message: "One and Done API is active.",
        system: "Cloudflare Worker"
      });
    }

    if (path === "/health") {
      return json({ 
        ok: true, 
        status: "healthy", 
        timestamp: new Date().toISOString() 
      });
    }
    // ---------------------------------------

    const nowETParts = () => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(new Date());

      const get = (t) => parts.find((p) => p.type === t)?.value;
      return {
        y: Number(get("year")),
        mo: Number(get("month")),
        d: Number(get("day")),
        h: Number(get("hour")),
        mi: Number(get("minute")),
        s: Number(get("second")),
      };
    };

    const getDowET = () => {
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
      }).format(new Date());
      const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return map[weekday] ?? 0;
    };

    const baseSettings = {
      locked: false,
      revealed: false,
      autoReveal: true,
      revealDow: 3,      // Wed
      revealHour: 21,    // 9 PM
      revealMinute: 0,
    };

    const getSettings = async () => {
      const raw = await env.PICKS.get("settings");
      if (!raw) return { ...baseSettings };
      try {
        return { ...baseSettings, ...(JSON.parse(raw) || {}) };
      } catch {
        return { ...baseSettings };
      }
    };

    const setSettings = async (s) => {
      await env.PICKS.put("settings", JSON.stringify(s));
    };

    const shouldAutoReveal = (s) => {
      if (!s.autoReveal) return false;
      const dow = getDowET();
      if (dow !== s.revealDow) return false;
      const t = nowETParts();
      if (t.h > s.revealHour) return true;
      if (t.h < s.revealHour) return false;
      return t.mi >= s.revealMinute;
    };

    const maybeAutoReveal = async () => {
      const s = await getSettings();
      if (!s.revealed && shouldAutoReveal(s)) {
        s.revealed = true;
        s.locked = true;
        await setSettings(s);
      }
      return s;
    };

    const listAllPicks = async () => {
      const picks = [];
      let cursor;
      do {
        const list = await env.PICKS.list({ prefix: "pick:", cursor });
        cursor = list.cursor;
        for (const k of list.keys) {
          const v = await env.PICKS.get(k.name);
          if (!v) continue;
          try { picks.push(JSON.parse(v)); } catch {}
        }
      } while (cursor);
      picks.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      return picks;
    };

    const deleteAllPicks = async () => {
      let cursor;
      do {
        const list = await env.PICKS.list({ prefix: "pick:", cursor });
        cursor = list.cursor;
        await Promise.all(list.keys.map((k) => env.PICKS.delete(k.name)));
      } while (cursor);
    };

    // GET /settings
    if (path === "/settings" && request.method === "GET") {
      const s = await maybeAutoReveal();
      return json({ ok: true, ...s });
    }

    // --- NEW: Blind Submitted Names Route ---
    if (path === "/submitted" && request.method === "GET") {
      const picks = await listAllPicks();
      // Only return names to keep picks secret
      const names = picks.map(p => p.name);
      return json({ ok: true, names });
    }
    // ----------------------------------------

    // POST /submit
    if (path === "/submit" && request.method === "POST") {
      let body;
      try { body = await request.json(); }
      catch { return json({ ok: false, message: "Invalid JSON." }, 400); }

      const name = String(body?.name || "").trim();
      const pick = String(body?.pick || "").trim();
      const s = await maybeAutoReveal();
      if (s.locked) return json({ ok: false, message: "Picks are locked." }, 403);
      if (!name || !pick) return json({ ok: false, message: "Name and pick are required." }, 400);
      const entry = { name, pick, ts: new Date().toISOString() };
      const key = `pick:${name.toLowerCase()}`;
      await env.PICKS.put(key, JSON.stringify(entry));
      return json({ ok: true, message: "Pick submitted." });
    }

    // GET /picks
    if (path === "/picks" && request.method === "GET") {
      const s = await maybeAutoReveal();
      if (!s.revealed) return json({ ok: false, message: "Not revealed yet." }, 403);
      const picks = await listAllPicks();
      return json({ ok: true, picks });
    }

    // POST /admin
    if (path === "/admin" && request.method === "POST") {
      const adminKey = request.headers.get("X-Admin-Key") || "";
      const expected = env.ADMIN_KEY || "";
      if (!expected || adminKey !== expected) return json({ ok: false, message: "Unauthorized." }, 401);
      let body;
      try { body = await request.json(); }
      catch { return json({ ok: false, message: "Invalid JSON." }, 400); }
      const action = String(body?.action || "");
      const s = await getSettings();
      if (action === "lock") s.locked = true;
      else if (action === "unlock") s.locked = false;
      else if (action === "reveal") { s.revealed = true; s.locked = true; }
      else if (action === "hide") s.revealed = false;
      else if (action === "reset") {
        await deleteAllPicks();
        s.locked = false;
        s.revealed = false;
      } else {
        return json({ ok: false, message: "Unknown action." }, 400);
      }
      await setSettings(s);
      return json({ ok: true, settings: s });
    }

    return json({ ok: false, message: "Not found." }, 404);
  },
};
