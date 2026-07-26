const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

firebase.initializeApp({
  apiKey: "AIzaSyBdTH24q_cU1TdyLpd1Du4G196zEcB9kbQ",
  authDomain: "vnmediasolution-tk.firebaseapp.com",
  databaseURL: "https://vnmediasolution-tk-default-rtdb.firebaseio.com",
  projectId: "vnmediasolution-tk",
  storageBucket: "vnmediasolution-tk.firebasestorage.app",
  messagingSenderId: "615383281154",
  appId: "1:615383281154:web:0030c2652d67c13352011b",
  measurementId: "G-BQPQZQQ9FR",
});

const db = firebase.firestore();
module.exports = { db };
