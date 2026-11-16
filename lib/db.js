// Single database-driver boundary for the ECG application.
// Keep SQL tag semantics unchanged while centralizing the Neon dependency.
// Alternative PostgreSQL hosting requires an explicit, tested compatibility adapter.
export { neon } from '@neondatabase/serverless';
