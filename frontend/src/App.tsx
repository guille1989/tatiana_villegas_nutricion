import {
  AppBar,
  Badge,
  Button,
  Box,
  CssBaseline,
  Fab,
  Stack,
  ThemeProvider,
  Toolbar,
  Typography,
  Tooltip,
  createTheme,
} from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { useCallback, useEffect, useState, type PropsWithChildren } from 'react'
import {
  BrowserRouter,
  Link as RouterLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import './App.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import { getUnreadInboxCount, listPlans } from './lib/api'
import AdminClientPlansPage from './pages/AdminClientPlansPage'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AccessPage from './pages/AccessPage'
import PlanDetailPage from './pages/PlanDetailPage'
import PlanPendingPage from './pages/PlanPendingPage'
import PlansPage from './pages/PlansPage'
import MessagesPage from './pages/MessagesPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import WizardPage from './pages/WizardPage'

const theme = createTheme({
  palette: {
    primary: { main: '#2563eb' },
    secondary: { main: '#0ea5e9' },
    background: { default: '#f6f7fb' },
  },
  typography: {
    fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif',
    h4: { fontWeight: 800 },
  },
  shape: {
    borderRadius: 14,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #e5e7eb',
          boxShadow: '0 16px 50px rgba(15,23,42,0.08)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 700,
        },
      },
    },
  },
})

type PlanGateStatus = 'active' | 'draft' | 'none'

type PlanGateState = {
  loading: boolean
  status: PlanGateStatus | null
  error: string | null
  reload: () => void
}

const WHATSAPP_SUPPORT_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER ?? '').trim()
const WHATSAPP_SUPPORT_MESSAGE = 'Hola, necesito ayuda con mi plan nutricional.'
const WHATSAPP_BUTTON_OFFSET = { xs: 16, sm: 24 }
const WHATSAPP_BUTTON_ENABLED = true
const MESSAGES_ENABLED = `${import.meta.env.VITE_MESSAGES_ENABLED ?? ''}`.toLowerCase() === 'true'

const buildWhatsAppLink = (rawNumber: string, message: string) => {
  const digits = rawNumber.replace(/[^\d]/g, '')
  const encoded = encodeURIComponent(message)
  return digits
    ? `https://wa.me/${digits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`
}

const useMemberPlanStatus = (enabled: boolean): PlanGateState => {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<PlanGateStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      setStatus(null)
      setError(null)
      return
    }

    let active = true
    setLoading(true)
    setError(null)
    listPlans()
      .then((plans) => {
        if (!active) return
        const hasActive = plans.some((plan) => plan.status === 'active' || !plan.status)
        const hasDraft = plans.some((plan) => plan.status === 'draft')
        const nextStatus: PlanGateStatus = hasActive ? 'active' : hasDraft ? 'draft' : 'none'
        setStatus(nextStatus)
      })
      .catch((err) => {
        if (!active) return
        setStatus(null)
        setError(err instanceof Error ? err.message : 'No se pudo verificar planes')
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [enabled, refreshKey])

  return {
    loading,
    status,
    error,
    reload: () => setRefreshKey((prev) => prev + 1),
  }
}

const PlanGateFallback = ({
  loading,
  error,
  onRetry,
}: {
  loading: boolean
  error: string | null
  onRetry: () => void
}) => (
  <Stack alignItems="center" sx={{ py: 6 }} spacing={1}>
    <Typography color="text.secondary">
      {loading ? 'Cargando...' : error ?? 'No se pudo verificar planes.'}
    </Typography>
    {!loading && (
      <Button onClick={onRetry} color="primary">
        Reintentar
      </Button>
    )}
  </Stack>
)

