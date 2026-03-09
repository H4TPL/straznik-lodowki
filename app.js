// ==========================================
// 1. IMPORTY I KONFIGURACJA FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, where, updateDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// !!! TUTAJ WKLEJ SWOJE KLUCZE FIREBASE !!!
const firebaseConfig = {
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

// ==========================================
// 2. STAN APLIKACJI I ZMIENNE
// ==========================================
let currentUser = null;
let currentHouseholdId = null; // ID domu (dla współdzielenia lodówki)
let unsubscribeProducts = null;
let productsArray = []; // Trzymamy produkty lokalnie dla kalendarza
let chartInstance = null; // Zmienna dla wykresu Chart.js

const defaultSections = [
    { id: 'fridge-top', name: 'Lodówka - Góra', icon: 'fa-temperature-low' },
    { id: 'fridge-mid', name: 'Lodówka - Środek', icon: 'fa-snowflake' },
    { id: 'fridge-drawer', name: 'Szuflada', icon: 'fa-carrot' },
    { id: 'pantry', name: 'Spiżarnia', icon: 'fa-box-open' }
];

// ==========================================
// 3. NAWIGACJA (PRZEŁĄCZANIE EKRANÓW)
// ==========================================
const navItems = document.querySelectorAll('.nav-item');
const screens = document.querySelectorAll('.screen');

navItems.forEach(btn => {
    btn.addEventListener('click', () => {
        // Ignorujemy przycisk skanera, bo on otwiera pop-up, a nie ekran
        if(btn.id === 'scanNavBtn') return; 

        // Zmiana aktywnego przycisku w menu
        navItems.forEach(item => item.classList.remove('active'));
        btn.classList.add('active');

        // Zmiana ekranu
        const target = btn.getAttribute('data-target');
        screens.forEach(screen => screen.classList.remove('active'));
        document.getElementById(target).classList.add('active');

        // Odśwież kalendarz lub statystyki, jeśli na nie wejdziesz
        if(target === 'calendarScreen') renderCalendar();
        if(target === 'statsScreen') renderStats();
    });
});

// ==========================================
// 4. LOGOWANIE I SYSTEM "DOMU"
// ==========================================
const loginBtn = document.getElementById('loginBtn');
const mainLoginBtn = document.getElementById('mainLoginBtn');

const signIn = async () => { try { await signInWithPopup(auth, provider); } catch(e) { console.error(e); } };
const logOut = async () => { try { await signOut(auth); } catch(e) { console.error(e); } };

loginBtn.addEventListener('click', () => currentUser ? logOut() : signIn());
mainLoginBtn.addEventListener('click', signIn);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Domyślnie Twoim "domem" jest Twoje własne ID
        currentHouseholdId = user.uid; 
        
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
    }
});

function initApp() {
    renderEmptySections();
    loadProducts();
    loadShoppingList();
}

// ==========================================
// 5. OBSŁUGA LODÓWKI I PRODUKTÓW
// ==========================================
const storageContainer = document.getElementById('storageSections');
const storageLocationSelect = document.getElementById('storageLocation');

function renderEmptySections() {
    storageContainer.innerHTML = '';
    storageLocationSelect.innerHTML = '';
    
    defaultSections.forEach(section => {
        const div = document.createElement('div');
        div.className = 'storage-section';
        div.innerHTML = `
            <h3><i class="fa-solid ${section.icon}"></i> ${section.name}</h3>
            <div class="product-list" id="${section.id}"></div>
        `;
        storageContainer.appendChild(div);

        const option = document.createElement('option');
        option.value = section.id;
        option.textContent = section.name;
        storageLocationSelect.appendChild(option);
    });
}

// Otwieranie/Zamykanie modala dodawania
const modal = document.getElementById('addProductModal');
document.getElementById('openModalBtn').addEventListener('click', () => modal.classList.add('active'));
document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.remove('active'));

// Zapis produktu do bazy
document.getElementById('saveProductBtn').addEventListener('click', async () => {
    if (!currentUser) return;
    const name = document.getElementById('productName').value;
    const date = document.getElementById('expiryDate').value;
    const location = document.getElementById('storageLocation').value;

    if (!name || !date) return alert("Wpisz nazwę i datę!");
    
    document.getElementById('saveProductBtn').innerText = "Zapisuję...";
    try {
        await addDoc(collection(db, "products"), {
            name, expiryDate: date, location, householdId: currentHouseholdId, addedBy: currentUser.email
        });
        modal.classList.remove('active');
        document.getElementById('productName').value = '';
    } catch (e) { alert("Błąd!"); }
    document.getElementById('saveProductBtn').innerText = "Zapisz";
});

