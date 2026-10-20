import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
// Remediation acceptance suite. Original defect assertions are archived as .txt.
export default defineConfig({ plugins: [react()], test: { include: [
  'src/lib/backup.test.ts', 'src/lib/partnerTransactions.test.ts',
  'src/lib/persist.test.ts', 'src/lib/sqlite-storage.test.ts',
  'src/lib/walletTransaction.test.ts', 'src/lib/restoreStartup.test.ts',
  'src/lib/fetchJson.test.ts', 'src/question-bank/cacheStorage.test.ts',
  'src/question-bank/repository.test.ts',
  'src/components/pet/PetSprite.instances.test.tsx',
  'src/components/focus/FocusRuntime.test.tsx',
] } });
