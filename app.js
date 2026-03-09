// ==========================================
// CZĘŚĆ 1: BAZA, LOGOWANIE I USTAWIENIA (Wersja naprawiona dla mobile)
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// TWOJE ZAPAMIĘTANE KLUCZE FIREBASE
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

// Wymuszenie wyboru konta przy każdym kliknięciu (czyści zablokowane sesje na telefonie)
provider.setCustomParameters({
    prompt: 'select_account'
});

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

        if(target === 'calendarScreen' && typeof renderCalendar === 'function') renderCalendar();
        if(target === 'statsScreen' && typeof renderStats === 'function') renderStats();
    });
});

// --- LOGOWANIE (POP-UP Z WYMUSZENIEM PAMIĘCI) ---
const loginBtn = document.getElementById('loginBtn');
const mainLoginBtn = document.getElementById('mainLoginBtn');

const signIn = () => { 
    // Twarde wymuszenie zapisania sesji w pamięci przeglądarki
    setPersistence(auth, browserLocalPersistence)
        .then(() => {
            // Zwykły Pop-up, bez opóźnień "await" - to omija blokady w telefonach!
            return signInWithPopup(auth, provider);
        })
        .catch((error) => {
            alert("Błąd logowania: " + error.message);
        });
};

const logOut = async () => { try { await signOut(auth); } catch(e) { console.error(e); } };

loginBtn.addEventListener('click', () => currentUser ? logOut() : signIn());
mainLoginBtn.addEventListener('click', signIn);

// Możesz usunąć cały blok getRedirectResult, nie będzie już potrzebny!

const logOut = async () => { try { await signOut(auth); } catch(e) { console.error(e); } };

loginBtn.addEventListener('click', () => currentUser ? logOut() : signIn());
mainLoginBtn.addEventListener('click', signIn);

// TO JEST KLUCZOWE: Odbieranie wyniku z Google po powrocie na stronę
getRedirectResult(auth).then((result) => {
    if (result) {
        console.log("Logowanie udane po powrocie!");
    }
}).catch((error) => {
    // Jeśli przeglądarka coś zablokuje, pokaże Ci się ten komunikat!
    alert("Błąd powrotu z Google: " + error.message);
});

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

        if (typeof initApp === 'function') initApp(); 
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

// --- USTAWIENIA: WŁASNE POJEMNIKI ---
document.getElementById('addSectionBtn').addEventListener('click', async () => {
    const sectionName = document.getElementById('newSectionInput').value.trim();
    if (!sectionName) return;
    
    const newId = 'sec-' + Date.now();
    try {
        await addDoc(collection(db, "customSections"), {
            householdId: currentHouseholdId,
            id: newId,
            name: sectionName,
            icon: 'fa-box'
        });
        document.getElementById('newSectionInput').value = '';
    } catch (e) { console.error(e); }
});

window.loadCustomSections = function() {
    const q = query(collection(db, "customSections"), where("householdId", "==", currentHouseholdId));
    unsubscribeSections = onSnapshot(q, (snapshot) => {
        const customList = document.getElementById('customSectionsList');
        if(customList) customList.innerHTML = '';
        
        storageSections = [
            { id: 'fridge-top', name: 'Lodówka - Góra', icon: 'fa-temperature-low' },
            { id: 'fridge-mid', name: 'Lodówka - Środek', icon: 'fa-snowflake' },
            { id: 'fridge-drawer', name: 'Szuflada', icon: 'fa-carrot' },
            { id: 'pantry', name: 'Spiżarnia', icon: 'fa-box-open' }
        ];

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            storageSections.push(data); 
            
            if(customList) {
                const li = document.createElement('li');
                li.innerHTML = `<span><i class="fa-solid ${data.icon}"></i> ${data.name}</span> 
                <button class="btn danger-btn" onclick="deleteCustomSection('${docSnap.id}')" style="padding: 4px 8px;"><i class="fa-solid fa-trash"></i></button>`;
                customList.appendChild(li);
            }
        });
        
        if (typeof renderEmptySections === 'function') renderEmptySections(); 
    });
}

window.deleteCustomSection = async function(id) {
    if(confirm('Na pewno usunąć ten pojemnik?')) await deleteDoc(doc(db, "customSections", id));
};

// --- USTAWIENIA: SYSTEM RODZINY ---
document.getElementById('inviteBtn').addEventListener('click', async () => {
    const email = document.getElementById('inviteEmailInput').value.trim().toLowerCase();
    if(!email) return alert("Podaj adres e-mail!");
    
    try {
        alert(`Zaproszenie wysłane do ${email}! Twój ID Domu to: ${currentHouseholdId}. Zaproszony musi skontaktować się z administratorem bazy.`);
        document.getElementById('inviteEmailInput').value = '';
    } catch(e) { console.error(e); }
});

