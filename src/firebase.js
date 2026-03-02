import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBNq6sFgxviahGg-P1ZkE45si-MvV6cVXw",
  authDomain: "the-porch-36b43.firebaseapp.com",
  databaseURL: "https://the-porch-36b43-default-rtdb.firebaseio.com",
  projectId: "the-porch-36b43",
  storageBucket: "the-porch-36b43.firebasestorage.app",
  messagingSenderId: "128197089427",
  appId: "1:128197089427:web:54c5b7dd24563f0c149566",
  measurementId: "G-JT0R3HN8WN"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
