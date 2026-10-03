import { lazy, Suspense, useEffect, useState } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { Toaster } from 'sonner'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigurado } from '@/lib/supabase'
import { ThemeProvider, useTema } from '@/lib/theme'
import { ROTAS } from '@/routes'
import { AppShell } from '@/components/shell/AppShell'
import LoginPage from '@/pages/LoginPage'

const LeadsPage = lazy(() => import('@/pages/LeadsPage'))
const ConfiguracoesPage = lazy(() => import('@/pages/ConfiguracoesPage'))
const EmBrevePage = lazy(() => import('@/pages/EmBrevePage'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
})

const carregando = <div className="h-full" />

function criarRouter(sessao: Session | null) {
  const paginas: Record<string, React.ReactNode> = {
    '/leads': <LeadsPage />,
    '/configuracoes': <ConfiguracoesPage />,
  }
  return createBrowserRouter([
    {
      path: '/',
      element: <AppShell sessao={sessao} />,
      children: [
        { index: true, element: <Navigate to="/leads" replace /> },
        ...ROTAS.map((r) => ({
          path: r.path.slice(1),
          element: <Suspense fallback={carregando}>{paginas[r.path] ?? <EmBrevePage />}</Suspense>,
        })),
        { path: '*', element: <Navigate to="/leads" replace /> },
      ],
    },
  ])
}

function Rotas() {
  const [sessao, setSessao] = useState<Session | null | undefined>(supabaseConfigurado ? undefined : null)

  useEffect(() => {
    if (!supabaseConfigurado) return
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // o router é criado uma vez por usuário (a sessão renovada não recria a árvore)
  const usuario = sessao?.user.id
  const [router, setRouter] = useState<ReturnType<typeof criarRouter> | null>(null)
  useEffect(() => {
    if (sessao) setRouter(criarRouter(sessao))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario])

  if (sessao === undefined) return carregando
  if (!sessao || !router) return <LoginPage />
  return <RouterProvider router={router} />
}

function Notificacoes() {
  const { modo } = useTema()
  return <Toaster position="top-right" richColors closeButton theme={modo === 'claro' ? 'light' : 'dark'} />
}

export default function App() {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <Rotas />
          <Notificacoes />
        </QueryClientProvider>
      </MotionConfig>
    </ThemeProvider>
  )
}
