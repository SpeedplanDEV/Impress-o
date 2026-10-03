# SpeedPlan Gestão

App interno (React + TypeScript + Tailwind v4 + Supabase), mobile-first e PWA. Esta pasta é independente
do Impress-o (raiz do repositório): tem seu próprio `package.json`.

## Rodar

```bash
cd gestao
cp .env.example .env        # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do seu projeto Supabase
npm install
npm run dev                 # http://localhost:5180
```

Banco: rode `supabase/migrations/20261003000000_leads.sql` no SQL Editor do Supabase (ou `supabase db push`).
A migration é idempotente e termina com `notify pgrst, 'reload schema'`. Crie os usuários em
Authentication → Users; `user_metadata.nome` e `user_metadata.cargo` aparecem no rodapé do menu.

`npm run typecheck` · `npm test` (máscaras, validadores, exportação) · `npm run build`

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `src/routes.ts` | Fonte única de navegação: ícone, label, seção e atalho Alt+N |
| `src/components/shell/` | `AppShell`, `Sidebar`, `SidebarItem`, `MobileDrawer`, `MobileHeader`, `BottomNav`, `QuickActionsFab`, `CommandPalette` |
| `src/components/leads/` | `LeadsTable`, `ColumnFilterPopover`, `CellEditor`, `InlineNewRow`, `LeadModal`, `CidadeCombobox`, `InteresseChips` |
| `src/hooks/` | `useLeads`, `useIbgeMunicipios`, `useColumnFilters`, `useSidebarState`, `useNavShortcuts` |
| `src/lib/` | `masks`, `validators`, `exportar`, `theme`, `supabase` |
| `supabase/migrations/` | Tabela `leads`, código LD-0001, RLS, índices, funções de filtro, realtime |

## Como funciona o filtro estilo Excel

Filtro, busca e ordenação rodam no servidor. `leads_filtrar(p_busca, p_filtros, p_desde)` devolve os leads
filtrados (o cliente aplica `order` + `range` com `count: 'exact'`), e `leads_valores_coluna(...)` devolve
os valores únicos com a contagem de uma coluna, respeitando os filtros das outras colunas. `p_filtros` tem o
formato `{"interesse": ["Sites"], "cidade_uf": ["", "Campinas/SP"]}` (`""` = vazias). A tabela carrega
páginas de 200 linhas sob demanda e virtualiza a renderização.

## Atalhos

`Ctrl K` palette · `Ctrl B` recolher menu · `Alt 1…9` telas · tabela: `↑ ↓ ← →` navegar, `Enter`/duplo clique
editar, `Tab` próxima célula, `Esc` cancelar, `Delete` excluir os selecionados · modal: `Ctrl Enter` salvar, `Esc` fechar.
