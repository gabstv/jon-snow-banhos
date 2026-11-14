/* Jon Snow — Banhos
   App estático. Os dados ficam só neste aparelho (localStorage + IndexedDB).
*/
(() => {
  "use strict";

  const TZ = "America/Sao_Paulo";
  const LOCALE = "pt-BR";
  const STORAGE_KEY = "jonsnow.v1";
  const DB_NAME = "jonsnow-banhos";
  const DB_VERSION = 1;
  const PHOTO_MAX = 1280;
  const PHOTO_QUALITY = 0.82;
  const RECEIPT_MAX = 2000;
  const RECEIPT_JPEG_QUALITY = 0.9;
  const SMALL_PNG_BYTES = 1.5 * 1024 * 1024;
  const RECENT_HOURS = 12;
  const NEAR_EXPIRY_DAYS = 7;
  const DEFAULT_QTY = 4;
  const DEFAULT_MONTHS = 2;

  const ORIGEM_LABEL = {
    qr: "QR code",
    nfc: "Tag NFC",
    link: "Atalho / link",
    manual: "App",
    seed: "Planilha inicial",
  };

  const ICO = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10.5V20h12V10.5"/></svg>',
    hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
    pkg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3z"/><path d="M12 12 20 7.5M12 12v9M12 12 4 7.5"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>',
    chev: '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3v11H4V8z"/><circle cx="12" cy="13" r="3.2"/></svg>',
    paw: '<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="7" cy="8" rx="2.1" ry="2.4"/><ellipse cx="17" cy="8" rx="2.1" ry="2.4"/><ellipse cx="10" cy="5.2" rx="2.1" ry="2.4"/><ellipse cx="14" cy="5.2" rx="2.1" ry="2.4"/><path d="M8.2 12.2c0-1.6 1.6-2.6 3.8-2.6s3.8 1 3.8 2.6c0 2.3-1.8 4.6-3.8 4.6s-3.8-2.3-3.8-4.6z"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v15l-2-1-2 1-2-1-2 1-2-1-1.5 1V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  };

  function uid(prefix) {
    const g = (crypto.randomUUID && crypto.randomUUID()) ||
      `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}_${g}`;
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }
  function zonedParts(date, tz = TZ) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    });
    const o = {};
    for (const p of fmt.formatToParts(date)) {
      if (p.type !== "literal") o[p.type] = p.value;
    }
    return o;
  }
  function dateFromZoned(y, m, d, h = 0, min = 0, s = 0, ms = 0, tz = TZ) {
    let utc = Date.UTC(y, m - 1, d, h, min, s, ms);
    for (let i = 0; i < 3; i++) {
      const p = zonedParts(new Date(utc), tz);
      const got = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      const want = Date.UTC(y, m - 1, d, h, min, s);
      utc += want - got;
    }
    return new Date(utc);
  }
  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function addMonthsEndOfDay(date, months, tz = TZ) {
    const p = zonedParts(date, tz);
    let y = +p.year;
    let m = +p.month + months;
    let d = +p.day;
    while (m > 12) { m -= 12; y += 1; }
    while (m < 1) { m += 12; y -= 1; }
    const dim = daysInMonth(y, m);
    if (d > dim) d = dim;
    return dateFromZoned(y, m, d, 23, 59, 59, 999, tz);
  }
  function fmtDate(date) {
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric",
    }).format(date);
  }
  function fmtTime(date) {
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone: TZ, hour: "2-digit", minute: "2-digit",
    }).format(date);
  }
  function fmtDateTime(date) {
    return `${fmtDate(date)} às ${fmtTime(date)}`;
  }
  function fmtWeekdayDate(date) {
    const w = new Intl.DateTimeFormat(LOCALE, {
      timeZone: TZ, weekday: "long", day: "2-digit", month: "long", year: "numeric",
    }).format(date);
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  function toDateTimeLocalValue(date) {
    const p = zonedParts(date);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  function parseDateTimeLocal(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return new Date();
    return dateFromZoned(+m[1], +m[2], +m[3], +m[4], +m[5], 0, 0);
  }
  function hoursBetween(a, b) {
    return Math.abs(+b - +a) / 36e5;
  }
  function daysUntil(date) {
    const now = new Date();
    const p = zonedParts(now);
    const startToday = dateFromZoned(+p.year, +p.month, +p.day, 0, 0, 0, 0);
    return Math.ceil((+date - +startToday) / 864e5);
  }
  function origemLabel(origem) {
    return ORIGEM_LABEL[origem] || "Outro";
  }
  function appBaseUrl() {
    const u = new URL(location.href);
    let path = u.pathname;
    if (path.endsWith("index.html")) path = path.slice(0, -10);
    if (!path.endsWith("/")) path += "/";
    return `${u.origin}${path}`;
  }
  function registerUrl(origem) {
    return `${appBaseUrl()}?registrar=1&origem=${encodeURIComponent(origem)}`;
  }

  let state = { packages: [], baths: [] };
  let dbPromise = null;
  const photoUrls = new Map();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw == null) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.packages) || !Array.isArray(data.baths)) {
        return { packages: [], baths: [] };
      }
      return data;
    } catch {
      return { packages: [], baths: [] };
    }
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      packages: state.packages,
      baths: state.baths,
    }));
  }
  function migrateState(st) {
    if (!st || !Array.isArray(st.packages)) return st;
    for (const pkg of st.packages) {
      if (pkg.receiptId === undefined) pkg.receiptId = null;
      if (pkg.paymentAmount === undefined) pkg.paymentAmount = null;
      if (pkg.paymentDate === undefined) pkg.paymentDate = null;
    }
    return st;
  }
  function parseYmd(ymd) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return dateFromZoned(+m[1], +m[2], +m[3], 12, 0, 0, 0);
  }
  function fmtMoney(n) {
    if (n == null || n === "") return "";
    return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "BRL" }).format(Number(n));
  }
  function fmtMoneyPlain(n) {
    if (n == null || n === "") return "";
    return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
  }
  function parseMoney(s) {
    const raw = String(s || "").trim();
    if (!raw) return null;
    const t = raw.replace(/R\$\s?/i, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }
  function moneyInputValue(n) {
    return n == null || n === "" ? "" : fmtMoneyPlain(n);
  }
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("photos")) {
          db.createObjectStore("photos", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  function idbOp(mode, fn) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction("photos", mode);
      const store = tx.objectStore("photos");
      const req = fn(store);
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      if (req) req.onerror = () => reject(req.error);
    }));
  }
  function putPhoto(id, blob) {
    return idbOp("readwrite", (s) => s.put({
      id, blob, mime: blob.type || "image/jpeg", savedAt: new Date().toISOString(),
    }));
  }
  function getPhoto(id) {
    return idbOp("readonly", (s) => s.get(id)).then((row) => (row ? row.blob : null));
  }
  function deletePhotoRecord(id) {
    if (photoUrls.has(id)) {
      URL.revokeObjectURL(photoUrls.get(id));
      photoUrls.delete(id);
    }
    return idbOp("readwrite", (s) => s.delete(id));
  }
  function allPhotoRows() {
    return idbOp("readonly", (s) => s.getAll()).then((rows) => rows || []);
  }
  async function getPhotoURL(id) {
    if (!id) return null;
    if (photoUrls.has(id)) return photoUrls.get(id);
    const blob = await getPhoto(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    photoUrls.set(id, url);
    return url;
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  function dataUrlToBlob(dataUrl) {
    const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("foto inválida no backup");
    const bin = atob(m[2]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  }

  function bathsOf(pkg, st = state) {
    return st.baths
      .filter((b) => b.packageId === pkg.id)
      .slice()
      .sort((a, b) => a.at.localeCompare(b.at) || a.createdAt.localeCompare(b.createdAt));
  }
  function usedCount(pkg, st = state) {
    return bathsOf(pkg, st).length;
  }
  function remaining(pkg, st = state) {
    return Math.max(0, (pkg.quantity || 0) - usedCount(pkg, st));
  }
  function recomputePackage(pkg, st = state) {
    const list = bathsOf(pkg, st);
    if (!list.length) {
      pkg.firstBathAt = null;
      pkg.expiresAt = null;
      pkg.completedAt = null;
      return;
    }
    pkg.firstBathAt = list[0].at;
    pkg.expiresAt = addMonthsEndOfDay(new Date(list[0].at), pkg.validityMonths || DEFAULT_MONTHS).toISOString();
    pkg.completedAt = list.length >= pkg.quantity ? list[pkg.quantity - 1].at : null;
  }
  function recomputeAll(st = state) {
    st.packages.forEach((p) => recomputePackage(p, st));
  }
  function isExpired(pkg, when = new Date()) {
    return !!(pkg.expiresAt && +when > +new Date(pkg.expiresAt) && !pkg.completedAt);
  }
  function isNearExpiry(pkg, when = new Date()) {
    if (!pkg.expiresAt || pkg.completedAt || isExpired(pkg, when)) return false;
    return daysUntil(new Date(pkg.expiresAt)) <= NEAR_EXPIRY_DAYS;
  }
  function packageStatus(pkg, st = state) {
    if (usedCount(pkg, st) >= pkg.quantity) return "completo";
    if (!pkg.firstBathAt) return "aguardando";
    if (isExpired(pkg)) return "vencido";
    if (isNearExpiry(pkg)) return "avencer";
    return "ativo";
  }
  const STATUS_LABEL = {
    completo: "Completo",
    aguardando: "Aguardando 1º banho",
    vencido: "Vencido",
    avencer: "Vence em breve",
    ativo: "Ativo",
  };
  function currentPackage(st = state) {
    const pkgs = st.packages.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return pkgs.find((p) => usedCount(p, st) < p.quantity) || null;
  }
  function packageById(id, st = state) {
    return st.packages.find((p) => p.id === id) || null;
  }
  function bathById(id, st = state) {
    return st.baths.find((b) => b.id === id) || null;
  }
  function nextPackageName(st = state) {
    return `Pacote ${st.packages.length + 1}`;
  }
  function recentBath(hours = RECENT_HOURS, st = state) {
    const now = new Date();
    return st.baths
      .filter((b) => hoursBetween(new Date(b.at), now) < hours)
      .sort((a, b) => b.at.localeCompare(a.at))[0] || null;
  }
  function seedIfNeeded() {
    if (localStorage.getItem(STORAGE_KEY) != null) return;
    const first = dateFromZoned(2026, 11, 14, 12, 0, 0, 0);
    const pkg = {
      id: uid("pkg"),
      name: "Pacote 1",
      quantity: DEFAULT_QTY,
      validityMonths: DEFAULT_MONTHS,
      createdAt: first.toISOString(),
      firstBathAt: first.toISOString(),
      expiresAt: null,
      completedAt: null,
      notes: "",
      receiptId: null,
      paymentAmount: null,
      paymentDate: null,
    };
    const bath = {
      id: uid("banho"),
      packageId: pkg.id,
      at: first.toISOString(),
      note: "Primeiro banho do pacote",
      photoId: null,
      origem: "seed",
      createdAt: first.toISOString(),
      updatedAt: first.toISOString(),
    };
    state = { packages: [pkg], baths: [bath] };
    recomputeAll();
    saveState();
  }

  async function compressImage(file, maxSize = PHOTO_MAX, quality = PHOTO_QUALITY) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
      if (typeof bitmap.close === "function") bitmap.close();
      return (await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))) || file;
    } catch {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = url;
        });
        const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        return (await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))) || file;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }
  async function attachPhotoToBath(bathId, file) {
    const bath = bathById(bathId);
    if (!bath || !file) return;
    const blob = await compressImage(file);
    const photoId = bath.photoId || uid("foto");
    await putPhoto(photoId, blob);
    if (photoUrls.has(photoId)) {
      URL.revokeObjectURL(photoUrls.get(photoId));
      photoUrls.delete(photoId);
    }
    bath.photoId = photoId;
    bath.updatedAt = new Date().toISOString();
    saveState();
  }

  async function compressReceipt(file) {
    const type = (file.type || "").toLowerCase();
    const name = file.name || "";
    const isPng = type === "image/png" || /\.png$/i.test(name);
    const loadSize = async () => {
      try {
        const bitmap = await createImageBitmap(file);
        const dim = { w: bitmap.width, h: bitmap.height, bitmap };
        return dim;
      } catch {
        const url = URL.createObjectURL(file);
        try {
          const img = await new Promise((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = url;
          });
          return { w: img.naturalWidth, h: img.naturalHeight, img, url };
        } catch (err) {
          URL.revokeObjectURL(url);
          throw err;
        }
      }
    };
    let src;
    try {
      src = await loadSize();
    } catch {
      throw new Error("Não foi possível ler a imagem. Use um arquivo PNG ou JPEG.");
    }
    const maxDim = Math.max(src.w, src.h) || 1;
    const keepPngAsIs = isPng && file.size <= SMALL_PNG_BYTES && maxDim <= RECEIPT_MAX;
    if (keepPngAsIs) {
      if (src.bitmap && typeof src.bitmap.close === "function") src.bitmap.close();
      if (src.url) URL.revokeObjectURL(src.url);
      return file;
    }
    const scale = Math.min(1, RECEIPT_MAX / maxDim);
    const w = Math.max(1, Math.round(src.w * scale));
    const h = Math.max(1, Math.round(src.h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (src.bitmap) {
      ctx.drawImage(src.bitmap, 0, 0, w, h);
      if (typeof src.bitmap.close === "function") src.bitmap.close();
    } else {
      ctx.drawImage(src.img, 0, 0, w, h);
      URL.revokeObjectURL(src.url);
    }
    const toBlob = (mime, quality) => new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
    if (isPng) {
      const pngBlob = await toBlob("image/png");
      if (pngBlob && pngBlob.size <= 2.5 * 1024 * 1024) return pngBlob;
    }
    return (await toBlob("image/jpeg", RECEIPT_JPEG_QUALITY)) || file;
  }
  async function attachReceiptToPackage(packageId, file) {
    const pkg = packageById(packageId);
    if (!pkg || !file) return;
    const blob = await compressReceipt(file);
    const receiptId = pkg.receiptId || uid("comp");
    await putPhoto(receiptId, blob);
    if (photoUrls.has(receiptId)) {
      URL.revokeObjectURL(photoUrls.get(receiptId));
      photoUrls.delete(receiptId);
    }
    pkg.receiptId = receiptId;
    saveState();
  }
  async function removeReceiptFromPackage(packageId) {
    const pkg = packageById(packageId);
    if (!pkg || !pkg.receiptId) return;
    const id = pkg.receiptId;
    pkg.receiptId = null;
    saveState();
    try { await deletePhotoRecord(id); } catch { /* ignore */ }
  }
  function updatePackagePayment(packageId, { paymentAmount, paymentDate }) {
    const pkg = packageById(packageId);
    if (!pkg) return;
    if (paymentAmount !== undefined) pkg.paymentAmount = paymentAmount;
    if (paymentDate !== undefined) pkg.paymentDate = paymentDate || null;
    saveState();
  }
  function receiptFileName(pkg, blob) {
    const ext = ((blob && blob.type) || "").includes("png") ? "png" : "jpg";
    const slug = String(pkg.name || "pacote").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pacote";
    return `comprovante-${slug}.${ext}`;
  }
  async function downloadReceipt(packageId) {
    const pkg = packageById(packageId);
    if (!pkg || !pkg.receiptId) return;
    const blob = await getPhoto(pkg.receiptId);
    if (!blob) { toast("Comprovante não encontrado"); return; }
    downloadBlob(blob, receiptFileName(pkg, blob));
    toast("Comprovante baixado");
  }
  async function shareReceipt(packageId) {
    const pkg = packageById(packageId);
    if (!pkg || !pkg.receiptId) return;
    const blob = await getPhoto(pkg.receiptId);
    if (!blob) { toast("Comprovante não encontrado"); return; }
    const name = receiptFileName(pkg, blob);
    const file = new File([blob], name, { type: blob.type || "image/jpeg" });
    const bits = [pkg.name];
    if (pkg.paymentAmount != null) bits.push(fmtMoney(pkg.paymentAmount));
    if (pkg.paymentDate) {
      const d = parseYmd(pkg.paymentDate);
      if (d) bits.push(fmtDate(d));
    }
    const text = bits.join(" · ");
    if (navigator.share) {
      try {
        const payload = { title: `Comprovante — ${pkg.name}`, text, files: [file] };
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share(payload);
          return;
        }
        await navigator.share({ title: payload.title, text });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    downloadBlob(blob, name);
    toast("Comprovante baixado");
  }

  function createPackage({ name, quantity, validityMonths } = {}) {
    const qty = Math.max(1, Math.min(24, Number(quantity) || DEFAULT_QTY));
    const months = Math.max(1, Math.min(24, Number(validityMonths) || DEFAULT_MONTHS));
    const pkg = {
      id: uid("pkg"),
      name: (name && name.trim()) || nextPackageName(),
      quantity: qty,
      validityMonths: months,
      createdAt: new Date().toISOString(),
      firstBathAt: null,
      expiresAt: null,
      completedAt: null,
      notes: "",
      receiptId: null,
      paymentAmount: null,
      paymentDate: null,
    };
    state.packages.push(pkg);
    saveState();
    return pkg;
  }
  function registerBath({ at, packageId, note, origem, createIfNeeded }) {
    let pkg = packageId ? packageById(packageId) : currentPackage();
    if (!pkg && createIfNeeded) pkg = createPackage({});
    if (!pkg) throw new Error("no-package");
    const when = at ? new Date(at) : new Date();
    const bath = {
      id: uid("banho"),
      packageId: pkg.id,
      at: when.toISOString(),
      note: note || "",
      photoId: null,
      origem: origem || "manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.baths.push(bath);
    recomputePackage(pkg);
    saveState();
    return bath;
  }
  function updateBath(id, patch) {
    const bath = bathById(id);
    if (!bath) return;
    const oldPkg = bath.packageId;
    if (patch.at) bath.at = new Date(patch.at).toISOString();
    if (patch.note !== undefined) bath.note = patch.note;
    if (patch.packageId && packageById(patch.packageId)) bath.packageId = patch.packageId;
    bath.updatedAt = new Date().toISOString();
    recomputePackage(packageById(oldPkg));
    if (bath.packageId !== oldPkg) recomputePackage(packageById(bath.packageId));
    saveState();
  }
  async function removeBath(id) {
    const bath = bathById(id);
    if (!bath) return;
    if (bath.photoId) {
      try { await deletePhotoRecord(bath.photoId); } catch { /* ignore */ }
    }
    state.baths = state.baths.filter((b) => b.id !== id);
    const pkg = packageById(bath.packageId);
    if (pkg) recomputePackage(pkg);
    saveState();
  }

  function csvCell(v) {
    const s = String(v ?? "");
    if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  function fileStamp() {
    const p = zonedParts(new Date());
    return `${p.year}-${p.month}-${p.day}`;
  }
  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCSV() {
    const paymentCols = (pkg) => [
      pkg && pkg.receiptId ? "Sim" : "Não",
      pkg && pkg.paymentAmount != null ? fmtMoneyPlain(pkg.paymentAmount) : "",
      pkg && pkg.paymentDate && parseYmd(pkg.paymentDate) ? fmtDate(parseYmd(pkg.paymentDate)) : "",
    ];
    const rows = [["Data", "Horário", "Pacote", "Banhos do pacote", "Validade do pacote", "Observações", "Tem foto", "Origem", "Comprovante", "Valor pago", "Data do pagamento"]];
    const baths = state.baths.slice().sort((a, b) => a.at.localeCompare(b.at));
    for (const b of baths) {
      const pkg = packageById(b.packageId);
      const d = new Date(b.at);
      rows.push([
        fmtDate(d), fmtTime(d),
        pkg ? pkg.name : "",
        pkg ? String(pkg.quantity) : "",
        pkg && pkg.expiresAt ? fmtDate(new Date(pkg.expiresAt)) : "",
        b.note || "",
        b.photoId ? "Sim" : "Não",
        origemLabel(b.origem),
        ...paymentCols(pkg),
      ]);
    }
    rows.push([]);
    rows.push(["PACOTES"]);
    rows.push(["Pacote", "Banhos do pacote", "Usados", "Validade do pacote", "Comprovante", "Valor pago", "Data do pagamento"]);
    const pkgs = state.packages.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const pkg of pkgs) {
      rows.push([
        pkg.name,
        String(pkg.quantity),
        String(usedCount(pkg)),
        pkg.expiresAt ? fmtDate(new Date(pkg.expiresAt)) : "",
        ...paymentCols(pkg),
      ]);
    }
    const body = rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFFsep=;\r\n", body, "\r\n"], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `jon-snow-banhos-${fileStamp()}.csv`);
  }
  async function exportJSON() {
    const photos = {};
    const rows = await allPhotoRows();
    for (const row of rows) {
      if (!row || !row.blob) continue;
      photos[row.id] = { mime: row.mime || row.blob.type || "image/jpeg", data: await blobToDataUrl(row.blob) };
    }
    const payload = {
      app: "jon-snow-banhos",
      version: 2,
      exportedAt: new Date().toISOString(),
      state: { packages: state.packages, baths: state.baths },
      photos,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, `jon-snow-banhos-backup-${fileStamp()}.json`);
  }
  async function importJSON(file) {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== "jon-snow-banhos" || !data.state) {
      throw new Error("Arquivo de backup inválido.");
    }
    const pkgs = Array.isArray(data.state.packages) ? data.state.packages : [];
    const baths = Array.isArray(data.state.baths) ? data.state.baths : [];
    const existing = await allPhotoRows();
    for (const row of existing) {
      try { await deletePhotoRecord(row.id); } catch { /* ignore */ }
    }
    const photos = data.photos || {};
    for (const [id, info] of Object.entries(photos)) {
      try {
        const blob = dataUrlToBlob(info.data || info);
        await putPhoto(id, blob);
      } catch { /* skip broken photo */ }
    }
    state = migrateState({ packages: pkgs, baths });
    recomputeAll();
    saveState();
  }

  /* ---------------- UI ---------------- */
  let toastTimer = 0;
  let pendingOrigem = null;
  let pendingPhotoBathId = null;
  let photoTargetId = null;
  let photoUseCapture = false;

  function toast(msg) {
    clearTimeout(toastTimer);
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    toastTimer = setTimeout(() => { el.remove(); }, 2800);
  }
  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg || "Link copiado");
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast(okMsg || "Link copiado");
        return true;
      } catch {
        prompt("Copie o link:", text);
        return false;
      }
    }
  }
  function route() {
    const raw = (location.hash || "#/").replace(/^#/, "");
    const parts = raw.split("/").filter(Boolean);
    if (!parts.length) return { name: "inicio" };
    if (parts[0] === "historico") return { name: "historico" };
    if (parts[0] === "pacotes") return { name: "pacotes" };
    if (parts[0] === "pacote" && parts[1] === "novo") return { name: "pacote-novo" };
    if (parts[0] === "pacote" && parts[1]) return { name: "pacote", id: parts[1] };
    if (parts[0] === "mais") return { name: "mais" };
    if (parts[0] === "qr") return { name: "qr" };
    if (parts[0] === "nfc") return { name: "nfc" };
    if (parts[0] === "atalho") return { name: "atalho" };
    if (parts[0] === "banho" && parts[1] === "novo") return { name: "banho-novo" };
    if (parts[0] === "banho" && parts[1] === "editar" && parts[2]) return { name: "banho-editar", id: parts[2] };
    if (parts[0] === "banho" && parts[1]) return { name: "banho", id: parts[1] };
    if (parts[0] === "como-usar") return { name: "como-usar" };
    return { name: "inicio" };
  }
  function go(hash) {
    if (!hash.startsWith("#")) hash = "#" + hash;
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  function navHTML(active) {
    const item = (href, key, ico, label) =>
      `<a href="${href}" class="${active === key ? "active" : ""}">${ico}<span>${label}</span></a>`;
    return `<nav class="nav" aria-label="Principal">
      ${item("#/", "inicio", ICO.home, "Início")}
      ${item("#/historico", "historico", ICO.hist, "Histórico")}
      ${item("#/pacotes", "pacotes", ICO.pkg, "Pacotes")}
      ${item("#/mais", "mais", ICO.more, "Mais")}
    </nav>`;
  }
  function topbar(title, backHash) {
    const back = backHash
      ? `<button class="icon-btn" data-action="go" data-hash="${esc(backHash)}" aria-label="Voltar">${ICO.back}</button>`
      : `<span style="width:40px"></span>`;
    return `<header class="topbar">${back}<h1>${esc(title)}</h1><span style="width:40px"></span></header>`;
  }
  function sourcePill(origem) {
    const cls = ORIGEM_LABEL[origem] ? origem : "";
    return `<span class="source-pill ${esc(cls)}">${esc(origemLabel(origem))}</span>`;
  }
  function alertHTML(kind, text) {
    return `<div class="alert ${kind}" role="status">${text}</div>`;
  }
  function segmentsHTML(used, total) {
    const n = Math.max(1, total);
    const cells = Array.from({ length: n }, (_, i) =>
      `<div class="seg ${i < used ? "on" : ""}"></div>`
    ).join("");
    return `<div class="segments" style="grid-template-columns:repeat(${n},1fr)">${cells}</div>`;
  }
  function copyRow(url, action) {
    return `<div class="copy-row">
      <div class="url-box">${esc(url)}</div>
      <button type="button" class="btn btn-primary" data-action="${esc(action)}">Copiar</button>
    </div>`;
  }
  function packageAlerts(pkg) {
    if (!pkg) return "";
    const st = packageStatus(pkg);
    if (st === "vencido") {
      const dias = Math.abs(daysUntil(new Date(pkg.expiresAt)));
      const rest = remaining(pkg);
      const restTxt = rest === 1 ? "resta 1 banho" : `restam ${rest} banhos`;
      return alertHTML("danger", `Este pacote venceu em ${fmtDate(new Date(pkg.expiresAt))} (há ${dias} dia${dias === 1 ? "" : "s"}). Ainda ${restTxt}.`);
    }
    if (st === "avencer") {
      const dias = Math.max(0, daysUntil(new Date(pkg.expiresAt)));
      const quando = dias <= 0 ? "vence hoje" : `vence em ${dias} dia${dias === 1 ? "" : "s"}`;
      return alertHTML("warn", `Validade próxima: este pacote ${quando} (${fmtDate(new Date(pkg.expiresAt))}).`);
    }
    if (st === "completo") {
      return alertHTML("ok", `Pacote concluído: os ${pkg.quantity} banhos já foram usados.`);
    }
    return "";
  }
  function receiptRowHTML(pkg) {
    const thumb = pkg.receiptId
      ? `<img class="receipt-thumb" alt="Comprovante de pagamento" data-photo="${esc(pkg.receiptId)}" data-action="view-receipt" data-id="${esc(pkg.id)}" />`
      : `<div class="receipt-thumb placeholder" aria-hidden="true">${ICO.receipt}</div>`;
    const title = pkg.receiptId ? "Comprovante anexado" : "Adicionar comprovante";
    const meta = [
      pkg.paymentAmount != null ? fmtMoney(pkg.paymentAmount) : "",
      pkg.paymentDate && parseYmd(pkg.paymentDate) ? fmtDate(parseYmd(pkg.paymentDate)) : "",
    ].filter(Boolean).join(" · ");
    const sub = meta || (pkg.receiptId ? "Toque para ver ou trocar" : "Valor, data e imagem do pagamento");
    return `<a class="receipt-row" href="#/pacote/${esc(pkg.id)}">
      ${thumb}
      <div class="item-body">
        <p class="item-title">${title}</p>
        <p class="item-sub">${esc(sub)}</p>
      </div>
      ${ICO.chev}
    </a>`;
  }
  function bathItemHTML(b) {
    const pkg = packageById(b.packageId);
    const note = b.note ? ` · ${esc(b.note)}` : "";
    const thumb = b.photoId
      ? `<img class="thumb" alt="" data-photo="${esc(b.photoId)}" />`
      : `<div class="thumb" aria-hidden="true">${ICO.paw}</div>`;
    return `<a class="item" href="#/banho/${esc(b.id)}">
      ${thumb}
      <div class="item-body">
        <p class="item-title">${esc(fmtDateTime(new Date(b.at)))}</p>
        <p class="item-sub">${esc(pkg ? pkg.name : "Pacote")}${note} · ${esc(origemLabel(b.origem))}</p>
      </div>
      ${ICO.chev}
    </a>`;
  }

  function renderInicio() {
    const pkg = currentPackage();
    const all = state.baths.slice().sort((a, b) => b.at.localeCompare(a.at));
    const recent = all.slice(0, 3);
    let pkgCard;
    if (!pkg) {
      const last = state.packages.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      pkgCard = `<section class="card">
        <h2>Pacote atual</h2>
        <p class="pkg-meta">${last ? "O último pacote já foi concluído." : "Nenhum pacote aberto ainda."}</p>
        <button class="btn btn-primary" data-action="go" data-hash="#/pacote/novo">Abrir novo pacote</button>
      </section>`;
    } else {
      const used = usedCount(pkg);
      const left = remaining(pkg);
      const validade = pkg.expiresAt
        ? `Válido até ${fmtDate(new Date(pkg.expiresAt))}`
        : "A validade começa no primeiro banho";
      pkgCard = `<section class="card">
        <div class="pkg-head">
          <h3 class="pkg-name">${esc(pkg.name)}</h3>
          <span class="badge ${packageStatus(pkg)}">${STATUS_LABEL[packageStatus(pkg)]}</span>
        </div>
        <p class="pkg-meta">${esc(validade)}</p>
        <div class="counts">
          <div class="count used"><b>${used}</b><span>usados</span></div>
          <div class="count ok"><b>${left}</b><span>restantes</span></div>
        </div>
        ${segmentsHTML(used, pkg.quantity)}
        ${packageAlerts(pkg)}
        ${receiptRowHTML(pkg)}
      </section>`;
    }
    const list = recent.length
      ? `<div class="list">${recent.map(bathItemHTML).join("")}</div>
         ${all.length > 3 ? `<button class="btn btn-ghost" data-action="go" data-hash="#/historico">Ver todo o histórico</button>` : ""}`
      : `<div class="empty"><p>Nenhum banho registrado ainda.</p></div>`;
    return `<div class="page">
      <header class="hero">
        <p class="hero-kicker">Pet shop</p>
        <h1>Jon Snow</h1>
        <p class="sub">Controle de banhos</p>
      </header>
      <div class="content stack">
        ${pkgCard}
        <button class="btn btn-primary" data-action="registrar-manual">Registrar banho</button>
        <section>
          <h2 class="section-title">Últimos banhos</h2>
          ${list}
        </section>
      </div>
      ${navHTML("inicio")}
    </div>`;
  }

  function renderHistorico() {
    const baths = state.baths.slice().sort((a, b) => b.at.localeCompare(a.at));
    const list = baths.length
      ? `<div class="list">${baths.map(bathItemHTML).join("")}</div>`
      : `<div class="empty"><p>Nenhum banho registrado ainda.</p></div>`;
    return `<div class="page">
      ${topbar("Histórico")}
      <div class="content flat stack">
        ${list}
        <button class="btn btn-ghost" data-action="go" data-hash="#/banho/novo">Adicionar banho manualmente</button>
      </div>
      ${navHTML("historico")}
    </div>`;
  }

  function renderPacotes() {
    const pkgs = state.packages.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const cards = pkgs.map((pkg) => {
      const used = usedCount(pkg);
      const validade = pkg.expiresAt
        ? `Validade: ${fmtDate(new Date(pkg.expiresAt))}`
        : "Validade começa no 1º banho";
      return `<section class="card">
        <div class="pkg-head">
          <h3 class="pkg-name">${esc(pkg.name)}</h3>
          <span class="badge ${packageStatus(pkg)}">${STATUS_LABEL[packageStatus(pkg)]}</span>
        </div>
        <p class="pkg-meta">${used} de ${pkg.quantity} banhos · ${esc(validade)}</p>
        ${segmentsHTML(used, pkg.quantity)}
        ${packageAlerts(pkg)}
        ${receiptRowHTML(pkg)}
      </section>`;
    }).join("") || `<div class="empty"><p>Nenhum pacote ainda.</p></div>`;
    return `<div class="page">
      ${topbar("Pacotes")}
      <div class="content flat stack">
        ${cards}
        <button class="btn btn-primary" data-action="go" data-hash="#/pacote/novo">Novo pacote</button>
      </div>
      ${navHTML("pacotes")}
    </div>`;
  }

  function renderPacoteNovo() {
    return `<div class="page">
      ${topbar("Novo pacote", "#/pacotes")}
      <div class="content flat">
        <form class="card" data-form="novo-pacote">
          <label class="field"><span>Nome</span>
            <input type="text" name="name" value="${esc(nextPackageName())}" maxlength="60" />
          </label>
          <label class="field"><span>Quantidade de banhos</span>
            <input type="number" name="quantity" min="1" max="24" value="${DEFAULT_QTY}" required />
          </label>
          <label class="field"><span>Validade (meses a partir do 1º banho)</span>
            <input type="number" name="validityMonths" min="1" max="24" value="${DEFAULT_MONTHS}" required />
          </label>
          <p class="help">O prazo só começa a contar no primeiro banho do pacote.</p>
          <button class="btn btn-primary" type="submit">Criar pacote</button>
        </form>
      </div>
      ${navHTML("pacotes")}
    </div>`;
  }

  function renderPacote(id) {
    const pkg = packageById(id);
    if (!pkg) {
      return `<div class="page">${topbar("Pacote", "#/pacotes")}<div class="content flat"><div class="empty"><p>Pacote não encontrado.</p></div></div>${navHTML("pacotes")}</div>`;
    }
    const used = usedCount(pkg);
    const validade = pkg.expiresAt
      ? `Válido até ${fmtDate(new Date(pkg.expiresAt))}`
      : "A validade começa no primeiro banho";
    const photo = pkg.receiptId
      ? `<button type="button" class="receipt-hero-btn" data-action="view-receipt" data-id="${esc(pkg.id)}">
           <img class="photo-hero receipt-hero" alt="Comprovante de pagamento" data-photo="${esc(pkg.receiptId)}" />
         </button>`
      : `<div class="photo-hero placeholder">${ICO.receipt}<span>Nenhum comprovante ainda</span></div>`;
    return `<div class="page">
      ${topbar(pkg.name, "#/pacotes")}
      <div class="content flat stack">
        <section class="card">
          <div class="pkg-head">
            <h3 class="pkg-name">${esc(pkg.name)}</h3>
            <span class="badge ${packageStatus(pkg)}">${STATUS_LABEL[packageStatus(pkg)]}</span>
          </div>
          <p class="pkg-meta">${used} de ${pkg.quantity} banhos · ${esc(validade)}</p>
          ${segmentsHTML(used, pkg.quantity)}
          ${packageAlerts(pkg)}
        </section>
        <section class="card">
          <h2>Pagamento</h2>
          <form data-form="pagamento" data-id="${esc(pkg.id)}">
            <label class="field"><span>Valor pago (opcional)</span>
              <input type="text" name="paymentAmount" inputmode="decimal" placeholder="0,00" value="${esc(moneyInputValue(pkg.paymentAmount))}" />
            </label>
            <label class="field"><span>Data do pagamento (opcional)</span>
              <input type="date" name="paymentDate" value="${esc(pkg.paymentDate || "")}" />
            </label>
            <button class="btn btn-ghost" type="submit">Salvar valor e data</button>
          </form>
        </section>
        <section class="card">
          <h2>Comprovante</h2>
          <p class="help">PNG ou JPEG. A imagem fica só neste aparelho, com qualidade alta o bastante para ler os dados.</p>
          ${photo}
          <div class="stack" style="margin-top:0.85rem">
            <div class="btn-row">
              <button class="btn btn-primary" data-action="add-receipt" data-id="${esc(pkg.id)}">${pkg.receiptId ? "Trocar comprovante" : "Adicionar comprovante"}</button>
              ${pkg.receiptId ? `<button class="btn btn-ghost" data-action="receipt-camera" data-id="${esc(pkg.id)}">Tirar foto</button>` : `<button class="btn btn-ghost" data-action="receipt-camera" data-id="${esc(pkg.id)}">Tirar foto</button>`}
            </div>
            ${pkg.receiptId ? `<div class="btn-row">
              <button class="btn btn-ghost" data-action="view-receipt" data-id="${esc(pkg.id)}">Ver em tamanho real</button>
              <button class="btn btn-ghost" data-action="download-receipt" data-id="${esc(pkg.id)}">Baixar</button>
            </div>
            <div class="btn-row">
              <button class="btn btn-ghost" data-action="share-receipt" data-id="${esc(pkg.id)}">Compartilhar</button>
              <button class="btn btn-danger" data-action="delete-receipt" data-id="${esc(pkg.id)}">Remover comprovante</button>
            </div>` : ""}
          </div>
        </section>
      </div>
      ${navHTML("pacotes")}
    </div>`;
  }

  function renderBanho(id) {
    const b = bathById(id);
    if (!b) {
      return `<div class="page">${topbar("Banho", "#/historico")}<div class="content flat"><div class="empty"><p>Banho não encontrado.</p></div></div>${navHTML("historico")}</div>`;
    }
    const pkg = packageById(b.packageId);
    const photo = b.photoId
      ? `<img class="photo-hero" alt="Foto do Jon Snow depois do banho" data-photo="${esc(b.photoId)}" />`
      : `<div class="photo-hero placeholder">${ICO.cam}<span>Sem foto ainda</span></div>`;
    return `<div class="page">
      ${topbar("Banho", "#/historico")}
      <div class="content flat stack">
        ${photo}
        <section class="card">
          <dl class="kv">
            <dt>Data</dt><dd>${esc(fmtWeekdayDate(new Date(b.at)))}</dd>
            <dt>Horário</dt><dd>${esc(fmtTime(new Date(b.at)))}</dd>
            <dt>Pacote</dt><dd>${esc(pkg ? pkg.name : "—")}</dd>
            <dt>Origem</dt><dd>${sourcePill(b.origem)}</dd>
            <dt>Observações</dt><dd>${b.note ? esc(b.note) : "—"}</dd>
          </dl>
        </section>
        <div class="btn-row">
          <button class="btn btn-ghost" data-action="add-photo" data-id="${esc(b.id)}">${b.photoId ? "Trocar foto" : "Adicionar foto"}</button>
          <button class="btn btn-ghost" data-action="go" data-hash="#/banho/editar/${esc(b.id)}">Editar</button>
        </div>
        <button class="btn btn-danger" data-action="delete-banho" data-id="${esc(b.id)}">Excluir banho</button>
      </div>
      ${navHTML("historico")}
    </div>`;
  }

  function renderBanhoForm(editId) {
    const b = editId ? bathById(editId) : null;
    const initial = b ? new Date(b.at) : new Date();
    const currentId = b ? b.packageId : ((currentPackage() && currentPackage().id) || "");
    const options = state.packages
      .slice()
      .sort((a, c) => c.createdAt.localeCompare(a.createdAt))
      .map((p) => `<option value="${esc(p.id)}" ${p.id === currentId ? "selected" : ""}>${esc(p.name)} (${usedCount(p)}/${p.quantity})</option>`)
      .join("");
    return `<div class="page">
      ${topbar(b ? "Editar banho" : "Novo banho", b ? `#/banho/${b.id}` : "#/historico")}
      <div class="content flat">
        <form class="card" data-form="${b ? "editar-banho" : "novo-banho"}" ${b ? `data-id="${esc(b.id)}"` : ""}>
          <label class="field"><span>Data e horário</span>
            <input type="datetime-local" name="at" value="${esc(toDateTimeLocalValue(initial))}" required />
          </label>
          <label class="field"><span>Pacote</span>
            <select name="packageId" required>${options || `<option value="">Crie um pacote primeiro</option>`}</select>
          </label>
          <label class="field"><span>Observações</span>
            <textarea name="note" maxlength="400" placeholder="Ex.: tosa higiênica, unhas…">${b ? esc(b.note) : ""}</textarea>
          </label>
          <button class="btn btn-primary" type="submit" ${options ? "" : "disabled"}>${b ? "Salvar alterações" : "Adicionar banho"}</button>
        </form>
      </div>
      ${navHTML("historico")}
    </div>`;
  }

  function renderMais() {
    return `<div class="page">
      ${topbar("Mais")}
      <div class="content flat stack">
        <div class="menu">
          <a href="#/qr"><span class="ico">${ICO.cam}</span><span>Código QR</span>${ICO.chev}</a>
          <a href="#/nfc"><span class="ico">${ICO.pkg}</span><span>Tag NFC</span>${ICO.chev}</a>
          <a href="#/atalho"><span class="ico">${ICO.hist}</span><span>Atalho / link</span>${ICO.chev}</a>
        </div>
        <div class="menu">
          <button type="button" data-action="export-csv"><span class="ico">${ICO.hist}</span><span>Exportar planilha (CSV)</span></button>
          <button type="button" data-action="export-json"><span class="ico">${ICO.pkg}</span><span>Backup completo (JSON)</span></button>
          <button type="button" data-action="import-json"><span class="ico">${ICO.pkg}</span><span>Restaurar backup</span></button>
        </div>
        <div class="menu">
          <a href="#/como-usar"><span class="ico">${ICO.home}</span><span>Como usar</span>${ICO.chev}</a>
        </div>
        <p class="help">Os dados e as fotos ficam só neste aparelho e neste navegador. Faça um backup de vez em quando.</p>
      </div>
      ${navHTML("mais")}
    </div>`;
  }

  function renderQR() {
    const url = registerUrl("qr");
    return `<div class="page qr-page">
      ${topbar("Código QR", "#/mais")}
      <div class="content flat stack">
        <section class="card method-card">
          <h3>Imprima e deixe à mão</h3>
          <p class="lead muted">Ao escanear, o app abre na tela de confirmação e só registra o banho depois do seu ok.</p>
          <div class="qr-wrap printable" id="qr-target" data-url="${esc(url)}"></div>
          <p class="qr-url">${esc(url)}</p>
        </section>
        <div class="btn-row no-print">
          <button class="btn btn-primary" data-action="print-qr">Imprimir</button>
          <button class="btn btn-ghost" data-action="copy-qr">Copiar link</button>
        </div>
      </div>
      ${navHTML("mais")}
    </div>`;
  }

  function renderNFC() {
    const url = registerUrl("nfc");
    const canWrite = "NDEFReader" in window;
    const writeBlock = canWrite
      ? `<button class="btn btn-primary" data-action="write-nfc">Gravar na tag NFC</button>
         <p class="help">Aproxime a tag depois de tocar no botão. Funciona no Chrome para Android, com NFC ligado.</p>`
      : `<p class="help">Este aparelho não grava tags pelo navegador (no iPhone isso é normal). Use o app NFC Tools, que é grátis.</p>`;
    return `<div class="page">
      ${topbar("Tag NFC", "#/mais")}
      <div class="content flat stack">
        <section class="card method-card">
          <h3>URL da tag</h3>
          <p class="lead muted">Grave este endereço como um registro NDEF do tipo URL/URI. Ao aproximar o iPhone da tag, o sistema abre o link e aparece a mesma tela de confirmação.</p>
          ${copyRow(url, "copy-nfc")}
        </section>
        <section class="card method-card prose">
          <h3>Como gravar no iPhone</h3>
          <ol>
            <li>Instale o app grátis <strong>NFC Tools</strong>.</li>
            <li>Abra <em>Escrever</em> → <em>Adicionar um registro</em> → <em>URL / URI</em>.</li>
            <li>Cole o link acima e grave em uma tag NFC virgem (NTAG 215 costuma funcionar bem).</li>
            <li>Para registrar um banho, é só aproximar o iPhone da tag — não precisa abrir o app antes.</li>
          </ol>
          ${writeBlock}
        </section>
      </div>
      ${navHTML("mais")}
    </div>`;
  }

  function renderAtalho() {
    const url = registerUrl("link");
    return `<div class="page">
      ${topbar("Atalho / link", "#/mais")}
      <div class="content flat stack">
        <section class="card method-card">
          <h3>Link direto</h3>
          <p class="lead muted">Abre o app já na tela de confirmação do banho. Útil num atalho da Tela de Início, num favorito ou num widget.</p>
          ${copyRow(url, "copy-link")}
        </section>
        <section class="card method-card prose">
          <h3>Atalho no iPhone</h3>
          <ol>
            <li>Abra o app <strong>Atalhos</strong> e crie um atalho novo.</li>
            <li>Adicione a ação <em>Abrir URLs</em> e cole o link acima.</li>
            <li>Em seguida, use <em>Adicionar à Tela de Início</em> e dê um nome, por exemplo “Banho do Jon Snow”.</li>
          </ol>
          <p>Outra opção é adicionar este app à Tela de Início (no Safari: botão de compartilhar → <em>Adicionar à Tela de Início</em>) e registrar pelo botão do próprio app.</p>
        </section>
      </div>
      ${navHTML("mais")}
    </div>`;
  }

  function renderComoUsar() {
    return `<div class="page">
      ${topbar("Como usar", "#/mais")}
      <div class="content flat">
        <section class="card prose">
          <p>Este app documenta os banhos do Jon Snow para você conferir com o pet shop. Cada pacote tem, por padrão, 4 banhos e vale 2 meses a partir do primeiro.</p>
          <h3>Como registrar</h3>
          <ol>
            <li><strong>QR code</strong> — imprima o código e deixe na coleira, na geladeira ou no pet shop.</li>
            <li><strong>Tag NFC</strong> — grave o link numa tag e aproxime o iPhone para abrir a confirmação.</li>
            <li><strong>Atalho / link</strong> — um atalho na Tela de Início, ou o botão Registrar aqui no app.</li>
          </ol>
          <p>Nos três jeitos aparece a mesma tela de confirmação, para não registrar duas vezes sem querer.</p>
          <h3>Comprovante de pagamento</h3>
          <p>Em cada pacote você pode guardar o valor, a data e uma imagem (PNG ou JPEG) do comprovante. Toque no pacote para anexar, ver em tamanho real, baixar ou compartilhar.</p>
          <h3>Fotos e dados</h3>
          <p>Depois de confirmar, você pode anexar uma foto do Jon Snow. Tudo fica só neste aparelho e neste navegador — nada vai para a nuvem.</p>
          <p>No iPhone, o Safari e o ícone da Tela de Início podem ter dados separados. Abra sempre do mesmo lugar e exporte um backup JSON de vez em quando.</p>
        </section>
      </div>
      ${navHTML("mais")}
    </div>`;
  }

  function registerIntent() {
    const usp = new URLSearchParams(location.search);
    if (usp.get("registrar") !== "1") return null;
    let origem = (usp.get("origem") || "link").toLowerCase();
    if (!["qr", "nfc", "link"].includes(origem)) origem = "link";
    return origem;
  }
  function clearRegisterIntent() {
    const url = new URL(location.href);
    url.search = "";
    history.replaceState({}, "", url.pathname + url.hash);
  }

  function confirmSheetHTML(origem) {
    const now = new Date();
    const pkg = currentPackage();
    const recent = recentBath();
    const via = origemLabel(origem);
    let warnings = "";
    let extra = "";
    let cta = "Confirmar banho";
    if (recent) {
      warnings += alertHTML("warn", `Já existe um banho registrado nas últimas 12 horas (${fmtDateTime(new Date(recent.at))}). Tem certeza de que quer registrar outro?`);
    }
    if (!pkg) {
      warnings += alertHTML("info", "Não há um pacote ativo. Ao confirmar, um pacote novo de 4 banhos será aberto e este será o primeiro banho.");
    } else if (isExpired(pkg)) {
      warnings += alertHTML("danger", `O pacote atual venceu em ${fmtDate(new Date(pkg.expiresAt))}. Você pode registrar mesmo assim, ou abrir um pacote novo depois.`);
    } else if (remaining(pkg) <= 0) {
      warnings += alertHTML("info", "Este pacote já usou todos os banhos. Ao confirmar, um pacote novo será aberto para este registro.");
      extra = "create-new";
    } else {
      extra = `Pacote ${esc(pkg.name)} · ${remaining(pkg)} restante${remaining(pkg) === 1 ? "" : "s"}`;
    }
    return `<div class="overlay" data-overlay="confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div class="sheet">
        <div class="sheet-handle"></div>
        <h2 id="confirm-title">Registrar banho?</h2>
        <p class="lead">Via ${esc(via)}. Confira a data e o horário antes de confirmar.</p>
        <div class="when-block">
          <div class="day">${esc(fmtWeekdayDate(now))}</div>
          <div class="hour">${esc(fmtTime(now))}</div>
          ${extra && extra !== "create-new" ? `<div class="muted">${extra}</div>` : ""}
        </div>
        ${warnings}
        <div class="stack">
          <button class="btn btn-primary" data-action="confirm-register" data-origem="${esc(origem)}" data-new="${extra === "create-new" || !pkg ? "1" : "0"}">${cta}</button>
          <button class="btn btn-ghost" data-action="cancel-register">Agora não</button>
        </div>
      </div>
    </div>`;
  }

  function photoSheetHTML(bathId) {
    return `<div class="overlay" data-overlay="foto" role="dialog" aria-modal="true" aria-labelledby="foto-title">
      <div class="sheet">
        <div class="sheet-handle"></div>
        <h2 id="foto-title">Banho registrado</h2>
        <p class="lead">Quer anexar uma foto do Jon Snow agora? Você também pode fazer isso depois, no histórico.</p>
        <div class="stack">
          <button class="btn btn-primary" data-action="photo-camera" data-id="${esc(bathId)}">Tirar foto</button>
          <button class="btn btn-ghost" data-action="photo-gallery" data-id="${esc(bathId)}">Escolher da galeria</button>
          <button class="btn btn-ghost" data-action="photo-later">Depois</button>
        </div>
      </div>
    </div>`;
  }

  function deleteSheetHTML(id) {
    const b = bathById(id);
    if (!b) return "";
    return `<div class="overlay center" data-overlay="delete" role="dialog" aria-modal="true">
      <div class="sheet">
        <h2>Excluir banho?</h2>
        <p class="lead">O banho de ${esc(fmtDateTime(new Date(b.at)))} será apagado, inclusive a foto. Essa ação não pode ser desfeita.</p>
        <div class="stack">
          <button class="btn btn-danger" data-action="confirm-delete" data-id="${esc(id)}">Excluir</button>
          <button class="btn btn-ghost" data-action="close-overlay">Cancelar</button>
        </div>
      </div>
    </div>`;
  }

  function importSheetHTML() {
    return `<div class="overlay center" data-overlay="import" role="dialog" aria-modal="true">
      <div class="sheet">
        <h2>Restaurar backup?</h2>
        <p class="lead">Isso substitui todos os banhos, pacotes e fotos salvos neste aparelho pelo conteúdo do arquivo JSON.</p>
        <div class="stack">
          <button class="btn btn-primary" data-action="pick-import">Escolher arquivo</button>
          <button class="btn btn-ghost" data-action="close-overlay">Cancelar</button>
        </div>
      </div>
    </div>`;
  }

  function receiptViewerHTML(packageId) {
    const pkg = packageById(packageId);
    if (!pkg || !pkg.receiptId) return "";
    const bits = [];
    if (pkg.paymentAmount != null) bits.push(fmtMoney(pkg.paymentAmount));
    if (pkg.paymentDate && parseYmd(pkg.paymentDate)) bits.push(fmtDate(parseYmd(pkg.paymentDate)));
    const meta = bits.length ? `<p class="lead">${esc(bits.join(" · "))}</p>` : "";
    return `<div class="overlay center" data-overlay="receipt" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
      <div class="sheet lightbox-sheet">
        <h2 id="receipt-title">Comprovante</h2>
        ${meta}
        <img class="receipt-full" alt="Comprovante de pagamento de ${esc(pkg.name)}" data-photo="${esc(pkg.receiptId)}" />
        <div class="btn-row" style="margin-top:0.9rem">
          <button class="btn btn-primary" data-action="download-receipt" data-id="${esc(pkg.id)}">Baixar</button>
          <button class="btn btn-ghost" data-action="share-receipt" data-id="${esc(pkg.id)}">Compartilhar</button>
        </div>
        <button class="btn btn-ghost" data-action="close-overlay" style="margin-top:0.55rem">Fechar</button>
      </div>
    </div>`;
  }
  function deleteReceiptSheetHTML(packageId) {
    const pkg = packageById(packageId);
    if (!pkg) return "";
    return `<div class="overlay center" data-overlay="delete-receipt" role="dialog" aria-modal="true">
      <div class="sheet">
        <h2>Remover comprovante?</h2>
        <p class="lead">A imagem do comprovante de ${esc(pkg.name)} será apagada. O valor e a data de pagamento, se houver, são mantidos.</p>
        <div class="stack">
          <button class="btn btn-danger" data-action="confirm-delete-receipt" data-id="${esc(pkg.id)}">Remover</button>
          <button class="btn btn-ghost" data-action="close-overlay">Cancelar</button>
        </div>
      </div>
    </div>`;
  }

  function photoInputsHTML() {
    return `<input class="hidden-file" id="photo-input" type="file" accept="image/*" />
            <input class="hidden-file" id="receipt-input" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg,image/*" />
            <input class="hidden-file" id="import-input" type="file" accept="application/json,.json" />`;
  }

  function paintQR(root) {
    const el = root.querySelector("#qr-target");
    if (!el || typeof qrcode !== "function") return;
    const url = el.dataset.url || registerUrl("qr");
    try {
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      el.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
      const svg = el.querySelector("svg");
      if (svg) {
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "QR code para registrar um banho do Jon Snow");
      }
    } catch (err) {
      el.innerHTML = `<p class="muted">Não foi possível gerar o QR. Use o link abaixo.</p>`;
    }
  }

  async function hydratePhotos(root) {
    const imgs = root.querySelectorAll("img[data-photo]");
    for (const img of imgs) {
      const url = await getPhotoURL(img.dataset.photo);
      if (url) img.src = url;
    }
  }

  let overlayHTML = "";
  function setOverlay(html) {
    overlayHTML = html || "";
    const hold = document.getElementById("overlay-root");
    if (hold) hold.innerHTML = overlayHTML;
    document.body.style.overflow = overlayHTML ? "hidden" : "";
  }

  function render() {
    const r = route();
    let body = "";
    if (r.name === "historico") body = renderHistorico();
    else if (r.name === "pacotes") body = renderPacotes();
    else if (r.name === "pacote-novo") body = renderPacoteNovo();
    else if (r.name === "pacote") body = renderPacote(r.id);
    else if (r.name === "mais") body = renderMais();
    else if (r.name === "qr") body = renderQR();
    else if (r.name === "nfc") body = renderNFC();
    else if (r.name === "atalho") body = renderAtalho();
    else if (r.name === "como-usar") body = renderComoUsar();
    else if (r.name === "banho") body = renderBanho(r.id);
    else if (r.name === "banho-novo") body = renderBanhoForm(null);
    else if (r.name === "banho-editar") body = renderBanhoForm(r.id);
    else body = renderInicio();

    const app = document.getElementById("app");
    app.innerHTML = `${body}<div id="overlay-root">${overlayHTML}</div>${photoInputsHTML()}`;
    paintQR(app);
    hydratePhotos(app);
  }

  function openConfirm(origem) {
    pendingOrigem = origem;
    setOverlay(confirmSheetHTML(origem));
  }

  async function doRegister(origem, forceNew) {
    const btn = document.querySelector("[data-action='confirm-register']");
    if (btn) btn.disabled = true;
    try {
      let packageId = null;
      const pkg = currentPackage();
      if (forceNew || !pkg) {
        const created = createPackage({});
        packageId = created.id;
      } else {
        packageId = pkg.id;
      }
      const bath = registerBath({ origem, packageId, createIfNeeded: true });
      clearRegisterIntent();
      pendingOrigem = null;
      pendingPhotoBathId = bath.id;
      setOverlay(photoSheetHTML(bath.id));
      render();
      setOverlay(photoSheetHTML(bath.id));
      toast("Banho registrado");
    } catch (err) {
      toast("Não foi possível registrar o banho");
      if (btn) btn.disabled = false;
    }
  }

  function pickPhoto(bathId, useCapture) {
    photoTargetId = bathId;
    photoUseCapture = !!useCapture;
    const input = document.getElementById("photo-input");
    if (!input) return;
    if (useCapture) input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.value = "";
    input.click();
  }

  async function writeNfcTag() {
    if (!("NDEFReader" in window)) {
      toast("Este navegador não grava NFC. Use o NFC Tools.");
      return;
    }
    try {
      const ndef = new NDEFReader();
      toast("Aproxime a tag do celular…");
      await ndef.write({ records: [{ recordType: "url", data: registerUrl("nfc") }] });
      toast("Tag gravada com sucesso");
    } catch (err) {
      if (err && err.name === "AbortError") toast("Gravação cancelada");
      else if (err && err.name === "NotAllowedError") toast("Permissão de NFC negada");
      else toast("Não foi possível gravar a tag");
    }
  }

  function onClick(e) {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;
    if (action === "go") {
      go(t.dataset.hash || "#/");
      return;
    }
    if (action === "registrar-manual") {
      openConfirm("manual");
      return;
    }
    if (action === "cancel-register") {
      pendingOrigem = null;
      clearRegisterIntent();
      setOverlay("");
      render();
      return;
    }
    if (action === "confirm-register") {
      doRegister(t.dataset.origem || "manual", t.dataset.new === "1");
      return;
    }
    if (action === "photo-later" || action === "close-overlay") {
      pendingPhotoBathId = null;
      setOverlay("");
      render();
      return;
    }
    if (action === "photo-camera") {
      pickPhoto(t.dataset.id, true);
      return;
    }
    if (action === "photo-gallery" || action === "add-photo") {
      pickPhoto(t.dataset.id, false);
      return;
    }
    if (action === "delete-banho") {
      setOverlay(deleteSheetHTML(t.dataset.id));
      const hold = document.getElementById("overlay-root");
      if (hold) hold.innerHTML = overlayHTML;
      return;
    }
    if (action === "confirm-delete") {
      removeBath(t.dataset.id).then(() => {
        setOverlay("");
        go("#/historico");
        toast("Banho excluído");
      });
      return;
    }
    if (action === "export-csv") { exportCSV(); toast("Planilha baixada"); return; }
    if (action === "export-json") {
      exportJSON().then(() => toast("Backup baixado")).catch(() => toast("Não foi possível exportar"));
      return;
    }
    if (action === "import-json") {
      setOverlay(importSheetHTML());
      const hold = document.getElementById("overlay-root");
      if (hold) hold.innerHTML = overlayHTML;
      return;
    }
    if (action === "pick-import") {
      const input = document.getElementById("import-input");
      if (input) { input.value = ""; input.click(); }
      return;
    }
    if (action === "copy-qr") { copyText(registerUrl("qr")); return; }
    if (action === "copy-nfc") { copyText(registerUrl("nfc")); return; }
    if (action === "copy-link") { copyText(registerUrl("link")); return; }
    if (action === "print-qr") { window.print(); return; }
    if (action === "write-nfc") { writeNfcTag(); return; }
    if (action === "view-receipt") {
      e.preventDefault();
      e.stopPropagation();
      setOverlay(receiptViewerHTML(t.dataset.id));
      const hold = document.getElementById("overlay-root");
      if (hold) {
        hold.innerHTML = overlayHTML;
        hydratePhotos(hold);
      }
      return;
    }
    if (action === "add-receipt") { pickReceipt(t.dataset.id, false); return; }
    if (action === "receipt-camera") { pickReceipt(t.dataset.id, true); return; }
    if (action === "download-receipt") { downloadReceipt(t.dataset.id); return; }
    if (action === "share-receipt") { shareReceipt(t.dataset.id); return; }
    if (action === "delete-receipt") {
      setOverlay(deleteReceiptSheetHTML(t.dataset.id));
      const hold = document.getElementById("overlay-root");
      if (hold) hold.innerHTML = overlayHTML;
      return;
    }
    if (action === "confirm-delete-receipt") {
      removeReceiptFromPackage(t.dataset.id).then(() => {
        setOverlay("");
        render();
        toast("Comprovante removido");
      });
      return;
    }
  }

  function onSubmit(e) {
    const form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    const fd = new FormData(form);
    const kind = form.dataset.form;
    if (kind === "novo-pacote") {
      createPackage({
        name: fd.get("name"),
        quantity: fd.get("quantity"),
        validityMonths: fd.get("validityMonths"),
      });
      toast("Pacote criado");
      go("#/pacotes");
      return;
    }
    if (kind === "novo-banho") {
      const packageId = String(fd.get("packageId") || "");
      if (!packageById(packageId)) { toast("Escolha um pacote"); return; }
      const bath = registerBath({
        at: parseDateTimeLocal(fd.get("at")),
        packageId,
        note: String(fd.get("note") || ""),
        origem: "manual",
      });
      toast("Banho adicionado");
      go(`#/banho/${bath.id}`);
      return;
    }
    if (kind === "editar-banho") {
      updateBath(form.dataset.id, {
        at: parseDateTimeLocal(fd.get("at")),
        packageId: String(fd.get("packageId") || ""),
        note: String(fd.get("note") || ""),
      });
      toast("Alterações salvas");
      go(`#/banho/${form.dataset.id}`);
      return;
    }
    if (kind === "pagamento") {
      const raw = String(fd.get("paymentAmount") || "").trim();
      let amount = null;
      if (raw) {
        amount = parseMoney(raw);
        if (amount == null) { toast("Valor inválido"); return; }
      }
      const date = String(fd.get("paymentDate") || "").trim();
      updatePackagePayment(form.dataset.id, {
        paymentAmount: amount,
        paymentDate: date || null,
      });
      toast("Pagamento salvo");
      render();
    }
  }

  let receiptTargetId = null;
  let receiptUseCapture = false;
  function pickReceipt(packageId, useCapture) {
    receiptTargetId = packageId;
    receiptUseCapture = !!useCapture;
    const input = document.getElementById("receipt-input");
    if (!input) return;
    if (useCapture) input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.value = "";
    input.click();
  }
  async function onReceiptChange(e) {
    const file = e.target.files && e.target.files[0];
    const id = receiptTargetId;
    if (!file || !id) return;
    try {
      await attachReceiptToPackage(id, file);
      toast("Comprovante anexado");
      if (route().name !== "pacote" || route().id !== id) go(`#/pacote/${id}`);
      else render();
    } catch (err) {
      toast((err && err.message) || "Não foi possível salvar o comprovante");
    } finally {
      e.target.value = "";
      receiptTargetId = null;
    }
  }

  async function onPhotoChange(e) {
    const file = e.target.files && e.target.files[0];
    const id = photoTargetId;
    if (!file || !id) return;
    try {
      await attachPhotoToBath(id, file);
      pendingPhotoBathId = null;
      setOverlay("");
      toast("Foto anexada");
      if (route().name !== "banho" || route().id !== id) go(`#/banho/${id}`);
      else render();
    } catch {
      toast("Não foi possível salvar a foto");
    } finally {
      e.target.value = "";
      photoTargetId = null;
    }
  }

  async function onImportChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      await importJSON(file);
      setOverlay("");
      toast("Backup restaurado");
      go("#/");
    } catch (err) {
      toast(err && err.message ? err.message : "Não foi possível restaurar o backup");
    } finally {
      e.target.value = "";
    }
  }

  function boot() {
    const loaded = loadState();
    if (loaded) {
      state = migrateState(loaded);
      recomputeAll();
      saveState();
    } else {
      seedIfNeeded();
    }
    const app = document.getElementById("app");
    app.addEventListener("click", onClick);
    app.addEventListener("submit", onSubmit);
    app.addEventListener("change", (e) => {
      if (e.target && e.target.id === "photo-input") onPhotoChange(e);
      if (e.target && e.target.id === "receipt-input") onReceiptChange(e);
      if (e.target && e.target.id === "import-input") onImportChange(e);
    });
    window.addEventListener("hashchange", () => render());

    const intent = registerIntent();
    render();
    if (intent) openConfirm(intent);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => { /* offline is best-effort */ });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
