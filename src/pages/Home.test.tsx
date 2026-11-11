// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import '../i18n';
import i18n from '../i18n';
import Home from './Home';
import { getOpenShift, openShift } from '../data/shifts';
import { listActivePatients } from '../data/patients';
import { listShiftConsultations } from '../data/consultations';
import { listShiftPayments } from '../data/payments';
import { listExpenses } from '../data/expenses';

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: { user: { email: 'test@example.com' } }, signOut: vi.fn() }) }));
vi.mock('../data/shifts', () => ({ getOpenShift: vi.fn(), openShift: vi.fn() }));
vi.mock('../data/patients', () => ({ listActivePatients: vi.fn() }));
vi.mock('../data/consultations', () => ({ listShiftConsultations: vi.fn() }));
vi.mock('../data/payments', () => ({ listShiftPayments: vi.fn() }));
vi.mock('../data/expenses', () => ({ listExpenses: vi.fn() }));
const shift = { id: 'shift', opened_at: new Date().toISOString(), closed_at: null };
const setup = () => render(<MemoryRouter initialEntries={['/inicio']}><Home /></MemoryRouter>);

beforeEach(async () => {
  vi.resetAllMocks();
  await i18n.changeLanguage('pt-BR');
  vi.mocked(getOpenShift).mockResolvedValue(shift);
  vi.mocked(listActivePatients).mockResolvedValue([{ id: 'p1', full_name: 'Paciente Teste', cedula: null, birth_date: null, notes: null, phone: null, consultation_id: 'c1' }]);
  vi.mocked(listShiftConsultations).mockResolvedValue([{ consultation_id: 'c2', patient_id: 'p2', patient_name: 'Consulta Teste', amount_pyg: 200000, closed_at: new Date().toISOString() }]);
  vi.mocked(listShiftPayments).mockResolvedValue([{ id: 'pay1', patient_id: 'p2', consultation_id: 'c2', shift_id: 'shift', patient_name: 'Consulta Teste', amount_pyg: 150000, method: 'cash', paid_at: new Date().toISOString() }]);
  vi.mocked(listExpenses).mockResolvedValue([{ id: 'e1', shift_id: 'shift', description: 'Material', amount_pyg: 40000, created_at: new Date().toISOString() }]);
});
afterEach(cleanup);

describe('dashboard', () => {
  it('uses actual shift movements and links pending consultations to the patient', async () => {
    setup();
    await screen.findByText('Paciente Teste');
    expect(screen.getAllByText('₲ 110.000')).toHaveLength(2);
    expect(screen.getByText('Paciente Teste').closest('a')?.getAttribute('href')).toBe('/paciente/p1');
    expect(screen.getByText('Consulta Teste').closest('a')?.getAttribute('href')).toBe('/paciente/p2');
    expect(listShiftPayments).toHaveBeenCalledWith('shift');
  });
  it('keeps pending consultations visible without an open shift and requests opening before attendance', async () => {
    vi.mocked(getOpenShift).mockResolvedValue(null);
    setup();
    await screen.findByText('Paciente Teste');
    expect(listShiftPayments).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Novo atendimento' }));
    expect(screen.getByRole('alert').textContent).toContain('primeiro abra um turno');
  });
  it('does not display failed loads as zero and can retry', async () => {
    vi.mocked(listExpenses).mockRejectedValueOnce(new Error('Offline'));
    setup();
    await screen.findByRole('alert');
    expect(screen.queryByText('₲ 0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await screen.findByText('Paciente Teste');
    expect(screen.getAllByText('₲ 110.000')).toHaveLength(2);
  });
  it('blocks repeated opening clicks while the request is pending', async () => {
    vi.mocked(getOpenShift).mockResolvedValue(null);
    let resolve!: (value: typeof shift) => void;
    vi.mocked(openShift).mockImplementation(() => new Promise(r => { resolve = r; }));
    setup();
    await screen.findByText('Paciente Teste');
    const button = screen.getByRole('button', { name: 'Abrir turno' });
    fireEvent.click(button); fireEvent.click(button);
    expect(openShift).toHaveBeenCalledTimes(1);
    resolve(shift);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  });
});
