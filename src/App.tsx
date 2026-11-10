import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireAuth from './auth/RequireAuth';
import Cover from './pages/Cover';
import Finances from './pages/Finances';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import PatientForm from './pages/PatientForm';
import Patients from './pages/Patients';
import ShiftDetail from './pages/ShiftDetail';

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
            <Route path="/pacientes" element={<Patients />} />
            <Route path="/financas" element={<Finances />} />
            <Route path="/turnos/:id" element={<ShiftDetail />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
