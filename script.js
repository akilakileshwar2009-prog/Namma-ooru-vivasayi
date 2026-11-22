import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, collection, addDoc, getDocs,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDfSZ-O8sc5sJvBpvQSA2EOyDf5ZFS6fOA",
  authDomain: "namma-ooru-vivasayai.firebaseapp.com",
  projectId: "namma-ooru-vivasayai",
  storageBucket: "namma-ooru-vivasayai.firebasestorage.app",
  messagingSenderId: "805018117820",
  appId: "1:805018117820:web:d6fe853ff6230d4f9492b9",
  measurementId: "G-GTB1R27YEE"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "default");
setPersistence(auth, browserLocalPersistence).catch(console.error);

const $ = (id) => document.getElementById(id);
const loginDialog = $("loginDialog"), sellDialog = $("sellDialog");
const loginForm = $("loginForm"), sellForm = $("sellForm");
const logoutBtn = $("logoutBtn");

let allOffers = [];
let currentCategory = "All";
let currentSearch = "";

function setMsg(el, text) { if (el) el.textContent = text; }

function friendlyError(error) {
  const map = {
    "auth/invalid-email": "That email address is not valid.",
    "auth/missing-password": "Please enter a password.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/email-already-in-use": "This email is already registered. Try Login.",
    "auth/invalid-credential": "Wrong email or password.",
    "auth/user-not-found": "No account with this email. Try Create account.",
    "auth/wrong-password": "Wrong password.",
    "auth/too-many-requests": "Too many tries. Please wait and try again.",
    "auth/network-request-failed": "No internet connection.",
    "auth/operation-not-allowed": "Email/Password sign-in is not enabled in Firebase Console.",
    "permission-denied": "Permission denied. Check Firestore rules and login."
  };
  return map[error.code] || error.message;
}

/* ---------- Dialogs ---------- */
function openDialog(d) { if (d && !d.open) d.showModal(); }
function closeDialog(d) { if (d && d.open) d.close(); }

$("loginBtn").addEventListener("click", () => { setMsg($("loginMessage"), ""); openDialog(loginDialog); });
$("closeLoginBtn").addEventListener("click", () => closeDialog(loginDialog));
$("closeSellBtn").addEventListener("click", () => closeDialog(sellDialog));

function openSell() {
  if (!auth.currentUser) {
    setMsg($("loginMessage"), "Please login first to post an item.");
    openDialog(loginDialog);
    return;
  }
  setMsg($("sellMessage"), "");
  openDialog(sellDialog);
}
["openSellTop", "openSellHero", "openSellMobile"].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener("click", openSell);
});

/* ---------- Login ---------- */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  setMsg($("loginMessage"), "Logging in...");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
    closeDialog(loginDialog);
  } catch (error) {
    setMsg($("loginMessage"), "Login failed: " + friendlyError(error));
  }
});

/* ---------- Create account ---------- */
$("createAccountBtn").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const name = $("signupName").value.trim();
  const phone = $("signupPhone").value.trim();

  if (!email || password.length < 6) {
    setMsg($("loginMessage"), "Enter a valid email and a password of at least 6 characters.");
    return;
  }
  setMsg($("loginMessage"), "Creating account...");
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    try {
      await setDoc(doc(db, "users", result.user.uid), {
        email: result.user.email,
        name: name,
        phone: phone,
        createdAt: serverTimestamp()
      });
    } catch (dbError) {
      console.error("Profile save error:", dbError);
      setMsg($("loginMessage"), "Account created, but profile not saved: " + friendlyError(dbError));
      return;
    }
    loginForm.reset();
    closeDialog(loginDialog);
  } catch (error) {
    setMsg($("loginMessage"), "Registration failed: " + friendlyError(error));
  }
});

/* ---------- Logout ---------- */
logoutBtn.addEventListener("click", async () => {
  try { await signOut(auth); } catch (error) { alert(friendlyError(error)); }
});

/* ---------- Login status (persists after refresh) ---------- */
onAuthStateChanged(auth, (user) => {
  $("userEmail").textContent = user ? user.email : "Guest";
  logoutBtn.hidden = !user;
  $("loginBtn").hidden = !!user;
});

