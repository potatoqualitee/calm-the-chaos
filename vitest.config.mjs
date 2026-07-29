import { defineConfig } from 'vitest/config';

// The catalog tests in tests/*.test.cjs run under `node --test`, not vitest.
// Only the trending engine's tests belong to vitest.
export default defineConfig({
    test: {
        include: ['tests/trending*.test.mjs']
    }
});
