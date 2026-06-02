import ReactDOM from 'react-dom/client';
import PetWindow from './components/pet/PetWindow';
import ErrorBoundary from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary><PetWindow /></ErrorBoundary>
);
