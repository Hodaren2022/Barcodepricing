// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAtaZL06wkWJHhOJdne2Z_h9fMIEYldgjM",
  authDomain: "barcodepricing-00898.firebaseapp.com",
  projectId: "barcodepricing-00898",
  storageBucket: "barcodepricing-00898.firebasestorage.app",
  messagingSenderId: "286146042453",
  appId: "1:286146042453:web:14a20a662dcf3d06f592dc",
  measurementId: "G-6GMRVJ4S52"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
