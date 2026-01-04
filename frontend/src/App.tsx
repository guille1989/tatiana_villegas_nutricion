import {
  AppBar,
  Button,
  CssBaseline,
  Stack,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { BrowserRouter, Link as RouterLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import { listPlans } from './lib/api'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AccessPage from './pages/AccessPage'
import PlanDetailPage from './pages/PlanDetailPage'
import PlansPage from './pages/PlansPage'
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

type PlanGateState = {
  loading: boolean
  hasPlans: boolean | null
  error: string | null
  reload: () => void
}

const useMemberPlanStatus = (enabled: boolean): PlanGateState => {
  const [loading, setLoading] = useState(false)
  const [hasPlans, setHasPlans] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      setHasPlans(null)
      setError(null)
      return
    }

    let active = true
    setLoading(true)
    setError(null)
    listPlans()
      .then((plans) => {
        if (!active) return
        setHasPlans(plans.length > 0)
      })
      .catch((err) => {
        if (!active) return
        setHasPlans(null)
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
    hasPlans,
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

const RequireAuth = ({ children }: PropsWithChildren) => {
  const { token } = useAuth()
  if (!token) return <Navigate to="/access" replace />
  return <>{children}</>
}

const RequireAdmin = ({ children }: PropsWithChildren) => {
  const { token, isAdmin } = useAuth()
  if (!token) return <Navigate to="/access" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

const RequireWizard = ({
  children,
  planGate,
}: PropsWithChildren & { planGate: PlanGateState }) => {
  const { token, isAdmin } = useAuth()
  if (!token) return <Navigate to="/access" replace />
  if (isAdmin) return <Navigate to="/admin" replace />
  if (planGate.loading || planGate.hasPlans === null) {
    return (
      <PlanGateFallback
        loading={planGate.loading}
        error={planGate.error}
        onRetry={planGate.reload}
      />
    )
  }
  if (planGate.hasPlans) return <Navigate to="/plans" replace />
  return <>{children}</>
}

const AppShell = () => {
  const { token, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const planGate = useMemberPlanStatus(!!token && !isAdmin)

  const renderMemberLanding = () => {
    if (!token) return <Navigate to="/access" replace />
    if (isAdmin) return <Navigate to="/admin" replace />
    if (planGate.loading || planGate.hasPlans === null) {
      return (
        <PlanGateFallback
          loading={planGate.loading}
          error={planGate.error}
          onRetry={planGate.reload}
        />
      )
    }
    return <Navigate to={planGate.hasPlans ? '/plans' : '/wizard'} replace />
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
                <Button component={RouterLink} to="/plans" color="primary">
                  Planes
                </Button>
                {isAdmin && (
                  <Button component={RouterLink} to="/admin" color="primary">
                    Admin
                  </Button>
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
        <Route
          path="/wizard"
          element={
            <RequireWizard planGate={planGate}>
              <WizardPage />
            </RequireWizard>
          }
        />
        <Route
          path="/plans"
          element={
            <RequireAuth>
              <PlansPage />
            </RequireAuth>
          }
        />
        <Route
          path="/plans/:planId"
          element={
            <RequireAuth>
              <PlanDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminDashboardPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={renderMemberLanding()} />
      </Routes>
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
