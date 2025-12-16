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
import { BrowserRouter, Link as RouterLink, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
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

const App = () => (
  <ThemeProvider theme={theme}>
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <CssBaseline />
      <BrowserRouter>
        <div className="app-shell">
          <AppBar position="static" color="transparent" elevation={0}>
            <Toolbar sx={{ justifyContent: 'space-between' }}>
              <Typography variant="h6" fontWeight={800}>
                Tati Nutrición
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button component={RouterLink} to="/wizard" color="primary">
                  Wizard
                </Button>
                <Button component={RouterLink} to="/plans" color="primary">
                  Planes
                </Button>
              </Stack>
            </Toolbar>
          </AppBar>
          <Routes>
            <Route path="/" element={<Navigate to="/wizard" replace />} />
            <Route path="/wizard" element={<WizardPage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/plans/:planId" element={<PlanDetailPage />} />
            <Route path="*" element={<Navigate to="/wizard" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </LocalizationProvider>
  </ThemeProvider>
)

export default App
