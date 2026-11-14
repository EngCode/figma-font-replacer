import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createFigmaTransport, isInsideFigma, type UiTransport } from './transport';
import { createMockTransport } from './dev/mockTransport';
import './styles.css';

const transport: UiTransport = isInsideFigma() ? createFigmaTransport() : createMockTransport();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root container.');

createRoot(container).render(<App transport={transport} />);