// TUTAJ ZACZYNA SIĘ CZĘŚĆ 2 (Zostaw ją bez zmian!)
// ==========================================
// CZĘŚĆ 2: GŁÓWNA LOGIKA APLIKACJI
// ==========================================

// --- INICJALIZACJA PO ZALOGOWANIU ---
// Ta funkcja jest wywoływana z Części 1, gdy użytkownik się zaloguje
window.initApp = function() {
    loadCustomSections(); // To od razu rysuje puste sekcje
    loadProducts();
    loadShoppingList();
}

// --- RYSOWANIE POJEMNIKÓW W LODÓWCE ---
const storageContainer = document.getElementById('storageSections');
const storageLocationSelect = document.getElementById('storageLocation');
const modal = document.getElementById('addProductModal');

window.renderEmptySections = function() {
    storageContainer.innerHTML = '';
    storageLocationSelect.innerHTML = '';
    
    // Rysowanie pojemników na podstawie tablicy storageSections (Część 1)
    storageSections.forEach(section => {
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

document.getElementById('openModalBtn').addEventListener('click', () => modal.classList.add('active'));
document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.remove('active'));

// --- DODAWANIE PRODUKTU DO BAZY ---
document.getElementById('saveProductBtn').addEventListener('click', async () => {
    if (!currentUser) return;
    const name = document.getElementById('productName').value;
    const date = document.getElementById('expiryDate').value;
    const location = document.getElementById('storageLocation').value;

    if (!name || !date) return alert("Wpisz nazwę i wybierz datę!");
    
    document.getElementById('saveProductBtn').innerText = "Zapisuję...";
    try {
        await addDoc(collection(db, "products"), {
            name, expiryDate: date, location, householdId: currentHouseholdId, addedBy: currentUser.email
        });
        modal.classList.remove('active');
        document.getElementById('productName').value = '';
        document.getElementById('expiryDate').value = '';
    } catch (e) { alert("Błąd zapisu!"); console.error(e); }
    document.getElementById('saveProductBtn').innerText = "Zapisz produkt";
});

// --- POBIERANIE PRODUKTÓW (NA ŻYWO) ---
window.loadProducts = function() {
    const q = query(collection(db, "products"), where("householdId", "==", currentHouseholdId));
    
    unsubscribeProducts = onSnapshot(q, (snapshot) => {
        // Czyszczenie list
        storageSections.forEach(sec => {
            const el = document.getElementById(sec.id);
            if(el) el.innerHTML = '';
        });

        productsArray = [];
        const today = new Date();
        today.setHours(0,0,0,0);

        snapshot.forEach(docSnap => {
            productsArray.push({ id: docSnap.id, ...docSnap.data() });
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
        
        // Wyświetl "Pusto", jeśli sekcja nie ma produktów
        storageSections.forEach(sec => {
            const el = document.getElementById(sec.id);
            if(el && el.children.length === 0) el.innerHTML = '<p style="color: #aaa; font-size: 0.85em; text-align:center; padding: 10px;">Pusto</p>';
        });
        
        checkRecipeSuggestions();
    });
}

// --- USUWANIE I STATYSTYKI ZERO WASTE ---
let productToDeleteId = null;
const consumeModal = document.getElementById('consumeModal');

window.triggerDeleteModal = function(id) {
    productToDeleteId = id;
    consumeModal.classList.add('active');
};

document.getElementById('btnCancelConsume').addEventListener('click', () => {
    consumeModal.classList.remove('active');
    productToDeleteId = null;
});

document.getElementById('btnConsumed').addEventListener('click', () => resolveDeletion('saved'));
document.getElementById('btnWasted').addEventListener('click', () => resolveDeletion('wasted'));

async function resolveDeletion(status) {
    if(!productToDeleteId) return;
    consumeModal.classList.remove('active');
    
    try {
        const prod = productsArray.find(p => p.id === productToDeleteId);
        await deleteDoc(doc(db, "products", productToDeleteId)); // Usunięcie
        
        // Aktualizacja statystyk dla danego miesiąca
        const monthYear = new Date().toISOString().slice(0, 7); 
        const statRef = doc(db, "stats", `${currentHouseholdId}_${monthYear}`);
        const statSnap = await getDoc(statRef);
        
        let saved = statSnap.exists() ? statSnap.data().saved || 0 : 0;
        let wasted = statSnap.exists() ? statSnap.data().wasted || 0 : 0;
        
        if(status === 'saved') saved++; else wasted++;
        
        await setDoc(statRef, { householdId: currentHouseholdId, month: monthYear, saved, wasted }, { merge: true });
        
        // Pytanie o listę zakupów, jeśli produkt się zepsuł
        if(status === 'wasted' && prod) {
            if(confirm(`Wyrzuciłeś zepsuty produkt: ${prod.name}. Chcesz go od razu dodać do listy zakupów?`)) {
                addShoppingItem(prod.name);
            }
        }
    } catch (e) { console.error("Błąd usuwania", e); }
    productToDeleteId = null;
}

window.renderStats = function() {
    const monthYear = new Date().toISOString().slice(0, 7);
    const statRef = doc(db, "stats", `${currentHouseholdId}_${monthYear}`);
    
    getDoc(statRef).then(snap => {
        let saved = snap.exists() ? snap.data().saved || 0 : 0;
        let wasted = snap.exists() ? snap.data().wasted || 0 : 0;
        
        document.getElementById('savedCount').innerText = saved;
        document.getElementById('wastedCount').innerText = wasted;

        const ctx = document.getElementById('zeroWasteChart').getContext('2d');
        if(chartInstance) chartInstance.destroy(); // Czyszczenie starego wykresu
        
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Uratowane', 'Wyrzucone'],
                datasets: [{
                    // Fake'owa jedynka, jeśli wszystko wynosi 0, żeby narysowało szare kółko
                    data: [saved === 0 && wasted === 0 ? 1 : saved, wasted], 
                    backgroundColor: [saved === 0 && wasted === 0 ? '#e0e0e0' : '#2e7d32', '#e74c3c'],
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    });
}

// --- LISTA ZAKUPÓW ---
document.getElementById('addShoppingItemBtn').addEventListener('click', () => {
    const itemInput = document.getElementById('newShoppingItemInput');
    const item = itemInput.value.trim();
    if(item) {
        addShoppingItem(item);
        itemInput.value = '';
    }
});

window.addShoppingItem = async function(name) {
    try { await addDoc(collection(db, "shoppingList"), { name, householdId: currentHouseholdId }); } 
    catch (e) { console.error(e); }
}

window.loadShoppingList = function() {
    const q = query(collection(db, "shoppingList"), where("householdId", "==", currentHouseholdId));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('shoppingList');
        list.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${data.name}</span>
                <button class="btn danger-btn" onclick="deleteShoppingItem('${docSnap.id}')" style="padding: 6px 10px;"><i class="fa-solid fa-check"></i></button>
            `;
            list.appendChild(li);
        });
    });
}

window.deleteShoppingItem = async function(id) {
    await deleteDoc(doc(db, "shoppingList", id));
};

// --- POMYSŁY NA PRZEPISY (Inteligentne sugestie) ---
window.checkRecipeSuggestions = function() {
    const names = productsArray.map(p => p.name.toLowerCase());
    const hasEggs = names.some(n => n.includes('jajk'));
    const hasTomatoes = names.some(n => n.includes('pomidor'));
    const hasMilk = names.some(n => n.includes('mleko'));
    
    const alertBox = document.getElementById('recipeSuggestionAlert');
    const recipeText = document.getElementById('recipeText');
    
    if(hasEggs && hasTomatoes) {
        alertBox.style.display = 'block';
        recipeText.innerText = "Masz jajka i pomidory. Szybka szakszuka z patelni uchroni je przed zepsuciem!";
    } else if(hasEggs && hasMilk) {
        alertBox.style.display = 'block';
        recipeText.innerText = "Masz jajka i mleko. Zrób pyszne naleśniki lub omlet!";
    } else {
        alertBox.style.display = 'none';
    }
}

// --- KALENDARZ (FullCalendar) ---
window.renderCalendar = function() {
    const calendarEl = document.getElementById('calendarDiv');
    calendarEl.innerHTML = ''; 
    
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

// --- SKANER KODÓW KRESKOWYCH (Aparat) ---
const scanNavBtn = document.getElementById('scanNavBtn');
const scannerModal = document.getElementById('scannerModal');
let html5QrcodeScanner = null;

scanNavBtn.addEventListener('click', () => {
    if (!currentUser) return alert("Musisz być zalogowany, aby skanować kody!");
    scannerModal.classList.add('active');
    
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 150} }, false);
    html5QrcodeScanner.render(async (decodedText) => {
        // Zamykamy skaner po zeskanowaniu
        html5QrcodeScanner.clear();
        scannerModal.classList.remove('active');
        
        try {
            const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${decodedText}.json`);
            const data = await response.json();
            modal.classList.add('active'); // Otwórz okienko dodawania
            
            if (data.status === 1 && data.product.product_name) {
                document.getElementById('productName').value = data.product.product_name;
            } else {
                alert("Nie znaleziono kodu w bazie (Open Food Facts). Wpisz nazwę ręcznie.");
            }
        } catch (e) {
            console.error(e);
            modal.classList.add('active');
        }
    });
});

document.getElementById('closeScannerBtn').addEventListener('click', () => {
    scannerModal.classList.remove('active');
    if (html5QrcodeScanner) html5QrcodeScanner.clear();
});


