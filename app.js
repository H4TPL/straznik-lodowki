import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

const storageSections = [
    { id: 'fridge-top', name: 'Lodówka - Góra', icon: 'fa-temperature-low' },
    { id: 'fridge-mid', name: 'Lodówka - Środek', icon: 'fa-snowflake' },
    { id: 'fridge-drawer', name: 'Szuflada na warzywa', icon: 'fa-carrot' },
    { id: 'pantry', name: 'Spiżarnia', icon: 'fa-box-open' }
];

const loginBtn = document.getElementById('loginBtn');
const welcomeScreen = document.getElementById('welcomeScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const storageContainer = document.getElementById('storageSections');

const modal = document.getElementById('addProductModal');
const openModalBtn = document.getElementById('openModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const saveProductBtn = document.getElementById('saveProductBtn');
const storageLocationSelect = document.getElementById('storageLocation');

function renderEmptySections() {
    storageContainer.innerHTML = '';
    storageLocationSelect.innerHTML = '';

    storageSections.forEach(section => {
        const div = document.createElement('div');
        div.className = 'storage-section';
        div.innerHTML = `
            <h3><i class="fa-solid ${section.icon}"></i> ${section.name}</h3>
            <div class="product-list" id="${section.id}">
                <p style="color: #aaa; font-size: 0.85em; font-style: italic; text-align: center; padding: 10px;">Brak produktów</p>
            </div>
        `;
        storageContainer.appendChild(div);

        const option = document.createElement('option');
        option.value = section.id;
        option.textContent = section.name;
        storageLocationSelect.appendChild(option);
    });
}

openModalBtn.addEventListener('click', () => modal.classList.add('active'));
closeModalBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    document.getElementById('productName').value = ''; 
    document.getElementById('expiryDate').value = '';
});

loginBtn.addEventListener('click', () => {
    welcomeScreen.classList.remove('active');
    dashboardScreen.classList.add('active');
    loginBtn.innerText = "Wyloguj";
    renderEmptySections();
    loadProductsFromDatabase(); 
});

saveProductBtn.addEventListener('click', async () => {
    const name = document.getElementById('productName').value;
    const date = document.getElementById('expiryDate').value;
    const location = document.getElementById('storageLocation').value;

    if (!name || !date) {
        alert("Wpisz nazwę i wybierz datę!");
        return;
    }

    saveProductBtn.innerText = "Zapisuję...";

    try {
        await addDoc(collection(db, "products"), {
            name: name,
            expiryDate: date,
            location: location,
            createdAt: new Date()
        });
        
        modal.classList.remove('active');
        document.getElementById('productName').value = '';
        document.getElementById('expiryDate').value = '';
    } catch (error) {
        console.error("Błąd podczas dodawania: ", error);
        alert("Wystąpił błąd! Sprawdź w konsoli.");
    } finally {
        saveProductBtn.innerText = "Zapisz";
    }
});

function loadProductsFromDatabase() {
    const q = query(collection(db, "products"), orderBy("expiryDate", "asc"));
    
    onSnapshot(q, (snapshot) => {
        storageSections.forEach(section => {
            const listElement = document.getElementById(section.id);
            if(listElement) listElement.innerHTML = '';
        });

        const today = new Date();
        today.setHours(0,0,0,0);

        snapshot.forEach((docSnap) => {
            const product = docSnap.data();
            const productId = docSnap.id;
            const listElement = document.getElementById(product.location);

            if (listElement) {
                const expDate = new Date(product.expiryDate);
                const timeDiff = expDate.getTime() - today.getTime();
                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

                let statusClass = '';
                let statusText = `Ważne do: ${product.expiryDate}`;

                if (daysDiff < 0) {
                    statusClass = 'expired';
                    statusText = 'Przeterminowane!';
                } else if (daysDiff <= 3) {
                    statusClass = 'expiring-soon';
                    statusText = `Zostały ${daysDiff} dni!`;
                }

                const productDiv = document.createElement('div');
                productDiv.className = `product-item ${statusClass}`;
                productDiv.innerHTML = `
                    <div class="product-info">
                        <strong>${product.name}</strong>
                        <span>${statusText}</span>
                    </div>
                    <button class="delete-btn" data-id="${productId}"><i class="fa-solid fa-trash-can"></i></button>
                `;
                
                listElement.appendChild(productDiv);
            }
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idToDelete = e.currentTarget.getAttribute('data-id');
                if(confirm('Na pewno chcesz usunąć ten produkt?')) {
                    await deleteDoc(doc(db, "products", idToDelete));
                }
            });
        });
        
        storageSections.forEach(section => {
             const listElement = document.getElementById(section.id);
             if(listElement && listElement.children.length === 0) {
                 listElement.innerHTML = '<p style="color: #aaa; font-size: 0.85em; font-style: italic; text-align: center; padding: 10px;">Brak produktów</p>';
             }
        });
    });
}