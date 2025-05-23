import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // If needed for profile images

// IMPORTANT: Replace this with your actual Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyDjrCW-lvt_bp8oVaBoDjPab3Guanv-elE",
      authDomain: "chatapp-f11e5.firebaseapp.com",
        databaseURL: "https://chatapp-f11e5-default-rtdb.firebaseio.com",
          projectId: "chatapp-f11e5",
            storageBucket: "chatapp-f11e5.appspot.com",
              messagingSenderId: "500298784557",
                appId: "1:500298784557:web:1ace66dd61a4d547317da4",
                  measurementId: "G-4YXCW549X8"
                  };


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // Initialize Storage

export { app, auth, db, storage }; // Add storage if used