// Pobieranie i wyświetlanie produktów (NASŁUCHIWANIE NA ŻYWO)
function loadProducts() {
    const q = query(collection(db, "products"), where("householdId", "==", currentHouseholdId));
    
    unsubscribeProducts = onSnapshot(q, (snapshot) => {
        // Czyszczenie list
        defaultSections.forEach(sec => {
            const el = document.getElementById(sec.id);
            if(el) el.innerHTML = '';
        });

        productsArray = [];
        const today = new Date();
        today.setHours(0,0,0,0);

        snapshot.forEach(docSnap => {
            let p = { id: docSnap.id, ...docSnap.data() };
            productsArray.push(p);
        });
        
        productsArray.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

        productsArray.forEach(product => {
            const listElement = document.getElementById(product.location);
            if (listElement) {
                const expDate = new Date(product.expiryDate);
                const daysDiff = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

                let statusClass = 'safe';
                let statusText = `Ważne do: ${product.expiryDate}`;

                if (daysDiff < 0) { statusClass = 'expired'; statusText = 'Przeterminowane!'; } 
                else if (daysDiff <= 3) { statusClass = 'expiring-soon'; statusText = `Zostały ${daysDiff} dni!`; }

                const div = document.createElement('div');
                div.className = `product-item ${statusClass}`;
                div.innerHTML = `
                    <div class="product-info">
                        <strong>${product.name}</strong>
                        <span>${statusText}</span>
                    </div>
                    <button class="delete-btn" onclick="triggerDeleteModal('${product.id}')"><i class="fa-solid fa-trash-can"></i></button>
                `;
                listElement.appendChild(div);
            }
        });
        
        // Puste sekcje
        defaultSections.forEach(sec => {
            const el = document.getElementById(sec.id);
            if(el && el.children.length === 0) el.innerHTML = '<p style="color: #aaa; font-size: 0.8em; text-align:center;">Pusto</p>';
        });
        
        checkRecipeSuggestions();
    });
}

// ==========================================
// 6. USUWANIE, STATYSTYKI I "ZERO WASTE"
// ==========================================
let productToDeleteId = null;
const consumeModal = document.getElementById('consumeModal');

// Wystawienie funkcji globalnej dla przycisku HTML
window.triggerDeleteModal = function(id) {
    productToDeleteId = id;
    consumeModal.classList.add('active');
};

document.getElementById('btnConsumed').addEventListener('click', () => resolveDeletion('saved'));
document.getElementById('btnWasted').addEventListener('click', () => resolveDeletion('wasted'));

async function resolveDeletion(status) {
    if(!productToDeleteId) return;
    consumeModal.classList.remove('active');
    
    try {
        // Usuń produkt
        await deleteDoc(doc(db, "products", productToDeleteId));
        
        // Zapisz statystykę w chmurze
        const monthYear = new Date().toISOString().slice(0, 7); // np. "2024-03"
        const statRef = doc(db, "stats", `${currentHouseholdId}_${monthYear}`);
        
        // Pobieramy stary dokument
        const statSnap = await getDoc(statRef);
        let saved = statSnap.exists() ? statSnap.data().saved || 0 : 0;
        let wasted = statSnap.exists() ? statSnap.data().wasted || 0 : 0;
        
        if(status === 'saved') saved++; else wasted++;
        
        await setDoc(statRef, { householdId: currentHouseholdId, month: monthYear, saved, wasted }, { merge: true });
        
        // Jeśli wyrzucone, zapytaj o listę zakupów
        if(status === 'wasted') {
            if(confirm("Wyrzucono produkt. Dodać go od razu do listy zakupów?")) {
                const prod = productsArray.find(p => p.id === productToDeleteId);
                if(prod) addShoppingItem(prod.name);
            }
        }
    } catch (e) { console.error(e); }
    productToDeleteId = null;
}

