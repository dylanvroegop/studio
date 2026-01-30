
import { deleteField, FieldValue, Timestamp } from 'firebase/firestore';

type CleanOptions = {
    /**
     * If true, empty fields (undefined, null, "", [], {}) will be replaced with deleteField()
     * instead of being omitted (undefined).
     * Use this for updateDoc() calls where you want to remove fields that became empty.
     * Do NOT use this for addDoc() or arrays, as deleteField() is not valid there.
     */
    isUpdate?: boolean;

    /**
     * If true, treat empty arrays [] as valid values (do not clean them).
     * Defaults to false (aggressive cleaning).
     */
    allowEmptyArrays?: boolean;
};

/**
 * deepCleans data for Firestore.
 * - Removes undefined, null, "" (empty strings).
 * - Removes [] (empty arrays) unless allowEmptyArrays is true.
 * - Removes {} (empty objects).
 * - Preserves Date, Timestamp, FieldValue (serverTimestamp, deleteField).
 * 
 * @returns The cleaned value, or undefined if the value itself is effectively empty.
 *          If isUpdate=true, returns deleteField() instead of undefined (for top-level/object properties).
 */
export function cleanFirestoreData(data: any, options: CleanOptions = {}): any {
    const { isUpdate = false, allowEmptyArrays = false } = options;

    // 1. Primitive checks
    if (data === undefined || data === null || data === '') {
        return isUpdate ? deleteField() : undefined;
    }

    if (typeof data !== 'object') {
        return data; // Numbers, booleans, non-empty strings
    }

    // 2. Dates & Timestamps
    if (data instanceof Date) return data;
    if (data instanceof Timestamp) return data;

    // 3. Firestore FieldValues (serverTimestamp, deleteField, arrayUnion, etc.)
    // In modular SDK, these inherit from FieldValue abstract class.
    if (data instanceof FieldValue) {
        return data;
    }

    // 4. Arrays
    if (Array.isArray(data)) {
        if (data.length === 0) {
            if (allowEmptyArrays) return data;
            return isUpdate ? deleteField() : undefined;
        }

        // Clean items inside array
        // Note: You cannot use deleteField() INSIDE an array. 
        // So validation: always clean array items with isUpdate=false.
        const cleanedArray = data
            .map(item => cleanFirestoreData(item, { ...options, isUpdate: false }))
            .filter(item => item !== undefined);

        if (cleanedArray.length === 0) {
            if (allowEmptyArrays) return [];
            return isUpdate ? deleteField() : undefined;
        }

        return cleanedArray;
    }

    // 5. Objects
    // Check if it's a plain data object
    const cleanedObj: Record<string, any> = {};
    let hasKeys = false;

    for (const [key, value] of Object.entries(data)) {
        const cleanedValue = cleanFirestoreData(value, options);

        // If undefined, omit key (unless we want to verify something else? No, undefined means "remove" or "ignore")
        // If deleteField(), keep it (it means "delete this field")
        if (cleanedValue !== undefined) {
            cleanedObj[key] = cleanedValue;
            hasKeys = true;
        }
    }

    if (!hasKeys) {
        return isUpdate ? deleteField() : undefined;
    }

    return cleanedObj;
}