/* ---------- Offers ---------- */
sellForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) { setMsg($("sellMessage"), "Please login first."); return; }
  setMsg($("sellMessage"), "Saving offer...");
  try {
    await addDoc(collection(db, "offers"), {
      productName: $("sellName").value.trim(),
      category: $("sellCategory").value,
      price: Number($("sellPrice").value),
      quantity: $("sellQuantity").value.trim(),
      phone: $("sellPhone").value.trim(),
      photo: $("sellPhoto").value.trim(),
      ownerUid: user.uid,
      ownerEmail: user.email,
      createdAt: serverTimestamp()
    });
    sellForm.reset();
    closeDialog(sellDialog);
    await loadOffers();
  } catch (error) {
    setMsg($("sellMessage"), "Could not save offer: " + friendlyError(error));
  }
});

async function loadOffers() {
  const status = $("offersStatus");
  try {
    const q = query(collection(db, "offers"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    allOffers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOffers();
  } catch (error) {
    console.error(error);
    status.textContent = "Could not load offers: " + friendlyError(error);
  }
}

function renderOffers() {
  const grid = $("productGrid");
  const status = $("offersStatus");
  const term = currentSearch.toLowerCase();
  const list = allOffers.filter((o) => {
    const catOk = currentCategory === "All" || o.category === currentCategory;
    const textOk = !term || (o.productName || "").toLowerCase().includes(term);
    return catOk && textOk;
  });

  grid.textContent = "";
  $("offerCount").textContent = list.length + " offers";
  status.textContent = list.length ? "" : "No offers found yet. Be the first to post!";

  list.forEach((o) => {
    const card = document.createElement("article");
    card.className = "product-card";

    if (o.photo && /^https?:\/\//i.test(o.photo)) {
      const img = document.createElement("img");
      img.src = o.photo;
      img.alt = o.productName || "Product";
      img.loading = "lazy";
      card.appendChild(img);
    }
    const add = (tag, text, cls) => {
      const el = document.createElement(tag);
      el.textContent = text;
      if (cls) el.className = cls;
      card.appendChild(el);
    };
    add("h3", o.productName || "");
    add("p", "விலை: ₹" + (o.price ?? ""), "price");
    add("p", "அளவு: " + (o.quantity || ""));

    // Clean phone number
    const cleanPhone = String(o.phone || "").replace(/[^0-9+]/g, "");

    // Call Button
    const call = document.createElement("a");
    call.className = "primary-btn call-btn";
    call.href = "tel:" + cleanPhone;
    call.target = "_top";
    call.textContent = "📞 " + (o.phone || "");
    call.addEventListener("click", () => {
      if (navigator.clipboard && cleanPhone) {
        navigator.clipboard.writeText(cleanPhone).catch(() => {});
      }
    });
    card.appendChild(call);

    // WhatsApp Button (Universal Web Link)
    if (cleanPhone) {
      const waDigits = cleanPhone.replace(/^\+/, "");
      const waNumber = waDigits.length === 10 ? "91" + waDigits : waDigits;
      const wa = document.createElement("a");
      wa.className = "outline-btn call-btn";
      wa.href = "https://api.whatsapp.com/send?phone=" + waNumber + "&text=" + encodeURIComponent("Hi, I saw your offer for " + (o.productName || "your item") + " on Namma Ooru Vivasayi.");
      wa.target = "_blank";
      wa.rel = "noopener";
      wa.textContent = "💬 WhatsApp";
      card.appendChild(wa);
    }

    grid.appendChild(card);
  });
}

/* ---------- Category + search ---------- */
document.querySelectorAll("[data-category]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentCategory = btn.dataset.category;
    document.querySelectorAll("[data-category]").forEach((b) =>
      b.classList.toggle("active", b.dataset.category === currentCategory));
    renderOffers();
  });
});
$("searchInput").addEventListener("input", (e) => {
  currentSearch = e.target.value.trim();
  renderOffers();
});

loadOffers();
