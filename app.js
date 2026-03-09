import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

let currentUser = null; 
let unsubscribeSnapshot = null;

const storageSections = [
    { id: 'fridge-top', name: 'Lodówka - Góra', icon: 'fa-temperature-low' },
    { id: 'fridge-mid', name: 'Lodówka - Środek', icon: 'fa-snowflake' },
    { id: 'fridge-drawer', name: 'Szuflada na warzywa', icon: 'fa-carrot' },
    { id: 'pantry', name: 'Spiżarnia', icon: 'fa-box-open' }
];

const loginBtn = document.getElementById('loginBtn');
const mainLoginBtn = document.getElementById('mainLoginBtn');
const welcomeScreen = document.getElementById('welcomeScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const storageContainer = document.getElementById('storageSections');
const userEmailDisplay = document.getElementById('userEmailDisplay');

const modal = document.getElementById('addProductModal');
const openModalBtn = document.getElementById('openModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const saveProductBtn = document.getElementById('saveProductBtn');
const storageLocationSelect = document.getElementById('storageLocation');

// --- LOGOWANIE ---
const signIn = async () => {
    try { await signInWithPopup(auth, provider); } 
    catch (error) { console.error("Błąd logowania:", error); }
};

const logOut = async () => {
    try { await signOut(auth); } 
    catch (error) { console.error("Błąd wylogowania:", error); }
};

loginBtn.addEventListener('click', () => currentUser ? logOut() : signIn());
mainLoginBtn.addEventListener('click', signIn);

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        welcomeScreen.classList.remove('active');
        dashboardScreen.classList.add('active');
        
        loginBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Wyloguj';
        userEmailDisplay.style.display = 'inline';
        userEmailDisplay.innerText = user.email;

        renderEmptySections();
        loadProductsFromDatabase(); 
    } else {
        currentUser = null;
        welcomeScreen.classList.add('active');
        dashboardScreen.classList.remove('active');
        
        loginBtn.innerHTML = '<i class="fa-brands fa-google"></i> Zaloguj';
        userEmailDisplay.style.display = 'none';
        
        if (unsubscribeSnapshot) unsubscribeSnapshot();
    }
});

// --- RYSOWANIE POJEMNIKÓW ---
function renderEmptySections() {
    storageContainer.innerHTML = '';
    storageLocationSelect.innerHTML = '';

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

// --- OBSŁUGA OKIENKA ---
openModalBtn.addEventListener('click', () => modal.classList.add('active'));
closeModalBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    document.getElementById('productName').value = ''; 
    document.getElementById('expiryDate').value = '';
});

// --- BAZA DANYCH: ZAPISYWANIE ---
saveProductBtn.addEventListener('click', async () => {
    if (!currentUser) return alert("Musisz być zalogowany!");

    const name = document.getElementById('productName').value;
    const date = document.getElementById('expiryDate').value;
    const location = document.getElementById('storageLocation').value;

    if (!name || !date) return alert("Wpisz nazwę i wybierz datę!");
    saveProductBtn.innerText = "Zapisuję...";

    try {
        await addDoc(collection(db, "products"), {
            name: name,
            expiryDate: date,
            location: location,
            userId: currentUser.uid, // Przypisanie do Ciebie!
            createdAt: new Date()
        });
        
        modal.classList.remove('active');
        document.getElementById('productName').value = '';
        document.getElementById('expiryDate').value = '';
    } catch (error) {
        alert("Wystąpił błąd podczas dodawania.");
    } finally {
        saveProductBtn.innerText = "Zapisz";
    }
});

// --- BAZA DANYCH: POBIERANIE TWOICH PRODUKTÓW ---
function loadProductsFromDatabase() {
    if (!currentUser) return;

    // Pobieramy TYLKO Twoje produkty
    const q = query(collection(db, "products"), where("userId", "==", currentUser.uid));
    
    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        // Czyszczenie list
        storageSections.forEach(section => {
            const listElement = document.getElementById(section.id);
            if(listElement) listElement.innerHTML = '';
        });

        const today = new Date();
        today.setHours(0,0,0,0);
        
        // Zbieranie produktów do tablicy i sortowanie po dacie w JavaScript
        let products = [];
        snapshot.forEach(docSnap => {
            products.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        products.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

        // Wyświetlanie posegregowanych produktów
        products.forEach(product => {
            const listElement = document.getElementById(product.location);

            if (listElement) {
                const expDate = new Date(product.expiryDate);
                const daysDiff = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

                let statusClass = '';
                let statusText = `Ważne do: ${product.expiryDate}`;

                if (daysDiff < 0) {
                    statusClass = 'expired'; statusText = 'Przeterminowane!';
                } else if (daysDiff <= 3) {
                    statusClass = 'expiring-soon'; statusText = `Zostały ${daysDiff} dni!`;
                }

                const productDiv = document.createElement('div');
                productDiv.className = `product-item ${statusClass}`;
                productDiv.innerHTML = `
                    <div class="product-info">
                        <strong>${product.name}</strong>
                        <span>${statusText}</span>
                    </div>
                    <button class="delete-btn" data-id="${product.id}"><i class="fa-solid fa-trash-can"></i></button>
                `;
                listElement.appendChild(productDiv);
            }
        });

        // Obsługa usuwania
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idToDelete = e.currentTarget.getAttribute('data-id');
                if(confirm('Na pewno usunąć?')) {
                    await deleteDoc(doc(db, "products", idToDelete));
                }
            });
        });
        
        // Jeśli pusto - wyświetl napis
        storageSections.forEach(section => {
             const listElement = document.getElementById(section.id);
             if(listElement && listElement.children.length === 0) {
                 listElement.innerHTML = '<p style="color: #aaa; font-size: 0.85em; font-style: italic; text-align: center; padding: 10px;">Brak produktów</p>';
             }
        });
    });
}
