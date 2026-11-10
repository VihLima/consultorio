import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireAuth from './auth/RequireAuth';
import Cover from './pages/Cover';
import Login from './pages/Login';
import Placeholder from './pages/Placeholder';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Cover />} />
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/inicio" element={<Placeholder titleKey="home.title" />} />
            <Route path="/paciente/novo" element={<Placeholder titleKey="patient.newTitle" />} />
            <Route path="/paciente/:id" element={<Placeholder titleKey="patient.title" />} />
            <Route path="/pacientes" element={<Placeholder titleKey="patients.title" />} />
            <Route path="/financas" element={<Placeholder titleKey="finances.title" />} />
            <Route path="/turnos/:id" element={<Placeholder titleKey="finances.previousShifts" />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
