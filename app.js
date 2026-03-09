// ==========================================
// KOMPLETNY SILNIK APLIKACJI (NAPRAWIONY)
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, where, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// TWOJE KLUCZE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyCZQCabpk9z3ErO1PvWK1s1t2bgYLsaU4Q",
  authDomain: "straznik-lodowki.firebaseapp.com",
  projectId: "straznik-lodowki",
  storageBucket: "straznik-lodowki.firebasestorage.app",
  messagingSenderId: "164272438750",
  appId: "1:164272438750:web:e70732b4e4db6de056714f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Wymuszenie wyboru konta
provider.setCustomParameters({ prompt: 'select_account' });

// --- ZMIENNE GLOBALNE ---
let currentUser = null;
let currentHouseholdId = null; 
let unsubscribeProducts = null;
let unsubscribeSections = null;
let productsArray = []; 
let chartInstance = null; 

let storageSections = [
    { id: 'fridge-top', name: 'Lodówka - Góra', icon: 'fa-temperature-low' },
    { id: 'fridge-mid', name: 'Lodówka - Środek', icon: 'fa-snowflake' },
    { id: 'fridge-drawer', name: 'Szuflada', icon: 'fa-carrot' },
    { id: 'pantry', name: 'Spiżarnia', icon: 'fa-box-open' }
];

// --- NAWIGACJA ---
const navItems = document.querySelectorAll('.nav-item');
const screens = document.querySelectorAll('.screen');

navItems.forEach(btn => {
    btn.addEventListener('click', () => {
        if(btn.id === 'scanNavBtn') return; 
        navItems.forEach(item => item.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-target');
        screens.forEach(screen => screen.classList.remove('active'));
        document.getElementById(target).classList.add('active');
        if(target === 'calendarScreen') renderCalendar();
        if(target === 'statsScreen') renderStats();
    });
});

// --- LOGOWANIE (NAPRAWIONE) ---
const loginBtn = document.getElementById('loginBtn');
const mainLoginBtn = document.getElementById('mainLoginBtn');

const signIn = () => { 
    // Wymuszamy zapamiętanie sesji w pamięci przeglądarki (Local Storage)
    setPersistence(auth, browserLocalPersistence)
        .then(() => {
            return signInWithPopup(auth, provider);
        })
        .catch((error) => {
            alert("Błąd logowania: " + error.message);
        });
};

const logOut = async () => { try { await signOut(auth); } catch(e) { console.error(e); } };

loginBtn.addEventListener('click', () => currentUser ? logOut() : signIn());
mainLoginBtn.addEventListener('click', signIn);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists() && userDocSnap.data().householdId) {
            currentHouseholdId = userDocSnap.data().householdId;
        } else {
            currentHouseholdId = user.uid; 
            await setDoc(userDocRef, { email: user.email, householdId: currentHouseholdId });
        }
        
        document.getElementById('welcomeScreen').classList.remove('active');
        document.getElementById('dashboardScreen').classList.add('active');
        loginBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Wyloguj';
        document.getElementById('userEmailDisplay').style.display = 'inline';
        document.getElementById('userEmailDisplay').innerText = user.email;

        initApp(); 
    } else {
        currentUser = null;
        currentHouseholdId = null;
        document.getElementById('welcomeScreen').classList.add('active');
        document.getElementById('dashboardScreen').classList.remove('active');
        loginBtn.innerHTML = '<i class="fa-brands fa-google"></i> Zaloguj';
        document.getElementById('userEmailDisplay').style.display = 'none';
        
        if (unsubscribeProducts) unsubscribeProducts();
        if (unsubscribeSections) unsubscribeSections();
    }
});

// --- SILNIK APLIKACJI ---
window.initApp = function() {
    loadCustomSections();
    loadProducts();
    loadShoppingList();
}

const storageContainer = document.getElementById('storageSections');
const storageLocationSelect = document.getElementById('storageLocation');
const modal = document.getElementById('addProductModal');