const RequireAdmin = ({ children }: PropsWithChildren) => {
  const { token, isAdmin } = useAuth()
  if (!token) return <Navigate to="/access" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

const RequireMember = ({ children }: PropsWithChildren) => {
  const { token, isAdmin } = useAuth()
  if (!token) return <Navigate to="/access" replace />
  if (isAdmin) return <Navigate to="/admin" replace />
  return <>{children}</>
}

const RequireWizard = ({
  children,
  planGate,
}: PropsWithChildren & { planGate: PlanGateState }) => {
  const { token, isAdmin } = useAuth()
  if (!token) return <Navigate to="/access" replace />
  if (isAdmin) return <Navigate to="/admin" replace />
  if (planGate.loading || planGate.status === null) {
    return (
      <PlanGateFallback
        loading={planGate.loading}
        error={planGate.error}
        onRetry={planGate.reload}
      />
    )
  }
  if (planGate.status === 'active') return <Navigate to="/plans" replace />
  if (planGate.status === 'draft') return <Navigate to="/plan-pending" replace />
  return <>{children}</>
}

const RequireActivePlan = ({
  children,
  planGate,
}: PropsWithChildren & { planGate: PlanGateState }) => {
  const { token, isAdmin } = useAuth()
  if (!token) return <Navigate to="/access" replace />
  if (isAdmin) return <>{children}</>
  if (planGate.loading || planGate.status === null) {
    return (
      <PlanGateFallback
        loading={planGate.loading}
        error={planGate.error}
        onRetry={planGate.reload}
      />
    )
  }
  if (planGate.status === 'active') return <>{children}</>
  if (planGate.status === 'draft') return <Navigate to="/plan-pending" replace />
  return <Navigate to="/wizard" replace />
}

const RequirePendingPlan = ({
  children,
  planGate,
}: PropsWithChildren & { planGate: PlanGateState }) => {
  const { token, isAdmin } = useAuth()
  if (!token) return <Navigate to="/access" replace />
  if (isAdmin) return <Navigate to="/admin" replace />
  if (planGate.loading || planGate.status === null) {
    return (
      <PlanGateFallback
        loading={planGate.loading}
        error={planGate.error}
        onRetry={planGate.reload}
      />
    )
  }
  if (planGate.status === 'draft') return <>{children}</>
  if (planGate.status === 'active') return <Navigate to="/plans" replace />
  return <Navigate to="/wizard" replace />
}

const AppShell = () => {
  const { token, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const planGate = useMemberPlanStatus(!!token && !isAdmin)
  const whatsappHref = buildWhatsAppLink(WHATSAPP_SUPPORT_NUMBER, WHATSAPP_SUPPORT_MESSAGE)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const showAdminSectionNav = isAdmin && location.pathname.startsWith('/admin')
  const adminSection = new URLSearchParams(location.search).get('section') === 'ingredients' ? 'ingredients' : 'overview'

  const refreshUnreadMessageCount = useCallback(async () => {
    if (!MESSAGES_ENABLED || !token || isAdmin) {
      setUnreadMessageCount(0)
      return
    }
    try {
      const count = await getUnreadInboxCount()
      setUnreadMessageCount(count)
    } catch {
      // Keep previous counter state on transient failures.
    }
  }, [isAdmin, token])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshUnreadMessageCount()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [location.pathname, refreshUnreadMessageCount])

  const renderMemberLanding = () => {
    if (!token) return <Navigate to="/access" replace />
    if (isAdmin) return <Navigate to="/admin" replace />
    if (planGate.loading || planGate.status === null) {
      return (
        <PlanGateFallback
          loading={planGate.loading}
          error={planGate.error}
          onRetry={planGate.reload}
        />
      )
    }
    const target =
      planGate.status === 'active' ? '/plans' : planGate.status === 'draft' ? '/plan-pending' : '/wizard'
    return <Navigate to={target} replace />
  }

  const handleLogout = () => {
    logout()
    navigate('/access', { replace: true })
  }

  return (
    <div className="app-shell">
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6" fontWeight={800}>
            Tati Nutrición
          </Typography>
          <Stack direction="row" spacing={1}>
            {token ? (
              <>
                {!isAdmin && MESSAGES_ENABLED && (
                  <Badge
                    color="error"
                    badgeContent={unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                    invisible={unreadMessageCount < 1}
                  >
                    <Button component={RouterLink} to="/messages" color="primary">
                      Mensajes
                    </Button>
                  </Badge>
                )}
                {!isAdmin && (
                  <Button component={RouterLink} to="/plans" color="primary">
                    Planes
                  </Button>
                )}
                {isAdmin && (
                  <>
                    {!showAdminSectionNav && (
                      <Button component={RouterLink} to="/admin" color="primary">
                        Admin
                      </Button>
                    )}
                    {showAdminSectionNav && (
                      <>
                        <Button
                          component={RouterLink}
                          to="/admin?section=overview"
                          color="primary"
                          variant={adminSection === 'overview' ? 'contained' : 'text'}
                        >
                          Resumen
                        </Button>
                        <Button
                          component={RouterLink}
                          to="/admin?section=ingredients"
                          color="primary"
                          variant={adminSection === 'ingredients' ? 'contained' : 'text'}
                        >
                          Ingredientes
                        </Button>
                      </>
                    )}
                  </>
                )}
                <Button onClick={handleLogout} color="primary">
                  Salir
                </Button>
              </>
            ) : (
              <Button component={RouterLink} to="/access" color="primary">
                Acceso
              </Button>
            )}
          </Stack>
        </Toolbar>
      </AppBar>
      <Routes>
        <Route path="/" element={renderMemberLanding()} />
        <Route path="/access" element={token ? renderMemberLanding() : <AccessPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/wizard"
          element={
            <RequireWizard planGate={planGate}>
              <WizardPage onComplete={planGate.reload} />
            </RequireWizard>
          }
        />
        <Route
          path="/plan-pending"
          element={
            <RequirePendingPlan planGate={planGate}>
              <PlanPendingPage onRefresh={planGate.reload} loading={planGate.loading} />
            </RequirePendingPlan>
          }
        />
        <Route
          path="/plans"
          element={
            <RequireActivePlan planGate={planGate}>
              <PlansPage />
            </RequireActivePlan>
          }
        />
        <Route
          path="/plans/:planId"
          element={
            <RequireActivePlan planGate={planGate}>
              <PlanDetailPage />
            </RequireActivePlan>
          }
        />
        {MESSAGES_ENABLED && (
          <Route
            path="/messages"
            element={
              <RequireMember>
                <MessagesPage onUnreadCountRefresh={refreshUnreadMessageCount} />
              </RequireMember>
            }
          />
        )}
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminDashboardPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/client/:userId/plans"
          element={
            <RequireAdmin>
              <AdminClientPlansPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/client/:userId"
          element={
            <RequireAdmin>
              <AdminDashboardPage mode="client-detail" />
            </RequireAdmin>
          }
        />
        <Route path="*" element={renderMemberLanding()} />
      </Routes>
      {WHATSAPP_BUTTON_ENABLED && (
        <Box
          sx={{
            position: 'fixed',
            right: WHATSAPP_BUTTON_OFFSET,
            bottom: WHATSAPP_BUTTON_OFFSET,
            zIndex: (theme) => theme.zIndex.appBar - 1,
          }}
        >
          {/* WhatsApp support entry point; adjust offsets or toggle flag to move/hide. */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                display: { xs: 'none', sm: 'flex' },
                px: 1.25,
                py: 0.5,
                borderRadius: 999,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Necesitas ayuda?
              </Typography>
            </Box>
            <Tooltip title="Necesitas ayuda?" arrow>
              <Fab
                color="primary"
                size="medium"
                component="a"
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir WhatsApp"
                sx={{
                  bgcolor: '#25D366',
                  color: 'common.white',
                  boxShadow: '0 10px 24px rgba(37, 211, 102, 0.3)',
                  transition: 'transform 150ms ease, box-shadow 150ms ease',
                  '&:hover': {
                    bgcolor: '#20c05a',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 14px 30px rgba(37, 211, 102, 0.35)',
                  },
                }}
              >
                <WhatsAppIcon />
              </Fab>
            </Tooltip>
          </Stack>
        </Box>
      )}
    </div>
  )
}

const App = () => (
  <ThemeProvider theme={theme}>
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </AuthProvider>
    </LocalizationProvider>
  </ThemeProvider>
)

export default App
