import { useState } from 'react';
import { NotesView } from './views/notes-view';
import './index.css';

function App() {
  return (
    <div className="min-h-screen bg-background">
      <NotesView />
    </div>
  );
}

export default App;
