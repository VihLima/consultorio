import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireAuth from './auth/RequireAuth';
import Cover from './pages/Cover';
import Home from './pages/Home';
import Login from './pages/Login';
import PatientForm from './pages/PatientForm';
import Placeholder from './pages/Placeholder';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Cover />} />
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/inicio" element={<Home />} />
            <Route path="/paciente/novo" element={<PatientForm />} />
            <Route path="/paciente/:id" element={<PatientForm />} />
            <Route path="/pacientes" element={<Placeholder titleKey="patients.title" />} />
            <Route path="/financas" element={<Placeholder titleKey="finances.title" />} />
            <Route path="/turnos/:id" element={<Placeholder titleKey="finances.previousShifts" />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
