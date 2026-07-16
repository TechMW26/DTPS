/**
 * Global Mongoose plugin — IST date serialisation
 *
 * Registers a toJSON transform on EVERY schema so that all Date fields
 * are automatically formatted as IST ISO strings (with +05:30 offset)
 * in API responses.
 *
 * Imported once in src/lib/db/connection.ts BEFORE any model files.
 */

import mongoose from 'mongoose';
import { toISTISO } from '@/lib/utils/ist';

function istTransform(_doc: any, ret: any) {
    for (const key of Object.keys(ret)) {
        const val = ret[key];
        if (val instanceof Date) {
            ret[key] = toISTISO(val);
        }
    }
    return ret;
}

/**
 * Global plugin that merges an IST toJSON transform onto every schema.
 * It preserves any existing toJSON transform the schema already defines.
 */
function istDatePlugin(schema: mongoose.Schema) {
    const existing = schema.get('toJSON') || {};
    const existingTransform = existing.transform;

    schema.set('toJSON', {
        ...existing,
        transform(doc: any, ret: any, options: any) {
            // Run the schema's own transform first (e.g. User removes password)
            if (typeof existingTransform === 'function') {
                ret = existingTransform(doc, ret, options) || ret;
            }
            // Then convert all remaining Date values to IST strings
            return istTransform(doc, ret);
        },
    });
}

// Register globally — applies to every schema created after this line
mongoose.plugin(istDatePlugin);

export default istDatePlugin;
