// The knowledge base: bug examples, glossary, and the lead-only tab that
// edits what the mascot says. Permission gating is the whole point here.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BagodelnyaPage from './BagodelnyaPage';
import { knowledgeApi } from '../api';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));
vi.mock('../components/FrogLinesEditor', () => ({ default: () => <div data-testid="frog-editor" /> }));
vi.mock('../api', () => ({
  knowledgeApi: {
    getBugExamples: vi.fn(), getGlossary: vi.fn(), getMyPermissions: vi.fn(),
    createBugExample: vi.fn(), updateBugExample: vi.fn(), deleteBugExample: vi.fn(), approveBugExample: vi.fn(),
    createGlossaryTerm: vi.fn(), updateGlossaryTerm: vi.fn(), deleteGlossaryTerm: vi.fn(), approveGlossaryTerm: vi.fn(),
  },
}));

const tester = { id: 2, name: 'Tester', role: 'tester' };
const lead = { id: 1, name: 'Lead', role: 'lead' };

const example = (o = {}) => ({
  id: 1, tag: 'UI', tag_color: '#66FCF1', problem: 'Отступ слишком большой',
  bad_text: 'плохо', good_text: 'хорошо', is_published: 1, proposal_status: null, created_by: 1, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(knowledgeApi.getMyPermissions).mockResolvedValue({ data: [] } as any);
  vi.mocked(knowledgeApi.getBugExamples).mockResolvedValue({ data: [example()] } as any);
  vi.mocked(knowledgeApi.getGlossary).mockResolvedValue({ data: [] } as any);
});

const renderPage = (user: any) => render(<BagodelnyaPage user={user} onLogout={vi.fn()} />);

describe('BagodelnyaPage', () => {
  it('renders the fetched bug examples', async () => {
    renderPage(tester);
    expect(await screen.findByText('Отступ слишком большой')).toBeInTheDocument();
  });

  it('reports a failed load instead of looking like an empty knowledge base', async () => {
    vi.mocked(knowledgeApi.getBugExamples).mockRejectedValue({ response: { status: 500, data: {} } });
    renderPage(tester);
    expect(await screen.findByText(/Не удалось загрузить базу знаний/)).toBeInTheDocument();
  });

  it('offers a tester «Предложить пример», not «Добавить пример» — the wording is the permission', async () => {
    renderPage(tester);
    // Case-insensitive: the wording is the permission, the casing is styling.
    expect(await screen.findByText(/Предложить пример/i)).toBeInTheDocument();
    expect(screen.queryByText(/Добавить пример/i)).not.toBeInTheDocument();
  });

  it('offers a lead the direct «Добавить пример»', async () => {
    renderPage(lead);
    expect(await screen.findByText(/Добавить пример/i)).toBeInTheDocument();
  });

  it('lets a granted tester add directly, without promoting them', async () => {
    vi.mocked(knowledgeApi.getMyPermissions).mockResolvedValue({ data: ['manage_knowledge_base'] } as any);
    renderPage(tester);
    expect(await screen.findByText(/Добавить пример/i)).toBeInTheDocument();
  });

  it('keeps the mascot-copy tab away from testers — the server refuses their writes anyway', async () => {
    renderPage(tester);
    await screen.findByText('Отступ слишком большой');
    expect(screen.queryByRole('button', { name: /Лягух/i })).not.toBeInTheDocument();
  });

  it('gives a lead the mascot-copy tab, and opens it on click', async () => {
    renderPage(lead);
    const tab = await screen.findByRole('button', { name: /Лягух/i });
    fireEvent.click(tab);
    expect(await screen.findByTestId('frog-editor')).toBeInTheDocument();
  });

  it('does not give the mascot tab to a merely granted tester — that permission is about the knowledge base', async () => {
    vi.mocked(knowledgeApi.getMyPermissions).mockResolvedValue({ data: ['manage_knowledge_base'] } as any);
    renderPage(tester);
    await screen.findByText(/Добавить пример/i);
    expect(screen.queryByRole('button', { name: /Лягух/i })).not.toBeInTheDocument();
  });

  it('switches to the glossary tab', async () => {
    vi.mocked(knowledgeApi.getGlossary).mockResolvedValue({ data: [{ id: 5, term: 'Регрессия', definition: 'd', is_published: 1, proposal_status: null, created_by: 1 }] } as any);
    renderPage(lead);
    fireEvent.click(await screen.findByRole('button', { name: /Словарь/i }));
    expect(await screen.findByText('Регрессия')).toBeInTheDocument();
  });
});