window.renderEmptySections = function() {
    storageContainer.innerHTML = '';
    storageLocationSelect.innerHTML = '';
    storageSections.forEach(section => {
        const div = document.createElement('div');
        div.className = 'storage-section';
        div.innerHTML = `<h3><i class="fa-solid ${section.icon}"></i> ${section.name}</h3><div class="product-list" id="${section.id}"></div>`;
        storageContainer.appendChild(div);
        const option = document.createElement('option');
        option.value = section.id;
        option.textContent = section.name;
        storageLocationSelect.appendChild(option);
    });
}

document.getElementById('openModalBtn').addEventListener('click', () => modal.classList.add('active'));
document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.remove('active'));

document.getElementById('saveProductBtn').addEventListener('click', async () => {
    if (!currentUser) return;
    const name = document.getElementById('productName').value;
    const date = document.getElementById('expiryDate').value;
    const location = document.getElementById('storageLocation').value;
    if (!name || !date) return alert("Wpisz nazwę i wybierz datę!");
    try {
        await addDoc(collection(db, "products"), { name, expiryDate: date, location, householdId: currentHouseholdId, addedBy: currentUser.email });
        modal.classList.remove('active');
        document.getElementById('productName').value = '';
    } catch (e) { alert("Błąd zapisu!"); }
});

window.loadProducts = function() {
    const q = query(collection(db, "products"), where("householdId", "==", currentHouseholdId));
    unsubscribeProducts = onSnapshot(q, (snapshot) => {
        storageSections.forEach(sec => { const el = document.getElementById(sec.id); if(el) el.innerHTML = ''; });
        productsArray = [];
        const today = new Date(); today.setHours(0,0,0,0);
        snapshot.forEach(docSnap => { productsArray.push({ id: docSnap.id, ...docSnap.data() }); });
        productsArray.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
        productsArray.forEach(product => {
            const listElement = document.getElementById(product.location);
            if (listElement) {
                const expDate = new Date(product.expiryDate);
                const daysDiff = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
                let statusClass = 'safe';
                if (daysDiff < 0) statusClass = 'expired'; else if (daysDiff <= 3) statusClass = 'expiring-soon';
                const div = document.createElement('div');
                div.className = `product-item ${statusClass}`;
                div.innerHTML = `<div class="product-info"><strong>${product.name}</strong><span>Ważne: ${product.expiryDate}</span></div><button class="delete-btn" onclick="triggerDeleteModal('${product.id}')"><i class="fa-solid fa-trash-can"></i></button>`;
                listElement.appendChild(div);
            }
        });
        checkRecipeSuggestions();
    });
}

// --- STATYSTYKI I USUWANIE ---
let productToDeleteId = null;
const consumeModal = document.getElementById('consumeModal');
window.triggerDeleteModal = (id) => { productToDeleteId = id; consumeModal.classList.add('active'); };
document.getElementById('btnCancelConsume').onclick = () => consumeModal.classList.remove('active');

const resolveDeletion = async (status) => {
    if(!productToDeleteId) return;
    consumeModal.classList.remove('active');
    try {
        await deleteDoc(doc(db, "products", productToDeleteId));
        const monthYear = new Date().toISOString().slice(0, 7); 
        const statRef = doc(db, "stats", `${currentHouseholdId}_${monthYear}`);
        const statSnap = await getDoc(statRef);
        let saved = statSnap.exists() ? statSnap.data().saved || 0 : 0;
        let wasted = statSnap.exists() ? statSnap.data().wasted || 0 : 0;
        if(status === 'saved') saved++; else wasted++;
        await setDoc(statRef, { householdId: currentHouseholdId, month: monthYear, saved, wasted }, { merge: true });
    } catch (e) { console.error(e); }
};
document.getElementById('btnConsumed').onclick = () => resolveDeletion('saved');
document.getElementById('btnWasted').onclick = () => resolveDeletion('wasted');

