import { render } from 'preact';
import './styles.css';
import { App } from './ui/App.tsx';

const root = document.getElementById('app');
if (!root) throw new Error('wetwire: #app element is missing from index.html');
render(<App />, root);
