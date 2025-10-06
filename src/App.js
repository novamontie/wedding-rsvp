import React, { useMemo, useState, useEffect } from "react";

const WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbzwyjdCGeBWN0yAxUI_PtifqcAes83HVqavntRuzleNz8r0cjjHG0nbEfcQV_lYudLC/exec"; // Apps Script Web App URL (must be /exec)

// ===== Public CSV (Published Google Sheet) =====
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1hhCVI_qw6CeFTZfwE5vea-WNnJqRYyx4StybsieogxI/edit?usp=sharing";

// --- Helpers ---
const LS_KEY = "wedding_rsvps_v1";
const saveLocal = (entry) => {
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    existing.push(entry);
    localStorage.setItem(LS_KEY, JSON.stringify(existing));
  } catch (e) {
    console.error("Failed to save to localStorage", e);
  }
};
const loadLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
};

// FLATTEN guestsDetails into columns guest1Name, guest1Dietary, ...
const toCSV = (rows) => {
  if (!rows?.length) return "";

  const common = [
    "submittedAt",
    "fullName",
    "email",
    "attending",
    "guests",
    "dietary", // will be empty now (no general dietary field), kept for compatibility
    "message",
    "userAgent",
  ];

  const maxGuests = rows.reduce(
    (m, r) => Math.max(m, Array.isArray(r.guestsDetails) ? r.guestsDetails.length : 0),
    0
  );

  const guestCols = [];
  for (let i = 1; i <= maxGuests; i++) {
    guestCols.push(`guest${i}Name`, `guest${i}Dietary`);
  }

  const headers = [...common, ...guestCols];

  const escape = (v) => {
    const s =
      v == null
        ? ""
        : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return '"' + s.replaceAll('"', '""') + '"';
    }
    return s;
  };

  const lines = [headers.join(",")];

  for (const r of rows) {
    const vals = [];

    vals.push(
      escape(r.submittedAt || ""),
      escape(r.fullName || ""),
      escape(r.email || ""),
      escape(r.attending || ""),
      escape(r.guests ?? ""),
      escape(r.dietary || ""), // empty now
      escape(r.message || ""),
      escape(r.userAgent || "")
    );

    const gd = Array.isArray(r.guestsDetails) ? r.guestsDetails : [];
    for (let i = 0; i < maxGuests; i++) {
      const guest = gd[i] || {};
      vals.push(escape(guest.name || ""), escape(guest.dietary || ""));
    }

    lines.push(vals.join(","));
  }

  return lines.join("\n");
};

