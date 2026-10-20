import ReactDOM from 'react-dom/client';
import PetWindow from './components/pet/PetWindow';
import ErrorBoundary from './components/ErrorBoundary';
import { RESTORE_GENERATION_KEY } from './lib/restoreBarrier';

window.addEventListener('storage', event => {
  if (event.key === RESTORE_GENERATION_KEY && event.newValue?.startsWith('complete:')) window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary><PetWindow /></ErrorBoundary>
);