function renderStats() {
    const monthYear = new Date().toISOString().slice(0, 7);
    const statRef = doc(db, "stats", `${currentHouseholdId}_${monthYear}`);
    
    getDoc(statRef).then(snap => {
        let saved = snap.exists() ? snap.data().saved || 0 : 0;
        let wasted = snap.exists() ? snap.data().wasted || 0 : 0;
        
        document.getElementById('savedCount').innerText = saved;
        document.getElementById('wastedCount').innerText = wasted;

        const ctx = document.getElementById('zeroWasteChart').getContext('2d');
        if(chartInstance) chartInstance.destroy(); // Zniszcz stary wykres
        
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Uratowane', 'Wyrzucone'],
                datasets: [{
                    data: [saved, wasted === 0 && saved === 0 ? 1 : wasted], // fake 1 żeby nie było pustego kółka
                    backgroundColor: ['#2e7d32', '#e74c3c'],
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    });
}

// ==========================================
// 7. LISTA ZAKUPÓW I SUGESTIE PRZEPISÓW
// ==========================================
document.getElementById('addShoppingItemBtn').addEventListener('click', () => {
    const item = prompt("Co kupić?");
    if(item) addShoppingItem(item);
});

async function addShoppingItem(name) {
    try {
        await addDoc(collection(db, "shoppingList"), { name, householdId: currentHouseholdId, done: false });
    } catch (e) { console.error(e); }
}

function loadShoppingList() {
    const q = query(collection(db, "shoppingList"), where("householdId", "==", currentHouseholdId));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('shoppingList');
        list.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${data.name}</span>
                <button class="btn danger-btn" onclick="deleteDoc(doc(db, 'shoppingList', '${docSnap.id}'))" style="padding: 4px 8px;"><i class="fa-solid fa-check"></i></button>
            `;
            list.appendChild(li);
        });
    });
}

function checkRecipeSuggestions() {
    // Prosta logika: jeśli mamy w produktach jajka i pomidory, sugeruj szakszukę
    const names = productsArray.map(p => p.name.toLowerCase());
    const hasEggs = names.some(n => n.includes('jajk'));
    const hasTomatoes = names.some(n => n.includes('pomidor'));
    
    if(hasEggs && hasTomatoes) {
        document.getElementById('recipeSuggestionAlert').style.display = 'block';
    } else {
        document.getElementById('recipeSuggestionAlert').style.display = 'none';
    }
}

// ==========================================
// 8. KALENDARZ FULLCALENDAR
// ==========================================
function renderCalendar() {
    const calendarEl = document.getElementById('calendarDiv');
    calendarEl.innerHTML = ''; // czyszczenie
    
    const events = productsArray.map(p => {
        return {
            title: p.name,
            start: p.expiryDate,
            color: new Date(p.expiryDate) < new Date() ? '#e74c3c' : '#2e7d32'
        };
    });

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pl',
        height: 'auto',
        events: events
    });
    calendar.render();
}

// ==========================================
// 9. SKANER KODÓW KRESKOWYCH (Aparat)
// ==========================================
const scanNavBtn = document.getElementById('scanNavBtn');
const scannerModal = document.getElementById('scannerModal');
let html5QrcodeScanner = null;

scanNavBtn.addEventListener('click', () => {
    if (!currentUser) return alert("Musisz być zalogowany!");
    scannerModal.classList.add('active');
    
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 150} }, false);
    html5QrcodeScanner.render(async (decodedText) => {
        // Po udanym skanowaniu
        html5QrcodeScanner.clear();
        scannerModal.classList.remove('active');
        
        try {
            const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${decodedText}.json`);
            const data = await response.json();
            modal.classList.add('active'); // Otwórz okienko dodawania
            
            if (data.status === 1 && data.product.product_name) {
                document.getElementById('productName').value = data.product.product_name;
            } else {
                alert("Nie znaleziono nazwy. Wpisz ją ręcznie.");
            }
        } catch (e) {
            modal.classList.add('active');
        }
    });
});

document.getElementById('closeScannerBtn').addEventListener('click', () => {
    scannerModal.classList.remove('active');
    if (html5QrcodeScanner) html5QrcodeScanner.clear();
});

// Udostępnienie funkcji globalnej z modułu dla przycisków HTML
window.deleteDoc = deleteDoc;
window.doc = doc;
window.db = db;

