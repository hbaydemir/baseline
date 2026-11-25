import { createRoot } from 'react-dom/client';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import fontUrl from '@expo-google-fonts/baloo-2/800ExtraBold/Baloo2_800ExtraBold.ttf?url';
import { Kernel } from '../core/kernel';
import { App } from './App';
import './style.css';

const root = document.getElementById('root')!;
try {
  const font = await (await fetch(fontUrl)).arrayBuffer();
  const kernel = await Kernel.create({ wasmUrl, font });
  createRoot(root).render(<App kernel={kernel} />);
} catch (e) { root.textContent = `Geometri motoru başlatılamadı: ${(e as Error).message}`; }