const download = (filename, text) => {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// --- UI bits ---
const Label = ({ children }) => (
  <label className="block text-sm font-medium leading-6 text-gray-700 mb-1">{children}</label>
);
const Input = ({ className = "", ...props }) => (
  <input
    className={
      "w-full rounded-2xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-800 shadow-sm " +
      className
    }
    {...props}
  />
);
const TextArea = ({ className = "", ...props }) => (
  <textarea
    className={
      "w-full rounded-2xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-800 shadow-sm min-h-[96px] " +
      className
    }
    {...props}
  />
);
const Button = ({ children, className = "", ...props }) => (
  <button
    className={
      "inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold shadow-sm bg-black text-white hover:opacity-90 disabled:opacity-50 " +
      className
    }
    {...props}
  >
    {children}
  </button>
);
const RadioGroup = ({ value, onChange, name, options }) => (
  <div className="flex gap-3">
    {options.map((opt) => (
      <label key={opt.value} className="flex cursor-pointer items-center gap-2">
        <input
          type="radio"
          name={name}
          value={opt.value}
          checked={value === opt.value}
          onChange={(e) => onChange(e.target.value)}
          className="h-4 w-4"
        />
        <span className="text-sm">{opt.label}</span>
      </label>
    ))}
  </div>
);

export default function WeddingRSVP() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // kept `dietary` in state for backward compatibility, but we no longer render a general dietary input
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    attending: "yes",
    guests: 1,
    dietary: "", // stays empty; only per-guest dietary is collected
    message: "",
  });

  // Dynamic guest details array
  const [guestsDetails, setGuestsDetails] = useState([{ name: "", dietary: "" }]);

  // Load Apple Chancery-like web fonts once
  useEffect(() => {
    const id = "gf-allura-alexbrush";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Allura&family=Alex+Brush&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  // Sync array length with guests count
  useEffect(() => {
    const n = Math.max(0, Number(form.guests) || 0);
    setGuestsDetails((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push({ name: "", dietary: "" });
      return next;
    });
  }, [form.guests]);

  const localData = useMemo(() => loadLocal(), [submitted]);

  const WEDDING = {
    coupleNames: "Demi & Liam",
    date: "14th March 2026",
    time: "12:30PM",
    venue: " Woodlands Hotel, 79 Gelderd Road, Gildersome, Leeds, LS27 7LY",
    rsvpBy: "14th January 2026",
  };

  const handleChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleGuestChange = (i, key, value) =>
    setGuestsDetails((list) => {
      const copy = [...list];
      copy[i] = { ...copy[i], [key]: value };
      return copy;
    });

  const validate = () => {
    if (!form.fullName.trim()) return "Please enter your full name";
    if (!form.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email))
      return "Please enter a valid email";
    const guestNum = Number(form.guests);
    if (Number.isNaN(guestNum) || guestNum < 0) return "Guests must be 0 or more";

    if (form.attending === "yes" && guestNum > 0) {
      for (let i = 0; i < guestNum; i++) {
        if (!guestsDetails[i]?.name?.trim()) {
          return `Please enter a name for guest ${i + 1}`;
        }
      }
    }
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const problem = validate();
    if (problem) return setError(problem);

    const payload = {
      ...form,
      guests: Number(form.guests),
      guestsDetails, // array of { name, dietary }
      submittedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };

    setSubmitting(true);
    try {
      // Save locally so you can export even if network fails
      saveLocal(payload);

      // Post to your Google Apps Script Web App
      if (WEBHOOK_URL) {
        await fetch(WEBHOOK_URL, {
          method: "POST",
          mode: "no-cors", // avoid CORS errors from browser → Apps Script
          headers: { "Content-Type": "text/plain" }, // send JSON as plain text
          body: JSON.stringify(payload),
        });
      }

      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong submitting your RSVP. Your response was saved locally.");
    } finally {
      setSubmitting(false);
    }
  };

  const clearAll = () => {
    if (window.confirm("Delete ALL saved RSVPs on this device?")) {
      localStorage.removeItem(LS_KEY);
      window.location.reload();
    }
  };
  const exportCSV = () => {
    const csv = toCSV(localData);
    download("wedding-rsvps.csv", csv);
  };

  useEffect(() => {
    document.title = `${WEDDING.coupleNames} – Wedding RSVP`;
  }, []);

  return (
    <div className="relative min-h-screen text-gray-900">
      {/* Lighter gold + darker hero styles */}
      <style>{`
        @keyframes goldShimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
        .gold-text {
          background-image: linear-gradient(
            115deg,
            #d8c06a 0%,
            #eadb9c 18%,
            #fff6cf 36%,
            #f1e4a8 54%,
            #fff7dc 72%,
            #e8d48a 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: goldShimmer 10s linear infinite;
          filter: drop-shadow(0 0.5px 0 rgba(0,0,0,0.25));
        }
        .fancy-script {
          font-family: "Apple Chancery", "Allura", "Alex Brush", "Great Vibes", cursive;
          letter-spacing: 0.2px;
          font-weight: 400;
        }
      `}</style>

      {/* Venue background across entire site */}
      <div
        className="absolute inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: "url('/venue.jpg')" }}
      />
      {/* overlay tint so text stays readable */}
      <div className="absolute inset-0 -z-10 bg-white/70" />

      {/* Hero section with hero1.jpg (darker overlay now) */}
      <header className="relative isolate min-h-[80vh]">
        <div
          className="absolute inset-0 -z-10 bg-center bg-no-repeat bg-contain"
          style={{ backgroundImage: "url('/hero1.jpg')" }}
        />
        <div className="absolute inset-0 -z-0 bg-black/50" />
        <div className="relative mx-auto max-w-4xl px-6 pt-24 pb-10 text-center">
          {/* narrow line-length wrapper so lines stay short */}
          <div className="mx-auto max-w-[26ch] sm:max-w-[34ch] [text-wrap:balance]">
            <p className="tracking-widest uppercase text-sm leading-6 gold-text"></p>

            <h1 className="mt-2 text-5xl sm:text-6xl font-semibold">
              <span className="gold-text fancy-script">{WEDDING.coupleNames}</span>
            </h1>

            <p className="mt-4 text-lg sm:text-xl leading-relaxed gold-text">
              {WEDDING.date} at {WEDDING.time}
            </p>

            {/* Manual line breaks for the address */}
            <p className="text-lg sm:text-xl leading-relaxed gold-text">
              <span className="block">Woodlands Hotel</span>
              <span className="block">79 Gelderd Road</span>
              <span className="block">Gildersome</span>
              <span className="block">Leeds LS27 7LY</span>
            </p>

            <div className="mt-6 inline-flex rounded-2xl bg-white/90 px-4 py-1 text-xs font-medium text-gray-900">
              Please RSVP by {WEDDING.rsvpBy}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="relative mx-auto max-w-4xl px-6 -mt-10">
        {!submitted ? (
          <section className="rounded-3xl bg-white/90 shadow-xl p-6 sm:p-8">
            <h2 className="text-2xl font-semibold">RSVP</h2>
            <p className="mt-1 text-sm text-gray-600">
              Let us know if you can celebrate with us. One form per invitation is perfect. ✨
            </p>

            <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
              <div>
                <Label>Your name (primary contact)</Label>
                <Input
                  placeholder="Taylor Swift"
                  value={form.fullName}
                  onChange={(e) => handleChange("fullName", e.target.value)}
                />
              </div>

              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                />
              </div>

              <div>
                <Label>Will you be attending?</Label>
                <RadioGroup
                  name="attending"
                  value={form.attending}
                  onChange={(v) => handleChange("attending", v)}
                  options={[
                    { value: "yes", label: "Greatfully accepts" },
                    { value: "no", label: "Regretfully declines" },
                  ]}
                />
              </div>

              {/* Guests count (general dietary input removed per your request) */}
              <div>
                <Label>How many guests (including you)?</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={form.guests}
                  onChange={(e) => handleChange("guests", e.target.value)}
                />
              </div>

              {/* Per-guest fields (names + dietary only here) */}
              {form.attending === "yes" && Number(form.guests) > 0 && (
                <div className="mt-2 grid gap-4">
                  <h3 className="text-lg font-semibold">Guest details</h3>
                  {guestsDetails.map((g, i) => (
                    <div key={i} className="rounded-2xl border border-gray-200 bg-white/70 p-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Guest {i + 1} name</Label>
                          <Input
                            placeholder={`Guest ${i + 1} full name`}
                            value={g.name}
                            onChange={(e) => handleGuestChange(i, "name", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Guest {i + 1} dietary (optional)</Label>
                          <Input
                            placeholder="e.g., vegetarian, nut allergy"
                            value={g.dietary}
                            onChange={(e) => handleGuestChange(i, "dietary", e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <Label>Message to the couple (optional)</Label>
                <TextArea
                  placeholder="Any notes you'd like to share"
                  value={form.message}
                  onChange={(e) => handleChange("message", e.target.value)}
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Send RSVP"}
                </Button>
              </div>
            </form>
          </section>
        ) : (
          <section className="rounded-3xl bg-white/90 shadow-xl p-6 sm:p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              ✅
            </div>
            <h2 className="text-2xl font-semibold">Thank you!</h2>
            <p className="mt-1 text-gray-600">
              Your RSVP has been received. We can’t wait to celebrate together.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                onClick={() => setSubmitted(false)}
                className="bg-white text-gray-900 border border-gray-200"
              >
                Submit another
              </Button>
              <Button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                Back to top
              </Button>
            </div>
          </section>
        )}

        {/* Details + Accommodation + Host tools */}
        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          {/* Details */}
          <div className="rounded-3xl bg-white/90 shadow p-6">
            <h3 className="text-lg font-semibold">Details</h3>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              <li><strong>Date:</strong> {WEDDING.date}</li>
              <li><strong>Time:</strong> {WEDDING.time}</li>
              <li><strong>Venue:</strong> {WEDDING.venue}</li>
              <li><strong>RSVP by:</strong> {WEDDING.rsvpBy}</li>
            </ul>
          </div>

          {/* Nearby accommodation details */}
          <div className="rounded-3xl bg-white/90 shadow p-6">
            <h3 className="text-lg font-semibold">Nearby accommodation details</h3>
            <ul className="mt-4 space-y-4 text-sm text-gray-700">
              <li className="rounded-2xl border border-gray-200 p-4 bg-white/70">
                <p className="font-medium">Premier Inn — Leeds South (Birstall)</p>
                <p>Wakefield Road, BD11 1EA</p>
                <p className="text-gray-600">1.5 miles — 6 minute drive from Woodlands Hotel</p>
              </li>
              <li className="rounded-2xl border border-gray-200 p-4 bg-white/70">
                <p className="font-medium">Travelodge — Leeds Morley</p>
                <p>Bruntcliffe Road, LS26 0LY</p>
                <p className="text-gray-600">1.8 miles — 7 minute drive from Woodlands Hotel</p>
              </li>
            </ul>
          </div>

          {/* Host tools */}
          <div className="rounded-3xl bg-white/90 shadow p-6 sm:col-span-2">
            <h3 className="text-lg font-semibold">Host tools</h3>
            <p className="mt-2 text-sm text-gray-600">Visible only to you.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {/* Master CSV (published link you provided) */}
              <Button
                className="bg-white text-gray-900 border border-gray-200"
                onClick={() => window.open(SHEET_CSV_URL, "_blank", "noopener,noreferrer")}
              >
                Download RSVPs (master CSV)
              </Button>

              {/* Local-only backup CSV */}
              <Button
                className="bg-white text-gray-900 border border-gray-200"
                onClick={exportCSV}
              >
                Download local RSVPs (this device)
              </Button>

              <Button className="bg-white text-gray-900 border border-gray-200" onClick={clearAll}>
                Clear saved RSVPs (this device)
              </Button>
            </div>
            <div className="mt-4 text-xs text-gray-500">
              <p><strong>Total saved here:</strong> {localData.length}</p>
              <p className="mt-1">
                RSVPs also post to your Google Sheet via the webhook above.
              </p>
            </div>
          </div>
        </section>

        <footer className="py-16 text-center text-xs text-gray-500">
          Made with ❤️
        </footer>
      </main>
    </div>
  );
}

