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
import type { PropsWithChildren } from 'react'
import { BrowserRouter, Link as RouterLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'
import { AuthProvider, useAuth } from './context/AuthContext'
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

const RequireAuth = ({ children }: PropsWithChildren) => {
  const { token } = useAuth()
  if (!token) return <Navigate to="/access" replace />
  return <>{children}</>
}

const RequireAdmin = ({ children }: PropsWithChildren) => {
  const { token, isAdmin } = useAuth()
  if (!token) return <Navigate to="/access" replace />
  if (!isAdmin) return <Navigate to="/wizard" replace />
  return <>{children}</>
}

const AppShell = () => {
  const { token, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const defaultRoute = token ? (isAdmin ? '/admin' : '/wizard') : '/access'

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
                <Button component={RouterLink} to="/wizard" color="primary">
                  Wizard
                </Button>
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
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        <Route path="/access" element={token ? <Navigate to={defaultRoute} replace /> : <AccessPage />} />
        <Route
          path="/wizard"
          element={
            <RequireAuth>
              <WizardPage />
            </RequireAuth>
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
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
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