window.renderStats = function() {
    const monthYear = new Date().toISOString().slice(0, 7);
    getDoc(doc(db, "stats", `${currentHouseholdId}_${monthYear}`)).then(snap => {
        let s = snap.exists() ? snap.data().saved || 0 : 0;
        let w = snap.exists() ? snap.data().wasted || 0 : 0;
        document.getElementById('savedCount').innerText = s;
        document.getElementById('wastedCount').innerText = w;
        const ctx = document.getElementById('zeroWasteChart').getContext('2d');
        if(chartInstance) chartInstance.destroy();
        chartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: ['Uratowane', 'Wyrzucone'], datasets: [{ data: [s||1, w], backgroundColor: ['#2e7d32', '#e74c3c'] }] } });
    });
}

// --- LISTA ZAKUPÓW ---
document.getElementById('addShoppingItemBtn').onclick = () => {
    const inp = document.getElementById('newShoppingItemInput');
    if(inp.value) { addDoc(collection(db, "shoppingList"), { name: inp.value, householdId: currentHouseholdId }); inp.value = ''; }
};

window.loadShoppingList = () => {
    onSnapshot(query(collection(db, "shoppingList"), where("householdId", "==", currentHouseholdId)), snap => {
        const l = document.getElementById('shoppingList'); l.innerHTML = '';
        snap.forEach(d => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${d.data().name}</span><button class="btn danger-btn" onclick="deleteShoppingItem('${d.id}')">OK</button>`;
            l.appendChild(li);
        });
    });
}
window.deleteShoppingItem = (id) => deleteDoc(doc(db, "shoppingList", id));

// --- KALENDARZ I SKANER ---
window.renderCalendar = () => {
    const el = document.getElementById('calendarDiv'); el.innerHTML = '';
    new FullCalendar.Calendar(el, { initialView: 'dayGridMonth', locale: 'pl', events: productsArray.map(p => ({ title: p.name, start: p.expiryDate, color: '#2e7d32' })) }).render();
}

document.getElementById('scanNavBtn').onclick = () => {
    if (!currentUser) return alert("Zaloguj się!");
    const scanModal = document.getElementById('scannerModal'); scanModal.classList.add('active');
    const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
    scanner.render(async (text) => {
        scanner.clear(); scanModal.classList.remove('active');
        const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${text}.json`);
        const data = await res.json();
        modal.classList.add('active');
        if (data.status === 1) document.getElementById('productName').value = data.product.product_name;
    });
    document.getElementById('closeScannerBtn').onclick = () => { scanner.clear(); scanModal.classList.remove('active'); };
};

// --- WŁASNE SEKCJE ---
document.getElementById('addSectionBtn').onclick = async () => {
    const val = document.getElementById('newSectionInput').value;
    if(val) { await addDoc(collection(db, "customSections"), { householdId: currentHouseholdId, name: val, icon: 'fa-box' }); document.getElementById('newSectionInput').value = ''; }
};

window.loadCustomSections = () => {
    onSnapshot(query(collection(db, "customSections"), where("householdId", "==", currentHouseholdId)), snap => {
        const list = document.getElementById('customSectionsList'); list.innerHTML = '';
        storageSections = [{id:'fridge-top',name:'Góra',icon:'fa-temperature-low'},{id:'fridge-mid',name:'Środek',icon:'fa-snowflake'},{id:'fridge-drawer',name:'Szuflada',icon:'fa-carrot'},{id:'pantry',name:'Spiżarnia',icon:'fa-box-open'}];
        snap.forEach(d => {
            storageSections.push({id: d.id, name: d.data().name, icon: d.data().icon});
            const li = document.createElement('li'); li.innerHTML = `<span>${d.data().name}</span><button onclick="deleteDoc(doc(db,'customSections','${d.id}'))">X</button>`;
            list.appendChild(li);
        });
        renderEmptySections();
    });
}

window.checkRecipeSuggestions = () => {
    const names = productsArray.map(p => p.name.toLowerCase());
    const box = document.getElementById('recipeSuggestionAlert');
    if(names.some(n => n.includes('jajk')) && names.some(n => n.includes('pomidor'))) box.style.display = 'block'; else box.style.display = 'none';
}
