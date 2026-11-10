import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Cover from './pages/Cover';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Cover />} />
      </Routes>
    </BrowserRouter>
  );
}
