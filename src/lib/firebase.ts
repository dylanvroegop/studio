'use client';

import { initializeFirebase, errorEmitter, FirestorePermissionError } from "@/firebase";
import { serverTimestamp, doc, setDoc, collection } from "firebase/firestore";

// All CSV related upload functions have been removed as requested.
// This file can be used for other specific Firebase helper functions if needed in the future.
